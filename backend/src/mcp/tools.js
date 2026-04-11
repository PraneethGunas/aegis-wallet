/**
 * Aegis Wallet MCP Tools — 7 wallet tools exposed to Claude.
 *
 * Each tool is registered on the McpServer instance.
 * Currently wired to mocks. Swap imports to real services for production.
 */
import { z } from "zod";
import * as lnd from "../mocks/lnd.js";
import * as litd from "../mocks/litd.js";
import * as db from "../mocks/db.js";

// BTC/USD price cache (60s)
let priceCache = { usd: 96000, fetchedAt: 0 };
async function getBtcUsd() {
  if (Date.now() - priceCache.fetchedAt < 60_000) return priceCache.usd;
  priceCache = { usd: 96000, fetchedAt: Date.now() };
  return priceCache.usd;
}

function satsToUsd(sats, btcPrice) {
  return ((sats / 1e8) * btcPrice).toFixed(2);
}

function reply(data) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function errorReply(message) {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const APPROVAL_POLL_INTERVAL_MS = 1000;
const APPROVAL_TIMEOUT_MS = 600_000; // 10 minutes

/**
 * Wait for an approval to be resolved (approved/denied) by polling the DB.
 * Returns the final approval record.
 */
async function waitForApproval(approvalId) {
  const start = Date.now();
  while (Date.now() - start < APPROVAL_TIMEOUT_MS) {
    const approval = db.getApproval(approvalId);
    if (!approval) break;
    if (approval.status === "approved" || approval.status === "denied") {
      return approval;
    }
    await sleep(APPROVAL_POLL_INTERVAL_MS);
  }
  // Timed out — mark as denied
  db.updateApprovalStatus(approvalId, "denied");
  return db.getApproval(approvalId);
}

// ── Register all tools on a server instance ───────────────────────────────────
/**
 * @param {McpServer} server
 * @param {() => Agent} getAgentContext
 * @param {object} opts
 * @param {(credentialId: string, event: string, data: object) => void} [opts.emitToUser] — WebSocket emitter (optional)
 */
export function registerTools(server, getAgentContext, opts = {}) {
  const emitToUser = opts.emitToUser || (() => {});

  // ── 1. pay_invoice ────────────────────────────────────────────────────────
  server.tool(
    "pay_invoice",
    "Pay a Lightning invoice within the agent's budget. Returns preimage (proof of payment) on success.",
    {
      bolt11: z.string().describe("BOLT11 invoice string (starts with lnbc)"),
      purpose: z.string().describe("Why this payment is being made (for logging and user display)"),
    },
    async ({ bolt11, purpose }) => {
      const agent = getAgentContext();

      const decoded = await lnd.decodeInvoice(bolt11);
      if (decoded.is_expired) {
        return errorReply("Invoice has expired. Request a new one.");
      }

      const result = await lnd.sendPayment(bolt11, agent.macaroon_encrypted);

      if (!result.success) {
        return reply({
          success: false,
          error: result.error,
          balance_sats: result.balance_sats || null,
          invoice_amount_sats: result.invoice_amount_sats || decoded.amount_sats,
        });
      }

      db.createTransaction({
        agent_id: agent.id,
        type: "payment",
        amount_sats: result.amount_sats,
        purpose,
        bolt11,
        status: "settled",
        approval_type: "auto",
      });

      // Notify user's browser
      emitToUser(agent.user_credential_id, "payment_made", {
        amount_sats: result.amount_sats,
        purpose,
        balance_remaining_sats: result.balance_remaining_sats,
        approval_type: "auto",
        agent_id: agent.id,
      });

      return reply({
        success: true,
        amount_sats: result.amount_sats,
        fee_sats: result.fee_sats,
        balance_remaining_sats: result.balance_remaining_sats,
        preimage: result.preimage,
      });
    }
  );

  // ── 2. create_invoice ─────────────────────────────────────────────────────
  server.tool(
    "create_invoice",
    "Generate a Lightning invoice to receive a payment into the agent's account.",
    {
      amount_sats: z.number().int().positive().describe("Amount in satoshis to request"),
      memo: z.string().describe("Description shown to the payer"),
    },
    async ({ amount_sats, memo }) => {
      const agent = getAgentContext();
      const invoice = await lnd.addInvoice(amount_sats, memo, agent.macaroon_encrypted);
      return reply({
        bolt11: invoice.bolt11,
        payment_hash: invoice.payment_hash,
        expires_at: invoice.expires_at,
      });
    }
  );

  // ── 3. get_balance ────────────────────────────────────────────────────────
  server.tool(
    "get_balance",
    "Check the agent's current spending balance and the user's auto-pay threshold. Payments under the threshold can be auto-paid; payments over it need user approval via request_approval.",
    {},
    async () => {
      const agent = getAgentContext();
      const { balance_sats } = await lnd.getBalance(agent.macaroon_encrypted);
      const user = db.getUser(agent.user_credential_id);
      const btcPrice = await getBtcUsd();

      return reply({
        balance_sats,
        balance_usd: satsToUsd(balance_sats, btcPrice),
        auto_pay_threshold_sats: user?.auto_pay_threshold_sats ?? 15000,
        auto_pay_threshold_usd: satsToUsd(user?.auto_pay_threshold_sats ?? 15000, btcPrice),
      });
    }
  );

  // ── 4. get_budget_status ──────────────────────────────────────────────────
  server.tool(
    "get_budget_status",
    "Get a detailed view of today's spending, remaining budget, and recent payments.",
    {},
    async () => {
      const agent = getAgentContext();
      const { balance_sats } = await lnd.getBalance(agent.macaroon_encrypted);
      const spending = db.getAgentSpendingToday(agent.id);
      const recentTxs = db.getTransactions(agent.id, 5);

      return reply({
        spent_today_sats: spending.total_sats,
        remaining_sats: balance_sats,
        total_budget_sats: agent.budget_sats,
        recent_payments: recentTxs.map((tx) => ({
          amount_sats: tx.amount_sats,
          purpose: tx.purpose,
          approval_type: tx.approval_type,
          timestamp: tx.created_at,
        })),
      });
    }
  );

  // ── 5. request_approval ───────────────────────────────────────────────────
  server.tool(
    "request_approval",
    "Request user approval for a specific payment that exceeds the auto-pay threshold. Sends a biometric prompt to the user's device. Blocks until approved, denied, or timed out (~10 min).",
    {
      amount_sats: z.number().int().positive().describe("Payment amount in satoshis"),
      reason: z.string().describe("Human-readable reason shown to the user (e.g. 'coolproject.co domain — $8')"),
    },
    async ({ amount_sats, reason }) => {
      const agent = getAgentContext();
      const btcPrice = await getBtcUsd();

      const expiresAt = new Date(Date.now() + APPROVAL_TIMEOUT_MS).toISOString();
      const { id: approvalId } = db.createApproval({
        agent_id: agent.id,
        type: "payment",
        amount_sats,
        reason,
        status: "pending",
        expires_at: expiresAt,
      });

      // Push to user's browser
      emitToUser(agent.user_credential_id, "approval_requested", {
        approval_id: approvalId,
        type: "payment",
        amount_sats,
        amount_usd: satsToUsd(amount_sats, btcPrice),
        reason,
        expires_at: expiresAt,
      });

      // Block until resolved
      const approval = await waitForApproval(approvalId);

      if (approval.status === "approved") {
        emitToUser(agent.user_credential_id, "approval_resolved", { approval_id: approvalId, approved: true });
        return reply({ approved: true, approval_id: approvalId });
      } else {
        const reason = approval.status === "denied" ? "denied_by_user" : "timeout";
        emitToUser(agent.user_credential_id, "approval_resolved", { approval_id: approvalId, approved: false });
        return reply({ approved: false, approval_id: approvalId, reason });
      }
    }
  );

  // ── 6. request_topup ──────────────────────────────────────────────────────
  server.tool(
    "request_topup",
    "Request the user to add more funds to the agent's budget. Sends a notification to the user's device. Blocks until approved or denied.",
    {
      amount_sats: z.number().int().positive().describe("Additional budget requested in satoshis"),
      reason: z.string().describe("Why more budget is needed (e.g. 'Need $8 for API access the user requested')"),
    },
    async ({ amount_sats, reason }) => {
      const agent = getAgentContext();
      const btcPrice = await getBtcUsd();

      const expiresAt = new Date(Date.now() + APPROVAL_TIMEOUT_MS).toISOString();
      const { id: approvalId } = db.createApproval({
        agent_id: agent.id,
        type: "topup",
        amount_sats,
        reason,
        status: "pending",
        expires_at: expiresAt,
      });

      emitToUser(agent.user_credential_id, "topup_requested", {
        approval_id: approvalId,
        amount_sats,
        amount_usd: satsToUsd(amount_sats, btcPrice),
        reason,
        expires_at: expiresAt,
      });

      const approval = await waitForApproval(approvalId);

      if (approval.status === "approved") {
        const { balance_sats } = await lnd.getBalance(agent.macaroon_encrypted);
        const newBalance = balance_sats + amount_sats;
        await litd.updateBalance(agent.litd_account_id, newBalance);
        emitToUser(agent.user_credential_id, "topup_approved", { new_balance_sats: newBalance });
        return reply({ approved: true, new_balance_sats: newBalance });
      } else {
        return reply({ approved: false, reason: "denied_by_user" });
      }
    }
  );

  // ── 7. list_payments ──────────────────────────────────────────────────────
  server.tool(
    "list_payments",
    "List the agent's recent payment history, including purpose and approval type for each.",
    {
      limit: z.number().int().min(1).max(50).default(10).describe("Number of payments to return (default 10, max 50)"),
    },
    async ({ limit }) => {
      const agent = getAgentContext();
      const txs = db.getTransactions(agent.id, limit);
      const btcPrice = await getBtcUsd();

      return reply({
        payments: txs.map((tx) => ({
          amount_sats: tx.amount_sats,
          amount_usd: satsToUsd(tx.amount_sats, btcPrice),
          purpose: tx.purpose,
          approval_type: tx.approval_type,
          timestamp: tx.created_at,
        })),
      });
    }
  );
}
