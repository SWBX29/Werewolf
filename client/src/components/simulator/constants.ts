/**
 * ============================================================================
 * simulator/constants — 模拟器常量定义
 * ============================================================================
 *
 * 架构说明：
 *   1. 自动策略默认值
 *   2. 事件图标映射
 *   3. WebSocket 重连与心跳参数
 *   4. 默认玩家名称列表
 *
 * 设计原则：
 *   - 所有魔法数字集中管理，避免散落在业务代码中
 * ============================================================================
 */

import type { AutoStrategies } from './types';

/** 自动策略默认配置 */
export const DEFAULT_AUTO_STRATEGIES: AutoStrategies = {
  mode: 'off',
  seer: { strategy: 'random' },
  witch: { autoSave: false, autoPoison: false, poisonPriority: 'random' },
  guard: { strategy: 'random' },
  werewolf: { killStrategy: 'random' },
  nightmare: { strategy: 'random' },
  mechanicalWolf: { imitateStrategy: 'random' },
  vote: { strategy: 'random' },
  hunterGun: { strategy: 'random' },
  wolfKingGun: { strategy: 'random' },
  whiteWolfExplode: { enabled: false, targetStrategy: 'random' },
  knightDuel: { enabled: false, targetStrategy: 'random' },
};

/** 事件分类图标映射 */
export const EVENT_ICONS: Record<string, string> = {
  system: '🔵',
  action: '🟡',
  result: '🟢',
  judge: '👑',
  error: '❌',
};

/** 事件日志最大条数 */
export const MAX_EVENT_LOG_SIZE = 500;

/** 默认玩家名称列表（最多18人） */
export const DEFAULT_PLAYER_NAMES: string[] = Array.from(
  { length: 18 },
  (_, i) => `模拟${i + 1}号`,
);

/** WebSocket 重连最大尝试次数 */
export const WS_RECONNECT_MAX_ATTEMPTS = 3;

/** 心跳发送间隔（毫秒） */
export const HEARTBEAT_INTERVAL = 25000;
