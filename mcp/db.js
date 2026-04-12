/**
 * Lightweight SQLite DB for the MCP package.
 * Stores approvals and transaction logs only.
 */
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.AEGIS_DB_PATH || join(tmpdir(), "aegis-mcp.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount_sats INTEGER NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    amount_sats INTEGER NOT NULL,
    purpose TEXT,
    bolt11 TEXT,
    payment_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approval_type TEXT,
    approval_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Approvals ───────────────────────────────────────────────────────────────

export function createApproval({ agent_id, type, amount_sats, reason, status, expires_at }) {
  const id = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    "INSERT INTO approvals (id, type, amount_sats, reason, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, type, amount_sats, reason, status, expires_at || null);
  return { id };
}

export function getApproval(id) {
  return db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) || null;
}

export function updateApprovalStatus(id, status) {
  return db.prepare("UPDATE approvals SET status = ? WHERE id = ?").run(status, id);
}

// ── Transactions ────────────────────────────────────────────────────────────

export function createTransaction(tx) {
  db.prepare(`
    INSERT INTO transactions (type, amount_sats, purpose, bolt11, payment_hash, status, approval_type, approval_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tx.type, tx.amount_sats, tx.purpose, tx.bolt11, tx.payment_hash, tx.status, tx.approval_type, tx.approval_id || null);
}

export function getTransactions(agentId, limit = 10) {
  return db.prepare("SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?").all(limit);
}

export function getTransactionByPaymentHash(hash) {
  return db.prepare("SELECT * FROM transactions WHERE payment_hash = ? AND status = 'settled'").get(hash) || null;
}

export function getAgentSpendingToday(agentId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount_sats), 0) as total_sats FROM transactions
    WHERE type = 'payment' AND status = 'settled' AND date(created_at) = date('now')
  `).get();
  return { total_sats: row.total_sats };
}

// ── User (stub for auto-pay threshold) ──────────────────────────────────────

export function getUser(credentialId) {
  // Auto-pay threshold is set via --threshold CLI arg, not DB
  return null;
}

// ── Audit ───────────────────────────────────────────────────────────────────

export function logToolCall({ agent_id, tool, params_summary, outcome }) {
  // Log to stderr (visible in Claude Desktop logs)
  if (process.env.DEBUG) {
    process.stderr.write(`[aegis] ${tool}: ${params_summary} → ${outcome}\n`);
  }
}

export function getAuditLog() { return []; }

export default db;
