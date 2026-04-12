/**
 * Aegis Wallet MCP Tools — thin bridge to LND.
 *
 * Budget enforcement is in the macaroon (LND layer).
 * Per-payment max-cost is enforced here (lnget-style).
 * L402 token cache avoids re-payment to the same domain.
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

const MAX_BODY_CHARS = 20_000;
function truncateBody(text) {
  if (text.length <= MAX_BODY_CHARS) return text;
  return text.slice(0, MAX_BODY_CHARS) + `\n\n... [truncated — ${text.length} chars total, showing first ${MAX_BODY_CHARS}]`;
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

// ── L402 token cache (lnget-style, per domain, in-memory) ──────────────────
const tokenCache = new Map(); // domain → { macaroon, preimage }

function cacheToken(url, macaroon, preimage) {
  try {
    const domain = new URL(url).hostname;
    tokenCache.set(domain, { macaroon, preimage, cachedAt: Date.now() });
  } catch {}
}

function getCachedToken(url) {
  try {
    const domain = new URL(url).hostname;
    return tokenCache.get(domain) || null;
  } catch { return null; }
}

/**
 * Parse L402 challenge from WWW-Authenticate header.
 * Format: L402 macaroon="<base64>", invoice="<bolt11>"
 * or:     LSAT macaroon="<base64>", invoice="<bolt11>"
 */
function parseL402Challenge(header) {
  if (!header) return null;
  const match = header.match(/(?:L402|LSAT)\s+macaroon="([^"]+)",\s*invoice="([^"]+)"/i);
  if (!match) return null;
  return { macaroon: match[1], invoice: match[2] };
}

/**
 * Register all wallet tools on a server instance.
 */
export function registerTools(server, getAgentContext, opts = {}) {

  // ── 1. pay_invoice ────────────────────────────────────────────────────────
  server.tool(
    "pay_invoice",
    "Pay a Lightning invoice. Budget enforced by LND. Use max_cost_sats to set a per-payment ceiling (like lnget --max-cost).",
    {
      bolt11: z.string().describe("BOLT11 invoice string"),
      purpose: z.string().describe("Why this payment is being made"),
      max_cost_sats: z.number().int().positive().optional().describe("Refuse to pay if invoice exceeds this amount (optional safety cap)"),
    },
    wrapTool(async ({ bolt11, purpose, max_cost_sats }) => {
      getAgentContext();
      const btcPrice = await getBtcUsd();

      // Decode first
      const decoded = await lnd.decodeInvoice(bolt11);
      if (!decoded.is_valid) return errorReply(`Invalid invoice: ${decoded.error}`);
      if (decoded.is_expired) return errorReply("Invoice expired. Ask for a fresh one.");

      // Per-payment cost guard (lnget-style --max-cost)
      if (max_cost_sats && decoded.amount_sats > max_cost_sats) {
        return reply({
          success: false,
          reason: "exceeds_max_cost",
          message: `Invoice is ${decoded.amount_sats} sats but max_cost_sats is ${max_cost_sats}. Refusing to pay.`,
          invoice: { amount_sats: decoded.amount_sats, description: decoded.description },
        });
      }

      // Pay
      const result = await lnd.sendPayment(bolt11);
      if (!result.success) {
        // Budget exceeded — escalate to user's dashboard for direct payment
        if (result.budget_exceeded && opts.apiUrl && opts.userId) {
          try {
            await fetch(`${opts.apiUrl}/dev/emit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                credential_id: opts.userId,
                event: "payment_failed",
                data: { bolt11, amount_sats: decoded.amount_sats, description: decoded.description, purpose },
              }),
            });
          } catch {}
          return reply({
            success: false,
            reason: "budget_exceeded",
            message: "Your spending budget is exhausted. This invoice has been sent to the user's Aegis dashboard — they can pay it directly.",
            invoice: { bolt11, amount_sats: decoded.amount_sats, description: decoded.description },
          });
        }
        return errorReply(`Payment failed: ${result.error}. Invoice: ${decoded.amount_sats} sats. Check channel liquidity with get_balance().`);
      }

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

  // ── 6. l402_fetch — automatic L402 payment flow (lnget-style) ────────────
  server.tool(
    "l402_fetch",
    "Fetch a URL with automatic L402 payment. If the server returns 402, this tool extracts the invoice, pays it, and retries with the L402 auth header. Caches tokens per domain to avoid re-payment. Like lnget but as an MCP tool.",
    {
      url: z.string().describe("URL to fetch"),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET").describe("HTTP method"),
      headers: z.record(z.string()).optional().describe("Extra HTTP headers"),
      body: z.string().optional().describe("Request body (for POST/PUT)"),
      max_cost_sats: z.number().int().positive().optional().describe("Refuse to pay if invoice exceeds this (safety cap)"),
    },
    wrapTool(async ({ url, method, headers: extraHeaders, body, max_cost_sats }) => {
      getAgentContext();
      const btcPrice = await getBtcUsd();

      const reqHeaders = { ...extraHeaders };

      // Check token cache first — reuse if we already paid this domain
      const cached = getCachedToken(url);
      if (cached) {
        reqHeaders["Authorization"] = `L402 ${cached.macaroon}:${cached.preimage}`;
      }

      // First request
      const fetchOpts = { method, headers: reqHeaders, signal: AbortSignal.timeout(15000) };
      if (body && (method === "POST" || method === "PUT")) fetchOpts.body = body;

      let res;
      try {
        res = await fetch(url, fetchOpts);
      } catch (err) {
        return errorReply(`Network error: ${err.message}`);
      }

      // Not a 402 — return the response directly
      if (res.status !== 402) {
        const responseBody = await res.text();
        return reply({
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body: truncateBody(responseBody),
          paid: false,
          cached_token: !!cached,
        });
      }

      // ── 402 Payment Required — extract L402 challenge ──────────────────
      const wwwAuth = res.headers.get("www-authenticate");
      const challenge = parseL402Challenge(wwwAuth);
      if (!challenge) {
        return errorReply(`Got 402 but couldn't parse L402 challenge from WWW-Authenticate: ${wwwAuth || "(missing)"}`);
      }

      // Decode invoice to check amount
      const decoded = await lnd.decodeInvoice(challenge.invoice);
      if (!decoded.is_valid) return errorReply(`L402 invoice invalid: ${decoded.error}`);
      if (decoded.is_expired) return errorReply("L402 invoice expired.");

      // Per-request cost guard
      if (max_cost_sats && decoded.amount_sats > max_cost_sats) {
        return reply({
          success: false,
          reason: "exceeds_max_cost",
          message: `L402 invoice is ${decoded.amount_sats} sats but max_cost_sats is ${max_cost_sats}. Not paying.`,
          invoice: { amount_sats: decoded.amount_sats, description: decoded.description },
        });
      }

      // Pay the invoice
      const payment = await lnd.sendPayment(challenge.invoice);
      if (!payment.success) {
        // Budget exceeded — escalate
        if (payment.budget_exceeded && opts.apiUrl && opts.userId) {
          try {
            await fetch(`${opts.apiUrl}/dev/emit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                credential_id: opts.userId,
                event: "payment_failed",
                data: { bolt11: challenge.invoice, amount_sats: decoded.amount_sats, description: decoded.description, purpose: `L402 payment for ${url}` },
              }),
            });
          } catch {}
          return reply({
            success: false,
            reason: "budget_exceeded",
            message: "Budget exhausted. Invoice forwarded to user's dashboard for direct payment.",
            url,
            invoice: { bolt11: challenge.invoice, amount_sats: decoded.amount_sats },
          });
        }
        return errorReply(`L402 payment failed: ${payment.error}. Invoice: ${decoded.amount_sats} sats to ${decoded.description || "unknown"}. Check channel liquidity with get_balance().`);
      }

      // Cache the token for this domain
      cacheToken(url, challenge.macaroon, payment.preimage);

      // Retry with L402 auth header
      const retryHeaders = {
        ...extraHeaders,
        "Authorization": `L402 ${challenge.macaroon}:${payment.preimage}`,
      };
      const retryOpts = { method, headers: retryHeaders, signal: AbortSignal.timeout(15000) };
      if (body && (method === "POST" || method === "PUT")) retryOpts.body = body;

      let retryRes;
      try {
        retryRes = await fetch(url, retryOpts);
      } catch (err) {
        return reply({
          paid: true,
          amount_sats: payment.amount_sats,
          amount_usd: satsToUsd(payment.amount_sats, btcPrice),
          preimage: payment.preimage,
          retry_error: err.message,
          message: "Payment succeeded but retry request failed. Use the preimage to retry manually.",
        });
      }

      const retryBody = await retryRes.text();
      return reply({
        status: retryRes.status,
        headers: Object.fromEntries(retryRes.headers.entries()),
        body: truncateBody(retryBody),
        paid: true,
        amount_sats: payment.amount_sats,
        amount_usd: satsToUsd(payment.amount_sats, btcPrice),
        fee_sats: payment.fee_sats,
        balance_remaining_sats: payment.balance_remaining_sats,
        balance_remaining_usd: satsToUsd(payment.balance_remaining_sats, btcPrice),
      });
    })
  );

  // ── 7. get_spending_summary — total spent + remaining budget ─────────────
  server.tool(
    "get_spending_summary",
    "Get a summary of spending: total paid, number of payments, remaining balance, and cached L402 tokens.",
    {},
    wrapTool(async () => {
      getAgentContext();
      const { balance_sats } = await lnd.getBalance();
      const payments = await lnd.listPayments(50);
      const btcPrice = await getBtcUsd();

      const settled = payments.filter((p) => p.status === "settled");
      const totalSpent = settled.reduce((sum, p) => sum + p.amount_sats, 0);
      const totalFees = settled.reduce((sum, p) => sum + (p.fee_sats || 0), 0);

      return reply({
        balance_sats,
        balance_usd: satsToUsd(balance_sats, btcPrice),
        total_spent_sats: totalSpent,
        total_spent_usd: satsToUsd(totalSpent, btcPrice),
        total_fees_sats: totalFees,
        payment_count: settled.length,
        cached_l402_domains: [...tokenCache.keys()],
      });
    })
  );
}
