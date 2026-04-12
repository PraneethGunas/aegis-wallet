import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { validateAgent } from "./auth.js";

// ── Parse CLI args — macaroon is the credential ─────────────────────────────
const args = process.argv.slice(2);
const macIndex = args.indexOf("--macaroon");
const macaroon = macIndex !== -1 ? args[macIndex + 1] : null;
const userIndex = args.indexOf("--user");
const userId = userIndex !== -1 ? args[userIndex + 1] : "default";

// Build agent context from the macaroon
const agentContext = {
  macaroon,
  macaroon_encrypted: macaroon,
  id: macaroon ? macaroon.slice(0, 16) : "none",
  user_credential_id: userId,  // needed for WebSocket approval notifications
  budget_sats: 0,
  status: "active",
};

function getAgentContext() {
  return validateAgent(agentContext);
}

// ── Create server ─────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "aegis-wallet",
  version: "0.1.0",
  description: "Aegis Wallet — Bitcoin Lightning spending tools with cryptographic budget enforcement",
});

// ── Ping (no auth) ───────────────────────────────────────────────────────────
server.tool(
  "ping",
  "Health check — verify the MCP server is running",
  {},
  async () => ({
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "ok",
        server: "aegis-wallet",
        version: "0.1.0",
        has_macaroon: !!macaroon,
        timestamp: new Date().toISOString(),
      }),
    }],
  })
);

// ── WebSocket emitter (for approval notifications to the web UI) ─────────────
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

// ── Register 7 wallet tools ──────────────────────────────────────────────────
registerTools(server, getAgentContext, { emitToUser });

// ── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
