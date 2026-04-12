#!/usr/bin/env node
/**
 * Aegis Wallet MCP Server
 *
 * Thin bridge between Claude and LND.
 * Budget enforced by the macaroon (LND layer).
 * Policy (spending limits, approvals) handled by the web app.
 *
 * Usage:
 *   aegis-wallet --macaroon <base64_macaroon>
 *
 * Environment:
 *   LND_CERT_PATH     — path to tls.cert (default: ~/.lnd/tls.cert)
 *   LND_CERT_BASE64   — base64 encoded TLS cert (overrides path)
 *   LND_SOCKET        — gRPC address (default: localhost:10009)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { validateAgent } from "./auth.js";
import { initLnd } from "./lnd.js";

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const macIndex = args.indexOf("--macaroon");
const macaroon = macIndex !== -1 ? args[macIndex + 1] : null;

const apiUrlIndex = args.indexOf("--api-url");
const apiUrl = apiUrlIndex !== -1 ? args[apiUrlIndex + 1] : null;

const userIdIndex = args.indexOf("--user-id");
const userId = userIdIndex !== -1 ? args[userIdIndex + 1] : null;

if (!macaroon) {
  process.stderr.write(`
aegis-wallet — Bitcoin Lightning wallet MCP server

Usage:
  aegis-wallet --macaroon <base64_macaroon>

Environment:
  LND_CERT_PATH        Path to tls.cert (default: ~/.lnd/tls.cert)
  LND_CERT_BASE64      Base64 TLS cert (overrides path)
  LND_SOCKET           gRPC address (default: localhost:10009)

The macaroon controls your budget. LND enforces it cryptographically.

`);
  process.exit(1);
}

// ── Initialize LND ──────────────────────────────────────────────────────────
try {
  initLnd(macaroon);
} catch (err) {
  process.stderr.write(`Failed to connect to LND: ${err.message}\n`);
  process.exit(1);
}

// ── Agent context ───────────────────────────────────────────────────────────
const agentContext = { macaroon };

function getAgentContext() {
  return validateAgent(agentContext);
}

// ── Server ──────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "aegis-wallet",
  version: "0.1.0",
  description: "Bitcoin Lightning wallet — pay invoices within your macaroon-enforced budget",
});

server.tool("ping", "Health check", {}, async () => ({
  content: [{
    type: "text",
    text: JSON.stringify({ status: "ok", server: "aegis-wallet", version: "0.1.0", timestamp: new Date().toISOString() }),
  }],
}));

registerTools(server, getAgentContext, { apiUrl, userId });

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  process.stderr.write(`MCP server failed: ${err.message}\n`);
  process.exit(1);
});
