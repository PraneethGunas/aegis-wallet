/**
 * Test pairing config generation.
 * Run: node src/mcp/test-pairing.js
 */
import { generatePairingConfig, validatePairingConfig } from "./pairing.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as sharedStore from "../mocks/shared-store.js";

let passed = 0;
let failed = 0;

function check(name, condition, data) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    if (data !== undefined) console.log(`     Got:`, typeof data === "string" ? data : JSON.stringify(data));
    failed++;
  }
}

async function main() {
  console.log("═══ Task 7: Agent Pairing Tests ═══\n");
  sharedStore.clearStore();

  const agent = {
    id: "agent_1",
    auth_token: "test_token_123",
    budget_sats: 50000,
  };

  // ── Generate config ────────────────────────────────────────────────────
  console.log("── Config generation ──");
  const config = generatePairingConfig(agent);

  check("cliCommand contains 'claude mcp add'", config.cliCommand.includes("claude mcp add"), config.cliCommand);
  check("cliCommand contains --token", config.cliCommand.includes("--token test_token_123"), config.cliCommand);
  check("cliCommand contains server.js", config.cliCommand.includes("server.js"), config.cliCommand);

  check("mcpConfig has aegis-wallet entry", !!config.mcpConfig.mcpServers["aegis-wallet"], config.mcpConfig);
  check("mcpConfig command is node", config.mcpConfig.mcpServers["aegis-wallet"].command === "node", config.mcpConfig);
  check("mcpConfig args include token", config.mcpConfig.mcpServers["aegis-wallet"].args.includes("test_token_123"), config.mcpConfig);

  const qr = JSON.parse(config.qrData);
  check("qrData is valid JSON", !!qr, config.qrData);
  check("qrData type is aegis-mcp", qr.type === "aegis-mcp", qr);
  check("qrData has agent_id", qr.agent_id === "agent_1", qr);

  // ── Validate config ────────────────────────────────────────────────────
  console.log("\n── Config validation ──");
  const validation = validatePairingConfig(config);
  check("config passes validation", validation.valid, validation.errors);

  // ── Test invalid config ────────────────────────────────────────────────
  const badValidation = validatePairingConfig({ cliCommand: "bad", mcpConfig: {}, qrData: "not json" });
  check("invalid config fails validation", !badValidation.valid, badValidation.errors);
  check("has multiple errors", badValidation.errors.length >= 3, badValidation.errors);

  // ── Actually connect using the generated config ────────────────────────
  console.log("\n── Live connection test ──");
  const mcpEntry = config.mcpConfig.mcpServers["aegis-wallet"];
  const transport = new StdioClientTransport({
    command: mcpEntry.command,
    args: mcpEntry.args,
  });
  const client = new Client({ name: "pairing-test", version: "0.0.1" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  check("connected via generated config", tools.length === 8, tools.map((t) => t.name));

  const ping = JSON.parse((await client.callTool({ name: "ping", arguments: {} })).content[0].text);
  check("ping returns agent_id", ping.agent_id === "agent_1", ping);

  await client.close();

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`  Task 7 validation: ${failed === 0 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("═".repeat(50));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
