/**
 * Agent Pairing — generates config artifacts for connecting Claude to an agent.
 *
 * Produces:
 * 1. CLI command for `claude mcp add`
 * 2. JSON config for Claude Code settings
 * 3. QR-encodable JSON string (Person 2 renders this)
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = path.resolve(__dirname, "server.js");

/**
 * Generate pairing config for a given agent.
 * @param {object} agent — { id, auth_token, budget_sats }
 * @param {object} [opts]
 * @param {string} [opts.serverPath] — override MCP server script path
 * @returns {{ cliCommand, mcpConfig, qrData }}
 */
export function generatePairingConfig(agent, opts = {}) {
  const serverScript = opts.serverPath || MCP_SERVER_PATH;

  // 1. CLI command — paste into terminal
  const cliCommand = `claude mcp add aegis-wallet -- node ${serverScript} --token ${agent.auth_token}`;

  // 2. JSON config — add to Claude Code's MCP config file
  const mcpConfig = {
    mcpServers: {
      "aegis-wallet": {
        command: "node",
        args: [serverScript, "--token", agent.auth_token],
      },
    },
  };

  // 3. QR data — compact JSON for QR code rendering
  const qrData = JSON.stringify({
    type: "aegis-mcp",
    version: 1,
    agent_id: agent.id,
    cli: cliCommand,
    config: mcpConfig,
  });

  return { cliCommand, mcpConfig, qrData };
}

/**
 * Validate that a pairing config would actually work.
 * @param {{ cliCommand: string, mcpConfig: object, qrData: string }} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePairingConfig(config) {
  const errors = [];

  if (!config.cliCommand?.includes("claude mcp add")) {
    errors.push("CLI command missing 'claude mcp add'");
  }
  if (!config.cliCommand?.includes("--token")) {
    errors.push("CLI command missing --token flag");
  }
  if (!config.mcpConfig?.mcpServers?.["aegis-wallet"]) {
    errors.push("MCP config missing aegis-wallet server entry");
  }
  const entry = config.mcpConfig?.mcpServers?.["aegis-wallet"];
  if (entry && entry.command !== "node") {
    errors.push("MCP config command should be 'node'");
  }
  if (entry && !entry.args?.includes("--token")) {
    errors.push("MCP config args missing --token");
  }
  try {
    const qr = JSON.parse(config.qrData);
    if (qr.type !== "aegis-mcp") errors.push("QR data type should be aegis-mcp");
  } catch {
    errors.push("QR data is not valid JSON");
  }

  return { valid: errors.length === 0, errors };
}
