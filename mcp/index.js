#!/usr/bin/env node
/**
 * Aegis Wallet MCP Server
 *
 * Bitcoin Lightning wallet tools for AI agents.
 * Budget enforced cryptographically via LND macaroons.
 *
 * Usage:
 *   aegis-wallet --macaroon <base64_macaroon> [--user <id>] [--threshold <sats>]
 *
 * Environment:
 *   LND_CERT_PATH     — path to tls.cert (default: ~/.lnd/tls.cert)
 *   LND_CERT_BASE64   — base64 encoded TLS cert (overrides path)
 *   LND_SOCKET        — gRPC address (default: localhost:10009)
 *   PORT              — backend port for WS notifications (default: 3001)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { validateAgent } from "./auth.js";
import { initLnd } from "./lnd.js";

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
}

const macaroon = getArg("macaroon");
const userId = getArg("user") || "default";
const threshold = parseInt(getArg("threshold") || "0") || 15000;

if (!macaroon) {
  process.stderr.write(`
aegis-wallet — Bitcoin Lightning wallet MCP server

Usage:
  aegis-wallet --macaroon <base64_macaroon> [options]

Options:
  --macaroon <mac>     Scoped LND macaroon (required, base64)
  --user <id>          User credential ID for approval notifications
  --threshold <sats>   Auto-approve threshold in sats (default: 15000)

Environment:
  LND_CERT_PATH        Path to tls.cert (default: ~/.lnd/tls.cert)
  LND_CERT_BASE64      Base64 TLS cert (overrides path)
  LND_SOCKET           gRPC address (default: localhost:10009)

Example:
  aegis-wallet --macaroon AgEDbG5k... --threshold 5000

`);
  process.exit(1);
}

// ── Initialize LND connection ───────────────────────────────────────────────
try {
  initLnd(macaroon);
} catch (err) {
  process.stderr.write(`Failed to connect to LND: ${err.message}\n`);
  process.exit(1);
}

// ── Agent context ───────────────────────────────────────────────────────────
const agentContext = {
  macaroon,
  macaroon_encrypted: macaroon,
  id: macaroon.slice(0, 16),
  user_credential_id: userId,
  budget_sats: 0,
  status: "active",
  auto_pay_threshold_sats: threshold,
};

function getAgentContext() {
  return validateAgent(agentContext);
}

// ── Create MCP server ───────────────────────────────────────────────────────
const server = new McpServer({
  name: "aegis-wallet",
  version: "0.1.0",
  description: "Bitcoin Lightning wallet — cryptographic budget enforcement via macaroons",
});

// ── Ping ─────────────────────────────────────────────────────────────────────
server.tool("ping", "Health check", {}, async () => ({
  content: [{
    type: "text",
    text: JSON.stringify({
      status: "ok",
      server: "aegis-wallet",
      version: "0.1.0",
      has_macaroon: true,
      threshold_sats: threshold,
      timestamp: new Date().toISOString(),
    }),
  }],
}));

// ── WebSocket emitter ────────────────────────────────────────────────────────
async function emitToUser(credentialId, event, data) {
  try {
    const port = process.env.PORT || 3001;
    await fetch(`http://localhost:${port}/dev/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential_id: credentialId, event, data }),
    });
  } catch {}
}

// ── Register tools + start ───────────────────────────────────────────────────
registerTools(server, getAgentContext, { emitToUser });

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  process.stderr.write(`MCP server failed: ${err.message}\n`);
  process.exit(1);
});
