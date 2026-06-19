import type { ClientMessage, ServerMessage } from '@langrensha/shared';

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;

/**
 * Create a new WebSocket connection to the game server
 */
export function createConnection(serverUrl: string): WebSocket {
  const ws = new WebSocket(serverUrl);
  return ws;
}

/**
 * Send a client message through a WebSocket connection
 */
export function sendMessage(ws: WebSocket | null, message: ClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Simulator] Cannot send message: WebSocket not open', message);
    return;
  }
  ws.send(JSON.stringify(message));
}

/**
 * Setup heartbeat (PING) for a WebSocket connection
 * Returns the interval ID for cleanup
 */
export function setupHeartbeat(ws: WebSocket): ReturnType<typeof setInterval> {
  let lastPongTime = Date.now();

  return setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      // Bug 164 修复：检查上次 PONG 是否超时
      if (Date.now() - lastPongTime > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT) {
        console.warn('[Simulator] Heartbeat timeout, closing connection');
        ws.close(4000, 'Heartbeat timeout');
        return;
      }
      ws.send(JSON.stringify({ type: 'PING' }));
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * Close a WebSocket connection gracefully
 */
export function closeConnection(ws: WebSocket | null): void {
  if (!ws) return;
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close(1000, 'Simulator disconnect');
  }
}

/**
 * Parse an incoming WebSocket message as ServerMessage
 */
export function parseMessage(data: string): ServerMessage | null {
  try {
    return JSON.parse(data) as ServerMessage;
  } catch {
    console.warn('[Simulator] Failed to parse message:', data);
    return null;
  }
}

/**
 * Get the WebSocket URL for the simulator
 * Uses the same logic as the main game client
 */
export function getSimulatorWsUrl(customUrl?: string): string {
  if (customUrl) return customUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${protocol}//localhost:3001`;
  }
  return `${protocol}//${window.location.host}/ws`;
}
