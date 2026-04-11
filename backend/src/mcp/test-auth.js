/**
 * Test auth edge cases: invalid token, paused agent, rate limiting.
 * Run: node src/mcp/test-auth.js
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "server.js");

let passed = 0;
let failed = 0;

function parse(result) {
  return JSON.parse(result.content[0].text);
}

function check(name, condition, data) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    console.log(`     Got:`, typeof data === "string" ? data : JSON.stringify(data));
    failed++;
  }
}

async function createClient(token) {
  const args = [serverPath];
  if (token) args.push("--token", token);
  const transport = new StdioClientTransport({ command: "node", args });
  const client = new Client({ name: "auth-test", version: "0.0.1" });
  await client.connect(transport);
  return client;
}

async function testInvalidToken() {
  console.log("\n── Test: Invalid token ──");
  const client = await createClient("totally_bogus_token");

  // ping should still work (no auth required)
  const ping = parse(await client.callTool({ name: "ping", arguments: {} }));
  check("ping works with invalid token", ping.status === "ok", ping);
  check("ping shows no agent", ping.agent_id === "none", ping);

  // get_balance should fail
  const result = await client.callTool({ name: "get_balance", arguments: {} });
  const text = result.content[0].text;
  check("get_balance rejects invalid token", text.includes("Invalid auth token") || result.isError === true, text);

  await client.close();
}

async function testPausedAgent() {
  console.log("\n── Test: Paused agent ──");
  // We use test_token_paused — need to add a paused agent to mock DB.
  // The mock DB seeds test_token_123 as active. We launch with that token,
  // call ping (works), then we can't easily pause mid-session with mocks.
  // Instead, let's test by adding a paused token to our mock.
  // We'll launch a server that imports db, adds a paused agent, then tests.

  // For this test, we'll use a separate mini-script approach.
  // Actually — the mock db has test_token_123 as "active". Let's just verify
  // the auth module directly instead of over MCP for the paused case.

  const { validateAgent, AgentError } = await import("./auth.js");

  // Create a fake db module
  const fakeDb = {
    getAgent(token) {
      if (token === "paused_token") return { id: "agent_2", status: "paused" };
      if (token === "active_token") return { id: "agent_3", status: "active" };
      return null;
    },
  };

  // Test paused
  try {
    validateAgent(fakeDb, "paused_token");
    check("paused agent throws", false, "did not throw");
  } catch (e) {
    check("paused agent throws AgentError", e instanceof AgentError, e.message);
    check("error mentions paused", e.message.includes("paused"), e.message);
  }

  // Test no token
  try {
    validateAgent(fakeDb, null);
    check("null token throws", false, "did not throw");
  } catch (e) {
    check("null token throws AgentError", e instanceof AgentError, e.message);
  }

  // Test active
  try {
    const agent = validateAgent(fakeDb, "active_token");
    check("active agent returns agent object", agent.id === "agent_3", agent);
  } catch (e) {
    check("active agent does not throw", false, e.message);
  }
}

async function testRateLimit() {
  console.log("\n── Test: Rate limiting ──");

  const { validateAgent, AgentError } = await import("./auth.js");
  const fakeDb = {
    getAgent(token) {
      return { id: "agent_ratelimit_test", status: "active" };
    },
  };

  // Fire 30 calls (should all succeed)
  let lastError = null;
  for (let i = 0; i < 30; i++) {
    try {
      validateAgent(fakeDb, "rate_test_token");
    } catch (e) {
      lastError = e;
      break;
    }
  }
  check("first 30 calls succeed", lastError === null, lastError?.message);

  // 31st should fail
  try {
    validateAgent(fakeDb, "rate_test_token");
    check("31st call is rate limited", false, "did not throw");
  } catch (e) {
    check("31st call is rate limited", e.message.includes("Rate limited"), e.message);
  }
}

async function testValidTokenOverMCP() {
  console.log("\n── Test: Valid token over MCP ──");
  const client = await createClient("test_token_123");

  const balance = parse(await client.callTool({ name: "get_balance", arguments: {} }));
  check("get_balance works with valid token", typeof balance.balance_sats === "number", balance);

  await client.close();
}

async function main() {
  console.log("═══ Task 3: Auth + Agent Lifecycle Tests ═══");

  await testInvalidToken();
  await testPausedAgent();
  await testRateLimit();
  await testValidTokenOverMCP();

  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`  Task 3 validation: ${failed === 0 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("═".repeat(50));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
