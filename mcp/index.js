#!/usr/bin/env node
/**
 * Aegis Wallet MCP Server
 *
 * Thin bridge between Claude and LND.
 * Budget enforced by the macaroon (LND layer).
 * Policy (spending limits, approvals) handled by the wallet app.
 *
 * Environment:
 *   LND_MACAROON_BASE64  — base64 macaroon (controls agent permissions + budget)
 *   LND_REST_HOST        — LND REST address (default: https://localhost:8080)
 *   AEGIS_API_URL        — wallet app backend for budget-exceeded notifications (optional)
 *   AEGIS_WALLET_ID      — wallet ID for notifications (optional)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { validateAgent } from "./auth.js";
import { initLnd } from "./lnd-gateway.js";

// ── Read config from environment ───────────────────────────────────────────
const macaroon = process.env.LND_MACAROON_BASE64;
const apiUrl = process.env.AEGIS_API_URL || null;
const walletId = process.env.AEGIS_WALLET_ID || null;

if (!macaroon) {
  process.stderr.write(`
aegis-wallet — Bitcoin Lightning wallet MCP server

Configure via environment variables in your Claude Desktop MCP config:

{
  "mcpServers": {
    "aegis-wallet": {
      "command": "npx",
      "args": ["-y", "aegis-wallet"],
      "env": {
        "LND_MACAROON_BASE64": "<your scoped macaroon>",
        "LND_REST_HOST": "https://localhost:8080"
      }
    }
  }
}

Environment:
  LND_MACAROON_BASE64    Base64 macaroon (required — controls budget + permissions)
  LND_REST_HOST          LND REST address (default: https://localhost:8080)
  AEGIS_API_URL          Wallet app backend URL for notifications (optional)
  AEGIS_WALLET_ID        Wallet ID for notifications (optional)

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
  version: "0.2.0",
  description: "Bitcoin Lightning wallet — pay invoices within your macaroon-enforced budget",
});

server.tool("ping", "Health check", {}, async () => ({
  content: [{
    type: "text",
    text: JSON.stringify({ status: "ok", server: "aegis-wallet", version: "0.2.0", timestamp: new Date().toISOString() }),
  }],
}));

registerTools(server, getAgentContext, { apiUrl, userId: walletId });

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  process.stderr.write(`MCP server failed: ${err.message}\n`);
  process.exit(1);
});
