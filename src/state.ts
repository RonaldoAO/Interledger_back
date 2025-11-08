export type PendingCtx = {
  customerWA: any;
  merchantWA: any;
  platformWA: any;
  quoteMerchant: any;
  quotePlatform: any;
  grantContinue: { uri: string; access_token: { value: string } };
};

const state = new Map<string, PendingCtx>();
export const putState = (nonce: string, ctx: PendingCtx) => state.set(nonce, ctx);
export const takeState = (nonce: string) => {
  const ctx = state.get(nonce);
  if (ctx) state.delete(nonce);
  return ctx;
};
