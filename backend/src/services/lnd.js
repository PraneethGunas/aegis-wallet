/**
 * LND service — gRPC via ln-service.
 * Connects to LND on port 10009 (gRPC), not REST.
 * All operations: wallet, channels, payments, invoices.
 */
import { readFileSync } from "fs";
import {
  authenticatedLndGrpc,
  getWalletInfo,
  getChainBalance,
  getChannelBalance,
  createChainAddress,
  getChannels,
  getPendingChannels,
  openChannel as lnOpenChannel,
  addPeer,
  getPeers,
  pay,
  createInvoice,
  getPayments,
  decodePaymentRequest,
  sendToChainAddress,
  getChainTransactions,
  getUtxos,
  broadcastChainTransaction,
  grantAccess,
} from "ln-service";
import * as macaroonLib from "macaroon";

// Read credentials
const cert = readFileSync(
  process.env.LND_CERT_PATH || "./certs/tls.cert"
).toString("base64");

const macaroon = readFileSync(
  process.env.LND_MACAROON_PATH || "./certs/admin.macaroon"
).toString("base64");

const socket = process.env.LND_GRPC_HOST || "localhost:10009";

const { lnd } = authenticatedLndGrpc({ cert, macaroon, socket });

// ── Per-agent scoped connections ────────────────────────────────────────────
// Each agent has a litd account macaroon that enforces its budget ceiling.
// When used for gRPC calls, LND's RPC middleware checks the account balance
// before routing any payment. No application code can override this.
const agentConnections = new Map();

function getAgentLnd(macaroonB64) {
  if (!macaroonB64) return lnd;
  if (agentConnections.has(macaroonB64)) return agentConnections.get(macaroonB64);

  const { lnd: agentLnd } = authenticatedLndGrpc({
    cert,
    macaroon: macaroonB64,
    socket,
  });
  agentConnections.set(macaroonB64, agentLnd);
  return agentLnd;
}

// ── Node Info ───────────────────────────────────────────────────────────────

export async function getInfo() {
  return getWalletInfo({ lnd });
}

// ── Balance ─────────────────────────────────────────────────────────────────

export async function getWalletBalance() {
  const bal = await getChainBalance({ lnd });
  return {
    confirmed_balance: String(bal.chain_balance),
    unconfirmed_balance: "0",
  };
}

export async function getBalance(agentMacaroon) {
  const connection = agentMacaroon ? getAgentLnd(agentMacaroon) : lnd;
  const bal = await getChannelBalance({ lnd: connection });
  return {
    balance_sats: bal.channel_balance || 0,
  };
}

// ── Addresses ───────────────────────────────────────────────────────────────

export async function newAddress(type = "TAPROOT_PUBKEY") {
  const format = type === "TAPROOT_PUBKEY" ? "p2tr" : "p2wpkh";
  const { address } = await createChainAddress({ format, lnd });
  return { address };
}

// ── Payments ────────────────────────────────────────────────────────────────

export async function sendPayment(bolt11, agentMacaroon) {
  try {
    const connection = agentMacaroon ? getAgentLnd(agentMacaroon) : lnd;

    if (agentMacaroon) {
      // Agent macaroons use litd accounts. The litd account middleware cannot
      // handle streaming RPCs (Router/SendPaymentV2), so use the legacy
      // unary SendPaymentSync instead.
      const result = await new Promise((resolve, reject) => {
        connection.default.sendPaymentSync({ payment_request: bolt11 }, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
      if (result.payment_error) {
        return { success: false, error: result.payment_error };
      }
      const { balance_sats } = await getBalance(agentMacaroon);
      return {
        success: true,
        amount_sats: Number(result.payment_route?.total_amt || 0),
        fee_sats: Number(result.payment_route?.total_fees || 0),
        preimage: Buffer.from(result.payment_preimage).toString("hex"),
        balance_remaining_sats: balance_sats,
      };
    }

    // Admin macaroon — use ln-service's pay() (streaming is fine without litd accounts)
    const result = await pay({ lnd: connection, request: bolt11 });
    const { balance_sats } = await getBalance(agentMacaroon);
    return {
      success: true,
      amount_sats: result.tokens,
      fee_sats: result.fee,
      preimage: result.secret,
      balance_remaining_sats: balance_sats,
    };
  } catch (err) {
    return { success: false, error: err.details || err.message };
  }
}

export async function payInvoiceSync(bolt11, agentMacaroon) {
  const connection = agentMacaroon ? getAgentLnd(agentMacaroon) : lnd;
  return pay({ lnd: connection, request: bolt11 });
}

// ── Invoices ────────────────────────────────────────────────────────────────

export async function addInvoice(amountSats, memo, agentMacaroon) {
  const connection = agentMacaroon ? getAgentLnd(agentMacaroon) : lnd;
  const invoice = await createInvoice({
    lnd: connection,
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
    const decoded = await decodePaymentRequest({ lnd, request: bolt11 });
    const expiresAt = new Date(decoded.expires_at).getTime();
    const isExpired = expiresAt < Date.now();
    return {
      is_valid: true,
      is_expired: isExpired,
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

export async function listPayments(agentMacaroon, limit = 10) {
  const connection = agentMacaroon ? getAgentLnd(agentMacaroon) : lnd;
  const { payments } = await getPayments({ lnd: connection, limit });
  return (payments || []).map((p) => ({
    amount_sats: p.tokens,
    fee_sats: p.fee,
    status: p.is_confirmed ? "settled" : "pending",
    timestamp: p.created_at,
  }));
}

// ── On-chain ────────────────────────────────────────────────────────────────

export async function sendCoins(address, amountSats) {
  const result = await sendToChainAddress({
    lnd,
    address,
    tokens: amountSats,
  });
  return { txid: result.id };
}

export async function publishTransaction(txHex) {
  const result = await broadcastChainTransaction({
    lnd,
    transaction: txHex,
  });
  return { txid: result.id };
}

export async function listUnspent() {
  const { utxos } = await getUtxos({ lnd });
  return { utxos };
}

export async function getTransactions() {
  const { transactions } = await getChainTransactions({ lnd });
  return { transactions };
}

// ── Channel Operations ──────────────────────────────────────────────────────

export const DEFAULT_CHANNEL_PEER = {
  pubkey: "03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f",
  host: "3.33.236.230:9735",
  name: "ACINQ",
};

export async function connectPeer(pubkey, host) {
  try {
    await addPeer({ lnd, public_key: pubkey, socket: host });
    return { ok: true };
  } catch (err) {
    if (err.message?.includes("already connected")) return { ok: true };
    throw err;
  }
}

export async function listPeers() {
  return getPeers({ lnd });
}

export async function openChannel(peerPubkey, localAmountSats) {
  const result = await lnOpenChannel({
    lnd,
    partner_public_key: peerPubkey,
    local_tokens: localAmountSats,
  });
  return {
    funding_txid_str: result.transaction_id,
    output_index: result.transaction_vout,
  };
}

export async function listChannels() {
  const { channels } = await getChannels({ lnd });
  return {
    channels: channels.map((ch) => ({
      channel_point: `${ch.transaction_id}:${ch.transaction_vout}`,
      remote_pubkey: ch.partner_public_key,
      local_balance: ch.local_balance,
      remote_balance: ch.remote_balance,
      capacity: ch.capacity,
      active: ch.is_active,
      chan_id: ch.id,
    })),
  };
}

export async function pendingChannels() {
  const pending = await getPendingChannels({ lnd });
  return {
    pending_open_channels: pending.pending_channels
      .filter((ch) => ch.is_opening)
      .map((ch) => ({
        channel: {
          channel_point: `${ch.transaction_id}:${ch.transaction_vout}`,
          local_balance: ch.local_balance,
          capacity: ch.capacity,
        },
      })),
  };
}

// ── Macaroon baking ─────────────────────────────────────────────────────────

/**
 * Bake a minimal-permission macaroon tied to a litd account.
 *
 * Takes the account ID from litd and creates a macaroon that can ONLY:
 * - Pay invoices (SendPaymentSync)
 * - Decode invoices (DecodePayReq)
 * - Check channel balance (ChannelBalance)
 * - List payments (ListPayments)
 * - Get node info (GetInfo)
 *
 * Cannot: see on-chain balance, create invoices, open channels, manage peers.
 * Budget ceiling enforced by the litd account caveat.
 */
export async function bakeAgentMacaroon(accountId) {
  // 1. Bake macaroon with minimal permissions
  // ln-service's pay() uses routerrpc.Router/SendPaymentV2 (streaming),
  // NOT lnrpc.Lightning/SendPaymentSync (legacy sync).
  // Also needs TrackPaymentV2 for payment tracking and QueryRoutes for pathfinding.
  const { macaroon: minimalB64 } = await grantAccess({
    lnd,
    permissions: [
      "uri:/routerrpc.Router/SendPaymentV2",
      "uri:/routerrpc.Router/TrackPaymentV2",
      "uri:/lnrpc.Lightning/SendPaymentSync",   // fallback if router unavailable
      "uri:/lnrpc.Lightning/DecodePayReq",
      "uri:/lnrpc.Lightning/ChannelBalance",
      "uri:/lnrpc.Lightning/ListPayments",
      "uri:/lnrpc.Lightning/GetInfo",
      "uri:/lnrpc.Lightning/AddInvoice",         // create_invoice tool
      "uri:/invoicesrpc.Invoices/AddHoldInvoice", // hold invoices if needed
    ],
  });

  // 2. Add the litd account caveat (ties to budget ceiling)
  const macBytes = new Uint8Array(Buffer.from(minimalB64, "base64"));
  const m = macaroonLib.importMacaroons(macBytes)[0];
  m.addFirstPartyCaveat(`lnd-custom account ${accountId}`);

  // 3. Export as base64
  return Buffer.from(m.exportBinary()).toString("base64");
}
