import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';
import {
  createAuthenticatedClient,
  createUnauthenticatedClient
} from '@interledger/open-payments';

import 'dotenv/config';

export const fxRouter = Router();
fxRouter.use(express.json());

const {
  OP_PLATFORM_WALLET_ADDRESS,
  OP_CLIENT_KEY_ID,
  OP_PRIVATE_KEY_PEM
} = process.env;

async function opClient() {
  if (!OP_CLIENT_KEY_ID || !OP_PRIVATE_KEY_PEM || !OP_PLATFORM_WALLET_ADDRESS) {
    throw new Error('OP_CLIENT_KEY_ID/OP_PRIVATE_KEY_PEM/OP_PLATFORM_WALLET_ADDRESS no configurados');
  }
  return await createAuthenticatedClient({
    keyId: OP_CLIENT_KEY_ID,
    privateKey: OP_PRIVATE_KEY_PEM,
    walletAddressUrl: OP_PLATFORM_WALLET_ADDRESS
  });
}
async function opAnon() {
  return await createUnauthenticatedClient({});
}

// --- Mapa fijo de wallets por divisa ---
const WALLETS_BY_ASSET: Record<string, string> = {
  USD: 'https://ilp.interledger-test.dev/usd_25',
  EUR: 'https://ilp.interledger-test.dev/eur_25',
  MXN: 'https://ilp.interledger-test.dev/mx_25',
  EGG: 'https://ilp.interledger-test.dev/eg25',
  PEB: 'https://ilp.interledger-test.dev/peb_25',
  PKR: 'https://ilp.interledger-test.dev/pkr_25'
};

const DEFAULT_MAJOR_AMOUNT = 100; // Enviar 100 unidades mayores

type FxBody = { from?: string; to?: string };

fxRouter.post('/api/fx/compare', async (req: Request<unknown, unknown, FxBody>, res: Response) => {
  try {
    const from = (req.body?.from || '').toUpperCase();
    const to = (req.body?.to || '').toUpperCase();

    if (!from || !to) {
      return res.status(400).json({ error: 'from y to son requeridos (ej: USD, EUR, MXN)' });
    }
    const payerAddress = WALLETS_BY_ASSET[from];
    const receiverAddress = WALLETS_BY_ASSET[to];
    if (!payerAddress || !receiverAddress) {
      return res.status(400).json({
        error: 'Divisa no soportada en el servidor',
        supported: Object.keys(WALLETS_BY_ASSET)
      });
    }

    // 1) Resolver wallet addresses
    const anon = await opAnon();
    const [payerWA, receiverWA] = await Promise.all([
      anon.walletAddress.get({ url: payerAddress }),
      anon.walletAddress.get({ url: receiverAddress })
    ]);

    // 2) Crear incoming en receiver (sin incomingAmount para permitir fixed-send)
    const client = await opClient();
    const incomingGrant = await client.grant.request(
      { url: receiverWA.authServer },
      { access_token: { access: [{ type: 'incoming-payment', actions: ['create'] }] } }
    );
    const incoming = await client.incomingPayment.create(
      { url: receiverWA.resourceServer, accessToken: incomingGrant.access_token.value },
      { walletAddress: receiverWA.id }
    );

    // 3) Grant en payer para quote:create
    const quoteGrant = await client.grant.request(
      { url: payerWA.authServer },
      { access_token: { access: [{ type: 'quote', actions: ['create'] }] } }
    );

    // 4) Monto fijo: 100 unidades mayores del 'from'
    const sendAmountMinor = BigInt(DEFAULT_MAJOR_AMOUNT) * BigInt(10 ** payerWA.assetScale);

    // 5) Crear quote (fixed-send)
    const quote = await client.quote.create(
      { url: payerWA.resourceServer, accessToken: quoteGrant.access_token.value },
      {
        walletAddress: payerWA.id,
        receiver: incoming.id,
        method: 'ilp',
        debitAmount: {
          value: sendAmountMinor.toString(),
          assetCode: payerWA.assetCode,
          assetScale: payerWA.assetScale
        }
      }
    );

    // 6) Calcular tasa ILP normalizada
    const debit = Number(quote.debitAmount.value) / 10 ** quote.debitAmount.assetScale;
    const receive = Number(quote.receiveAmount.value) / 10 ** quote.receiveAmount.assetScale;
    const ilpRate = receive / debit; // FROM -> TO

    // 7) Tasa spot de mercado (multi-proveedor con fallback)
    let marketRate: number;
    try {
      marketRate = await getMarketRate(from, to);
    } catch {
      return res.status(200).json({
        from, to,
        sendMajor: DEFAULT_MAJOR_AMOUNT,
        sendMinor: sendAmountMinor.toString(),
        ilp: {
          rate: ilpRate,
          debitAmount: quote.debitAmount,
          receiveAmount: quote.receiveAmount,
          quoteId: quote.id
        },
        market: { rate: null, source: null, error: 'market-rate-unavailable' },
        deltaPct: null
      });
    }
    const deltaPct = ((ilpRate - marketRate) / marketRate) * 100;

    return res.json({
      from, to,
      sendMajor: DEFAULT_MAJOR_AMOUNT,
      sendMinor: sendAmountMinor.toString(),
      ilp: {
        rate: ilpRate,
        debitAmount: quote.debitAmount,
        receiveAmount: quote.receiveAmount,
        quoteId: quote.id
      },
      market: { rate: marketRate, source: 'multi' },
      deltaPct
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// --- opcional: mapear códigos no-ISO a ISO ---
const ISO_MAP: Record<string, string> = {
  USDT: 'USD',
  USD: 'USD',
  EUR: 'EUR',
  MXN: 'MXN'
};

function normCode(ccy?: string) {
  if (!ccy) return undefined;
  const up = ccy.toUpperCase();
  return ISO_MAP[up] ?? up;
}

async function fetchWithTimeout(url: string, ms = 4000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

async function getMarketRate(from: string, to: string): Promise<number> {
  const f = normCode(from);
  const t = normCode(to);
  if (!f || !t) throw new Error('Códigos de divisa inválidos');
  if (f === t) return 1.0;

  try {
    const r = await fetchWithTimeout(
      `https://api.exchangerate.host/convert?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`
    );
    if (r.ok) {
      const j: any = await r.json();
      const val = Number(j?.result);
      if (Number.isFinite(val) && val > 0) return val;
    }
  } catch {}

  try {
    const r = await fetchWithTimeout(
      `https://api.frankfurter.app/latest?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`
    );
    if (r.ok) {
      const j: any = await r.json();
      const val = Number(j?.rates?.[t]);
      if (Number.isFinite(val) && val > 0) return val;
    }
  } catch {}

  try {
    const r = await fetchWithTimeout(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(f)}`
    );
    if (r.ok) {
      const j: any = await r.json();
      const val = Number(j?.rates?.[t]);
      if (Number.isFinite(val) && val > 0) return val;
    }
  } catch {}

  throw new Error('market-rate-unavailable');
}

