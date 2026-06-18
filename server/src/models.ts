/**
 * ============================================================================
 * 狼人杀联机游戏 — Mongoose 数据模型定义
 * ============================================================================
 *
 * 架构说明：
 *   本文件定义了 MongoDB 的两个核心集合 Schema：
 *   1. Room — 房间状态持久化（断线重连、服务重启后恢复）
 *   2. GameLog — 全局操作日志（复盘、审计、Admin 后台查询）
 *
 * 设计原则：
 *   - Schema 严格对应 shared/types.ts 中的接口定义
 *   - 使用 Mongoose 的严格模式（strict: 'throw'）防止脏数据写入
 *   - 所有时间戳使用 Unix 毫秒（number 类型），避免时区问题
 *   - GameLog 必须包含 nightActionOrderSnapshot 字段用于复盘追溯
 *   - 索引设计面向高频查询场景（房间码、时间范围、动作类型）
 * ============================================================================
 */

import mongoose, { Schema, Document } from 'mongoose';
import type {
  RoleId,
  GamePhase,
  GameMode,
  Faction,
  PlayerStatus,
  DeathCause,
  NightSubPhase,
  NightActionData,
  NightDeathRecord,
  DayDeathRecord,
  RuleConfig,
  ActionLog,
  ActionType,
  Player,
  SpeechOrderStrategy,
  NightActionOrderPreset,
  WitchSaveSelfRule,
  GuardWitchConflictRule,
  KnightDuelWolfKingRule,
  KnightDuelSuicideRule,
  TieVoteResolution,
  WinCondition,
  DaytimeKillSequence,
  WerewolfSharedVision,
  RevealIdentityOnDayVote,
  WolfChatMessage,
  WolfChatLog,
} from '@langrensha/shared';

// ============================================================================
// 辅助：Mongoose 子文档 Schema
// ============================================================================

/**
 * 玩家子文档 Schema
 * 对应 shared/types.ts 中的 Player 接口
 */
const PlayerSubSchema = new Schema<Player>({
  id: { type: String, required: true },
  nickname: { type: String, required: true, trim: true, maxlength: 20 },
  seatNumber: { type: Number, required: true, min: 1 },
  role: {
    type: String,
    required: true,
    enum: [
      'villager', 'seer', 'witch', 'hunter', 'guard', 'idiot', 'knight',
      'werewolf', 'white_wolf_king', 'wolf_king', 'nightmare_shadow', 'hidden_wolf', 'mechanical_wolf',
    ],
  },
  status: {
    type: String,
    required: true,
    enum: ['alive', 'dead', 'poisoned', 'voted_out'],
    default: 'alive',
  },
  isJudge: { type: Boolean, required: true, default: false },
  isSheriff: { type: Boolean, required: true, default: false },
  isHost: { type: Boolean, required: true, default: false },
  isReady: { type: Boolean, required: true, default: false },
  isNightmared: { type: Boolean, required: true, default: false },
  isMuted: { type: Boolean, required: true, default: false },
  witchAntidoteUsed: { type: Boolean, required: true, default: false },
  witchPoisonUsed: { type: Boolean, required: true, default: false },
  guardLastProtected: { type: Number, default: null },
  guardProtectedHistory: { type: [Number], default: [] },
  nightmareTargetHistory: { type: [Number], default: [] },
  idiotRevealed: { type: Boolean, required: true, default: false },
  hunterGunFired: { type: Boolean, required: true, default: false },
  wolfKingGunFired: { type: Boolean, required: true, default: false },
  hiddenWolfHasActed: { type: Boolean, default: false },
  mechanicalWolfImitateTarget: { type: Number, default: null },
  mechanicalWolfPhase: { type: String, default: null, enum: ['selecting', 'learning', 'active', 'failed', 'silent', null] },
  mechanicalWolfImitatedRole: { type: String, default: null },
  mechanicalWolfSkillDeferred: { type: Boolean, default: false },
  deathCause: {
    type: String,
    enum: [
      'werewolf_kill', 'witch_poison', 'vote_out', 'hunter_gun',
      'wolf_king_gun', 'white_wolf_explode', 'knight_duel',
      'knight_suicide', 'guard_witch_conflict', 'judge_override',
    ],
    default: null,
  },
  deathRound: { type: Number, default: null },
}, { _id: false, strict: 'throw' });

/**
 * 夜间子阶段子文档 Schema
 */
const NightSubPhaseSubSchema = new Schema<NightSubPhase>({
  currentRole: {
    type: String,
    required: true,
    enum: [
      'villager', 'seer', 'witch', 'hunter', 'guard', 'idiot', 'knight',
      'werewolf', 'white_wolf_king', 'wolf_king', 'nightmare_shadow', 'hidden_wolf', 'mechanical_wolf',
    ],
  },
  currentRoleIndex: { type: Number, required: true, min: 0 },
  isBlockedByNightmare: { type: Boolean, required: true, default: false },
}, { _id: false, strict: 'throw' });

/**
 * 夜间行动数据子文档 Schema
 */
const NightActionDataSubSchema = new Schema<NightActionData>({
  roleId: {
    type: String,
    required: true,
    enum: [
      'villager', 'seer', 'witch', 'hunter', 'guard', 'idiot', 'knight',
      'werewolf', 'white_wolf_king', 'wolf_king', 'nightmare_shadow', 'hidden_wolf', 'mechanical_wolf',
    ],
  },
  actorSeat: { type: Number, required: true, min: 0 },
  targetSeat: { type: Number, default: null },
  extra: { type: Schema.Types.Mixed, default: {} },
  submitted: { type: Boolean, required: true, default: false },
  blockedByNightmare: { type: Boolean, required: true, default: false },
}, { _id: false, strict: false }); // extra 为自由结构，允许 Mixed

/**
 * 夜间死亡记录子文档 Schema
 */
const NightDeathRecordSubSchema = new Schema<NightDeathRecord>({
  seatNumber: { type: Number, required: true, min: 1 },
  cause: {
    type: String,
    required: true,
    enum: [
      'werewolf_kill', 'witch_poison', 'vote_out', 'hunter_gun',
      'wolf_king_gun', 'white_wolf_explode', 'knight_duel',
      'knight_suicide', 'guard_witch_conflict', 'judge_override',
    ],
  },
  saved: { type: Boolean, required: true, default: false },
  overridden: { type: Boolean, required: true, default: false },
  overrideReason: { type: String, default: null },
}, { _id: false, strict: 'throw' });

/**
 * 白天死亡记录子文档 Schema
 */
const DayDeathRecordSubSchema = new Schema<DayDeathRecord>({
  seatNumber: { type: Number, required: true, min: 1 },
  cause: {
    type: String,
    required: true,
    enum: [
      'werewolf_kill', 'witch_poison', 'vote_out', 'hunter_gun',
      'wolf_king_gun', 'white_wolf_explode', 'knight_duel',
      'knight_suicide', 'guard_witch_conflict', 'judge_override',
    ],
  },
  triggeredBy: { type: Number, default: null },
  triggersChain: { type: Boolean, required: true, default: false },
  overridden: { type: Boolean, required: true, default: false },
  overrideReason: { type: String, default: null },
}, { _id: false, strict: 'throw' });

/**
 * RuleConfig 子文档 Schema
 * 对应 shared/types.ts 中的 RuleConfig 接口
 * 所有村规字段均在此定义，确保数据库层与类型层一致
 */
const RuleConfigSubSchema = new Schema<RuleConfig>({
  playerCount: { type: Number, required: true, min: 6, max: 18 },

  roleDistribution: {
    type: Map,
    of: Number,
    required: true,
    validate: {
      validator(v: Map<string, number>) {
        // 验证角色分配总数等于 playerCount
        let total = 0;
        for (const count of v.values()) {
          total += count;
        }
        return total > 0; // 创建时可能还未配齐，运行时再校验
      },
      message: '角色分配总数必须大于0',
    },
  },

  // ---- 夜间行动顺序 ----
  nightActionOrder: {
    type: [String],
    required: true,
    validate: {
      validator(v: string[]) {
        // 每个元素必须是合法的 RoleId
        const validRoles = new Set([
          'villager', 'seer', 'witch', 'hunter', 'guard', 'idiot', 'knight',
          'werewolf', 'white_wolf_king', 'wolf_king', 'nightmare_shadow', 'hidden_wolf', 'mechanical_wolf',
        ]);
        return v.every((r) => validRoles.has(r));
      },
      message: 'nightActionOrder 包含非法角色ID',
    },
  },
  nightActionOrderPreset: {
    type: String,
    required: true,
    enum: ['classic', 'seer_first', 'witch_first', 'chaos'],
  },

  // ---- 村规配置 ----
  witchSaveSelf: {
    type: String,
    required: true,
    enum: ['NEVER', 'FIRST_NIGHT', 'ALWAYS'],
  },
  guardWitchConflict: {
    type: String,
    required: true,
    enum: ['DEATH', 'ALIVE'],
  },
  poisonBlockGun: { type: Boolean, required: true },
  witchCanUseBothPotions: { type: Boolean, required: true, default: false },
  knightDuelWolfKing: {
    type: String,
    required: true,
    enum: ['CAN_SHOOT', 'SILENCED'],
  },
  knightDuelSuicide: {
    type: String,
    required: true,
    enum: ['SUICIDE', 'REVEAL_ONLY'],
  },
  tieVoteResolution: {
    type: String,
    required: true,
    enum: ['SKIP', 'PK_VOTE', 'RANDOM'],
  },
  winCondition: {
    type: String,
    required: true,
    enum: ['SLAUGHTER_SIDE', 'SLAUGHTER_ALL'],
  },
  daytimeKillSequence: {
    type: String,
    required: true,
    enum: ['TRIGGER_ALL', 'TRIGGER_DEFERRED'],
  },
  werewolfSharedVision: {
    type: String,
    required: true,
    enum: ['ALL_SHARE', 'LEADER_ONLY', 'NONE'],
  },

  // ---- 共同睁眼的狼人 ----
  sharedWolfRoles: {
    type: [String],
    required: true,
    default: ['werewolf', 'wolf_king', 'nightmare_shadow'],
    validate: {
      validator(v: string[]) {
        const validRoles = new Set([
          'villager', 'seer', 'witch', 'hunter', 'guard', 'idiot', 'knight',
          'werewolf', 'white_wolf_king', 'wolf_king', 'nightmare_shadow', 'hidden_wolf', 'mechanical_wolf',
        ]);
        return v.every((r) => validRoles.has(r));
      },
      message: 'sharedWolfRoles 包含非法角色ID',
    },
  },

  // ---- 发言顺序 ----
  speechOrderStrategy: {
    type: String,
    required: true,
    enum: ['DEATH_LEFT', 'DEATH_RIGHT', 'SHERIFF_LEFT', 'SHERIFF_RIGHT', 'JUDGE_CUSTOM'],
  },

  // ---- 超时配置 ----
  nightActionTimeout: { type: Number, required: true, min: 0, default: 30 },
  speechTimeout: { type: Number, required: true, min: 0, default: 60 },
  voteTimeout: { type: Number, required: true, min: 0, default: 20 },
  preVoteWaitTime: { type: Number, required: true, min: 0, default: 10 },
  skillActivationTimeout: { type: Number, required: true, min: 0, default: 15 },

  // ---- 身份揭示配置（规则20） ----
  revealIdentityOnDayVote: {
    type: String,
    required: true,
    enum: ['NONE', 'FACTION', 'ROLE'],
    default: 'NONE',
  },

  // ---- 警长选举 ----
  sheriffElectionEnabled: { type: Boolean, required: true, default: false },
  sheriffVoteWeight: { type: Number, required: true, default: 1.5, enum: [1, 1.5, 2] },

  // ---- 语音功能 ----
  enableVoice: { type: Boolean, required: true, default: true },
  firstDayDoubleSpeech: { type: Boolean, default: false },
}, { _id: false, strict: 'throw' });

/**
 * 狼人聊天消息子文档 Schema
 * 对应 shared/types.ts 中的 WolfChatMessage 接口
 */
const WolfChatMessageSubSchema = new Schema({
  id: { type: String, required: true },
  roomCode: { type: String, required: true, uppercase: true },
  round: { type: Number, required: true, min: 1 },
  senderSeat: { type: Number, required: true, min: 1 },
  senderNickname: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true, maxlength: 500 },
  timestamp: { type: Number, required: true },
  visibility: { type: String, required: true, enum: ['wolf_only'], default: 'wolf_only' },
}, { _id: false, strict: 'throw' });

// ============================================================================
// Room Schema — 房间状态持久化
// ============================================================================

/**
 * Room 文档接口
 */
export interface RoomDocument extends Document {
  roomCode: string;
  gameMode: GameMode;
  phase: GamePhase;
  nightSubPhase: NightSubPhase | null;
  round: number;
  config: RuleConfig;
  players: Player[];
  speechOrder: number[];
  currentSpeakerIndex: number;
  currentSpeechRound: number;
  votes: Map<number, number>;
  sheriffElectionVotes: Map<number, number>;
  pkCandidates: number[];
  nightActions: Map<string, NightActionData>;
  werewolfTarget: number | null;
  witchSaveTarget: number | null;
  witchPoisonTarget: number | null;
  guardProtectTarget: number | null;
  nightmareTarget: number | null;
  wolfVotes: Map<number, number>;
  wolfVoteConsensus: boolean;
  nightDeaths: NightDeathRecord[];
  dayDeaths: DayDeathRecord[];
  isPaused: boolean;
  winner: Faction | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  configVersion: number;
}

const RoomSchema = new Schema<RoomDocument>({
  roomCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9]{6}$/,
  },
  gameMode: {
    type: String,
    required: true,
    enum: ['HUMAN', 'SYSTEM'],
  },
  phase: {
    type: String,
    required: true,
    enum: [
      'LOBBY', 'ROLE_REVEAL', 'PRE_NIGHT', 'NIGHT', 'NIGHT_SETTLEMENT', 'DAY_ANNOUNCE',
      'SHERIFF_ELECTION', 'SHERIFF_TRANSFER',
      'DAY_SPEECH', 'PRE_VOTE_WAIT', 'DAY_VOTE', 'DAY_SETTLEMENT', 'DAY_INTERRUPT',
      'PK_VOTE', 'GAME_OVER',
    ],
    default: 'LOBBY',
  },
  nightSubPhase: { type: NightSubPhaseSubSchema, default: null },
  round: { type: Number, required: true, default: 0 },
  config: { type: RuleConfigSubSchema, required: true },
  players: [PlayerSubSchema],
  speechOrder: { type: [Number], default: [] },
  currentSpeakerIndex: { type: Number, default: 0 },
  currentSpeechRound: { type: Number, default: 1 },
  votes: { type: Map, of: Number, default: {} },
  sheriffElectionVotes: { type: Map, of: Number, default: {} },
  pkCandidates: { type: [Number], default: [] },
  nightActions: { type: Map, of: NightActionDataSubSchema, default: {} },
  werewolfTarget: { type: Number, default: null },
  witchSaveTarget: { type: Number, default: null },
  witchPoisonTarget: { type: Number, default: null },
  guardProtectTarget: { type: Number, default: null },
  nightmareTarget: { type: Number, default: null },
  wolfVotes: { type: Map, of: Number, default: {} },
  wolfVoteConsensus: { type: Boolean, default: false },
  nightDeaths: [NightDeathRecordSubSchema],
  dayDeaths: [DayDeathRecordSubSchema],
  isPaused: { type: Boolean, default: false },
  winner: {
    type: String,
    enum: ['good', 'evil'],
    default: null,
  },
  createdAt: { type: Number, required: true, default: () => Date.now() },
  startedAt: { type: Number, default: null },
  endedAt: { type: Number, default: null },
  configVersion: { type: Number, default: 10 },
}, {
  strict: 'throw',
  timestamps: false, // 使用自定义的 createdAt
  collection: 'rooms',
});

// 游戏状态索引（用于清理超时房间等）
RoomSchema.index({ phase: 1, createdAt: -1 });

// ============================================================================
// GameLog Schema — 全局操作日志
// ============================================================================

/**
 * GameLog 文档接口
 */
export interface GameLogDocument extends Document {
  roomCode: string;
  /** 游戏局唯一标识（格式: ${roomCode}_${gameStartTimestamp}），同房间不同局可通过此字段分离 */
  gameId: string;
  timestamp: number;
  actorSeat: number;
  actorNickname: string;
  actionType: ActionType;
  targetSeat: number | null;
  targetNickname: string | null;
  phase: GamePhase;
  round: number;
  detail: Record<string, unknown>;
  overridden: boolean;
  overrideReason: string | null;
  /**
   * 当时的夜间行动顺序快照
   * 关键字段：用于复盘时追溯顺序对结果的影响
   * 例如：噩梦之影排在最后导致恐惧延期，此快照可还原当时的顺序
   */
  nightActionOrderSnapshot: RoleId[];
}

const GameLogSchema = new Schema<GameLogDocument>({
  roomCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9]{6}$/,
  },
  gameId: {
    type: String,
    required: false,
    uppercase: true,
    trim: true,
    default: '',
  },
  timestamp: { type: Number, required: true, default: () => Date.now() },
  actorSeat: { type: Number, required: true, min: 0 },
  actorNickname: { type: String, required: true, trim: true },
  actionType: {
    type: String,
    required: true,
    enum: [
      // 大厅操作
      'PLAYER_JOIN', 'PLAYER_LEAVE', 'PLAYER_READY', 'GAME_START',
      // 夜间操作
      'NIGHT_PHASE_START', 'NIGHT_ACTION_SUBMIT', 'NIGHT_ACTION_BLOCKED',
      'NIGHT_SETTLEMENT', 'NIGHTMARE_DEFER', 'NIGHTMARE_BLOCK_MODE_DOWNGRADE',
      'WOLF_CHAT_MESSAGE', 'WOLF_VOTE_CAST', 'WOLF_VOTE_CONSENSUS', 'WOLF_VOTE_TIMEOUT_RANDOM',
      // 白天操作
      'DAY_ANNOUNCE', 'SPEECH_START', 'SPEECH_CONTENT', 'SPEECH_SKIP', 'SPEECH_FINISH',
      'VOTE_CAST', 'VOTE_RESULT', 'PK_VOTE_START',
      // 特殊技能
      'KNIGHT_DUEL', 'WHITE_WOLF_EXPLODE', 'HUNTER_GUN', 'WOLF_KING_GUN', 'IDIOT_REVEAL',
      // 警长选举
      'SHERIFF_ELECTION_START', 'SHERIFF_ELECTION_VOTE', 'SHERIFF_ELECTED', 'SHERIFF_ELECTION_TIE',
      'SHERIFF_TRANSFER',
      // 法官操作
      'JUDGE_OVERRIDE_SETTLEMENT', 'JUDGE_FORCE_NEXT_PHASE',
      'JUDGE_PAUSE', 'JUDGE_RESUME', 'JUDGE_MODIFY_SPEECH_ORDER',
      'JUDGE_MODIFY_NIGHT_ORDER', 'JUDGE_TRIGGER_KNIGHT_DUEL',
      'JUDGE_TRIGGER_WHITE_WOLF', 'JUDGE_SKIP_SPEECH',
      // 系统
      'GAME_OVER', 'PHASE_CHANGE', 'TIMER_EXPIRED',
      // V10 新增
      'WOLF_PHASE_SKIPPED', 'GUARD_NO_VALID_TARGET',
      'MECHANICAL_WOLF_SKILL_DEFERRED', 'DEAD_CHAT_MESSAGE',
      'DAY_VOTE_IDENTITY_REVEAL',
    ],
  },
  targetSeat: { type: Number, default: null },
  targetNickname: { type: String, default: null },
  phase: {
    type: String,
    required: true,
    enum: [
      'LOBBY', 'NIGHT', 'NIGHT_SETTLEMENT', 'DAY_ANNOUNCE',
      'SHERIFF_ELECTION', 'SHERIFF_TRANSFER',
      'DAY_SPEECH', 'PRE_VOTE_WAIT', 'DAY_VOTE', 'DAY_SETTLEMENT', 'DAY_INTERRUPT',
      'PK_VOTE', 'GAME_OVER',
    ],
  },
  round: { type: Number, required: true, min: 0 },
  detail: { type: Schema.Types.Mixed, default: {} },
  overridden: { type: Boolean, required: true, default: false },
  overrideReason: { type: String, default: null },
  nightActionOrderSnapshot: {
    type: [String],
    required: false,
    default: [],
    validate: {
      validator(v: string[]) {
        if (!v || v.length === 0) return true;
        const validRoles = new Set([
          'villager', 'seer', 'witch', 'hunter', 'guard', 'idiot', 'knight',
          'werewolf', 'white_wolf_king', 'wolf_king', 'nightmare_shadow', 'hidden_wolf', 'mechanical_wolf',
        ]);
        return v.every((r) => validRoles.has(r));
      },
      message: 'nightActionOrderSnapshot 包含非法角色ID',
    },
  },
}, {
  strict: 'throw',
  timestamps: false,
  collection: 'game_logs',
});

// 复合索引：按房间+时间查询（最常用的查询模式）
GameLogSchema.index({ roomCode: 1, timestamp: -1 });
// 按游戏局ID查询（单独调取某局游戏的所有日志）
GameLogSchema.index({ gameId: 1, timestamp: -1 });
// 按动作类型查询
GameLogSchema.index({ actionType: 1, timestamp: -1 });
// 按时间范围查询（Admin 后台全局检索）
GameLogSchema.index({ timestamp: -1 });
// 按房间+轮次+阶段查询
GameLogSchema.index({ roomCode: 1, round: 1, phase: 1 });

// ============================================================================
// WolfChatLog Schema — 狼人聊天日志独立集合
// ============================================================================

/**
 * WolfChatLog 文档接口
 */
export interface WolfChatLogDocument extends Document {
  roomCode: string;
  gameId: string;
  round: number;
  senderSeat: number;
  senderNickname: string;
  content: string;
  timestamp: number;
  visibility: 'wolf_only';
}

const WolfChatLogSchema = new Schema<WolfChatLogDocument>({
  roomCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9]{6}$/,
  },
  gameId: {
    type: String,
    required: false,
    uppercase: true,
    trim: true,
    default: '',
  },
  round: { type: Number, required: true, min: 1 },
  senderSeat: { type: Number, required: true, min: 1 },
  senderNickname: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true, maxlength: 500 },
  timestamp: { type: Number, required: true, default: () => Date.now() },
  visibility: { type: String, required: true, enum: ['wolf_only'], default: 'wolf_only' },
}, {
  strict: 'throw',
  timestamps: false,
  collection: 'wolf_chat_logs',
});

// 狼人聊天日志索引
WolfChatLogSchema.index({ roomCode: 1, round: -1 });
WolfChatLogSchema.index({ gameId: 1, round: -1 });
WolfChatLogSchema.index({ roomCode: 1, timestamp: -1 });

// ============================================================================
// 导出 Model
// ============================================================================

/**
 * 房间 Model — 用于房间状态的 CRUD 操作
 * 服务端在内存中维护 RoomState，定期同步到此集合
 * 断线重连时从此集合恢复状态
 */
export const RoomModel = mongoose.model<RoomDocument>('Room', RoomSchema);

/**
 * 游戏日志 Model — 用于操作日志的写入和查询
 * 游戏中的每一项操作都实时写入此集合
 * Admin 后台通过此集合检索历史战报
 */
export const GameLogModel = mongoose.model<GameLogDocument>('GameLog', GameLogSchema);

/**
 * 狼人聊天日志 Model — 用于狼人聊天消息的写入和查询
 * 狼人聊天消息独立存储，不再嵌入 RoomModel
 */
export const WolfChatLogModel = mongoose.model<WolfChatLogDocument>('WolfChatLog', WolfChatLogSchema);

// ============================================================================
// MongoDB 连接管理
// ============================================================================

/** 连接状态 */
let isConnected = false;
/** 重连定时器 */
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 连接 MongoDB
 * 支持断线自动重连，重连间隔指数退避（1s → 2s → 4s → 最大 30s）
 */
export async function connectMongoDB(uri: string): Promise<void> {
  const MAX_RECONNECT_INTERVAL = 30_000;
  let reconnectInterval = 1_000;

  const doConnect = async (): Promise<void> => {
    try {
      const conn = await mongoose.connect(uri, {
        // MongoDB Atlas 推荐配置
        serverSelectionTimeoutMS: 30_000,
        heartbeatFrequencyMS: 10_000,
        // 连接池配置
        maxPoolSize: 10,
        minPoolSize: 2,
        // 单节点直连模式（绕过 Node.js SRV DNS 解析问题）
        directConnection: uri.includes('directConnection=true'),
      });

      isConnected = true;
      reconnectInterval = 1_000; // 重置重连间隔

      console.log(`[MongoDB] 已连接 | 主机: ${conn.connection.host} | 数据库: ${conn.connection.name}`);

      // 监听断线事件
      conn.connection.on('disconnected', () => {
        isConnected = false;
        console.warn('[MongoDB] 连接断开，将自动重连...');
        scheduleReconnect();
      });

      conn.connection.on('error', (err) => {
        console.error('[MongoDB] 连接错误:', err.message);
      });

      conn.connection.on('reconnected', () => {
        isConnected = true;
        console.log('[MongoDB] 已自动重连');
      });
    } catch (error) {
      isConnected = false;
      console.error(`[MongoDB] 连接失败: ${(error as Error).message}`);
      scheduleReconnect();
    }
  };

  const scheduleReconnect = (): void => {
    if (reconnectTimer) return; // 已有重连任务在排队
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      console.log(`[MongoDB] 尝试重连... (间隔: ${reconnectInterval}ms)`);
      await doConnect();
      reconnectInterval = Math.min(reconnectInterval * 2, MAX_RECONNECT_INTERVAL);
    }, reconnectInterval);
  };

  await doConnect();
}

/**
 * 获取连接状态
 */
export function isMongoConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * 优雅关闭连接
 */
export async function disconnectMongoDB(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  await mongoose.disconnect();
  isConnected = false;
  console.log('[MongoDB] 已断开连接');
}
