/**
 * ============================================================================
 * 大厅管理器 — 房间生命周期与连接映射
 * ============================================================================
 *
 * 架构说明：
 *   1. 密码学安全随机生成6位房间码
 *   2. 创建/销毁房间
 *   3. 加入/离开房间的握手逻辑
 *   4. 房间码唯一性校验
 *   5. 玩家连接映射（WebSocket → 房间+玩家）
 *
 * 设计原则：
 *   - 零硬编码：房间码由密码学安全随机生成，不使用默认房间号
 *   - 线程安全：所有房间操作在单线程 Node.js 事件循环中执行
 *   - 内存为主：房间状态主要在内存中维护，定期同步到 MongoDB
 * ============================================================================
 */

import crypto from 'crypto';
import type {
  RoomState,
  Player,
  RuleConfig,
  GameMode,
  GamePhase,
  PlayerStatus,
  RoleId,
  WolfChatMessage,
  WolfChatLog,
  ActionLog,
  ActionType,
} from '@langrensha/shared';
import {
  ROOM_CODE_CHARSET,
  ROOM_CODE_LENGTH,
  createDefaultRuleConfig,
  isEvilRole,
} from '@langrensha/shared';
import { GameEngine, VoteResultCallback, GameOverCallback, IdentityRevealCallback } from './GameEngine.js';
import { WolfChatLogModel, isMongoConnected } from './models.js';

// ============================================================================
// 房间码生成器
// ============================================================================

/**
 * 密码学安全随机生成6位房间码
 *
 * 使用 Node.js 内置 crypto.randomBytes 作为熵源，
 * 确保房间码不可预测、不可碰撞。
 * 字符集排除易混淆字符（0/O, 1/I/L）。
 *
 * @returns 6位房间码字符串
 */
export function generateRoomCode(): string {
  const charset = ROOM_CODE_CHARSET;
  const charsetLen = charset.length;
  // 拒绝采样的阈值：256 / charsetLen 向下取整 * charsetLen
  // 超出此阈值的字节值被拒绝，确保均匀分布
  const threshold = Math.floor(256 / charsetLen) * charsetLen;
  let code = '';

  const randomBytes = crypto.randomBytes(ROOM_CODE_LENGTH * 3);

  let byteIndex = 0;
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    let byte: number;
    do {
      byte = randomBytes[byteIndex++];
      // 如果字节用完，重新生成一批
      if (byteIndex >= randomBytes.length) {
        const newBytes = crypto.randomBytes(ROOM_CODE_LENGTH * 3);
        for (let j = 0; j < newBytes.length; j++) randomBytes[j] = newBytes[j];
        byteIndex = 0;
      }
    } while (byte >= threshold);
    code += charset[byte % charsetLen];
  }

  return code;
}

// ============================================================================
// 连接映射类型
// ============================================================================

/**
 * 客户端连接上下文
 * 每个 WebSocket 连接对应一个 ClientContext
 */
export interface ClientContext {
  /** WebSocket 连接实例 */
  ws: any; // WebSocket 类型由外层注入
  /** 玩家 ID（连接时分配） */
  playerId: string;
  /** 玩家昵称 */
  nickname: string;
  /** 所在房间码（null 表示未加入任何房间） */
  roomCode: string | null;
  /** 是否为法官 */
  isJudge: boolean;
  /** 连接时间 */
  connectedAt: number;
  /** 是否已断连（等待重连中） */
  disconnected: boolean;
  /** 断连时间戳 */
  disconnectedAt: number | null;
  /** 宽限期定时器引用（用于重连时取消旧定时器） */
  gracePeriodTimer: ReturnType<typeof setTimeout> | null;
  origin: string;
}

// ============================================================================
// LobbyManager 类定义
// ============================================================================

export class LobbyManager {
  /** 所有活跃房间：key 为房间码，value 为 GameEngine 实例 */
  private rooms: Map<string, GameEngine> = new Map();

  /** 客户端连接映射：key 为 playerId，value 为 ClientContext */
  private clients: Map<string, ClientContext> = new Map();

  /** WebSocket → playerId 映射（用于快速查找） */
  private wsToPlayerId: Map<any, string> = new Map();

  /** 快照恢复时间戳（用于在恢复后给予客户端重连的宽限期） */
  private snapshotRestoredAt: number | null = null;

  /** 快照恢复后的宽限期（毫秒），在此期间不清理 LOBBY 断连玩家 */
  private static readonly SNAPSHOT_RESTORE_GRACE_PERIOD = 30 * 1000; // 30 秒

  /** 房间→客户端反向索引：key 为 roomCode，value 为该房间的 playerId 集合 */
  private roomClientsIndex: Map<string, Set<string>> = new Map();

  /** 将玩家加入房间索引 */
  private addToRoomIndex(roomCode: string, playerId: string): void {
    let set = this.roomClientsIndex.get(roomCode);
    if (!set) {
      set = new Set();
      this.roomClientsIndex.set(roomCode, set);
    }
    set.add(playerId);
  }

  /** 将玩家从房间索引中移除 */
  private removeFromRoomIndex(roomCode: string | null, playerId: string): void {
    if (!roomCode) return;
    const set = this.roomClientsIndex.get(roomCode);
    if (set) {
      set.delete(playerId);
      if (set.size === 0) this.roomClientsIndex.delete(roomCode);
    }
  }

  /** 玩家 ID 计数器 */
  private playerIdCounter = 0;

  /**
   * 生成唯一玩家 ID
   *
   * 格式：p_自增计数器_随机后缀
   *
   * @returns 唯一玩家 ID 字符串
   */
  private generatePlayerId(): string {
    this.playerIdCounter++;
    const suffix = crypto.randomBytes(3).toString('hex');
    return `p_${this.playerIdCounter}_${suffix}`;
  }

  /**
   * 生成唯一房间码
   *
   * 确保与现有房间码不冲突（极低概率，但仍需检查），
   * 最多尝试 100 次。
   *
   * @returns 唯一房间码字符串
   * @throws 当超过最大尝试次数时抛出异常
   */
  private generateUniqueRoomCode(): string {
    let code: string;
    let attempts = 0;
    const MAX_ATTEMPTS = 100;

    do {
      code = generateRoomCode();
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        throw new Error('无法生成唯一房间码，请稍后重试');
      }
    } while (this.rooms.has(code));

    return code;
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  /**
   * 注册新的 WebSocket 连接
   *
   * 在 WebSocket 握手成功后调用，为连接分配唯一玩家 ID。
   *
   * @param ws - WebSocket 连接实例
   * @param origin - 连接来源（用于生成邀请链接）
   * @returns 客户端连接上下文
   */
  registerConnection(ws: any, origin = ''): ClientContext {
    const playerId = this.generatePlayerId();
    const context: ClientContext = {
      ws,
      playerId,
      nickname: '',
      roomCode: null,
      isJudge: false,
      connectedAt: Date.now(),
      disconnected: false,
      disconnectedAt: null,
      gracePeriodTimer: null,
      origin,
    };

    this.clients.set(playerId, context);
    this.wsToPlayerId.set(ws, playerId);

    return context;
  }

  /**
   * 注销 WebSocket 连接
   *
   * 在连接断开时调用，标记玩家为断连状态，给予 60 秒宽限期等待重连。
   * LOBBY 阶段超时后移除玩家，游戏进行中则保留断连状态等待昵称重连。
   *
   * @param ws - 断开的 WebSocket 连接
   * @returns 房间码和玩家 ID
   */
  unregisterConnection(ws: any): { roomCode: string | null; playerId: string } {
    const playerId = this.wsToPlayerId.get(ws);
    if (!playerId) return { roomCode: null, playerId: '' };

    const context = this.clients.get(playerId);
    if (!context) return { roomCode: null, playerId };

    // 标记为断连，而非立即移除
    context.disconnected = true;
    context.disconnectedAt = Date.now();
    context.ws = null; // 释放旧 WebSocket 引用

    // 清理 ws 映射
    this.wsToPlayerId.delete(ws);

    // 如果玩家不在房间中，直接清理
    if (!context.roomCode) {
      this.clients.delete(playerId);
      return { roomCode: null, playerId };
    }

    // 清除旧的宽限期定时器（防止多次断连产生多个定时器）
    if (context.gracePeriodTimer) {
      clearTimeout(context.gracePeriodTimer);
    }

    // 在房间中：设置宽限期，超时后根据游戏阶段决定处理方式
    const roomCode = context.roomCode;
    context.gracePeriodTimer = setTimeout(() => {
      const ctx = this.clients.get(playerId);
      // 如果宽限期结束时仍未重连
      if (ctx && ctx.disconnected && ctx.roomCode === roomCode) {
        ctx.gracePeriodTimer = null;

        // 检查游戏阶段
        const engine = this.rooms.get(roomCode);
        const phase = engine?.getState().phase;

        if (phase === 'LOBBY') {
          // LOBBY 阶段：真正移除玩家
          console.log(`[Lobby] 玩家 ${playerId} 重连超时，执行离开房间 ${roomCode}`);
          this.leaveRoom(playerId);
          this.removeFromRoomIndex(ctx.roomCode, playerId);
          this.clients.delete(playerId);
        } else {
          // 游戏进行中/已结束：保留 context 和玩家数据，允许后续通过昵称重连
          // 玩家仍留在游戏中，只是标记为断连状态
          console.log(`[Lobby] 玩家 ${playerId} 重连超时（游戏进行中），保留断连状态等待昵称重连`);
        }
      }
    }, 60 * 1000); // 60秒宽限期

    return { roomCode, playerId };
  }

  /**
   * 玩家重连 — 使用之前的 playerId 恢复会话
   *
   * 清除宽限期定时器，恢复连接状态，更新 WebSocket 映射。
   * 如果旧连接仍标记为"已连接"（TCP 半开连接），强制替换为新连接。
   *
   * @param playerId - 原玩家 ID
   * @param roomCode - 房间码
   * @param newWs - 新的 WebSocket 连接
   * @returns 重连结果，包含恢复的上下文和需清理的临时 playerId
   */
  reconnectPlayer(playerId: string, roomCode: string, newWs: any): { success: boolean; error?: string; context?: ClientContext; newPlayerId?: string } {
    const context = this.clients.get(playerId);
    if (!context) {
      return { success: false, error: '找不到之前的会话，请重新加入房间' };
    }

    if (context.roomCode !== roomCode) {
      return { success: false, error: '房间码不匹配' };
    }

    // 如果旧连接仍标记为"已连接"，说明服务端未检测到断连（TCP 半开连接）
    // 此时强制标记为断连，允许重连替换旧连接
    if (!context.disconnected) {
      console.log(`[Lobby] 玩家 ${playerId} 旧连接仍标记为已连接，强制替换为新连接`);
      // 清理旧 ws 映射
      if (context.ws) {
        this.wsToPlayerId.delete(context.ws);
        // 尝试关闭旧 WebSocket（可能已经死亡但服务端未检测到）
        try { (context.ws as any).close(); } catch {}
      }
      context.disconnected = true;
      context.disconnectedAt = Date.now();
    }

    // 清除宽限期定时器
    if (context.gracePeriodTimer) {
      clearTimeout(context.gracePeriodTimer);
      context.gracePeriodTimer = null;
    }

    // 在覆盖 ws 映射之前，先找到新 ws 对应的新 playerId
    // 此时 wsToPlayerId.get(newWs) 仍然指向 registerConnection 创建的 newPlayerId
    const newPlayerId = this.wsToPlayerId.get(newWs);
    const actualNewPlayerId = (newPlayerId && newPlayerId !== playerId) ? newPlayerId : undefined;

    // 恢复连接
    context.disconnected = false;
    context.disconnectedAt = null;
    context.ws = newWs;

    // 更新 ws 映射：newWs → 旧 playerId
    this.wsToPlayerId.set(newWs, playerId);

    console.log(`[Lobby] 玩家 ${playerId} (${context.nickname}) 重连成功，房间 ${roomCode}${actualNewPlayerId ? `，需清理临时 context ${actualNewPlayerId}` : ''}`);

    return { success: true, context, newPlayerId: actualNewPlayerId };
  }

  /**
   * 删除指定 playerId 的 ClientContext
   *
   * 用于重连时清理新创建的临时 context。
   *
   * @param playerId - 要删除的玩家 ID
   */
  removeClientContext(playerId: string): void {
    const ctx = this.clients.get(playerId);
    if (ctx) {
      if (ctx.gracePeriodTimer) {
        clearTimeout(ctx.gracePeriodTimer);
      }
      // 清理 wsToPlayerId 映射（如果 ws 仍指向此 playerId）
      if (ctx.ws && this.wsToPlayerId.get(ctx.ws) === playerId) {
        this.wsToPlayerId.delete(ctx.ws);
      }
      this.removeFromRoomIndex(ctx.roomCode, playerId);
      this.clients.delete(playerId);
    }
  }

  /**
   * 根据玩家 ID 获取客户端上下文
   *
   * @param playerId - 玩家 ID
   * @returns 客户端上下文，未找到则返回 undefined
   */
  getClient(playerId: string): ClientContext | undefined {
    return this.clients.get(playerId);
  }

  /**
   * 根据 WebSocket 获取客户端上下文
   *
   * @param ws - WebSocket 连接实例
   * @returns 客户端上下文，未找到则返回 undefined
   */
  getClientByWs(ws: any): ClientContext | undefined {
    const playerId = this.wsToPlayerId.get(ws);
    if (!playerId) return undefined;
    return this.clients.get(playerId);
  }

  // ==========================================================================
  // 房间操作
  // ==========================================================================

  /**
   * 创建房间
   *
   * 流程：
   * 1. 校验昵称和配置
   * 2. 生成唯一房间码
   * 3. 初始化 RoomState
   * 4. 创建 GameEngine 实例
   * 5. 将房主/法官添加到房间
   *
   * @param hostNickname - 房主昵称
   * @param gameMode - 游戏模式（HUMAN/SYSTEM）
   * @param config - 村规配置
   * @param hostWs - 房主的 WebSocket 连接
   * @param origin - 连接来源（用于生成邀请链接）
   * @returns 创建结果，包含房间码、邀请链接和玩家 ID
   */
  createRoom(
    hostNickname: string,
    gameMode: GameMode,
    config: RuleConfig,
    hostWs: any,
    origin: string,
  ): { success: boolean; error?: string; roomCode?: string; inviteLink?: string; playerId?: string } {
    // 校验昵称
    if (!hostNickname || hostNickname.trim().length === 0) {
      return { success: false, error: '昵称不能为空' };
    }
    if (hostNickname.length > 20) {
      return { success: false, error: '昵称不能超过20个字符' };
    }

    // 校验配置
    const configValidation = this.validateRuleConfig(config);
    if (!configValidation.valid) {
      return { success: false, error: configValidation.error };
    }

    // 生成唯一房间码
    const roomCode = this.generateUniqueRoomCode();

    // 生成邀请链接（HTTP 页面链接，前端页面会解析 code 参数）
    const inviteLink = `${origin || ''}/join?code=${roomCode}`;

    // 初始化房间状态
    const initialState: RoomState = {
      roomCode,
      gameMode,
      phase: 'LOBBY',
      nightSubPhase: null,
      round: 0,
      config,
      players: [],
      speechOrder: [],
      currentSpeakerIndex: 0,
      currentSpeechRound: 1,
      votes: {},
      sheriffElectionVotes: {},
      pkCandidates: [],
      nightActions: {},
      werewolfTarget: null,
      witchSaveTarget: null,
      witchPoisonTarget: null,
      guardProtectTarget: null,
      nightmareTarget: null,
      wolfVotes: {},
      wolfVoteConsensus: false,
      wolfChatMessages: [],
      nightDeaths: [],
      dayDeaths: [],
      isPaused: false,
      winner: null,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      configVersion: 10,
      pendingDeathSkill: null,
    };

    // 创建 GameEngine 实例
    const engine = new GameEngine(
      initialState,
      // 日志回调（由外层 Server 注入实际写入逻辑，此处使用占位）
      (log) => { this.onLog(log); },
      // 法官警告回调
      (type, msg, data) => { this.onJudgeWarning(roomCode, type, msg, data); },
      // 阶段变更回调
      (phase, subPhase, round) => { this.onPhaseChange(roomCode, phase, subPhase, round); },
      // 狼人聊天回调
      (rc, message) => { this.onWolfChat(rc, message); },
      // 阶段提醒回调
      (rc, roleId, round, actorSeats, timeout) => { this.onPhaseReminder(rc, roleId, round, actorSeats, timeout); },
      // 狼人投票更新回调
      (rc, votes, consensus, lockedTarget) => { this.onWolfVoteUpdate(rc, votes, consensus, lockedTarget); },
      // 游戏事件回调
      (rc, eventType, data) => { this.onGameEvent(rc, eventType, data); },
      // 夜间子阶段推进回调
      (rc) => { this.onNightSubPhaseAdvance(rc); },
      // 夜间倒计时广播回调
      (rc, roleId, remaining) => { this.onNightCountdown(rc, roleId, remaining); },
      // 发言倒计时广播回调
      (rc, seatNumber, remaining) => { this.onSpeechCountdown(rc, seatNumber, remaining); },
      // 天亮公告回调
      (rc, deaths, mutedSeats) => { this.onDayAnnounce(rc, deaths, mutedSeats); },
      // 投票结果回调
      (rc, votes, eliminated, isPK, pkCandidates) => { this.voteResultCallback(rc, votes, eliminated, isPK, pkCandidates); },
      // 游戏结束回调
      (rc, winner, round, players) => { this.gameOverCallback(rc, winner, round, players); },
      // 身份揭示回调
      (rc, seatNumber, nickname, revealType, revealInfo) => { this.identityRevealCallback(rc, seatNumber, nickname, revealType, revealInfo); },
    );

    this.rooms.set(roomCode, engine);

    // 注册房主连接
    const playerId = this.generatePlayerId();
    const isJudge = gameMode === 'HUMAN';

    // 创建房主玩家对象
    const hostPlayer: Player = {
      id: playerId,
      nickname: hostNickname.trim(),
      seatNumber: 0, // 法官不占座位号
      role: 'villager', // 法官角色无意义，默认值
      status: 'alive',
      isJudge,
      isSheriff: false,
      isHost: true,
      isReady: false,
      isNightmared: false,
      isMuted: false,
      witchAntidoteUsed: false,
      witchPoisonUsed: false,
      guardLastProtected: null,
      guardProtectedHistory: [],
      nightmareTargetHistory: [],
      hiddenWolfHasActed: false,
      mechanicalWolfImitateTarget: null,
      mechanicalWolfPhase: null,
      mechanicalWolfImitatedRole: null,
      mechanicalWolfSkillDeferred: false,
      idiotRevealed: false,
      hunterGunFired: false,
      wolfKingGunFired: false,
      deathCause: null,
      deathRound: null,
    };

    // 添加房主到房间
    const state = engine.getState() as RoomState;
    state.players.push(hostPlayer);

    // 记录房主加入日志
    this.onLog({
      roomCode,
      gameId: '',
      timestamp: Date.now(),
      actorSeat: 0,
      actorNickname: hostNickname.trim(),
      actionType: 'PLAYER_JOIN' as ActionType,
      targetSeat: null,
      targetNickname: null,
      phase: 'LOBBY',
      round: 0,
      detail: { roomCode, gameMode, config, isJudge: true },
      overridden: false,
      overrideReason: null,
      nightActionOrderSnapshot: [...config.nightActionOrder],
    } as ActionLog);

    // 复用已有的客户端上下文（WebSocket 连接时已注册）
    const existingPlayerId = this.wsToPlayerId.get(hostWs);
    let contextPlayerId: string;
    if (existingPlayerId) {
      const existingContext = this.clients.get(existingPlayerId)!;
      hostPlayer.id = existingPlayerId;
      existingContext.nickname = hostNickname.trim();
      existingContext.roomCode = roomCode;
      this.addToRoomIndex(roomCode, existingPlayerId);
      existingContext.isJudge = isJudge;
      contextPlayerId = existingPlayerId;
    } else {
      const context = this.registerConnection(hostWs);
      hostPlayer.id = context.playerId;
      context.nickname = hostNickname.trim();
      context.roomCode = roomCode;
      this.addToRoomIndex(roomCode, context.playerId);
      context.isJudge = isJudge;
      contextPlayerId = context.playerId;
    }

    return {
      success: true,
      roomCode,
      inviteLink,
      playerId: contextPlayerId,
    };
  }

  /**
   * 加入房间
   *
   * 校验流程：
   * 1. 昵称和房间码格式校验
   * 2. 房间是否存在
   * 3. 游戏是否已开始
   * 4. 房间是否已满
   * 5. 昵称是否重复（大小写不敏感）
   *
   * @param nickname - 玩家昵称
   * @param roomCode - 房间码
   * @param playerWs - 玩家的 WebSocket 连接
   * @returns 加入结果，包含玩家 ID 和座位号
   */
  joinRoom(
    nickname: string,
    roomCode: string,
    playerWs: any,
  ): { success: boolean; error?: string; playerId?: string; seatNumber?: number } {
    // 校验昵称
    if (!nickname || nickname.trim().length === 0) {
      return { success: false, error: '昵称不能为空' };
    }
    if (nickname.length > 20) {
      return { success: false, error: '昵称不能超过20个字符' };
    }

    // 校验房间码格式
    const upperCode = roomCode.toUpperCase();
    if (upperCode.length !== ROOM_CODE_LENGTH || !upperCode.split('').every((c) => ROOM_CODE_CHARSET.includes(c))) {
      return { success: false, error: '房间码格式不正确' };
    }

    // 查找房间
    const engine = this.rooms.get(roomCode.toUpperCase());
    if (!engine) {
      return { success: false, error: '房间不存在' };
    }

    const state = engine.getState() as RoomState;

    // 校验游戏是否已开始
    if (state.phase !== 'LOBBY') {
      return { success: false, error: '游戏已开始，无法加入' };
    }

    // 校验房间是否已满
    const nonJudgePlayers = state.players.filter((p) => !p.isJudge);
    if (nonJudgePlayers.length >= state.config.playerCount) {
      return { success: false, error: '房间已满' };
    }

    // 校验昵称是否重复（大小写不敏感）
    const nicknameExists = state.players.some(
      (p) => p.nickname.toLowerCase() === nickname.trim().toLowerCase(),
    );
    if (nicknameExists) {
      return { success: false, error: '该昵称已被使用' };
    }

    // 分配座位号
    const usedSeats = new Set(state.players.map((p) => p.seatNumber));
    let seatNumber = 1;
    while (usedSeats.has(seatNumber)) {
      seatNumber++;
    }

    // 复用已有的客户端上下文（WebSocket 连接时已注册）
    const existingPlayerId = this.wsToPlayerId.get(playerWs);
    let contextPlayerId: string;
    if (existingPlayerId) {
      const existingContext = this.clients.get(existingPlayerId)!;
      existingContext.nickname = nickname.trim();
      existingContext.roomCode = roomCode.toUpperCase();
      this.addToRoomIndex(roomCode.toUpperCase(), existingPlayerId);
      existingContext.isJudge = false;
      contextPlayerId = existingPlayerId;
    } else {
      const context = this.registerConnection(playerWs);
      context.nickname = nickname.trim();
      context.roomCode = roomCode.toUpperCase();
      this.addToRoomIndex(roomCode.toUpperCase(), context.playerId);
      context.isJudge = false;
      contextPlayerId = context.playerId;
    }

    // 创建玩家对象
    const player: Player = {
      id: contextPlayerId,
      nickname: nickname.trim(),
      seatNumber,
      role: 'villager', // 默认值，游戏开始时随机分配
      status: 'alive',
      isJudge: false,
      isSheriff: false,
      isHost: false,
      isReady: false,
      isNightmared: false,
      isMuted: false,
      witchAntidoteUsed: false,
      witchPoisonUsed: false,
      guardLastProtected: null,
      guardProtectedHistory: [],
      nightmareTargetHistory: [],
      hiddenWolfHasActed: false,
      mechanicalWolfImitateTarget: null,
      mechanicalWolfPhase: null,
      mechanicalWolfImitatedRole: null,
      mechanicalWolfSkillDeferred: false,
      idiotRevealed: false,
      hunterGunFired: false,
      wolfKingGunFired: false,
      deathCause: null,
      deathRound: null,
    };

    state.players.push(player);

    // 记录玩家加入日志
    this.onLog({
      roomCode: state.roomCode,
      gameId: '',
      timestamp: Date.now(),
      actorSeat: seatNumber,
      actorNickname: nickname.trim(),
      actionType: 'PLAYER_JOIN' as ActionType,
      targetSeat: null,
      targetNickname: null,
      phase: 'LOBBY',
      round: 0,
      detail: { playerCount: state.players.filter(p => !p.isJudge).length, maxPlayers: state.config.playerCount },
      overridden: false,
      overrideReason: null,
      nightActionOrderSnapshot: [...state.config.nightActionOrder],
    } as ActionLog);

    return {
      success: true,
      playerId: contextPlayerId,
      seatNumber,
    };
  }

  /**
   * 通过昵称+房间号重新加入游戏
   *
   * 场景：玩家异常退出（浏览器崩溃、误关页面等）后，重新输入相同昵称和房间号。
   * 如果房间中存在同昵称的断连玩家，则自动重连恢复。
   *
   * @param nickname - 玩家昵称
   * @param roomCode - 房间码
   * @param playerWs - 玩家的 WebSocket 连接
   * @returns 重连结果，包含是否重连、玩家 ID、房间码、游戏阶段和需清理的临时 playerId
   */
  rejoinByNickname(
    nickname: string,
    roomCode: string,
    playerWs: any,
  ): { success: boolean; error?: string; reconnected?: boolean; playerId?: string; roomCode?: string; phase?: GamePhase; newPlayerId?: string } {
    // 校验昵称
    if (!nickname || nickname.trim().length === 0) {
      return { success: false, error: '昵称不能为空' };
    }
    if (nickname.length > 20) {
      return { success: false, error: '昵称不能超过20个字符' };
    }

    // 校验房间码格式
    const upperCode = roomCode.toUpperCase();
    if (upperCode.length !== ROOM_CODE_LENGTH || !upperCode.split('').every((c) => ROOM_CODE_CHARSET.includes(c))) {
      return { success: false, error: '房间码格式不正确' };
    }

    // 查找房间
    const engine = this.rooms.get(upperCode);
    if (!engine) {
      return { success: false, error: '房间不存在' };
    }

    const state = engine.getState() as RoomState;
    const trimmedNickname = nickname.trim();

    // 查找同昵称的断连玩家（大小写不敏感匹配，包含法官）
    const matchingPlayer = state.players.find(
      (p) => p.nickname.toLowerCase() === trimmedNickname.toLowerCase(),
    );

    if (matchingPlayer) {
      // 找到同昵称玩家，检查是否断连
      const context = this.clients.get(matchingPlayer.id);

      if (context) {
        // 如果旧连接仍标记为"已连接"，说明服务端未检测到断连（TCP 半开连接）
        // 此时强制标记为断连，允许昵称重连替换旧连接
        if (!context.disconnected) {
          console.log(`[Lobby] 玩家 ${matchingPlayer.id} 旧连接仍标记为已连接，强制替换为新连接（昵称重连）`);
          // 清理旧 ws 映射
          if (context.ws) {
            this.wsToPlayerId.delete(context.ws);
            // 尝试关闭旧 WebSocket（可能已经死亡但服务端未检测到）
            try { (context.ws as any).close(); } catch {}
          }
          context.disconnected = true;
          context.disconnectedAt = Date.now();
        }

        // 断连玩家 → 执行重连
        // 先获取新 ws 对应的新 playerId（registerConnection 创建的）
        const newPlayerId = this.wsToPlayerId.get(playerWs);
        const actualNewPlayerId = (newPlayerId && newPlayerId !== matchingPlayer.id) ? newPlayerId : undefined;

        // 恢复旧 context 的连接
        context.disconnected = false;
        context.disconnectedAt = null;
        context.ws = playerWs;

        // 清除宽限期定时器
        if (context.gracePeriodTimer) {
          clearTimeout(context.gracePeriodTimer);
          context.gracePeriodTimer = null;
        }

        // 更新 ws 映射
        this.wsToPlayerId.set(playerWs, matchingPlayer.id);

        console.log(`[Lobby] 玩家 ${matchingPlayer.id} (${trimmedNickname}) 通过昵称重连成功，房间 ${upperCode}${actualNewPlayerId ? `，需清理临时 context ${actualNewPlayerId}` : ''}`);

        return {
          success: true,
          reconnected: true,
          playerId: matchingPlayer.id,
          roomCode: upperCode,
          phase: state.phase,
          newPlayerId: actualNewPlayerId,
        };
      }

      // context 不存在但玩家数据仍在游戏中（异常状态）→ 不允许加入
      return { success: false, error: '该昵称的玩家当前在线，无法重复加入' };
    }

    // 没有找到同昵称玩家
    if (state.phase === 'LOBBY') {
      // LOBBY 阶段 → 正常加入（由 joinRoom 处理）
      return { success: true, reconnected: false };
    }

    // 游戏进行中/已结束且没有同昵称断连玩家 → 不允许加入
    return { success: false, error: '游戏已开始，无法以新身份加入' };
  }

  /**
   * 离开房间
   *
   * LOBBY 阶段直接移除玩家，游戏进行中仅标记断线。
   * 房主离开时自动转移房主权限，房间为空时销毁房间。
   *
   * @param playerId - 玩家 ID
   * @returns 离开结果，包含房间码
   */
  leaveRoom(playerId: string): { success: boolean; error?: string; roomCode?: string } {
    const context = this.clients.get(playerId);
    if (!context || !context.roomCode) {
      return { success: false, error: '你不在任何房间中' };
    }

    const engine = this.rooms.get(context.roomCode);
    if (!engine) {
      // 房间已不存在，仅清理上下文
      this.removeFromRoomIndex(context.roomCode, playerId);
      context.roomCode = null;
      return { success: true, roomCode: undefined };
    }

    const state = engine.getState() as RoomState;
    const playerIndex = state.players.findIndex((p) => p.id === playerId);

    if (playerIndex === -1) {
      this.removeFromRoomIndex(context.roomCode, playerId);
      context.roomCode = null;
      return { success: true, roomCode: undefined };
    }

    const player = state.players[playerIndex];

    // 如果游戏正在进行中，玩家断线但不移除（标记为断线状态）
    // 如果在大厅阶段，直接移除
    if (state.phase === 'LOBBY') {
      // 记录玩家离开日志（大厅阶段）
      this.onLog({
        roomCode: state.roomCode,
        gameId: '',
        timestamp: Date.now(),
        actorSeat: player.seatNumber,
        actorNickname: player.nickname,
        actionType: 'PLAYER_LEAVE' as ActionType,
        targetSeat: null,
        targetNickname: null,
        phase: 'LOBBY',
        round: 0,
        detail: { remainingPlayers: state.players.length - 1, wasHost: player.isHost },
        overridden: false,
        overrideReason: null,
        nightActionOrderSnapshot: [...state.config.nightActionOrder],
      } as ActionLog);

      state.players.splice(playerIndex, 1);

      // 如果房主离开，转移房主权限
      if (player.isHost && state.players.length > 0) {
        const nextHost = state.players.find((p) => !p.isJudge);
        if (nextHost) {
          nextHost.isHost = true;
        }
      }

      // 如果房间空了，销毁房间
      if (state.players.length === 0) {
        engine.destroy();
        this.rooms.delete(context.roomCode);
      }
    } else {
      // 游戏进行中：玩家断线但不移除，记录断线日志
      this.onLog({
        roomCode: state.roomCode,
        gameId: '',
        timestamp: Date.now(),
        actorSeat: player.seatNumber,
        actorNickname: player.nickname,
        actionType: 'PLAYER_LEAVE' as ActionType,
        targetSeat: null,
        targetNickname: null,
        phase: state.phase,
        round: state.round,
        detail: { disconnected: true, phase: state.phase },
        overridden: false,
        overrideReason: null,
        nightActionOrderSnapshot: [...state.config.nightActionOrder],
      } as ActionLog);
    }

    const roomCode = context.roomCode;

    // 游戏进行中时保留 roomCode 以支持断线重连，仅大厅阶段清除
    if (state.phase === 'LOBBY') {
      this.removeFromRoomIndex(context.roomCode, playerId);
      context.roomCode = null;
    }

    return { success: true, roomCode };
  }

  /**
   * 法官解散房间 — 销毁房间，返回所有玩家信息供广播
   *
   * @param playerId - 法官玩家 ID
   * @returns 解散结果，包含房间码和玩家信息列表
   */
  dissolveRoom(playerId: string): { success: boolean; error?: string; roomCode?: string; players?: Array<{ seatNumber: number; nickname: string; role: RoleId | null; status: PlayerStatus | null }> } {
    const context = this.clients.get(playerId);
    if (!context || !context.roomCode) {
      return { success: false, error: '你不在任何房间中' };
    }

    // 验证是法官
    if (!context.isJudge) {
      return { success: false, error: '只有法官可以解散房间' };
    }

    const roomCode = context.roomCode;
    const engine = this.rooms.get(roomCode);
    if (!engine) {
      return { success: false, error: '房间不存在' };
    }

    const state = engine.getState();

    // 收集所有非法官玩家信息
    const players = state.players
      .filter((p) => !p.isJudge)
      .map((p) => ({
        seatNumber: p.seatNumber,
        nickname: p.nickname,
        role: state.phase === 'LOBBY' ? null : p.role,
        status: state.phase === 'LOBBY' ? null : p.status,
      }));

    // 销毁房间引擎
    engine.destroy();
    this.rooms.delete(roomCode);

    // 通过反向索引 O(k) 清理该房间的所有客户端
    const roomPlayerIds = this.roomClientsIndex.get(roomCode);
    if (roomPlayerIds) {
      for (const pid of roomPlayerIds) {
        const ctx = this.clients.get(pid);
        if (ctx) ctx.roomCode = null;
      }
      this.roomClientsIndex.delete(roomCode);
    }

    return { success: true, roomCode, players };
  }

  /**
   * 玩家准备/取消准备
   *
   * @param playerId - 玩家 ID
   * @param ready - 是否准备
   * @returns 操作结果
   */
  setReady(playerId: string, ready: boolean): { success: boolean; error?: string } {
    const context = this.clients.get(playerId);
    if (!context || !context.roomCode) {
      return { success: false, error: '你不在任何房间中' };
    }

    const engine = this.rooms.get(context.roomCode);
    if (!engine) {
      return { success: false, error: '房间不存在' };
    }

    const state = engine.getState() as RoomState;
    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return { success: false, error: '玩家不存在' };
    }

    if (state.phase !== 'LOBBY') {
      return { success: false, error: '游戏已开始' };
    }

    player.isReady = ready;

    // 记录玩家准备状态变更日志
    this.onLog({
      roomCode: state.roomCode,
      gameId: '',
      timestamp: Date.now(),
      actorSeat: player.seatNumber,
      actorNickname: player.nickname,
      actionType: 'PLAYER_READY' as ActionType,
      targetSeat: null,
      targetNickname: null,
      phase: 'LOBBY',
      round: 0,
      detail: { ready },
      overridden: false,
      overrideReason: null,
      nightActionOrderSnapshot: [...state.config.nightActionOrder],
    } as ActionLog);

    return { success: true };
  }

  // ==========================================================================
  // 房间查询
  // ==========================================================================

  /**
   * 获取房间引擎
   *
   * @param roomCode - 房间码
   * @returns GameEngine 实例，未找到则返回 undefined
   */
  getRoom(roomCode: string): GameEngine | undefined {
    return this.rooms.get(roomCode);
  }

  /**
   * 获取房间中的所有客户端
   *
   * @param roomCode - 房间码
   * @returns 客户端上下文数组
   */
  getRoomClients(roomCode: string): ClientContext[] {
    const playerIds = this.roomClientsIndex.get(roomCode);
    if (!playerIds) return [];
    const clients: ClientContext[] = [];
    for (const pid of playerIds) {
      const ctx = this.clients.get(pid);
      if (ctx) clients.push(ctx);
    }
    return clients;
  }

  /**
   * 获取活跃房间数量
   *
   * @returns 房间数量
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * 获取在线玩家数量
   *
   * @returns 在线玩家数量
   */
  getOnlineCount(): number {
    return this.clients.size;
  }

  /**
   * LOBBY 阶段掉线检查
   *
   * 遍历所有处于 LOBBY 阶段的房间，检查每个玩家是否已断连，
   * 如果断连则立即移除（不等待宽限期），并返回被移除的玩家信息供广播。
   * 快照恢复后的宽限期内不执行清理。
   *
   * @returns 被移除的玩家信息列表
   */
  checkLobbyDisconnectedPlayers(): Array<{ roomCode: string; playerId: string; seatNumber: number; nickname: string }> {
    const removed: Array<{ roomCode: string; playerId: string; seatNumber: number; nickname: string }> = [];

    // 快照恢复后的宽限期内，不清理 LOBBY 断连玩家，给客户端重连的机会
    const inSnapshotGracePeriod = this.snapshotRestoredAt !== null &&
      Date.now() - this.snapshotRestoredAt < LobbyManager.SNAPSHOT_RESTORE_GRACE_PERIOD;

    for (const [roomCode, engine] of this.rooms) {
      const state = engine.getState() as RoomState;
      // 仅处理 LOBBY 阶段的房间
      if (state.phase !== 'LOBBY') continue;

      // 收集已断连的玩家
      const disconnectedPlayers: Player[] = [];
      for (const player of state.players) {
        if (player.isJudge) continue;
        const context = this.clients.get(player.id);
        if (context && context.disconnected) {
          // 快照恢复宽限期内跳过，给客户端重连时间
          if (inSnapshotGracePeriod) continue;
          disconnectedPlayers.push(player);
        }
      }

      // 移除断连玩家
      for (const player of disconnectedPlayers) {
        // 清除宽限期定时器
        const context = this.clients.get(player.id);
        if (context?.gracePeriodTimer) {
          clearTimeout(context.gracePeriodTimer);
          context.gracePeriodTimer = null;
        }

        removed.push({
          roomCode,
          playerId: player.id,
          seatNumber: player.seatNumber,
          nickname: player.nickname,
        });

        // 执行离开逻辑
        this.leaveRoom(player.id);
      }
    }

    return removed;
  }

  // ==========================================================================
  // 配置校验
  // ==========================================================================

  /**
   * 校验 RuleConfig 的合法性
   *
   * 校验项：配置非空、玩家数量范围、角色分配总数、狼人数量合理性、夜间行动顺序。
   *
   * @param config - 村规配置
   * @returns 校验结果，包含是否合法和错误信息
   */
  private validateRuleConfig(config: RuleConfig): { valid: boolean; error?: string } {
    if (!config) {
      return { valid: false, error: '配置不能为空' };
    }

    if (config.playerCount < 6 || config.playerCount > 18) {
      return { valid: false, error: '玩家数量必须在6-18之间' };
    }

    // 校验角色分配总数
    let totalRoles = 0;
    for (const count of Object.values(config.roleDistribution)) {
      if (count && count < 0) {
        return { valid: false, error: '角色数量不能为负数' };
      }
      totalRoles += count || 0;
    }

    if (totalRoles !== config.playerCount) {
      return { valid: false, error: `角色分配总数(${totalRoles})与玩家数(${config.playerCount})不匹配` };
    }

    // 校验狼人数量合理性
    const evilCount = Object.entries(config.roleDistribution)
      .filter(([roleId]) => isEvilRole(roleId as RoleId))
      .reduce((sum, [, count]) => sum + (count || 0), 0);

    if (evilCount < 1) {
      return { valid: false, error: '至少需要1名狼人阵营角色' };
    }

    if (evilCount >= config.playerCount / 2) {
      return { valid: false, error: '狼人阵营人数不能达到或超过总人数的一半' };
    }

    // 校验夜间行动顺序
    if (!config.nightActionOrder || config.nightActionOrder.length === 0) {
      return { valid: false, error: '夜间行动顺序不能为空' };
    }

    return { valid: true };
  }

  // ==========================================================================
  // 回调占位（由外层 Server 注入实际逻辑）
  // ==========================================================================

  /**
   * 日志回调 — 由外层 Server 通过构造函数或 setter 注入
   * 默认实现为空操作
   */
  private onLogCallback: ((log: any) => void) | null = null;

  /**
   * 法官警告回调
   */
  private onJudgeWarningCallback: ((roomCode: string, type: any, msg: string, data: any) => void) | null = null;

  /**
   * 阶段变更回调
   */
  private onPhaseChangeCallback: ((roomCode: string, phase: any, subPhase: any, round: number) => void) | null = null;

  /**
   * 狼人聊天回调
   */
  private onWolfChatCallback: ((roomCode: string, message: WolfChatMessage) => void) | null = null;

  /**
   * 阶段提醒回调
   */
  private onPhaseReminderCallback: ((roomCode: string, roleId: RoleId, round: number, actorSeats: number[], timeout: number) => void) | null = null;

  /**
   * 狼人投票更新回调
   */
  private onWolfVoteUpdateCallback: ((roomCode: string, votes: Record<number, number>, consensus: boolean, lockedTarget: number | null) => void) | null = null;
  private onGameEventCallback: ((roomCode: string, eventType: string, data: Record<string, unknown>) => void) | null = null;
  private onNightSubPhaseAdvanceCallback: ((roomCode: string) => void) | null = null;
  private onNightCountdownCallback: ((roomCode: string, roleId: import('@langrensha/shared').RoleId, remaining: number) => void) | null = null;
  private onSpeechCountdownCallback: ((roomCode: string, seatNumber: number, remaining: number) => void) | null = null;
  private onDayAnnounceCallback: ((roomCode: string, deaths: Array<{seatNumber: number; nickname: string; cause: string}>, mutedSeats: number[]) => void) | null = null;
  private voteResultCallback: VoteResultCallback = () => {};
  private gameOverCallback: GameOverCallback = () => {};
  private identityRevealCallback: IdentityRevealCallback = () => {};

  /**
   * 设置日志回调
   *
   * @param cb - 日志回调函数
   */
  setLogCallback(cb: (log: any) => void): void {
    this.onLogCallback = cb;
  }

  /**
   * 设置法官警告回调
   *
   * @param cb - 法官警告回调函数
   */
  setJudgeWarningCallback(cb: (roomCode: string, type: any, msg: string, data: any) => void): void {
    this.onJudgeWarningCallback = cb;
  }

  /**
   * 设置阶段变更回调
   *
   * @param cb - 阶段变更回调函数
   */
  setPhaseChangeCallback(cb: (roomCode: string, phase: any, subPhase: any, round: number) => void): void {
    this.onPhaseChangeCallback = cb;
  }

  /**
   * 设置狼人聊天回调
   *
   * @param cb - 狼人聊天回调函数
   */
  setWolfChatCallback(cb: (roomCode: string, message: WolfChatMessage) => void): void {
    this.onWolfChatCallback = cb;
  }

  /**
   * 设置阶段提醒回调
   *
   * @param cb - 阶段提醒回调函数
   */
  setPhaseReminderCallback(cb: (roomCode: string, roleId: RoleId, round: number, actorSeats: number[], timeout: number) => void): void {
    this.onPhaseReminderCallback = cb;
  }

  /**
   * 设置狼人投票更新回调
   *
   * @param cb - 狼人投票更新回调函数
   */
  setWolfVoteUpdateCallback(cb: (roomCode: string, votes: Record<number, number>, consensus: boolean, lockedTarget: number | null) => void): void {
    this.onWolfVoteUpdateCallback = cb;
  }

  /**
   * 设置游戏事件回调
   *
   * @param cb - 游戏事件回调函数
   */
  setGameEventCallback(cb: (roomCode: string, eventType: string, data: Record<string, unknown>) => void): void {
    this.onGameEventCallback = cb;
  }

  /**
   * 设置夜间子阶段推进回调
   *
   * @param cb - 夜间子阶段推进回调函数
   */
  setNightSubPhaseAdvanceCallback(cb: (roomCode: string) => void): void {
    this.onNightSubPhaseAdvanceCallback = cb;
  }

  /**
   * 设置夜间倒计时广播回调
   *
   * @param cb - 夜间倒计时回调函数
   */
  setNightCountdownCallback(cb: (roomCode: string, roleId: import('@langrensha/shared').RoleId, remaining: number) => void): void {
    this.onNightCountdownCallback = cb;
  }

  /**
   * 设置发言倒计时广播回调
   *
   * @param cb - 发言倒计时回调函数
   */
  setSpeechCountdownCallback(cb: (roomCode: string, seatNumber: number, remaining: number) => void): void {
    this.onSpeechCountdownCallback = cb;
  }

  /**
   * 设置天亮公告回调
   *
   * @param cb - 天亮公告回调函数
   */
  setDayAnnounceCallback(cb: (roomCode: string, deaths: Array<{seatNumber: number; nickname: string; cause: string}>, mutedSeats: number[]) => void): void {
    this.onDayAnnounceCallback = cb;
  }

  /** 设置投票结果回调 */
  setVoteResultCallback(cb: VoteResultCallback): void { this.voteResultCallback = cb; }
  /** 设置游戏结束回调 */
  setGameOverCallback(cb: GameOverCallback): void { this.gameOverCallback = cb; }
  /** 设置身份揭示回调 */
  setIdentityRevealCallback(cb: IdentityRevealCallback): void { this.identityRevealCallback = cb; }

  // ---- 转发方法 ----

  /** 转发天亮公告 */
  private onDayAnnounce(roomCode: string, deaths: Array<{seatNumber: number; nickname: string; cause: string}>, mutedSeats: number[]): void {
    this.onDayAnnounceCallback?.(roomCode, deaths, mutedSeats);
  }

  private onLog(log: any): void {
    this.onLogCallback?.(log);
  }

  private onJudgeWarning(roomCode: string, type: any, msg: string, data: any): void {
    this.onJudgeWarningCallback?.(roomCode, type, msg, data);
  }

  private onPhaseChange(roomCode: string, phase: any, subPhase: any, round: number): void {
    this.onPhaseChangeCallback?.(roomCode, phase, subPhase, round);
  }

  private onWolfChat(roomCode: string, message: WolfChatMessage): void {
    this.onWolfChatCallback?.(roomCode, message);
    // 持久化狼人聊天消息到独立集合
    if (isMongoConnected()) {
      const engine = this.rooms.get(roomCode);
      WolfChatLogModel.create({
        roomCode,
        gameId: engine?.gameId ?? '',
        round: message.round,
        senderSeat: message.senderSeat,
        senderNickname: message.senderNickname,
        content: message.content,
        timestamp: message.timestamp,
        visibility: message.visibility,
      }).catch((err) => {
        console.error('[MongoDB] 狼人聊天日志写入失败:', err.message);
      });
    }
  }

  private onPhaseReminder(roomCode: string, roleId: RoleId, round: number, actorSeats: number[], timeout: number): void {
    this.onPhaseReminderCallback?.(roomCode, roleId, round, actorSeats, timeout);
  }

  private onWolfVoteUpdate(roomCode: string, votes: Record<number, number>, consensus: boolean, lockedTarget: number | null): void {
    this.onWolfVoteUpdateCallback?.(roomCode, votes, consensus, lockedTarget);
  }

  private onGameEvent(roomCode: string, eventType: string, data: Record<string, unknown>): void {
    this.onGameEventCallback?.(roomCode, eventType, data);
  }

  private onNightSubPhaseAdvance(roomCode: string): void {
    this.onNightSubPhaseAdvanceCallback?.(roomCode);
  }

  private onNightCountdown(roomCode: string, roleId: import('@langrensha/shared').RoleId, remaining: number): void {
    this.onNightCountdownCallback?.(roomCode, roleId, remaining);
  }

  private onSpeechCountdown(roomCode: string, seatNumber: number, remaining: number): void {
    this.onSpeechCountdownCallback?.(roomCode, seatNumber, remaining);
  }

  // ==========================================================================
  // 清理
  // ==========================================================================

  /**
   * 销毁所有房间，释放资源
   *
   * 清理所有房间引擎、客户端映射和索引。
   */
  destroyAll(): void {
    for (const engine of this.rooms.values()) {
      engine.destroy();
    }
    this.rooms.clear();
    this.clients.clear();
    this.wsToPlayerId.clear();
    this.roomClientsIndex.clear();
  }

  // ==========================================================================
  // 状态快照（用于 tsx watch 热重载后恢复游戏状态）
  // ==========================================================================

  /**
   * 导出所有房间的状态快照
   *
   * 包含房间状态和玩家连接信息（不含 WebSocket 引用和定时器），
   * 用于 tsx watch 热重载后恢复游戏状态。
   *
   * @returns 快照数据，包含房间列表、客户端列表、房间索引和计数器
   */
  exportSnapshot(): {
    rooms: Array<{ roomCode: string; state: RoomState; gameId: string }>;
    clients: Array<{
      playerId: string;
      nickname: string;
      roomCode: string | null;
      isJudge: boolean;
      connectedAt: number;
      disconnected: boolean;
      disconnectedAt: number | null;
      origin: string;
    }>;
    roomClientsIndex: Record<string, string[]>;
    playerIdCounter: number;
  } {
    const rooms: Array<{ roomCode: string; state: RoomState; gameId: string }> = [];
    for (const [roomCode, engine] of this.rooms) {
      rooms.push({
        roomCode,
        state: { ...engine.getState() },
        gameId: engine.gameId,
      });
    }

    const clients: Array<{
      playerId: string;
      nickname: string;
      roomCode: string | null;
      isJudge: boolean;
      connectedAt: number;
      disconnected: boolean;
      disconnectedAt: number | null;
      origin: string;
    }> = [];
    for (const [playerId, ctx] of this.clients) {
      clients.push({
        playerId: ctx.playerId,
        nickname: ctx.nickname,
        roomCode: ctx.roomCode,
        isJudge: ctx.isJudge,
        connectedAt: ctx.connectedAt,
        disconnected: true, // 恢复后所有连接都标记为断连，等待客户端重连
        disconnectedAt: Date.now(),
        origin: ctx.origin,
      });
    }

    const roomClientsIndexSnap: Record<string, string[]> = {};
    for (const [roomCode, playerIds] of this.roomClientsIndex) {
      roomClientsIndexSnap[roomCode] = Array.from(playerIds);
    }

    return {
      rooms,
      clients,
      roomClientsIndex: roomClientsIndexSnap,
      playerIdCounter: this.playerIdCounter,
    };
  }

  /**
   * 从快照恢复所有房间和客户端状态
   *
   * 恢复后所有客户端标记为 disconnected，等待客户端重连。
   * 记录快照恢复时间，用于 LOBBY 断连检查的宽限期。
   *
   * @param snapshot - 快照数据
   */
  restoreFromSnapshot(snapshot: ReturnType<typeof this.exportSnapshot>): void {
    // 恢复房间
    for (const roomData of snapshot.rooms) {
      const engine = new GameEngine(
        roomData.state,
        (log) => { this.onLog(log); },
        (type, msg, data) => { this.onJudgeWarning(roomData.roomCode, type, msg, data); },
        (phase, subPhase, round) => { this.onPhaseChange(roomData.roomCode, phase, subPhase, round); },
        (rc, message) => { this.onWolfChat(rc, message); },
        (rc, roleId, round, actorSeats, timeout) => { this.onPhaseReminder(rc, roleId, round, actorSeats, timeout); },
        (rc, votes, consensus, lockedTarget) => { this.onWolfVoteUpdate(rc, votes, consensus, lockedTarget); },
        (rc, eventType, data) => { this.onGameEvent(rc, eventType, data); },
        (rc) => { this.onNightSubPhaseAdvance(rc); },
        (rc, roleId, remaining) => { this.onNightCountdown(rc, roleId, remaining); },
        (rc, seatNumber, remaining) => { this.onSpeechCountdown(rc, seatNumber, remaining); },
        (rc, deaths, mutedSeats) => { this.onDayAnnounce(rc, deaths, mutedSeats); },
        (rc, votes, eliminated, isPK, pkCandidates) => { this.voteResultCallback(rc, votes, eliminated, isPK, pkCandidates); },
        (rc, winner, round, players) => { this.gameOverCallback(rc, winner, round, players); },
        (rc, seatNumber, nickname, revealType, revealInfo) => { this.identityRevealCallback(rc, seatNumber, nickname, revealType, revealInfo); },
      );
      engine.gameId = roomData.gameId;
      this.rooms.set(roomData.roomCode, engine);
    }

    // 恢复客户端（全部标记为 disconnected，ws 为 null）
    for (const clientData of snapshot.clients) {
      this.clients.set(clientData.playerId, {
        ws: null,
        playerId: clientData.playerId,
        nickname: clientData.nickname,
        roomCode: clientData.roomCode,
        isJudge: clientData.isJudge,
        connectedAt: clientData.connectedAt,
        disconnected: true,
        disconnectedAt: clientData.disconnectedAt,
        gracePeriodTimer: null,
        origin: clientData.origin,
      });
    }

    // 恢复房间→客户端索引
    for (const [roomCode, playerIds] of Object.entries(snapshot.roomClientsIndex)) {
      this.roomClientsIndex.set(roomCode, new Set(playerIds));
    }

    // 恢复玩家 ID 计数器
    this.playerIdCounter = snapshot.playerIdCounter;

    // 记录快照恢复时间，用于 LOBBY 断连检查的宽限期
    this.snapshotRestoredAt = Date.now();

    console.log(`[Lobby] 从快照恢复: ${this.rooms.size} 个房间, ${this.clients.size} 个客户端（全部等待重连，${LobbyManager.SNAPSHOT_RESTORE_GRACE_PERIOD / 1000}秒宽限期）`);
  }
}
