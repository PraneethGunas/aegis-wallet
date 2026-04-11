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
 *
 * Auto-reconnects on disconnect.
 */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

let socket = null;
const listeners = new Map();

export function connect() {
  // TODO: Implement WebSocket connection with auto-reconnect
  // socket = new WebSocket(WS_URL);
  // socket.onmessage = (event) => dispatch(JSON.parse(event.data));
  // socket.onclose = () => setTimeout(connect, 3000);
}

export function disconnect() {
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function on(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(callback);

  return () => listeners.get(event).delete(callback);
}

function dispatch(message) {
  const handlers = listeners.get(message.type);
  if (handlers) {
    handlers.forEach((cb) => cb(message.data));
  }
}
