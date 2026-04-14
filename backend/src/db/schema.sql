-- Aegis database schema

CREATE TABLE IF NOT EXISTS users (
  credential_id TEXT PRIMARY KEY,
  signing_pubkey TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  user_credential_id TEXT NOT NULL REFERENCES users(credential_id),
  litd_account_id TEXT,
  macaroon_encrypted TEXT,
  budget_sats INTEGER NOT NULL DEFAULT 50000,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  auth_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT REFERENCES agents(id),
  type TEXT NOT NULL CHECK (type IN ('payment', 'invoice', 'onchain_send', 'onchain_receive', 'fund_ln')),
  amount_sats INTEGER NOT NULL,
  purpose TEXT,
  bolt11 TEXT,
  payment_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'failed')),
  approval_type TEXT CHECK (approval_type IN ('auto', 'manual')),
  approval_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  type TEXT NOT NULL CHECK (type IN ('payment', 'topup')),
  amount_sats INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT REFERENCES agents(id),
  tool TEXT NOT NULL,
  params_summary TEXT,
  outcome TEXT,
  duration_ms INTEGER,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_token ON agents(auth_token);
CREATE INDEX IF NOT EXISTS idx_transactions_agent ON transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(payment_hash);
CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approvals(agent_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
