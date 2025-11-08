import express, { Request, Response } from 'express';
import crypto from 'crypto';
import {
  createAuthenticatedClient,
  createUnauthenticatedClient
} from '@interledger/open-payments';
import { putState, takeState } from './state';

import 'dotenv/config'; // carga .env desde el cwd

const app = express();
app.use(express.json());

const {
  OP_PLATFORM_WALLET_ADDRESS,
  OP_CLIENT_KEY_ID,
  OP_PRIVATE_KEY_PEM,
  BASE_URL,
  PORT = '3000'
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

/**
 * POST /api/split/checkout
 * Body:
 * {
 *   "customerAddress": "https://cloudninebank.example.com/customer",
 *   "merchantAddress":  "https://happylifebank.example.com/merchant",
 *   "amountMinor": 10000,   // 100.00 si assetScale=2
 *   "split": { "merchantPct": 99, "platformPct": 1 } // opcional
 * }
 */
type SplitBody = {
  customerAddress?: string;
  merchantAddress?: string;
  amountMinor?: number | string;
  split?: { merchantPct: number; platformPct: number };
};

app.post('/api/split/checkout', async (req: Request<unknown, unknown, SplitBody>, res: Response) => {
  try {
    const {
      customerAddress,
      merchantAddress,
      amountMinor = 10000,
      split = { merchantPct: 99, platformPct: 1 }
    } = req.body ?? {};

    if (!BASE_URL) {
      return res.status(400).json({ error: 'BASE_URL no configurado' });
    }

    if (!customerAddress || !merchantAddress || !OP_PLATFORM_WALLET_ADDRESS) {
      return res.status(400).json({ error: 'wallet addresses requeridos' });
    }

    const amt = typeof amountMinor === 'string' ? Number(amountMinor) : amountMinor;
    if (!Number.isFinite(amt) || amt <= 0 || !Number.isInteger(amt)) {
      return res.status(400).json({ error: 'amountMinor debe ser entero positivo' });
    }

    const merchantPct = Number(split.merchantPct);
    const platformPct = Number(split.platformPct);
    if (
      !Number.isFinite(merchantPct) ||
      !Number.isFinite(platformPct) ||
      merchantPct < 0 ||
      platformPct < 0 ||
      Math.round(merchantPct + platformPct) !== 100
    ) {
      return res.status(400).json({ error: 'split inválido: merchantPct + platformPct debe ser 100' });
    }

    // 1) Wallet Address info (descubre authServer y resourceServer)
    const anon = await opAnon();
    const [customerWA, merchantWA, platformWA] = await Promise.all([
      anon.walletAddress.get({ url: customerAddress }),
      anon.walletAddress.get({ url: merchantAddress }),
      anon.walletAddress.get({ url: OP_PLATFORM_WALLET_ADDRESS })
    ]);
    // (Get Wallet Address) :contentReference[oaicite:7]{index=7}

    // 2) Grants para crear incoming payments en merchant y plataforma
    const client = await opClient();
    const [merchantIncomingGrant, platformIncomingGrant] = await Promise.all([
      client.grant.request(
        { url: merchantWA.authServer },
        { access_token: { access: [{ type: 'incoming-payment', actions: ['create'] }] } }
      ),
      client.grant.request(
        { url: platformWA.authServer },
        { access_token: { access: [{ type: 'incoming-payment', actions: ['create'] }] } }
      )
    ]);
    // (Grant Request para incoming-payment) :contentReference[oaicite:8]{index=8}

    // 3) Crear incoming payments (según split)
    const merchantShare = Math.round((amt * merchantPct) / 100);
    const platformShare = amt - merchantShare;

    const [merchantIncoming, platformIncoming] = await Promise.all([
      client.incomingPayment.create(
        { url: merchantWA.resourceServer, accessToken: merchantIncomingGrant.access_token.value },
        {
          walletAddress: merchantWA.id,
          incomingAmount: {
            value: String(merchantShare),
            assetCode: merchantWA.assetCode,
            assetScale: merchantWA.assetScale
          }
        }
      ),
      client.incomingPayment.create(
        { url: platformWA.resourceServer, accessToken: platformIncomingGrant.access_token.value },
        {
          walletAddress: platformWA.id,
          incomingAmount: {
            value: String(platformShare),
            assetCode: platformWA.assetCode,
            assetScale: platformWA.assetScale
          }
        }
      )
    ]);
    // (Create Incoming Payment) :contentReference[oaicite:9]{index=9}

    // 4) Grant para quotes (cliente)
    const quoteGrant = await client.grant.request(
      { url: customerWA.authServer },
      { access_token: { access: [{ type: 'quote', actions: ['create'] }] } }
    );
    // (Grant Request para quote:create) :contentReference[oaicite:10]{index=10}

    // 5) Crear dos quotes (receiver = incoming.id de cada receptor)
    const [quoteMerchant, quotePlatform] = await Promise.all([
      client.quote.create(
        { url: customerWA.resourceServer, accessToken: quoteGrant.access_token.value },
        {
          walletAddress: customerWA.id,        // 👈 requerido
          receiver: merchantIncoming.id,       // 👈 requerido
          method: 'ilp'                        // 👈 requerido
          // Nota: como merchantIncoming tiene incomingAmount, no hace falta debitAmount/receiveAmount
        }
      ),
      client.quote.create(
        { url: customerWA.resourceServer, accessToken: quoteGrant.access_token.value },
        {
          walletAddress: customerWA.id,        // 👈 requerido
          receiver: platformIncoming.id,       // 👈 requerido
          method: 'ilp'                        // 👈 requerido
        }
      )
    ]);
    // (Create Quote) :contentReference[oaicite:11]{index=11}

    // 6) Grant interactivo para outgoing-payment (total combinado)
    const debitTotal =
      BigInt(quoteMerchant.debitAmount.value) + BigInt(quotePlatform.debitAmount.value);

    const nonce = crypto.randomBytes(16).toString('hex');
    const interactRedirectUri = `${BASE_URL}/api/op/callback?nonce=${nonce}`;

    const outgoingGrantInit = await client.grant.request(
      { url: customerWA.authServer },
      {
        access_token: {
          access: [{
            type: 'outgoing-payment',
            actions: ['create'],
            identifier: customerWA.id, // 👈 requerido: recurso concreto en el RS (la wallet address que envía)
            limits: {                  // 👇 los límites van DENTRO del item de access
              debitAmount: {
                value: debitTotal.toString(),
                assetCode: customerWA.assetCode,
                assetScale: customerWA.assetScale
              }
            }
          }]
        },
        interact: {
          start: ['redirect'],
          finish: { method: 'redirect', uri: interactRedirectUri, nonce }
        }
      }
    );

    // (Interactive outgoing payment grant + redirect al IdP) :contentReference[oaicite:12]{index=12}

    // Guardamos contexto para continuation + creación de outgoing payments
    putState(nonce, {
      customerWA,
      merchantWA,
      platformWA,
      quoteMerchant,
      quotePlatform,
      grantContinue: outgoingGrantInit.continue
    });

    return res.json({
      redirectUrl: outgoingGrantInit.interact.redirect, // redirige al usuario
      nonce
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
});

/**
 * GET /api/op/callback?hash=...&interact_ref=...&nonce=...
 * Tras el consentimiento en el IdP, el AS redirige aquí. Hacemos continuation y creamos 2 outgoing payments.
 */
app.get('/api/op/callback', async (req, res) => {
  try {
    const { interact_ref, nonce } = req.query as { interact_ref?: string; nonce?: string };
    if (!interact_ref || !nonce) return res.status(400).send('interact_ref y nonce requeridos');

    const ctx = takeState(nonce);
    if (!ctx) return res.status(400).send('flujo no encontrado');

    const client = await opClient();

    // 9) Continuation del grant
    const continued = await client.grant.continue(
      { url: ctx.grantContinue.uri, accessToken: ctx.grantContinue.access_token.value },
      { interact_ref }
    );
    // (Grant Continuation) :contentReference[oaicite:13]{index=13}

    // 10) Crear 2 outgoing payments (uno por quote)
    const [opMerchant, opPlatform] = await Promise.all([
      client.outgoingPayment.create(
        { url: ctx.customerWA.resourceServer, accessToken: continued.access_token.value },
        {
          walletAddress: ctx.customerWA.id,   // 👈 requerido: remitente (payer)
          quoteId: ctx.quoteMerchant.id
        }
      ),
      client.outgoingPayment.create(
        { url: ctx.customerWA.resourceServer, accessToken: continued.access_token.value },
        {
          walletAddress: ctx.customerWA.id,   // 👈 requerido: remitente (payer)
          quoteId: ctx.quotePlatform.id
        }
      )
    ]);
    // (Create Outgoing Payment con quoteId) :contentReference[oaicite:14]{index=14}

    return res.status(200).json({
      status: 'ok',
      merchantOutgoingPayment: opMerchant,
      platformOutgoingPayment: opPlatform
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Open Payments Split (TS) on :${PORT}`);
});
