/**
 * Aegis Wallet MCP Tools — thin bridge to LND.
 *
 * No policy logic. No threshold checks. No approvals.
 * Budget enforcement is in the macaroon (LND layer).
 * Per-payment limits are prompt instructions (Claude layer).
 * Policy management is in the web app (app layer).
 */
import { z } from "zod";
import * as lnd from "./lnd.js";
import { AgentError } from "./auth.js";

// BTC/USD price cache
let priceCache = { usd: 0, fetchedAt: 0 };
async function getBtcUsd() {
  if (Date.now() - priceCache.fetchedAt < 60_000 && priceCache.usd > 0) return priceCache.usd;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if (data?.bitcoin?.usd) priceCache = { usd: data.bitcoin.usd, fetchedAt: Date.now() };
  } catch {}
  return priceCache.usd || 100000;
}

function satsToUsd(sats, price) {
  return ((sats / 1e8) * price).toFixed(2);
}

function reply(data) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function errorReply(message) {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

function wrapTool(handler) {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      if (err instanceof AgentError) return reply({ error: err.message });
      return errorReply(`Unexpected error: ${err.message}`);
    }
  };
}

/**
 * Register all wallet tools on a server instance.
 */
export function registerTools(server, getAgentContext, opts = {}) {

  // ── 1. pay_invoice ────────────────────────────────────────────────────────
  server.tool(
    "pay_invoice",
    "Pay a Lightning invoice. Budget enforced by LND — if you exceed it, the payment is rejected.",
    {
      bolt11: z.string().describe("BOLT11 invoice string"),
      purpose: z.string().describe("Why this payment is being made"),
    },
    wrapTool(async ({ bolt11, purpose }) => {
      getAgentContext();
      const btcPrice = await getBtcUsd();

      // Decode first
      const decoded = await lnd.decodeInvoice(bolt11);
      if (!decoded.is_valid) return errorReply(`Invalid invoice: ${decoded.error}`);
      if (decoded.is_expired) return errorReply("Invoice expired. Ask for a fresh one.");

      // Pay
      const result = await lnd.sendPayment(bolt11);
      if (!result.success) return errorReply(`Payment failed: ${result.error}`);

      return reply({
        success: true,
        amount_sats: result.amount_sats,
        amount_usd: satsToUsd(result.amount_sats, btcPrice),
        fee_sats: result.fee_sats,
        preimage: result.preimage,
        balance_remaining_sats: result.balance_remaining_sats,
        balance_remaining_usd: satsToUsd(result.balance_remaining_sats, btcPrice),
        purpose,
      });
    })
  );

  // ── 2. create_invoice ─────────────────────────────────────────────────────
  server.tool(
    "create_invoice",
    "Generate a Lightning invoice to receive a payment.",
    {
      amount_sats: z.number().int().positive().describe("Amount in satoshis"),
      memo: z.string().describe("Description shown to the payer"),
    },
    wrapTool(async ({ amount_sats, memo }) => {
      getAgentContext();
      const invoice = await lnd.addInvoice(amount_sats, memo);
      return reply(invoice);
    })
  );

  // ── 3. get_balance ────────────────────────────────────────────────────────
  server.tool(
    "get_balance",
    "Check the wallet's current spending balance.",
    {},
    wrapTool(async () => {
      getAgentContext();
      const { balance_sats } = await lnd.getBalance();
      const btcPrice = await getBtcUsd();
      return reply({
        balance_sats,
        balance_usd: satsToUsd(balance_sats, btcPrice),
      });
    })
  );

  // ── 4. decode_invoice ─────────────────────────────────────────────────────
  server.tool(
    "decode_invoice",
    "Decode a BOLT11 invoice to see amount, description, and expiry.",
    {
      bolt11: z.string().describe("BOLT11 invoice string"),
    },
    wrapTool(async ({ bolt11 }) => {
      getAgentContext();
      const decoded = await lnd.decodeInvoice(bolt11);
      if (!decoded.is_valid) return errorReply(decoded.error);
      const btcPrice = await getBtcUsd();
      return reply({
        ...decoded,
        amount_usd: satsToUsd(decoded.amount_sats, btcPrice),
      });
    })
  );

  // ── 5. list_payments ──────────────────────────────────────────────────────
  server.tool(
    "list_payments",
    "List recent payment history.",
    {
      limit: z.number().int().min(1).max(50).default(10).describe("Number of payments to return"),
    },
    wrapTool(async ({ limit }) => {
      getAgentContext();
      const payments = await lnd.listPayments(limit);
      const btcPrice = await getBtcUsd();
      return reply({
        payments: payments.map((p) => ({
          ...p,
          amount_usd: satsToUsd(p.amount_sats, btcPrice),
        })),
      });
    })
  );
}
