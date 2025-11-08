import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';
import {
  createAuthenticatedClient,
  createUnauthenticatedClient
} from '@interledger/open-payments';
import { putState, takeState } from '../../../state';

import 'dotenv/config';

export const openPaymentsRouter = Router();
openPaymentsRouter.use(express.json());

const {
  OP_PLATFORM_WALLET_ADDRESS,
  OP_CLIENT_KEY_ID,
  OP_PRIVATE_KEY_PEM,
  BASE_URL
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

// ====== Split checkout (merchant + optional platform fee) ======
type SplitBody = {
  customerAddress?: string;
  merchantAddress?: string;
  amountMinor?: number | string;
  split?: { merchantPct: number; platformPct: number };
};

openPaymentsRouter.post('/api/split/checkout', async (req: Request<unknown, unknown, SplitBody>, res: Response) => {
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

    // 4) Grant para quotes (cliente)
    const quoteGrant = await client.grant.request(
      { url: customerWA.authServer },
      { access_token: { access: [{ type: 'quote', actions: ['create'] }] } }
    );

    // 5) Crear dos quotes (receiver = incoming.id de cada receptor)
    const [quoteMerchant, quotePlatform] = await Promise.all([
      client.quote.create(
        { url: customerWA.resourceServer, accessToken: quoteGrant.access_token.value },
        {
          walletAddress: customerWA.id,
          receiver: merchantIncoming.id,
          method: 'ilp'
        }
      ),
      client.quote.create(
        { url: customerWA.resourceServer, accessToken: quoteGrant.access_token.value },
        {
          walletAddress: customerWA.id,
          receiver: platformIncoming.id,
          method: 'ilp'
        }
      )
    ]);

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
            identifier: customerWA.id,
            limits: {
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
      redirectUrl: outgoingGrantInit.interact.redirect,
      nonce
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// ====== Callback para finalizar pagos (uno o dos) ======
openPaymentsRouter.get('/api/op/callback', async (req, res) => {
  try {
    const { interact_ref, nonce } = req.query as { interact_ref?: string; nonce?: string };
    if (!interact_ref || !nonce) return res.status(400).send('interact_ref y nonce requeridos');

    const ctx = takeState(nonce);
    if (!ctx) return res.status(400).send('flujo no encontrado');

    const client = await opClient();

    const continued = await client.grant.continue(
      { url: ctx.grantContinue.uri, accessToken: ctx.grantContinue.access_token.value },
      { interact_ref }
    );

    const creations: Promise<any>[] = [];

    if (ctx.quoteMerchant) {
      creations.push(
        client.outgoingPayment.create(
          { url: ctx.customerWA.resourceServer, accessToken: continued.access_token.value },
          { walletAddress: ctx.customerWA.id, quoteId: ctx.quoteMerchant.id }
        )
      );
    }
    if (ctx.quotePlatform) {
      creations.push(
        client.outgoingPayment.create(
          { url: ctx.customerWA.resourceServer, accessToken: continued.access_token.value },
          { walletAddress: ctx.customerWA.id, quoteId: ctx.quotePlatform.id }
        )
      );
    }

    if (creations.length === 0) {
      return res.status(400).json({ error: 'No hay quotes en el contexto para crear pagos' });
    }

    const results = await Promise.all(creations);
    return res.status(200).json({ status: 'ok', payer: ctx.customerWA?.id, outgoingPayments: results });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// ====== Group checkout (varios payers para un merchant) ======
type GroupBody = {
  merchantAddress?: string;
  totalAmountMinor?: number | string;
  payers?: string[];
};

function splitEven(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const res = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < res ? 1 : 0));
}

openPaymentsRouter.post('/api/split/group-checkout', async (req: Request<unknown, unknown, GroupBody>, res: Response) => {
  try {
    const { merchantAddress, totalAmountMinor, payers } = req.body ?? {};

    if (!BASE_URL) return res.status(400).json({ error: 'BASE_URL no configurado' });
    if (!merchantAddress || !Array.isArray(payers) || payers.length === 0) {
      return res.status(400).json({ error: 'merchantAddress y payers[] requeridos' });
    }

    const total = typeof totalAmountMinor === 'string' ? Number(totalAmountMinor) : Number(totalAmountMinor);
    if (!Number.isFinite(total) || total <= 0 || !Number.isInteger(total)) {
      return res.status(400).json({ error: 'totalAmountMinor debe ser entero positivo' });
    }

    // 1) Resolve wallet addresses
    const anon = await opAnon();
    const merchantWA = await anon.walletAddress.get({ url: merchantAddress });

    const payerWAs = await Promise.all(payers.map((url) => anon.walletAddress.get({ url })));

    // 2) Grant (merchant) para crear incoming payments
    const client = await opClient();
    const merchantIncomingGrant = await client.grant.request(
      { url: merchantWA.authServer },
      { access_token: { access: [{ type: 'incoming-payment', actions: ['create'] }] } }
    );

    // 3) Calcular partes iguales
    const shares = splitEven(total, payerWAs.length);

    // 4) Crear un incoming por cada payer en el merchant
    const incomings = await Promise.all(
      shares.map((shareMinor) =>
        client.incomingPayment.create(
          { url: merchantWA.resourceServer, accessToken: merchantIncomingGrant.access_token.value },
          {
            walletAddress: merchantWA.id,
            incomingAmount: {
              value: String(shareMinor),
              assetCode: merchantWA.assetCode,
              assetScale: merchantWA.assetScale
            }
          }
        )
      )
    );

    // 5) Para cada payer: grant quote, quote, y grant interactivo de outgoing con su parte
    const results = await Promise.all(
      payerWAs.map(async (payerWA, i) => {
        const quoteGrant = await client.grant.request(
          { url: payerWA.authServer },
          { access_token: { access: [{ type: 'quote', actions: ['create'] }] } }
        );

        const quote = await client.quote.create(
          { url: payerWA.resourceServer, accessToken: quoteGrant.access_token.value },
          { walletAddress: payerWA.id, receiver: incomings[i].id, method: 'ilp' }
        );

        const nonce = crypto.randomBytes(16).toString('hex');
        const interactRedirectUri = `${BASE_URL}/api/op/callback?nonce=${nonce}`;

        const outgoingGrantInit = await client.grant.request(
          { url: payerWA.authServer },
          {
            access_token: {
              access: [{
                type: 'outgoing-payment',
                actions: ['create'],
                identifier: payerWA.id,
                limits: {
                  debitAmount: {
                    value: quote.debitAmount.value,
                    assetCode: payerWA.assetCode,
                    assetScale: payerWA.assetScale
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

        // Guardar estado por payer
        putState(nonce, {
          customerWA: payerWA,
          merchantWA,
          platformWA: null,
          quoteMerchant: quote,
          quotePlatform: null,
          grantContinue: outgoingGrantInit.continue
        });

        return {
          payer: payerWA.id,
          shareMinor: shares[i],
          redirectUrl: outgoingGrantInit.interact.redirect,
          nonce
        };
      })
    );

    return res.json({ merchant: merchantWA.id, totalMinor: total, count: payerWAs.length, results });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
});

