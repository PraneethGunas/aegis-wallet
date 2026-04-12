/**
 * LND gRPC client for the MCP package.
 * Self-contained — connects using macaroon + cert + socket from env/args.
 */
import { readFileSync, existsSync } from "fs";
import {
  authenticatedLndGrpc,
  getWalletInfo,
  getChannelBalance,
  pay,
  createInvoice,
  getPayments,
  decodePaymentRequest,
} from "ln-service";

let _lnd = null;

export function initLnd(macaroonB64) {
  // TLS cert: base64 env var, file path, or default
  let cert;
  if (process.env.LND_CERT_BASE64) {
    cert = process.env.LND_CERT_BASE64;
  } else {
    const certPath = process.env.LND_CERT_PATH || "~/.lnd/tls.cert";
    const resolved = certPath.replace("~", process.env.HOME);
    if (existsSync(resolved)) {
      cert = readFileSync(resolved).toString("base64");
    } else {
      throw new Error(`TLS cert not found at ${resolved}. Set LND_CERT_PATH or LND_CERT_BASE64.`);
    }
  }

  const socket = process.env.LND_SOCKET || "localhost:10009";

  const { lnd } = authenticatedLndGrpc({ cert, macaroon: macaroonB64, socket });
  _lnd = lnd;
  return lnd;
}

function getLnd() {
  if (!_lnd) throw new Error("LND not initialized. Call initLnd() first.");
  return _lnd;
}

// ── Balance ─────────────────────────────────────────────────────────────────

export async function getBalance() {
  const bal = await getChannelBalance({ lnd: getLnd() });
  return { balance_sats: bal.channel_balance || 0 };
}

// ── Payments ────────────────────────────────────────────────────────────────

export async function sendPayment(bolt11) {
  try {
    const result = await pay({ lnd: getLnd(), request: bolt11 });
    const { balance_sats } = await getBalance();
    return {
      success: true,
      amount_sats: result.tokens,
      fee_sats: result.fee,
      preimage: result.secret,
      balance_remaining_sats: balance_sats,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Invoices ────────────────────────────────────────────────────────────────

export async function addInvoice(amountSats, memo) {
  const invoice = await createInvoice({
    lnd: getLnd(),
    tokens: amountSats,
    description: memo,
  });
  return {
    bolt11: invoice.request,
    payment_hash: invoice.id,
    expires_at: invoice.expires_at,
  };
}

export async function decodeInvoice(bolt11) {
  if (!bolt11 || (!bolt11.startsWith("lnbc") && !bolt11.startsWith("lntb"))) {
    return {
      is_valid: false,
      error: "not a Lightning invoice — must start with 'lnbc' or 'lntb'",
    };
  }
  try {
    const decoded = await decodePaymentRequest({ lnd: getLnd(), request: bolt11 });
    const expiresAt = new Date(decoded.expires_at).getTime();
    return {
      is_valid: true,
      is_expired: expiresAt < Date.now(),
      payment_hash: decoded.id,
      amount_sats: decoded.tokens,
      description: decoded.description || "",
      expiry_seconds: Math.floor((expiresAt - Date.now()) / 1000),
    };
  } catch (err) {
    return { is_valid: false, error: err.message };
  }
}

// ── Payment History ─────────────────────────────────────────────────────────

export async function listPayments(limit = 10) {
  const { payments } = await getPayments({ lnd: getLnd(), limit });
  return (payments || []).map((p) => ({
    amount_sats: p.tokens,
    fee_sats: p.fee,
    status: p.is_confirmed ? "settled" : "pending",
    timestamp: p.created_at,
  }));
}

// ── Info ─────────────────────────────────────────────────────────────────────

export async function getInfo() {
  return getWalletInfo({ lnd: getLnd() });
}
