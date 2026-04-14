/**
 * LND Gateway client — calls the Go sidecar for all LND operations.
 * The sidecar talks gRPC to LND directly.
 */

const GATEWAY = process.env.LND_GATEWAY_URL || "http://localhost:3003";

async function gw(method, path, body, agentMacaroon) {
  const headers = { "Content-Type": "application/json" };
  if (agentMacaroon) headers["X-Macaroon"] = agentMacaroon;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${GATEWAY}${path}`, opts);
  const data = await res.json();

  if (data.error) {
    const msg = typeof data.error === "string" ? data.error : data.error.message || JSON.stringify(data.error);
    throw new Error(msg);
  }

  return data;
}

// ── Node Info ───────────────────────────────────────────────────────────────

export async function getInfo() {
  return gw("GET", "/v1/node/info");
}

// ── Balance ─────────────────────────────────────────────────────────────────

export async function getWalletBalance() {
  return gw("GET", "/v1/balance/wallet");
}

export async function getBalance(agentMacaroon) {
  return gw("GET", "/v1/balance/channel", null, agentMacaroon);
}

// ── Addresses ───────────────────────────────────────────────────────────────

export async function newAddress(type = "TAPROOT_PUBKEY") {
  return gw("POST", "/v1/addresses/new", { type });
}

// ── Payments ────────────────────────────────────────────────────────────────

export async function sendPayment(bolt11, agentMacaroon) {
  return gw("POST", "/v1/payments/send", { bolt11 }, agentMacaroon);
}

export async function payInvoiceSync(bolt11, agentMacaroon) {
  return gw("POST", "/v1/payments/send", { bolt11 }, agentMacaroon);
}

// ── Invoices ────────────────────────────────────────────────────────────────

export async function addInvoice(amountSats, memo, agentMacaroon) {
  return gw("POST", "/v1/invoices/add", { amount_sats: amountSats, memo }, agentMacaroon);
}

export async function decodeInvoice(bolt11) {
  if (!bolt11 || (!bolt11.startsWith("lnbc") && !bolt11.startsWith("lntb"))) {
    return { is_valid: false, error: "not a Lightning invoice" };
  }
  try {
    const data = await gw("POST", "/v1/payments/decode", { bolt11 });
    return { ...data, is_valid: true };
  } catch (err) {
    return { is_valid: false, error: err.message };
  }
}

// ── Payment History ─────────────────────────────────────────────────────────

export async function listPayments(agentMacaroon, limit = 10) {
  const data = await gw("GET", `/v1/payments/list?limit=${limit}`, null, agentMacaroon);
  return data.payments || [];
}

// ── On-chain ────────────────────────────────────────────────────────────────

export async function sendCoins(address, amountSats) {
  return gw("POST", "/v1/onchain/send", { address, amount_sats: amountSats });
}

export async function publishTransaction(txHex) {
  return gw("POST", "/v1/onchain/publish", { tx_hex: txHex });
}

export async function listUnspent() {
  return gw("GET", "/v1/onchain/utxos");
}

export async function getTransactions() {
  return gw("GET", "/v1/onchain/transactions");
}

// ── Channel Operations ──────────────────────────────────────────────────────

export const DEFAULT_CHANNEL_PEER = {
  pubkey: process.env.CHANNEL_PEER_PUBKEY || "03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f",
  host: process.env.CHANNEL_PEER_HOST || "3.33.236.230:9735",
  name: process.env.CHANNEL_PEER_NAME || "ACINQ",
};

export async function connectPeer(pubkey, host) {
  try {
    return await gw("POST", "/v1/channels/connect-peer", { pubkey, host });
  } catch (err) {
    if (err.message?.includes("already connected")) return { ok: true };
    throw err;
  }
}

export async function listPeers() {
  return gw("GET", "/v1/channels/peers");
}

export async function openChannel(peerPubkey, localAmountSats) {
  return gw("POST", "/v1/channels/open", { peer_pubkey: peerPubkey, local_amount_sats: localAmountSats });
}

export async function listChannels() {
  return gw("GET", "/v1/channels/list");
}

export async function pendingChannels() {
  return gw("GET", "/v1/channels/pending");
}

// ── Macaroon baking ─────────────────────────────────────────────────────────

export async function bakeAgentMacaroon(accountId) {
  const data = await gw("POST", "/v1/macaroons/bake-agent", { account_id: accountId });
  return data.macaroon;
}
