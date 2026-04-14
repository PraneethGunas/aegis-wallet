/**
 * LND Gateway client for the MCP package.
 * Drop-in replacement for lnd.js — calls Go sidecar instead of ln-service.
 */

let _gateway = null;
let _macaroon = null;

export function initLnd(macaroonB64) {
  _macaroon = macaroonB64;
  _gateway = process.env.LND_GATEWAY_URL || "http://localhost:3003";
}

async function gw(method, path, body) {
  if (!_gateway) throw new Error("Gateway not initialized. Call initLnd() first.");

  const headers = { "Content-Type": "application/json" };
  if (_macaroon) headers["X-Macaroon"] = _macaroon;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${_gateway}${path}`, opts);
  return res.json();
}

// ── Balance ─────────────────────────────────────────────────────────────────

export async function getBalance() {
  const data = await gw("GET", "/v1/balance/channel");
  return { balance_sats: data.balance_sats || 0 };
}

// ── Payments ────────────────────────────────────────────────────────────────

export async function sendPayment(bolt11) {
  const data = await gw("POST", "/v1/payments/send", { bolt11 });
  if (!data.success) {
    return {
      success: false,
      error: data.error?.message || data.error || "payment failed",
      budget_exceeded: data.budget_exceeded || false,
    };
  }
  return {
    success: true,
    amount_sats: data.amount_sats,
    fee_sats: data.fee_sats,
    preimage: data.preimage,
    balance_remaining_sats: data.balance_remaining_sats,
  };
}

// ── Invoices ────────────────────────────────────────────────────────────────

export async function addInvoice(amountSats, memo) {
  return gw("POST", "/v1/invoices/add", { amount_sats: amountSats, memo });
}

export async function decodeInvoice(bolt11) {
  if (!bolt11 || (!bolt11.startsWith("lnbc") && !bolt11.startsWith("lntb"))) {
    return { is_valid: false, error: "not a Lightning invoice — must start with 'lnbc' or 'lntb'" };
  }
  try {
    const data = await gw("POST", "/v1/payments/decode", { bolt11 });
    if (data.error) return { is_valid: false, error: data.error.message || data.error };
    return {
      is_valid: true,
      is_expired: false, // gateway doesn't compute this yet
      payment_hash: data.payment_hash,
      amount_sats: data.amount_sats,
      description: data.description || "",
      expiry_seconds: data.expiry_seconds,
    };
  } catch (err) {
    return { is_valid: false, error: err.message };
  }
}

// ── Payment History ─────────────────────────────────────────────────────────

export async function listPayments(limit = 10) {
  const data = await gw("GET", `/v1/payments/list?limit=${limit}`);
  return (data.payments || []).map((p) => ({
    amount_sats: p.amount_sats,
    fee_sats: p.fee_sats,
    status: p.status,
    timestamp: p.timestamp,
  }));
}

// ── Info ─────────────────────────────────────────────────────────────────────

export async function getInfo() {
  return gw("GET", "/v1/node/info");
}
