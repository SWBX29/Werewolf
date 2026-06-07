/**
 * ============================================================================
 * 狼人杀联机游戏 — 大厅与房间管理器 (Lobby Manager)
 * ============================================================================
 *
 * 架构说明：
 *   LobbyManager 负责房间的生命周期管理，包括：
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
  PlayerStatus,
  RoleId,
  WolfChatMessage,
} from '@langrensha/shared';
import {
  ROOM_CODE_CHARSET,
  ROOM_CODE_LENGTH,
  createDefaultRuleConfig,
} from '@langrensha/shared';
import { GameEngine, VoteResultCallback, GameOverCallback, IdentityRevealCallback } from './GameEngine.js';

// ============================================================================
// 房间码生成器
// ============================================================================

/**
 * 密码学安全随机生成6位房间码
 *
 * 使用 Node.js 内置 crypto.randomBytes 作为熵源，
 * 确保房间码不可预测、不可碰撞。
 * 字符集排除易混淆字符（0/O, 1/I/L）。
 */
export function generateRoomCode(): string {
  const charset = ROOM_CODE_CHARSET;
  const charsetLen = charset.length;
  let code = '';

  // 使用密码学安全随机数
  const randomBytes = crypto.randomBytes(ROOM_CODE_LENGTH * 2); // 多取一些字节确保均匀分布

  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    // 使用拒绝采样法确保均匀分布
    const byte = randomBytes[i];
    const index = byte % charsetLen;
    code += charset[index];
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

  /** 玩家 ID 计数器 */
  private playerIdCounter = 0;

  /**
   * 生成唯一玩家 ID
   * 格式：p_自增计数器_随机后缀
   */
  private generatePlayerId(): string {
    this.playerIdCounter++;
    const suffix = crypto.randomBytes(3).toString('hex');
    return `p_${this.playerIdCounter}_${suffix}`;
  }

  /**
   * 生成唯一房间码
   * 确保与现有房间码不冲突（极低概率，但仍需检查）
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
   * 在 WebSocket 握手成功后调用
   */
  registerConnection(ws: any): ClientContext {
    const playerId = this.generatePlayerId();
    const context: ClientContext = {
      ws,
      playerId,
      nickname: '',
      roomCode: null,
      isJudge: false,
      connectedAt: Date.now(),
    };

    this.clients.set(playerId, context);
    this.wsToPlayerId.set(ws, playerId);

    return context;
  }

  /**
   * 注销 WebSocket 连接
   * 在连接断开时调用，自动清理房间中的玩家
   */
  unregisterConnection(ws: any): { roomCode: string | null; playerId: string } {
    const playerId = this.wsToPlayerId.get(ws);
    if (!playerId) return { roomCode: null, playerId: '' };

    const context = this.clients.get(playerId);
    if (!context) return { roomCode: null, playerId };

    // 如果玩家在房间中，执行离开逻辑
    if (context.roomCode) {
      this.leaveRoom(playerId);
    }

    // 清理映射
    this.clients.delete(playerId);
    this.wsToPlayerId.delete(ws);

    return { roomCode: context.roomCode, playerId };
  }

  /**
   * 根据玩家 ID 获取客户端上下文
   */
  getClient(playerId: string): ClientContext | undefined {
    return this.clients.get(playerId);
  }

  /**
   * 根据 WebSocket 获取客户端上下文
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
   * 1. 生成唯一房间码
   * 2. 初始化 RoomState
   * 3. 创建 GameEngine 实例
   * 4. 将房主/法官添加到房间
   *
   * @param hostNickname - 房主昵称
   * @param gameMode - 游戏模式（HUMAN/SYSTEM）
   * @param config - 村规配置
   * @param hostWs - 房主的 WebSocket 连接
   * @param publicUrl - 公网地址（用于生成邀请链接）
   */
  createRoom(
    hostNickname: string,
    gameMode: GameMode,
    config: RuleConfig,
    hostWs: any,
    publicUrl: string,
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
    const inviteLink = publicUrl
      ? `${publicUrl.replace(/^ws/, 'http')}/join?code=${roomCode}`
      : `http://localhost:3001/join?code=${roomCode}`;

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
      votes: {},
      judgeElectionVotes: {},
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

    // 复用已有的客户端上下文（WebSocket 连接时已注册）
    const existingPlayerId = this.wsToPlayerId.get(hostWs);
    let contextPlayerId: string;
    if (existingPlayerId) {
      const existingContext = this.clients.get(existingPlayerId)!;
      hostPlayer.id = existingPlayerId;
      existingContext.nickname = hostNickname.trim();
      existingContext.roomCode = roomCode;
      existingContext.isJudge = isJudge;
      contextPlayerId = existingPlayerId;
    } else {
      const context = this.registerConnection(hostWs);
      hostPlayer.id = context.playerId;
      context.nickname = hostNickname.trim();
      context.roomCode = roomCode;
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
   * 1. 房间是否存在
   * 2. 房间是否已满
   * 3. 游戏是否已开始
   * 4. 昵称是否重复
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

    // 校验昵称是否重复
    const nicknameExists = state.players.some(
      (p) => p.nickname === nickname.trim(),
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
      existingContext.isJudge = false;
      contextPlayerId = existingPlayerId;
    } else {
      const context = this.registerConnection(playerWs);
      context.nickname = nickname.trim();
      context.roomCode = roomCode.toUpperCase();
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

    return {
      success: true,
      playerId: contextPlayerId,
      seatNumber,
    };
  }

  /**
   * 离开房间
   */
  leaveRoom(playerId: string): { success: boolean; error?: string; roomCode?: string } {
    const context = this.clients.get(playerId);
    if (!context || !context.roomCode) {
      return { success: false, error: '你不在任何房间中' };
    }

    const engine = this.rooms.get(context.roomCode);
    if (!engine) {
      // 房间已不存在，仅清理上下文
      context.roomCode = null;
      return { success: true, roomCode: undefined };
    }

    const state = engine.getState() as RoomState;
    const playerIndex = state.players.findIndex((p) => p.id === playerId);

    if (playerIndex === -1) {
      context.roomCode = null;
      return { success: true, roomCode: undefined };
    }

    const player = state.players[playerIndex];

    // 如果游戏正在进行中，玩家断线但不移除（标记为断线状态）
    // 如果在大厅阶段，直接移除
    if (state.phase === 'LOBBY') {
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
    }

    const roomCode = context.roomCode;

    // 游戏进行中时保留 roomCode 以支持断线重连，仅大厅阶段清除
    if (state.phase === 'LOBBY') {
      context.roomCode = null;
    }

    return { success: true, roomCode };
  }

  /**
   * 玩家准备/取消准备
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
    return { success: true };
  }

  // ==========================================================================
  // 房间查询
  // ==========================================================================

  /**
   * 获取房间引擎
   */
  getRoom(roomCode: string): GameEngine | undefined {
    return this.rooms.get(roomCode);
  }

  /**
   * 获取房间中的所有客户端
   */
  getRoomClients(roomCode: string): ClientContext[] {
    const clients: ClientContext[] = [];
    for (const context of this.clients.values()) {
      if (context.roomCode === roomCode) {
        clients.push(context);
      }
    }
    return clients;
  }

  /**
   * 获取活跃房间数量
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * 获取在线玩家数量
   */
  getOnlineCount(): number {
    return this.clients.size;
  }

  // ==========================================================================
  // 配置校验
  // ==========================================================================

  /**
   * 校验 RuleConfig 的合法性
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
      .filter(([roleId]) => {
        const meta = { villager: 'good', seer: 'good', witch: 'good', hunter: 'good', guard: 'good', idiot: 'good', knight: 'good', werewolf: 'evil', white_wolf_king: 'evil', wolf_king: 'evil', nightmare_shadow: 'evil', hidden_wolf: 'evil' } as Record<string, string>;
        return meta[roleId] === 'evil';
      })
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
  private onDayAnnounceCallback: ((roomCode: string, deaths: Array<{seatNumber: number; nickname: string; cause: string}>, mutedSeats: number[]) => void) | null = null;
  private voteResultCallback: VoteResultCallback = () => {};
  private gameOverCallback: GameOverCallback = () => {};
  private identityRevealCallback: IdentityRevealCallback = () => {};

  /**
   * 设置日志回调
   */
  setLogCallback(cb: (log: any) => void): void {
    this.onLogCallback = cb;
  }

  /**
   * 设置法官警告回调
   */
  setJudgeWarningCallback(cb: (roomCode: string, type: any, msg: string, data: any) => void): void {
    this.onJudgeWarningCallback = cb;
  }

  /**
   * 设置阶段变更回调
   */
  setPhaseChangeCallback(cb: (roomCode: string, phase: any, subPhase: any, round: number) => void): void {
    this.onPhaseChangeCallback = cb;
  }

  /**
   * 设置狼人聊天回调
   */
  setWolfChatCallback(cb: (roomCode: string, message: WolfChatMessage) => void): void {
    this.onWolfChatCallback = cb;
  }

  /**
   * 设置阶段提醒回调
   */
  setPhaseReminderCallback(cb: (roomCode: string, roleId: RoleId, round: number, actorSeats: number[], timeout: number) => void): void {
    this.onPhaseReminderCallback = cb;
  }

  /**
   * 设置狼人投票更新回调
   */
  setWolfVoteUpdateCallback(cb: (roomCode: string, votes: Record<number, number>, consensus: boolean, lockedTarget: number | null) => void): void {
    this.onWolfVoteUpdateCallback = cb;
  }

  /**
   * 设置游戏事件回调
   */
  setGameEventCallback(cb: (roomCode: string, eventType: string, data: Record<string, unknown>) => void): void {
    this.onGameEventCallback = cb;
  }

  /**
   * 设置夜间子阶段推进回调
   */
  setNightSubPhaseAdvanceCallback(cb: (roomCode: string) => void): void {
    this.onNightSubPhaseAdvanceCallback = cb;
  }

  /**
   * 设置天亮公告回调
   */
  setDayAnnounceCallback(cb: (roomCode: string, deaths: Array<{seatNumber: number; nickname: string; cause: string}>, mutedSeats: number[]) => void): void {
    this.onDayAnnounceCallback = cb;
  }

  setVoteResultCallback(cb: VoteResultCallback): void { this.voteResultCallback = cb; }
  setGameOverCallback(cb: GameOverCallback): void { this.gameOverCallback = cb; }
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

  // ==========================================================================
  // 清理
  // ==========================================================================

  /**
   * 销毁所有房间，释放资源
   */
  destroyAll(): void {
    for (const engine of this.rooms.values()) {
      engine.destroy();
    }
    this.rooms.clear();
    this.clients.clear();
    this.wsToPlayerId.clear();
  }
}
