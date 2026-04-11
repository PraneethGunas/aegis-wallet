/**
 * Shared file-based store for cross-process state (approvals).
 * Uses a JSON file in /tmp so both the MCP server process and test process
 * can read/write the same approval records.
 *
 * Only used for approvals — the part that needs cross-process communication.
 * Everything else stays in-memory.
 */
import fs from "fs";
import os from "os";
import path from "path";

const STORE_PATH = path.join(os.tmpdir(), "aegis-approvals.json");

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function createApproval({ id, agent_id, type, amount_sats, reason, status, expires_at }) {
  const store = readStore();
  const record = { id, agent_id, type, amount_sats, reason, status, created_at: new Date().toISOString(), expires_at };
  store[id] = record;
  writeStore(store);
  return record;
}

export function getApproval(approvalId) {
  const store = readStore();
  return store[approvalId] || null;
}

export function updateApprovalStatus(approvalId, status) {
  const store = readStore();
  if (store[approvalId]) {
    store[approvalId].status = status;
    writeStore(store);
    return true;
  }
  return false;
}

export function clearStore() {
  try { fs.unlinkSync(STORE_PATH); } catch {}
}
