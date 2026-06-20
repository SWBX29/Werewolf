/**
 * ============================================================================
 * simulator/types — 模拟器类型定义
 * ============================================================================
 *
 * 架构说明：
 *   1. 定义模拟器连接、事件、策略等核心数据结构
 *   2. 供 useSimulatorStore、AutoStrategyPanel 等模块共用
 *
 * 设计原则：
 *   - 纯类型文件，不包含运行时逻辑
 *   - 所有策略类型均支持 random / custom 两种基础模式
 * ============================================================================
 */

import type {
  GamePhase,
  RoleId,
  ClientMessage,
  PlayerRoomStateDTO,
  JudgeRoomStateDTO,
} from '@langrensha/shared';

/** 模拟器连接状态，追踪单个 WebSocket 连接的完整生命周期 */
export interface SimConnection {
  playerId: string;
  nickname: string;
  seatNumber: number | null;
  role: RoleId | null;
  ws: WebSocket | null;
  isConnected: boolean;
  isJudge: boolean;
  isReady: boolean;
  state: PlayerRoomStateDTO | JudgeRoomStateDTO | null;
  suggestedAction: ClientMessage | null;
  connectedAt: number;
}

/** 模拟器事件，记录时间轴上的系统/行动/结果/法官/错误事件 */
export interface SimEvent {
  timestamp: number;
  phase: GamePhase;
  round: number;
  category: 'system' | 'action' | 'result' | 'judge' | 'error';
  icon: string;
  message: string;
  detail?: Record<string, unknown>;
}

/** 自动模式：关闭 / 仅建议 / 自动执行 */
export type AutoMode = 'off' | 'suggest' | 'auto';

/** 模拟器阶段：配置 / 大厅 / 游戏中 / 游戏结束 */
export type SimulatorPhase = 'setup' | 'lobby' | 'playing' | 'gameover';

/** 预言家策略配置 */
export interface SeerStrategy {
  strategy: 'random' | 'suspicious_first' | 'custom_list';
  customTargets?: number[];
}

/** 女巫策略配置 */
export interface WitchStrategy {
  autoSave: boolean;
  autoPoison: boolean;
  poisonPriority: 'random' | 'evil_first' | 'custom';
  customPoisonTargets?: number[];
}

/** 守卫策略配置 */
export interface GuardStrategy {
  strategy: 'random' | 'protect_gods' | 'custom_list';
  customTargets?: number[];
}

/** 狼人策略配置 */
export interface WerewolfStrategy {
  killStrategy: 'random' | 'kill_gods_first' | 'custom';
  customTarget?: number;
}

/** 噩梦之影策略配置 */
export interface NightmareStrategy {
  strategy: 'random' | 'block_gods' | 'custom_list';
  customTargets?: number[];
}

/** 机械狼策略配置 */
export interface MechanicalWolfStrategy {
  imitateStrategy: 'random' | 'custom';
  customTarget?: number;
}

/** 投票策略配置 */
export interface VoteStrategy {
  strategy: 'random' | 'follow_majority' | 'custom';
  customTarget?: number;
}

/** 猎人开枪策略配置 */
export interface HunterGunStrategy {
  strategy: 'random' | 'shoot_evil' | 'custom';
  customTarget?: number;
}

/** 狼王开枪策略配置 */
export interface WolfKingGunStrategy {
  strategy: 'random' | 'shoot_good' | 'custom';
  customTarget?: number;
}

/** 白狼王自爆策略配置 */
export interface WhiteWolfExplodeStrategy {
  enabled: boolean;
  targetStrategy: 'random' | 'custom';
  customTarget?: number;
}

/** 骑士决斗策略配置 */
export interface KnightDuelStrategy {
  enabled: boolean;
  targetStrategy: 'random' | 'suspicious' | 'custom';
  customTarget?: number;
}

/** 全部角色的自动策略集合 */
export interface AutoStrategies {
  mode: AutoMode;
  seer: SeerStrategy;
  witch: WitchStrategy;
  guard: GuardStrategy;
  werewolf: WerewolfStrategy;
  nightmare: NightmareStrategy;
  mechanicalWolf: MechanicalWolfStrategy;
  vote: VoteStrategy;
  hunterGun: HunterGunStrategy;
  wolfKingGun: WolfKingGunStrategy;
  whiteWolfExplode: WhiteWolfExplodeStrategy;
  knightDuel: KnightDuelStrategy;
}
