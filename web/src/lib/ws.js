/**
 * WebSocket client for real-time updates
 *
 * Events:
 *   payment_made        — agent completed a payment
 *   approval_requested  — agent needs user approval for a payment
 *   approval_resolved   — approval was approved or denied
 *   topup_requested     — agent requests budget increase
 *   topup_approved      — topup was approved
 *   balance_updated     — balance changed (L1 or L2)
 *   agent_paused        — agent was paused
 *
 * Auto-reconnects on disconnect with exponential backoff.
 */

// No auth needed — user's own node

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

let socket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;
const listeners = new Map();

/**
 * Connect to the WebSocket server.
 * Attaches auth token as query parameter.
 */
export function connect() {
  if (socket?.readyState === WebSocket.OPEN) return;

  // Clean up existing socket
  cleanup();

  const url = WS_URL;

  try {
    socket = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    reconnectDelay = 1000; // Reset backoff on successful connect
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      dispatch(message);
    } catch {
      // Ignore non-JSON messages
    }
  };

  socket.onclose = (event) => {
    socket = null;
    // Don't reconnect on intentional close (code 1000) or auth failure (4001)
    if (event.code !== 1000 && event.code !== 4001) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    // onclose will fire after onerror, which handles reconnection
  };
}

/**
 * Disconnect from the WebSocket server.
 */
export function disconnect() {
  cleanup();
  if (socket) {
    socket.close(1000, "client disconnect");
    socket = null;
  }
}

/**
 * Register a listener for a specific event type.
 * Returns an unsubscribe function.
 */
export function on(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(callback);

  return () => listeners.get(event)?.delete(callback);
}

/**
 * Send a message to the server (e.g., for approval responses).
 */
export function send(type, data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, data }));
  }
}

/**
 * Check if the WebSocket is currently connected.
 */
export function isConnected() {
  return socket?.readyState === WebSocket.OPEN;
}

function dispatch(message) {
  const { event: type, data } = message;
  const handlers = listeners.get(type);
  if (handlers) {
    handlers.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`WS handler error for ${type}:`, err);
      }
    });
  }

  // Also dispatch to wildcard listeners
  const wildcardHandlers = listeners.get("*");
  if (wildcardHandlers) {
    wildcardHandlers.forEach((cb) => {
      try {
        cb(message);
      } catch (err) {
        console.error("WS wildcard handler error:", err);
      }
    });
  }
}

function cleanup() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  cleanup();
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connect();
  }, reconnectDelay);
}
