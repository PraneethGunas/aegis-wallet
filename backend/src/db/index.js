/**
 * Real database — SQLite via better-sqlite3.
 * Drop-in replacement for mocks/db.js with identical export signatures.
 */
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DB_PATH || join(tmpdir(), "aegis.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize schema
const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

// ── Agents ──────────────────────────────────────────────────────────────────

/** Lookup agent by auth_token (used by MCP auth on every tool call). */
export function getAgent(authToken) {
  return db.prepare("SELECT * FROM agents WHERE auth_token = ?").get(authToken) || null;
}

export function getAgentById(agentId) {
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) || null;
}

export function createAgent({ user_credential_id, litd_account_id, macaroon, budget_sats, auth_token }) {
  const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    "INSERT INTO agents (id, user_credential_id, litd_account_id, macaroon_encrypted, budget_sats, auth_token) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, user_credential_id, litd_account_id, macaroon, budget_sats, auth_token);
  return { id };
}

export function updateAgentStatus(agentId, status) {
  const result = db.prepare("UPDATE agents SET status = ? WHERE id = ?").run(status, agentId);
  return result.changes > 0;
}

// ── Transactions ────────────────────────────────────────────────────────────

export function createTransaction({ agent_id, type, amount_sats, purpose, bolt11, payment_hash, status, approval_type, approval_id }) {
  const stmt = db.prepare(
    "INSERT INTO transactions (agent_id, type, amount_sats, purpose, bolt11, payment_hash, status, approval_type, approval_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const result = stmt.run(agent_id, type, amount_sats, purpose, bolt11, payment_hash, status, approval_type, approval_id || null);
  return { id: `tx_${result.lastInsertRowid}` };
}

export function getTransactions(agentId, limit = 10) {
  return db.prepare(
    "SELECT * FROM transactions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(agentId, limit);
}

export function getTransactionByPaymentHash(paymentHash) {
  return db.prepare(
    "SELECT * FROM transactions WHERE payment_hash = ? AND status = 'settled'"
  ).get(paymentHash) || null;
}

export function getAgentSpendingToday(agentId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount_sats), 0) as total_sats
    FROM transactions
    WHERE agent_id = ? AND type = 'payment' AND status = 'settled'
    AND date(created_at) = date('now')
  `).get(agentId);
  return { total_sats: row.total_sats };
}

// ── Approvals ───────────────────────────────────────────────────────────────

export function createApproval({ agent_id, type, amount_sats, reason, status, expires_at }) {
  const id = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    "INSERT INTO approvals (id, agent_id, type, amount_sats, reason, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, agent_id, type, amount_sats, reason, status, expires_at || null);
  return { id };
}

export function getApproval(approvalId) {
  return db.prepare("SELECT * FROM approvals WHERE id = ?").get(approvalId) || null;
}

export function updateApprovalStatus(approvalId, status) {
  const result = db.prepare("UPDATE approvals SET status = ? WHERE id = ?").run(status, approvalId);
  return result.changes > 0;
}

// ── Audit log ───────────────────────────────────────────────────────────────

export function logToolCall({ agent_id, tool, params_summary, outcome, duration_ms }) {
  db.prepare(
    "INSERT INTO audit_log (agent_id, tool, params_summary, outcome, duration_ms) VALUES (?, ?, ?, ?, ?)"
  ).run(agent_id, tool, params_summary, outcome, duration_ms || null);
}

export function getAuditLog(agentId, limit = 50) {
  return db.prepare(
    "SELECT * FROM audit_log WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?"
  ).all(agentId, limit);
}

// ── Users ───────────────────────────────────────────────────────────────────

export function getUser(credentialId) {
  return db.prepare("SELECT * FROM users WHERE credential_id = ?").get(credentialId) || null;
}

export function createUser(credentialId, autoPayThresholdSats = 15000) {
  db.prepare(
    "INSERT OR IGNORE INTO users (credential_id, auto_pay_threshold_sats) VALUES (?, ?)"
  ).run(credentialId, autoPayThresholdSats);
}

export default db;
