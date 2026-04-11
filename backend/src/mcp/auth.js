/**
 * Agent authentication, lifecycle checks, and rate limiting.
 */

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_CALLS = 30;

const callLog = new Map(); // agentId → [timestamp, timestamp, ...]

export function validateAgent(db, authToken) {
  if (!authToken) {
    throw new AgentError("No auth token provided. Launch the MCP server with --token <token>.");
  }

  const agent = db.getAgent(authToken);
  if (!agent) {
    throw new AgentError("Invalid auth token — no agent found for this token.");
  }

  if (agent.status === "paused") {
    throw new AgentError("Agent is paused by user. No tools are available until the user resumes.");
  }

  // Rate limiting
  const now = Date.now();
  if (!callLog.has(agent.id)) callLog.set(agent.id, []);
  const log = callLog.get(agent.id);

  // Prune old entries
  while (log.length > 0 && log[0] < now - RATE_LIMIT_WINDOW_MS) {
    log.shift();
  }

  if (log.length >= RATE_LIMIT_MAX_CALLS) {
    throw new AgentError(`Rate limited — max ${RATE_LIMIT_MAX_CALLS} tool calls per minute. Wait and try again.`);
  }

  log.push(now);
  return agent;
}

export class AgentError extends Error {
  constructor(message) {
    super(message);
    this.name = "AgentError";
  }
}
