/**
 * ============================================================================
 * simulator/websocket — 模拟器 WebSocket 通信工具
 * ============================================================================
 *
 * 架构说明：
 *   1. 创建和管理模拟器 WebSocket 连接
 *   2. 消息发送与解析
 *   3. 心跳保活机制（PING/PONG + 超时断连）
 *   4. 连接地址推导
 *
 * 设计原则：
 *   - 纯工具函数，无状态副作用
 *   - 心跳超时自动关闭连接，由上层 store 负责重连
 * ============================================================================
 */

import type { ClientMessage, ServerMessage } from '@langrensha/shared';

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;

/** 创建新的 WebSocket 连接 */
export function createConnection(serverUrl: string): WebSocket {
  const ws = new WebSocket(serverUrl);
  return ws;
}

/** 通过 WebSocket 连接发送客户端消息 */
export function sendMessage(ws: WebSocket | null, message: ClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Simulator] Cannot send message: WebSocket not open', message);
    return;
  }
  ws.send(JSON.stringify(message));
}

/**
 * 设置心跳保活机制（PING/PONG）
 * 返回定时器 ID 和更新最近 PONG 时间的函数
 */
export function setupHeartbeat(ws: WebSocket): {
  interval: ReturnType<typeof setInterval>;
  updatePongTime: () => void;
} {
  let lastPongTime = Date.now();

  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      // 检查上次 PONG 是否超时
      if (Date.now() - lastPongTime > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT) {
        console.warn('[Simulator] Heartbeat timeout, closing connection');
        ws.close(4000, 'Heartbeat timeout');
        return;
      }
      ws.send(JSON.stringify({ type: 'PING' }));
    }
  }, HEARTBEAT_INTERVAL);

  const updatePongTime = () => {
    lastPongTime = Date.now();
  };

  return { interval, updatePongTime };
}

/** 优雅关闭 WebSocket 连接 */
export function closeConnection(ws: WebSocket | null): void {
  if (!ws) return;
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close(1000, 'Simulator disconnect');
  }
}

/** 解析 WebSocket 收到的消息为 ServerMessage */
export function parseMessage(data: string): ServerMessage | null {
  try {
    return JSON.parse(data) as ServerMessage;
  } catch {
    console.warn('[Simulator] Failed to parse message:', data);
    return null;
  }
}

/**
 * 获取模拟器 WebSocket 地址
 * 与主游戏客户端使用相同的地址推导逻辑
 */
export function getSimulatorWsUrl(customUrl?: string): string {
  if (customUrl) return customUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${protocol}//localhost:3001`;
  }
  return `${protocol}//${window.location.host}/ws`;
}
