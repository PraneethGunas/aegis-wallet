import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { validateAgent } from "./auth.js";
import * as db from "../db/index.js";

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const tokenIndex = args.indexOf("--token");
const authToken = tokenIndex !== -1 ? args[tokenIndex + 1] : null;

// ── Agent context factory — called on every tool invocation ───────────────────
function getAgentContext() {
  return validateAgent(db, authToken);
}

// ── Create server ─────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "aegis-wallet",
  version: "0.0.1",
  description: "Aegis Wallet — AI agent spending tools for Bitcoin Lightning",
});

// ── Tool: ping (health check — no auth required) ─────────────────────────────
server.tool(
  "ping",
  "Health check — verify the MCP server is running and reachable",
  {},
  async () => {
    const agent = authToken ? db.getAgent(authToken) : null;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "ok",
            server: "aegis-wallet",
            version: "0.0.1",
            agent_id: agent?.id ?? "none",
            agent_status: agent?.status ?? "no_token",
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    };
  }
);

// ── WebSocket emitter ─────────────────────────────────────────────────────────
// When running as stdio process (Claude Code), WS events are sent via HTTP POST
// to the Express server. In-process mode (future SSE transport) uses direct import.
async function emitToUser(credentialId, event, data) {
  try {
    const port = process.env.PORT || 3001;
    const res = await fetch(`http://localhost:${port}/dev/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential_id: credentialId, event, data }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    // Express server not running — silently skip (mocks/testing)
  }
}

// ── Register 7 wallet tools ───────────────────────────────────────────────────
registerTools(server, getAgentContext, { emitToUser });

// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
