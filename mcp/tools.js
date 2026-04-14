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
      const steps = [];

      // Decode first
      const decoded = await lnd.decodeInvoice(bolt11);
      if (!decoded.is_valid) return errorReply(`Invalid invoice: ${decoded.error}`);
      if (decoded.is_expired) return errorReply("Invoice expired. Ask for a fresh one.");

      steps.push({
        step: 1,
        action: "invoice_decoded",
        detail: `${decoded.amount_sats} sats ($${satsToUsd(decoded.amount_sats, btcPrice)}) — ${decoded.description || "no description"}`,
        invoice: {
          amount_sats: decoded.amount_sats,
          amount_usd: satsToUsd(decoded.amount_sats, btcPrice),
          description: decoded.description,
          payment_hash: decoded.payment_hash,
          expiry_seconds: decoded.expiry_seconds,
        },
      });

      // Per-payment cost guard (lnget-style --max-cost)
      if (max_cost_sats && decoded.amount_sats > max_cost_sats) {
        steps.push({ step: 2, action: "rejected", detail: `Exceeds max_cost_sats (${max_cost_sats})` });
        return reply({ steps, success: false, reason: "exceeds_max_cost" });
      }

      // Pay
      steps.push({ step: 2, action: "paying", detail: `Sending ${decoded.amount_sats} sats via Lightning...` });
      const result = await lnd.sendPayment(bolt11);

      if (!result.success) {
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
          steps.push({ step: 3, action: "budget_exceeded", detail: "Forwarded to user's dashboard" });
          return reply({ steps, success: false, reason: "budget_exceeded" });
        }
        steps.push({ step: 3, action: "payment_failed", detail: result.error });
        return reply({ steps, success: false, error: result.error });
      }

      steps.push({
        step: 3,
        action: "payment_success",
        detail: `Paid ${result.amount_sats} sats + ${result.fee_sats || 0} fee`,
        receipt: {
          preimage: result.preimage,
          amount_sats: result.amount_sats,
          amount_usd: satsToUsd(result.amount_sats, btcPrice),
          fee_sats: result.fee_sats || 0,
          fee_usd: satsToUsd(result.fee_sats || 0, btcPrice),
          payment_hash: decoded.payment_hash,
          balance_remaining_sats: result.balance_remaining_sats,
          balance_remaining_usd: satsToUsd(result.balance_remaining_sats, btcPrice),
        },
      });

      return reply({
        steps,
        success: true,
        purpose,
        receipt: steps.find((s) => s.receipt)?.receipt || null,
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
      no_cache: z.boolean().default(false).optional().describe("Skip token cache — always pay fresh (useful for demos)"),
    },
    wrapTool(async ({ url, method, headers: extraHeaders, body, max_cost_sats, no_cache }) => {
      getAgentContext();
      const btcPrice = await getBtcUsd();
      const steps = [];

      const reqHeaders = { ...extraHeaders };

      // Check token cache first — reuse if we already paid this domain
      const cached = !no_cache ? getCachedToken(url) : null;
      if (cached) {
        reqHeaders["Authorization"] = `L402 ${cached.macaroon}:${cached.preimage}`;
        steps.push({ step: 1, action: "cache_hit", detail: `Reusing cached L402 token for ${new URL(url).hostname}` });
      } else {
        steps.push({ step: 1, action: "request", detail: `${method} ${url}${no_cache ? " (cache skipped)" : ""}` });
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
        steps.push({ step: 2, action: "response", detail: `HTTP ${res.status} (no payment needed)` });
        const responseBody = await res.text();
        return reply({
          steps,
          status: res.status,
          body: truncateBody(responseBody),
          paid: false,
          cached_token: !!cached,
        });
      }

      // ── 402 Payment Required — extract L402 challenge ──────────────────
      steps.push({ step: 2, action: "l402_challenge", detail: "Server returned HTTP 402 — payment required" });

      const wwwAuth = res.headers.get("www-authenticate");
      const challenge = parseL402Challenge(wwwAuth);
      if (!challenge) {
        return errorReply(`Got 402 but couldn't parse L402 challenge from WWW-Authenticate: ${wwwAuth || "(missing)"}`);
      }

      // Decode invoice to check amount
      const decoded = await lnd.decodeInvoice(challenge.invoice);
      if (!decoded.is_valid) return errorReply(`L402 invoice invalid: ${decoded.error}`);
      if (decoded.is_expired) return errorReply("L402 invoice expired.");

      steps.push({
        step: 3,
        action: "invoice_decoded",
        detail: `${decoded.amount_sats} sats ($${satsToUsd(decoded.amount_sats, btcPrice)}) — ${decoded.description || "no description"}`,
        invoice: {
          amount_sats: decoded.amount_sats,
          amount_usd: satsToUsd(decoded.amount_sats, btcPrice),
          description: decoded.description,
          payment_hash: decoded.payment_hash,
          expiry_seconds: decoded.expiry_seconds,
        },
      });

      // Per-request cost guard
      if (max_cost_sats && decoded.amount_sats > max_cost_sats) {
        steps.push({ step: 4, action: "rejected", detail: `Invoice ${decoded.amount_sats} sats exceeds max_cost_sats ${max_cost_sats}` });
        return reply({
          steps,
          success: false,
          reason: "exceeds_max_cost",
          message: `Invoice is ${decoded.amount_sats} sats but max_cost_sats is ${max_cost_sats}. Refusing to pay.`,
        });
      }

      // Pay the invoice
      steps.push({ step: 4, action: "paying", detail: `Sending ${decoded.amount_sats} sats via Lightning...` });
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
          steps.push({ step: 5, action: "budget_exceeded", detail: "Forwarded invoice to user's dashboard" });
          return reply({
            steps,
            success: false,
            reason: "budget_exceeded",
            message: "Budget exhausted. Invoice forwarded to user's dashboard for direct payment.",
            url,
            invoice: { bolt11: challenge.invoice, amount_sats: decoded.amount_sats },
          });
        }
        steps.push({ step: 5, action: "payment_failed", detail: payment.error });
        return reply({ steps, success: false, error: payment.error });
      }

      steps.push({
        step: 5,
        action: "payment_success",
        detail: `Paid ${payment.amount_sats} sats + ${payment.fee_sats || 0} fee`,
        receipt: {
          preimage: payment.preimage,
          amount_sats: payment.amount_sats,
          amount_usd: satsToUsd(payment.amount_sats, btcPrice),
          fee_sats: payment.fee_sats || 0,
          fee_usd: satsToUsd(payment.fee_sats || 0, btcPrice),
          payment_hash: decoded.payment_hash,
          balance_remaining_sats: payment.balance_remaining_sats,
          balance_remaining_usd: satsToUsd(payment.balance_remaining_sats, btcPrice),
        },
      });

      // Cache the token for this domain
      cacheToken(url, challenge.macaroon, payment.preimage);
      steps.push({ step: 6, action: "token_cached", detail: `L402 token cached for ${new URL(url).hostname}` });

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
        steps.push({ step: 7, action: "retry_failed", detail: err.message });
        return reply({
          steps,
          paid: true,
          receipt: steps[4]?.receipt,
          retry_error: err.message,
          message: "Payment succeeded but retry request failed. Use the preimage to retry manually.",
        });
      }

      const retryBody = await retryRes.text();
      steps.push({ step: 7, action: "response", detail: `HTTP ${retryRes.status} — data received` });

      return reply({
        steps,
        status: retryRes.status,
        body: truncateBody(retryBody),
        receipt: steps.find((s) => s.receipt)?.receipt || null,
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
