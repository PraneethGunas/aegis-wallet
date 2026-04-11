/**
 * Mock database — in-memory Maps + file-backed approvals (for cross-process).
 * Replace with real db/index.js (Person 1) when ready.
 */
import * as sharedStore from "./shared-store.js";

let idCounter = 1;
const agents = new Map();
const transactions = [];
const auditLog = [];
const users = new Map();

// ── Seed default data ─────────────────────────────────────────────────────────
agents.set("test_token_123", {
  id: "agent_1",
  user_credential_id: "user_1",
  litd_account_id: "acc_1",
  macaroon_encrypted: "mock_macaroon_hex",
  budget_sats: 50000,
  status: "active",
  auth_token: "test_token_123",
});

users.set("user_1", {
  credential_id: "user_1",
  auto_pay_threshold_sats: 15000,
  created_at: new Date().toISOString(),
});

// ── Agents ────────────────────────────────────────────────────────────────────
export function getAgent(authToken) {
  return agents.get(authToken) || null;
}

export function getAgentById(agentId) {
  for (const agent of agents.values()) {
    if (agent.id === agentId) return agent;
  }
  return null;
}

export function createAgent({ user_credential_id, litd_account_id, macaroon, budget_sats, auth_token }) {
  const id = `agent_${idCounter++}`;
  const agent = { id, user_credential_id, litd_account_id, macaroon_encrypted: macaroon, budget_sats, status: "active", auth_token };
  agents.set(auth_token, agent);
  return { id };
}

export function updateAgentStatus(agentId, status) {
  for (const agent of agents.values()) {
    if (agent.id === agentId) {
      agent.status = status;
      return true;
    }
  }
  return false;
}

// ── Transactions ──────────────────────────────────────────────────────────────
export function createTransaction({ agent_id, type, amount_sats, purpose, bolt11, payment_hash, status, approval_type, approval_id }) {
  const id = `tx_${idCounter++}`;
  const tx = { id, agent_id, type, amount_sats, purpose, bolt11, payment_hash, status, approval_type, approval_id, created_at: new Date().toISOString() };
  transactions.push(tx);
  return { id };
}

export function getTransactions(agentId, limit = 10) {
  return transactions
    .filter((tx) => tx.agent_id === agentId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

/** Returns the settled transaction for a given payment_hash, or null. */
export function getTransactionByPaymentHash(paymentHash) {
  return transactions.find(
    (tx) => tx.payment_hash === paymentHash && tx.status === "settled"
  ) || null;
}

export function getAgentSpendingToday(agentId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const total = transactions
    .filter((tx) => tx.agent_id === agentId && new Date(tx.created_at) >= startOfDay && tx.status === "settled")
    .reduce((sum, tx) => sum + tx.amount_sats, 0);
  return { total_sats: total };
}

// ── Approvals (file-backed for cross-process support) ─────────────────────────
export function createApproval({ agent_id, type, amount_sats, reason, status, expires_at }) {
  const id = `apr_${idCounter++}`;
  sharedStore.createApproval({ id, agent_id, type, amount_sats, reason, status, expires_at });
  return { id };
}

export function getApproval(approvalId) {
  return sharedStore.getApproval(approvalId);
}

export function updateApprovalStatus(approvalId, status) {
  return sharedStore.updateApprovalStatus(approvalId, status);
}

// ── Audit log ─────────────────────────────────────────────────────────────────
/**
 * Record a tool invocation for audit and activity feed purposes.
 * Stores: tool name, agent, human-readable params summary, outcome, timing.
 * Intentionally omits raw bolt11 strings and secrets.
 */
export function logToolCall({ agent_id, tool, params_summary, outcome, duration_ms }) {
  auditLog.push({
    agent_id,
    tool,
    params_summary,
    outcome,
    duration_ms,
    timestamp: new Date().toISOString(),
  });
}

export function getAuditLog(agentId, limit = 50) {
  return auditLog
    .filter((e) => e.agent_id === agentId)
    .slice(-limit)
    .reverse();
}

// ── Users ─────────────────────────────────────────────────────────────────────
export function getUser(credentialId) {
  return users.get(credentialId) || null;
}
