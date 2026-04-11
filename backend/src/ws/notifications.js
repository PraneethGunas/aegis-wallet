/**
 * WebSocket notification server — pushes real-time events to user browsers.
 *
 * Usage:
 *   import { init, emitToUser } from './ws/notifications.js';
 *   init(httpServer, authenticateToken);
 *   emitToUser("user_credential_id", "payment_made", { amount_sats: 5000 });
 */
import { WebSocketServer, WebSocket } from "ws";

const connections = new Map(); // credential_id → Set<ws>

/**
 * Attach WebSocket server to an existing HTTP server.
 * @param {http.Server} httpServer
 * @param {(token: string) => { credential_id: string } | null} authenticateToken
 */
export function init(httpServer, authenticateToken) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(4001, "Missing token");
      return;
    }

    const user = authenticateToken(token);
    if (!user) {
      ws.close(4001, "Invalid token");
      return;
    }

    const credId = user.credential_id;

    // Track connection
    if (!connections.has(credId)) connections.set(credId, new Set());
    connections.get(credId).add(ws);

    // Send welcome
    ws.send(JSON.stringify({
      event: "connected",
      data: { credential_id: credId },
      timestamp: new Date().toISOString(),
    }));

    ws.on("close", () => {
      const set = connections.get(credId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) connections.delete(credId);
      }
    });

    ws.on("error", () => {
      // Swallow errors — client disconnected
    });
  });

  return wss;
}

/**
 * Send an event to all connections for a specific user.
 * @param {string} credentialId
 * @param {string} event
 * @param {object} data
 */
export function emitToUser(credentialId, event, data) {
  const userConns = connections.get(credentialId);
  if (!userConns) return 0;

  const message = JSON.stringify({
    event,
    data,
    timestamp: new Date().toISOString(),
  });

  let sent = 0;
  for (const ws of userConns) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sent++;
    }
  }
  return sent;
}

/**
 * Get count of active connections for a user.
 */
export function getConnectionCount(credentialId) {
  return connections.get(credentialId)?.size ?? 0;
}
