/**
 * ============================================================================
 * 狼人杀联机游戏 — 核心游戏引擎 (Game Engine & State Machine)
 * ============================================================================
 *
 * 架构说明：
 *   GameEngine 是整个游戏的核心状态机，负责：
 *   1. 驱动游戏阶段流转（LOBBY → NIGHT → DAY → ... → GAME_OVER）
 *   2. 动态夜间行动顺序引擎（从 RuleConfig.nightActionOrder 读取顺序）
 *   3. 夜间结算引擎（同守同救/噩梦延期/毒封技能等冲突处理）
 *   4. 白天中断连锁结算（骑士决斗/白狼王自爆/亡语触发）
 *   5. 法官覆盖接口（改判/强制阶段/修改夜间顺序）
 *
 * 核心设计原则：
 *   - 零硬编码：所有规则从 RuleConfig 动态读取
 *   - 零信任：所有客户端操作在服务端重新校验
 *   - 可中断：白天阶段支持突发中断（骑士决斗/白狼王自爆）
 *   - 可覆盖：法官拥有最高裁决权，可随时改判
 *
 * 状态流转图：
 *   LOBBY → NIGHT → NIGHT_SETTLEMENT → DAY_ANNOUNCE → DAY_SPEECH → DAY_VOTE → DAY_SETTLEMENT → NIGHT → ...
 *                                                                                                  → GAME_OVER
 *   DAY_SPEECH/DAY_VOTE 可被中断 → DAY_INTERRUPT → (连锁结算) → NIGHT 或继续白天
 * ============================================================================
 */

import type {
  RoomState,
  Player,
  RuleConfig,
  GamePhase,
  NightSubPhase,
  RoleId,
  Faction,
  PlayerStatus,
  DeathCause,
  NightActionData,
  NightDeathRecord,
  DayDeathRecord,
  NightActionExtra,
  NightActionRequestDTO,
  ActionLog,
  ActionType,
  JudgeWarningType,
  GameMode,
  WolfChatMessage,
} from '@langrensha/shared';
import {
  ROLE_META,
  isEvilRole,
  isHiddenWolf,
  isSharedWolfRole,
  isImitationFailRole,
  hasNightAction,
  NIGHT_ACTION_ORDER_PRESETS,
} from '@langrensha/shared';
import {
  checkWinCondition as checkWinConditionUtil,
  resolveDeathChain as resolveDeathChainUtil,
  calculateSpeechOrder as calculateSpeechOrderUtil,
  resolveVoteResult as resolveVoteResultUtil,
  canMechanicalWolfActAsWolf as canMechanicalWolfActAsWolfUtil,
  isMechanicalWolfImitationFailed as isMechanicalWolfImitationFailedUtil,
  getMechanicalWolfSeerResult as getMechanicalWolfSeerResultUtil,
} from './SettlementEngine';
import { TimerManager, TIMER_NAMES, type TimerName } from './TimerManager';

// ============================================================================
// 日志回调类型
// ============================================================================

/**
 * 日志写入回调
 * GameEngine 不直接依赖 MongoDB，通过回调将日志外泄
 * 由外层 Server 负责将日志写入 GameLogModel
 */
export type LogCallback = (log: ActionLog) => void;

/**
 * 法官警告推送回调
 * 当检测到逻辑冲突时，通过此回调向法官客户端推送警告
 */
export type JudgeWarningCallback = (warningType: JudgeWarningType, message: string, data: Record<string, unknown>) => void;

/**
 * 阶段变更回调
 * 当状态机发生阶段转换时触发
 */
export type PhaseChangeCallback = (newPhase: GamePhase, nightSubPhase: NightSubPhase | null, round: number) => void;

/**
 * 狼人聊天消息回调
 * 当狼人在专属聊天区发送消息时触发
 */
export type WolfChatCallback = (roomCode: string, message: WolfChatMessage) => void;

/**
 * 阶段提醒回调
 * 当夜间子阶段切换时，通知当前应行动的角色
 */
export type PhaseReminderCallback = (roomCode: string, roleId: RoleId, round: number, actorSeats: number[], timeout: number) => void;

/**
 * 狼人投票更新回调
 * 当狼人子阶段投票状态变化时触发
 */
export type WolfVoteUpdateCallback = (roomCode: string, votes: Record<number, number>, consensus: boolean, lockedTarget: number | null) => void;

/**
 * 游戏事件回调
 * 当发生需要广播给客户端的游戏事件时触发（如白痴翻牌、猎人开枪、狼王开枪等）
 */
export type GameEventCallback = (roomCode: string, eventType: string, data: Record<string, unknown>) => void;

/**
 * 夜间子阶段推进回调
 * 当夜间子阶段切换时触发，用于广播 ROOM_STATE 让前端感知阶段变化
 */
export type NightSubPhaseAdvanceCallback = (roomCode: string) => void;

/**
 * 夜间倒计时广播回调
 * 每秒触发一次，向所有客户端推送当前夜间子阶段剩余时间
 */
export type NightCountdownCallback = (roomCode: string, roleId: RoleId, remaining: number) => void;

/**
 * 发言倒计时广播回调
 * 每秒触发一次，向所有客户端推送当前发言者剩余时间
 */
export type SpeechCountdownCallback = (roomCode: string, seatNumber: number, remaining: number) => void;

/**
 * 投票结果回调
 * 白天投票结算后触发，用于广播投票结果给客户端
 */
export type VoteResultCallback = (
  roomCode: string,
  votes: Record<number, number | null>,
  eliminated: number | null,
  isPK: boolean,
  pkCandidates: number[],
) => void;

/**
 * 游戏结束回调
 * 游戏结束时触发，用于广播游戏结束消息给客户端
 */
export type GameOverCallback = (
  roomCode: string,
  winner: 'good' | 'evil',
  round: number,
  players: Player[],
) => void;

/**
 * 身份揭示回调
 * 被票出时身份揭示信息广播
 */
export type IdentityRevealCallback = (
  roomCode: string,
  seatNumber: number,
  nickname: string,
  revealType: 'FACTION' | 'ROLE',
  revealInfo: string,
) => void;

/**
 * 天亮公告回调
 * 夜间结算完成后触发，用于广播死亡信息等公告数据给客户端
 */
export type DayAnnounceCallback = (
  roomCode: string,
  deaths: Array<{ seatNumber: number; nickname: string; cause: DeathCause }>,
  mutedSeats: number[],
) => void;

// ============================================================================
// GameEngine 类定义
// ============================================================================

export class GameEngine {
  /** 当前房间状态 */
  private state: RoomState;

  /** 当前游戏局ID（格式: ${roomCode}_${gameStartTimestamp}），每局游戏开始时生成 */
  public gameId: string = '';

  /** 日志回调 */
  private onLog: LogCallback;

  /** 法官警告回调 */
  private onJudgeWarning: JudgeWarningCallback;

  /** 阶段变更回调 */
  private onPhaseChange: PhaseChangeCallback;

  /** 狼人聊天消息回调 */
  private onWolfChat: WolfChatCallback;

  /** 阶段提醒回调 */
  private onPhaseReminder: PhaseReminderCallback;

  /** 狼人投票更新回调 */
  private onWolfVoteUpdate: WolfVoteUpdateCallback;

  /** 游戏事件回调 */
  private onGameEvent: GameEventCallback;

  /** 夜间子阶段推进回调 */
  private onNightSubPhaseAdvance: NightSubPhaseAdvanceCallback;

  /** 夜间倒计时广播回调 */
  private onNightCountdown: NightCountdownCallback;

  /** 发言倒计时广播回调 */
  private onSpeechCountdown: SpeechCountdownCallback;

  /** 天亮公告回调 */
  private onDayAnnounce: DayAnnounceCallback;

  /** 投票结果回调 */
  private onVoteResult: VoteResultCallback;

  /** 游戏结束回调 */
  private onGameOver: GameOverCallback;

  /** 身份揭示回调 */
  private onIdentityReveal: IdentityRevealCallback;

  /** 定时器引用（用于超时推进） */
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private timerDeadlines: Map<string, number> = new Map();
  private timerCallbacks: Map<string, () => void> = new Map();
  private pausedPhaseRemainingTime: number | null = null;
  private pausedPhaseTimerName: string | null = null;
  private pausedPhaseTimerCallback: (() => void) | null = null;
  private nightActionStartTime: number | null = null;

  constructor(
    initialState: RoomState,
    onLog: LogCallback,
    onJudgeWarning: JudgeWarningCallback,
    onPhaseChange: PhaseChangeCallback,
    onWolfChat?: WolfChatCallback,
    onPhaseReminder?: PhaseReminderCallback,
    onWolfVoteUpdate?: WolfVoteUpdateCallback,
    onGameEvent?: GameEventCallback,
    onNightSubPhaseAdvance?: NightSubPhaseAdvanceCallback,
    onNightCountdown?: NightCountdownCallback,
    onSpeechCountdown?: SpeechCountdownCallback,
    onDayAnnounce?: DayAnnounceCallback,
    onVoteResult?: VoteResultCallback,
    onGameOver?: GameOverCallback,
    onIdentityReveal?: IdentityRevealCallback,
  ) {
    this.state = initialState;
    this.onLog = onLog;
    this.onJudgeWarning = onJudgeWarning;
    this.onPhaseChange = onPhaseChange;
    this.onWolfChat = onWolfChat ?? (() => {});
    this.onPhaseReminder = onPhaseReminder ?? (() => {});
    this.onWolfVoteUpdate = onWolfVoteUpdate ?? (() => {});
    this.onGameEvent = onGameEvent ?? (() => {});
    this.onNightSubPhaseAdvance = onNightSubPhaseAdvance ?? (() => {});
    this.onNightCountdown = onNightCountdown ?? (() => {});
    this.onSpeechCountdown = onSpeechCountdown ?? (() => {});
    this.onDayAnnounce = onDayAnnounce ?? (() => {});
    this.onVoteResult = onVoteResult ?? (() => {});
    this.onGameOver = onGameOver ?? (() => {});
    this.onIdentityReveal = onIdentityReveal ?? (() => {});
  }

  // ==========================================================================
  // 公共状态访问
  // ==========================================================================

  /** 获取当前房间状态（只读引用） */
  getState(): Readonly<RoomState> {
    return this.state;
  }

  /** 获取当前阶段 */
  getPhase(): GamePhase {
    return this.state.phase;
  }

  /** 获取当前轮次 */
  getRound(): number {
    return this.state.round;
  }

  /** 获取指定座位的玩家 */
  getPlayerBySeat(seatNumber: number): Player | undefined {
    return this.state.players.find((p) => p.seatNumber === seatNumber);
  }

  /** 获取指定ID的玩家 */
  getPlayerById(id: string): Player | undefined {
    return this.state.players.find((p) => p.id === id);
  }

  // ==========================================================================
  // 第一部分：游戏启动与角色分配
  // ==========================================================================

  /**
   * 启动游戏
   * - 校验玩家数量与角色分配是否匹配
   * - 随机分配角色
   * - 初始化发言顺序
   * - 进入第一个夜间阶段
   */
  startGame(): { success: boolean; error?: string } {
    if (this.state.phase !== 'LOBBY') {
      return { success: false, error: '游戏已经开始' };
    }

    const nonJudgePlayers = this.state.players.filter((p) => !p.isJudge);
    if (nonJudgePlayers.length < 6) {
      return { success: false, error: '至少需要6名玩家才能开始游戏' };
    }

    // 校验角色分配总数
    const config = this.state.config;
    let totalRoles = 0;
    for (const count of Object.values(config.roleDistribution)) {
      totalRoles += count || 0;
    }
    if (totalRoles !== nonJudgePlayers.length) {
      return { success: false, error: `角色分配总数(${totalRoles})与玩家数(${nonJudgePlayers.length})不匹配` };
    }

    // 生成该局游戏的唯一标识（用于日志分离）
    this.gameId = `${this.state.roomCode}_${Date.now()}`;

    // 随机分配角色（Fisher-Yates 洗牌算法）
    const roleList: RoleId[] = [];
    for (const [roleId, count] of Object.entries(config.roleDistribution)) {
      for (let i = 0; i < (count || 0); i++) {
        roleList.push(roleId as RoleId);
      }
    }
    this.shuffleArray(roleList);

    nonJudgePlayers.forEach((player, index) => {
      player.role = roleList[index];
      player.status = 'alive';
      player.isReady = true;
    });

    // 初始化发言顺序（按座位号排列）
    this.state.speechOrder = nonJudgePlayers.map((p) => p.seatNumber);
    this.state.currentSpeakerIndex = 0;

    // 记录游戏开始日志
    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'GAME_START',
      targetSeat: null,
      targetNickname: null,
      detail: {
        playerCount: nonJudgePlayers.length,
        roleDistribution: config.roleDistribution,
        nightActionOrder: config.nightActionOrder,
      },
    });

    // 进入角色展示环节
    this.state.round = 1;
    this.state.startedAt = Date.now();
    this.state.phase = 'ROLE_REVEAL';
    this.onPhaseChange('ROLE_REVEAL', null, this.state.round);

    // 5秒后自动进入夜晚
    this.setTimer('role_reveal', 5, () => {
      this.enterNightPhase();
    });

    return { success: true };
  }

  // ==========================================================================
  // 第二部分：动态夜间行动顺序引擎
  // ==========================================================================

  /**
   * 进入夜间阶段
   *
   * 核心流程：
   * 1. 设置阶段为 NIGHT
   * 2. 从 config.nightActionOrder 读取顺序数组
   * 3. 处理噩梦之影延期逻辑（如果上一晚有延期的恐惧效果）
   * 4. 按顺序进入第一个有夜间行动的角色子阶段
   *
   * 关键设计：
   *   - 不存在的角色自动跳过
   *   - 噩梦之影排在末尾且 nightmareBlockMode === SAME_NIGHT_SUBSEQUENT 时自动降级
   *   - 噩梦之影的恐惧效果可能从上一晚延期到本晚
   */
  private enterNightPhase(): void {
    this.state.phase = 'NIGHT';
    this.state.nightDeaths = [];
    this.state.dayDeaths = [];
    this.state.werewolfTarget = null;
    this.state.witchSaveTarget = null;
    this.state.witchPoisonTarget = null;
    this.state.guardProtectTarget = null;
    this.state.wolfVotes = {};
    this.state.wolfVoteConsensus = false;

    // 规则七：恐惧始终当夜生效，不再有延期机制

    // 重置当夜恐惧目标
    this.state.nightmareTarget = null;

    // 清空夜间行动记录
    this.state.nightActions = {};

    // 重置玩家夜间状态
    for (const player of this.state.players) {
      player.isNightmared = false;
    }

    // 进入第一个有夜间行动的角色子阶段
    this.advanceNightSubPhase(0);

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'NIGHT_PHASE_START',
      targetSeat: null,
      targetNickname: null,
      detail: {
        round: this.state.round,
        nightActionOrder: this.state.config.nightActionOrder,
      },
    });

    this.onPhaseChange('NIGHT', this.state.nightSubPhase, this.state.round);
  }

  /**
   * 推进夜间子阶段
   *
   * 从指定索引开始，找到下一个存在于本局且有夜间行动的角色，
   * 设置为当前子阶段。
   *
   * 关键机制：
   *   - 噩梦之影拥有两个行动入口：先以噩梦之影身份恐惧，再以狼人身份参与投票
   *   - 狼人子阶段是所有"共同睁眼的狼人"一起行动的集体阶段
   *   - 隐狼不参与夜间行动
   *
   * @param startIndex - 从 nightActionOrder 的哪个索引开始搜索
   * @returns 是否找到了下一个子阶段（false 表示夜间行动全部完成）
   */
  private advanceNightSubPhase(startIndex: number): boolean {
    const order = this.state.config.nightActionOrder;
    const alivePlayers = this.state.players.filter((p) => !p.isJudge && p.status === 'alive');
    const roleDistribution = this.state.config.roleDistribution;

    for (let i = startIndex; i < order.length; i++) {
      const roleId = order[i];

      // 隐狼不参与夜间行动，跳过
      if (roleId === 'hidden_wolf') continue;

      // Bug 修复：先检查角色是否在本局游戏中存在（roleDistribution）
      // 如果角色不存在于本局配置，直接跳过，不应进入模拟倒计时逻辑
      const roleCountInGame = roleDistribution[roleId] ?? 0;
      if (roleCountInGame === 0) continue;

      // 检查本局是否有该角色且存活
      // werewolf 子阶段代表所有共同睁眼狼人的集体行动阶段，
      // 只要有任意共享狼人角色存活就应进入（不能仅检查 role === 'werewolf'）
      let hasRole: boolean;
      if (roleId === 'werewolf') {
        const sharedRoles = this.state.config.sharedWolfRoles;
        hasRole = alivePlayers.some((p) => isSharedWolfRole(p.role, sharedRoles));
      } else {
        hasRole = alivePlayers.some((p) => p.role === roleId);
      }
      if (!hasRole) {
        // Bug 8 修复：角色无存活玩家时，使用模拟倒计时而非直接跳过
        // 广播标准倒计时 + 随机延时后自动推进，防止暴露该角色已全灭的信息
        const simulatedDelay = Math.floor(Math.random() * 11) + 5; // 5-15秒
        this.state.nightSubPhase = {
          currentRole: roleId,
          currentRoleIndex: i,
          isBlockedByNightmare: false,
        };

        // 设置标准倒计时定时器和倒计时广播
        if (this.state.config.nightActionTimeout > 0) {
          this.setNightActionTimer(roleId, this.state.config.nightActionTimeout);
        }

        // 随机延时后自动推进
        this.setTimer('dead_role_auto_advance', simulatedDelay, () => {
          if (this.state.phase !== 'NIGHT') return;
          if (this.state.nightSubPhase?.currentRole !== roleId) return;

          this.clearTimer(`night_${roleId}`);
          this.clearNightCountdownTimer(roleId);

          const nextIndex = i + 1;
          this.advanceNightSubPhase(nextIndex);
        });

        // 发送阶段提醒（让所有玩家看到正常的阶段切换）
        this.onPhaseReminder(
          this.state.roomCode,
          roleId,
          this.state.round,
          [], // 无行动玩家
          this.state.config.nightActionTimeout,
        );

        this.onNightSubPhaseAdvance(this.state.roomCode);
        return true;
      }

      // 检查该角色是否有夜间行动
      if (!hasNightAction(roleId)) continue;

      // 检查该角色是否被噩梦封印
      // 狼人子阶段需要检查所有共同睁眼狼人是否都被封印
      let isBlocked = false;
      if (roleId === 'werewolf') {
        const sharedRoles = this.state.config.sharedWolfRoles;
        const wolfPlayers = alivePlayers.filter((p) => isSharedWolfRole(p.role, sharedRoles));
        // 只有当所有狼人都被封印时才跳过子阶段
        isBlocked = wolfPlayers.length > 0 && wolfPlayers.every((p) => this.isNightActionBlocked(roleId, p.seatNumber, i));
      } else {
        const rolePlayer = alivePlayers.find((p) => p.role === roleId)!;
        isBlocked = this.isNightActionBlocked(roleId, rolePlayer.seatNumber, i);
      }

      // 设置当前子阶段
      this.state.nightSubPhase = {
        currentRole: roleId,
        currentRoleIndex: i,
        isBlockedByNightmare: isBlocked,
      };

      // 如果被封印：不跳过阶段，而是设置标准倒计时广播 + 随机延时自动提交空操作
      // 所有玩家看到标准倒计时（如30秒），但被恐惧玩家的操作在 5-15 秒后被自动提交（不行动）
      if (isBlocked) {
        const blockedPlayer = roleId === 'werewolf'
          ? alivePlayers.filter((p) => isSharedWolfRole(p.role, this.state.config.sharedWolfRoles))[0]
          : alivePlayers.find((p) => p.role === roleId)!;

        this.logAction({
          actorSeat: blockedPlayer.seatNumber,
          actorNickname: blockedPlayer.nickname,
          actionType: 'NIGHT_ACTION_BLOCKED',
          targetSeat: null,
          targetNickname: null,
          detail: {
            roleId,
            reason: 'nightmare',
          },
        });

        // 记录封印的夜间行动（空操作）
        this.state.nightActions[roleId] = {
          roleId,
          actorSeat: blockedPlayer.seatNumber,
          targetSeat: null,
          extra: {},
          submitted: true,
          blockedByNightmare: true,
        };

        // 设置标准倒计时定时器 + 倒计时广播（全体玩家可见，保持与正常阶段一致）
        if (this.state.config.nightActionTimeout > 0) {
          this.setNightActionTimer(roleId, this.state.config.nightActionTimeout);
        }

        // 随机 5-15 秒后自动提交空操作并推进到下一个子阶段
        // 模拟真实玩家的操作时间，避免被恐惧阶段秒过暴露信息
        const autoAdvanceDelay = Math.floor(Math.random() * 11) + 5;
        this.setTimer('blocked_auto_advance', autoAdvanceDelay, () => {
          // 防护：如果当前已不在夜间或子阶段已变化，忽略
          if (this.state.phase !== 'NIGHT') return;
          if (this.state.nightSubPhase?.currentRole !== roleId) return;
          if (!this.state.nightSubPhase?.isBlockedByNightmare) return;

          // 清除标准倒计时定时器和倒计时广播
          this.clearTimer(`night_${roleId}`);
          this.clearNightCountdownTimer(roleId);

          // 推进到下一个子阶段
          const nextIndex = this.state.nightSubPhase!.currentRoleIndex + 1;
          this.advanceNightSubPhase(nextIndex);
        });

        // 发送阶段提醒
        const actorSeats = this.getActorSeatsForSubPhase(roleId);
        this.onPhaseReminder(
          this.state.roomCode,
          roleId,
          this.state.round,
          actorSeats,
          this.state.config.nightActionTimeout,
        );

        // 广播房间状态，确保前端感知子阶段切换
        this.onNightSubPhaseAdvance(this.state.roomCode);

        return true;
      }

      // 规则10：守卫无合法目标时自动跳过（被恐惧时已在上方处理，不重复检查）
      if (!isBlocked && roleId === 'guard') {
        const guardPlayer = alivePlayers.find((p) => p.role === 'guard');
        if (guardPlayer) {
          const { disabledTargets } = this.getDisabledTargets(guardPlayer.id);
          const allAliveSeats = alivePlayers.map((p) => p.seatNumber);
          const availableTargets = allAliveSeats.filter((s) => !disabledTargets.includes(s));
          if (availableTargets.length === 0) {
            this.logAction({
              actorSeat: 0,
              actorNickname: '系统',
              actionType: 'GUARD_NO_VALID_TARGET',
              targetSeat: null,
              targetNickname: null,
              detail: { message: '守卫无合法目标，阶段自动跳过' },
            });
            // 使用短延时跳过，避免暴露信息
            this.setTimer('guard_skip', 2, () => {
              this.advanceNightSubPhase(i + 1);
            });
            return true;
          }
        }
      }

      // ---- 狼人子阶段特殊处理（被恐惧时跳过，已在上方处理） ----
      // 当遇到 'werewolf' 时，这是所有共同睁眼狼人的集体行动阶段
      if (!isBlocked && roleId === 'werewolf') {
        if (this.enterWolfSubPhase()) {
          // 所有狼人被恐惧，阶段已在 enterWolfSubPhase 内推进，直接返回
          return true;
        }
      }

      // ---- 机械狼子阶段特殊处理（被恐惧时跳过，已在上方处理） ----
      if (!isBlocked && roleId === 'mechanical_wolf') {
        const mwPlayer = alivePlayers.find((p) => p.role === 'mechanical_wolf');
        if (mwPlayer) {
          // 第一晚初始化为 selecting
          if (mwPlayer.mechanicalWolfPhase === null) {
            mwPlayer.mechanicalWolfPhase = 'selecting';
          }
          // learning 阶段处理模仿结果
          if (mwPlayer.mechanicalWolfPhase === 'learning') {
            this.processMechanicalWolfLearning(mwPlayer);
          }
          // 规则6：failed和silent阶段跳过（silent阶段除非可以以狼人身份行动）
          if (mwPlayer.mechanicalWolfPhase === 'failed' || mwPlayer.mechanicalWolfPhase === 'silent') {
            // 规则7：如果机械狼可以以狼人身份行动，不跳过（将在狼人子阶段行动）
            if (!this.canMechanicalWolfActAsWolf()) {
              return this.advanceNightSubPhase(i + 1);
            }
            // 可以以狼人身份行动，但不在mechanical_wolf子阶段行动，而是在werewolf子阶段
            return this.advanceNightSubPhase(i + 1);
          }
          // 规则13：机械狼active阶段被恐惧延迟时跳过
          if (mwPlayer.mechanicalWolfPhase === 'active' && mwPlayer.mechanicalWolfSkillDeferred && mwPlayer.isNightmared) {
            return this.advanceNightSubPhase(i + 1);
          }
        }
      }

      // 设置超时定时器和倒计时广播（所有模式下都广播倒计时，仅SYSTEM模式超时自动推进）
      if (this.state.config.nightActionTimeout > 0) {
        this.setNightActionTimer(roleId, this.state.config.nightActionTimeout);
      }

      // 发送阶段提醒
      const actorSeats = this.getActorSeatsForSubPhase(roleId);
      this.onPhaseReminder(
        this.state.roomCode,
        roleId,
        this.state.round,
        actorSeats,
        this.state.config.nightActionTimeout,
      );

      // 广播房间状态，确保前端感知子阶段切换
      this.onNightSubPhaseAdvance(this.state.roomCode);

      return true;
    }

    // 所有夜间行动完成，进入结算
    this.state.nightSubPhase = null;
    this.enterNightSettlement();

    // 广播房间状态，确保前端感知夜间行动结束
    this.onNightSubPhaseAdvance(this.state.roomCode);

    return false;
  }

  /**
   * 获取当前子阶段应行动的玩家座位号列表
   */
  private getActorSeatsForSubPhase(roleId: RoleId): number[] {
    const alivePlayers = this.state.players.filter((p) => !p.isJudge && p.status === 'alive');

    if (roleId === 'werewolf') {
      // 狼人子阶段：所有共同睁眼的狼人（被恐惧的狼人无法参与投票）
      const sharedRoles = this.state.config.sharedWolfRoles;
      const actors = alivePlayers
        .filter((p) => isSharedWolfRole(p.role, sharedRoles))
        .filter((p) => !p.isNightmared) // 被恐惧的狼人无法参与投票
        .map((p) => p.seatNumber);
      // 规则7：机械狼在条件满足时以狼人身份参与投票（被恐惧时除外）
      const mwPlayer = alivePlayers.find((p) => p.role === 'mechanical_wolf');
      if (mwPlayer && this.canMechanicalWolfActAsWolf() && !mwPlayer.isNightmared && !actors.includes(mwPlayer.seatNumber)) {
        actors.push(mwPlayer.seatNumber);
      }
      return actors;
    }

    // 其他角色：只有该角色的玩家
    return alivePlayers
      .filter((p) => p.role === roleId)
      .map((p) => p.seatNumber);
  }

  /**
   * 进入狼人子阶段
   * 初始化狼人投票状态，向所有共同睁眼的狼人推送聊天历史
   * @returns true 表示阶段已被跳过（所有狼人被恐惧），调用方应提前返回
   */
  private enterWolfSubPhase(): boolean {
    // 与 getActorSeatsForSubPhase / submitWolfVote 保持一致：
    // 使用 isSharedWolfRole + 机械狼（可行动时），排除被恐惧的狼人
    const sharedRoles = this.state.config.sharedWolfRoles;
    const alivePlayers = this.state.players.filter(
      (p) => !p.isJudge && p.status === 'alive'
    );

    // 共同睁眼的狼人（排除被恐惧）
    const canActWolves = alivePlayers.filter(
      (p) => isSharedWolfRole(p.role, sharedRoles) && !p.isNightmared
    );

    // 机械狼（可以以狼人身份行动且未被恐惧时也算）
    const mwPlayer = alivePlayers.find((p) => p.role === 'mechanical_wolf');
    const mwCanAct = mwPlayer && this.canMechanicalWolfActAsWolf() && !mwPlayer.isNightmared;

    // 全部存活的共同睁眼狼人（含被恐惧的，用于判断是否"有狼人但全部被恐惧"）
    const allSharedWolves = alivePlayers.filter(
      (p) => isSharedWolfRole(p.role, sharedRoles)
    );
    const allWolvesIncludingMw = mwPlayer && this.canMechanicalWolfActAsWolf()
      ? [...allSharedWolves, mwPlayer]
      : allSharedWolves;

    if (canActWolves.length === 0 && !mwCanAct && allWolvesIncludingMw.length > 0) {
      // 所有狼人被恐惧，跳过狼人阶段
      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'WOLF_PHASE_SKIPPED',
        targetSeat: null,
        targetNickname: null,
        detail: {
          publicMessage: '夜深了，似乎有什么力量阻断了狼人的行动……',
          judgeReason: '所有存活狼人被恐惧，狼人阶段自动跳过',
        },
      });
      // 跳过狼人阶段，推进到下一个子阶段
      if (this.state.nightSubPhase) {
        this.advanceNightSubPhase(this.state.nightSubPhase.currentRoleIndex + 1);
      }
      return true; // 告知调用方：阶段已跳过
    }

    this.state.wolfVotes = {};
    this.state.wolfVoteConsensus = false;
    return false;
  }

  /**
   * 判断角色夜间行动是否被噩梦封印
   *
   * 封印条件：
   * 规则七重构后的硬逻辑：
   *   - 被恐惧的玩家，其所有技能当夜均不可使用
   *   - 封印仅持续当夜，下一晚自动恢复
   *   - 不再依赖 nightmareBlockMode / nightmareBlockSkill 配置
   *   - 噩梦之影排在 nightActionOrder 中该角色之前时，恐惧当夜生效
   */
  private isNightActionBlocked(roleId: RoleId, seatNumber: number, roleIndex: number): boolean {
    // 检查该玩家是否被恐惧
    const player = this.getPlayerBySeat(seatNumber);
    if (!player || !player.isNightmared) return false;

    // 噩梦之影必须在当前角色之前行动，恐惧才当夜生效
    const nightmareIndex = this.state.config.nightActionOrder.indexOf('nightmare_shadow');
    if (nightmareIndex === -1) return false;

    const blocked = roleIndex > nightmareIndex;

    // 规则13：机械狼被恐惧时设置延迟标记
    if (blocked && roleId === 'mechanical_wolf') {
      player.mechanicalWolfSkillDeferred = true;
    }

    return blocked;
  }

  /**
   * 应用噩梦恐惧效果
   * 规则七重构：仅当夜封印所有技能，不影响发言
   */
  private applyNightmareEffect(targetSeat: number): void {
    const player = this.getPlayerBySeat(targetSeat);
    if (player) {
      player.isNightmared = true;
      // 规则七：不影响发言，不再设置 isMuted
    }
  }

  // ==========================================================================
  // 第三部分：夜间行动提交与处理
  // ==========================================================================

  /**
   * 处理夜间行动提交
   *
   * 零信任校验：
   * 1. 当前阶段必须为 NIGHT
   * 2. 当前子阶段必须匹配提交的角色
   * 3. 提交者必须拥有该角色
   * 4. 角色必须存活
   * 5. 目标座位号必须合法
   *
   * 狼人子阶段特殊处理：
   * - 共同睁眼的狼人各自选择击杀目标
   * - 系统实时比对投票，全部一致时自动锁定
   * - 噩梦之影在狼人子阶段以狼人身份参与投票
   *
   * @param playerId - 提交者 WebSocket 连接 ID
   * @param roleId - 行动角色 ID
   * @param targetSeat - 目标座位号
   * @param extra - 附加数据
   */
  submitNightAction(
    playerId: string,
    roleId: RoleId,
    targetSeat: number | null,
    extra: NightActionExtra,
  ): { success: boolean; error?: string; seerResult?: Faction } {
    // ---- 零信任校验 ----
    if (this.state.phase !== 'NIGHT') {
      return { success: false, error: '当前不在夜间阶段' };
    }

    if (!this.state.nightSubPhase) {
      return { success: false, error: '当前没有夜间子阶段' };
    }

    // 狼人子阶段特殊校验：允许共同睁眼的狼人提交
    const isWolfSubPhase = this.state.nightSubPhase.currentRole === 'werewolf';
    const sharedRoles = this.state.config.sharedWolfRoles;

    if (isWolfSubPhase) {
      // 狼人子阶段：提交者必须是共同睁眼的狼人
      const player = this.getPlayerById(playerId);
      if (!player) return { success: false, error: '玩家不存在' };
      if (!isSharedWolfRole(player.role, sharedRoles)) {
        return { success: false, error: '你不是共同睁眼的狼人' };
      }
      if (player.status !== 'alive') return { success: false, error: '你已死亡，无法行动' };
    } else {
      // 非狼人子阶段：角色必须匹配
      if (this.state.nightSubPhase.currentRole !== roleId) {
        return { success: false, error: `当前不是${ROLE_META[roleId].name}的行动阶段` };
      }

      const player = this.getPlayerById(playerId);
      if (!player) return { success: false, error: '玩家不存在' };
      if (player.role !== roleId) return { success: false, error: '你不是该角色' };
      if (player.status !== 'alive') return { success: false, error: '你已死亡，无法行动' };
      if (this.state.nightSubPhase.isBlockedByNightmare) {
        return { success: false, error: '你被噩梦之影恐惧，技能被封印' };
      }
    }

    const player = this.getPlayerById(playerId)!;

    // ---- 狼人子阶段投票处理 ----
    if (isWolfSubPhase) {
      return this.submitWolfVote(player, targetSeat, extra);
    }

    // ---- 角色专属校验 ----
    const validation = this.validateNightAction(roleId, player, targetSeat, extra);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // ---- 执行角色行动 ----
    const result = this.executeNightAction(roleId, player, targetSeat, extra);

    // ---- 记录行动 ----
    this.state.nightActions[roleId] = {
      roleId,
      actorSeat: player.seatNumber,
      targetSeat,
      extra: { ...extra },
      submitted: true,
      blockedByNightmare: false,
    };

    // ---- 清除超时定时器 ----
    this.clearTimer(`night_${roleId}`);
    this.clearNightCountdownTimer(roleId);

    // ---- 记录日志 ----
    this.logAction({
      actorSeat: player.seatNumber,
      actorNickname: player.nickname,
      actionType: 'NIGHT_ACTION_SUBMIT',
      targetSeat,
      targetNickname: targetSeat ? this.getPlayerBySeat(targetSeat)?.nickname || null : null,
      detail: {
        roleId,
        targetSeat,
        extra,
        blockedByNightmare: false,
      },
    });

    // ---- 推进到下一个子阶段 ----
    const nextIndex = (this.state.nightSubPhase?.currentRoleIndex ?? 0) + 1;
    this.advanceNightSubPhase(nextIndex);

    return { success: true, seerResult: result.seerResult };
  }

  /**
   * 处理狼人子阶段的投票提交
   *
   * 核心机制：
   * 1. 每个共同睁眼的狼人各自秘密选择一个刀人目标
   * 2. 系统实时比对所有狼人的选择
   * 3. 全部一致 → 自动锁定目标，结束该子阶段
   * 4. 存在分歧 → 继续讨论，无法进入下一阶段
   * 5. 超时 → 系统随机选择一名存活玩家作为目标
   */
  private submitWolfVote(
    player: Player,
    targetSeat: number | null,
    extra: NightActionExtra,
  ): { success: boolean; error?: string; seerResult?: Faction } {
    // 规则七重构：被恐惧的狼人（含隐狼）无法参与投票
    if (player.isNightmared) {
      return { success: false, error: '你被噩梦之影恐惧，无法参与投票' };
    }

    // 校验玩家是否有资格参与狼人投票
    const sharedRoles = this.state.config.sharedWolfRoles;
    const isSharedWolf = isSharedWolfRole(player.role, sharedRoles);
    const isMechanicalWolfCanAct = player.role === 'mechanical_wolf' && this.canMechanicalWolfActAsWolf();
    
    if (!isSharedWolf && !isMechanicalWolfCanAct) {
      return { success: false, error: '你无法参与狼人投票' };
    }

    const killTarget = extra.killTarget ?? targetSeat;
    if (killTarget === null) {
      return { success: false, error: '必须选择击杀目标' };
    }

    // 校验目标合法性
    const target = this.getPlayerBySeat(killTarget);
    if (!target || target.status !== 'alive') {
      return { success: false, error: '目标不合法' };
    }
    // 规则八：允许自刀（目标是存活玩家即可，包括自己）
    // 不能击杀其他狼人阵营（隐狼/机械狼除外），但自刀允许
    if (isEvilRole(target.role) && !isHiddenWolf(target.role) && target.role !== 'mechanical_wolf') {
      if (killTarget !== player.seatNumber) {
        return { success: false, error: '不能击杀狼人阵营' };
      }
    }

    // 记录该狼人的投票
    this.state.wolfVotes[player.seatNumber] = killTarget;

    this.logAction({
      actorSeat: player.seatNumber,
      actorNickname: player.nickname,
      actionType: 'WOLF_VOTE_CAST',
      targetSeat: killTarget,
      targetNickname: target.nickname,
      detail: {
        voterRole: player.role,
        voterSeat: player.seatNumber,
        targetSeat: killTarget,
        currentVoteSummary: Object.values(this.state.wolfVotes).reduce<Record<number, number>>((acc, v) => {
          acc[v] = (acc[v] || 0) + 1;
          return acc;
        }, {}),
      },
    });

    // 检查是否所有共同睁眼的狼人都已投票
    // 检查是否所有可行动的共同睁眼的狼人都已投票（排除被恐惧的狼人）
    const aliveWolves = this.state.players.filter(
      (p) => !p.isJudge && p.status === 'alive' && isSharedWolfRole(p.role, sharedRoles) && !p.isNightmared,
    );
    const allVoted = aliveWolves.every((w) => this.state.wolfVotes[w.seatNumber] !== undefined);

    if (allVoted) {
      // 检查是否达成一致
      const votes = Object.values(this.state.wolfVotes);
      const allSame = votes.every((v) => v === votes[0]);

      if (allSame) {
        // 达成一致，锁定目标
        this.state.wolfVoteConsensus = true;
        this.state.werewolfTarget = votes[0];

        this.logAction({
          actorSeat: 0,
          actorNickname: '系统',
          actionType: 'WOLF_VOTE_CONSENSUS',
          targetSeat: votes[0],
          targetNickname: this.getPlayerBySeat(votes[0])?.nickname || null,
          detail: {
            targetSeat: votes[0],
            voteDetails: this.state.wolfVotes,
          },
        });

        // 通知投票更新
        this.onWolfVoteUpdate(
          this.state.roomCode,
          this.state.wolfVotes,
          true,
          votes[0],
        );

        // 清除超时定时器，推进到下一个子阶段
        this.clearTimer('night_werewolf');
        this.clearNightCountdownTimer('werewolf');
        const nextIndex = (this.state.nightSubPhase?.currentRoleIndex ?? 0) + 1;
        this.advanceNightSubPhase(nextIndex);
      } else {
        // 存在分歧，不推进
        this.state.wolfVoteConsensus = false;

        // 通知投票更新（狼人之间可见彼此选择）
        this.onWolfVoteUpdate(
          this.state.roomCode,
          this.state.wolfVotes,
          false,
          null,
        );
      }
    } else {
      // 还有人没投票，通知当前投票状态
      this.onWolfVoteUpdate(
        this.state.roomCode,
        this.state.wolfVotes,
        false,
        null,
      );
    }

    return { success: true };
  }

  /**
   * 校验夜间行动的合法性（角色专属规则）
   */
  private validateNightAction(
    roleId: RoleId,
    player: Player,
    targetSeat: number | null,
    extra: NightActionExtra,
  ): { valid: boolean; error?: string } {
    const config = this.state.config;

    switch (roleId) {
      case 'nightmare_shadow': {
        if (targetSeat === null) return { valid: false, error: '必须选择恐惧目标' };
        const target = this.getPlayerBySeat(targetSeat);
        if (!target || target.status !== 'alive') return { valid: false, error: '目标不合法' };
        if (target.isJudge) return { valid: false, error: '不能恐惧法官' };
        // 规则七：不能恐惧自己
        if (targetSeat === player.seatNumber) return { valid: false, error: '不能恐惧自己' };
        // 噩梦可以恐惧狼人阵营角色（不再限制）
        // 规则二：不能连续恐惧同一人
        if (player.nightmareTargetHistory.includes(targetSeat)) {
          return { valid: false, error: '不能重复恐惧同一人' };
        }
        return { valid: true };
      }

      case 'guard': {
        const protectTarget = extra.protectTarget ?? targetSeat;
        // 允许空守（protectTarget === null），执行阶段会正确处理
        if (protectTarget !== null) {
          const target = this.getPlayerBySeat(protectTarget);
          if (!target || target.status !== 'alive') return { valid: false, error: '目标不合法' };
          // 规则二：不可重复守护同一人（无论隔多少晚）
          if (player.guardProtectedHistory.includes(protectTarget)) {
            return { valid: false, error: '不可重复守护同一人' };
          }
          // 规则五：仅第一晚可以守护自己
          if (protectTarget === player.seatNumber && this.state.round > 1) {
            return { valid: false, error: '仅第一晚可以守护自己' };
          }
        }
        return { valid: true };
      }

      case 'werewolf':
      case 'white_wolf_king':
      case 'wolf_king': {
        // 狼人击杀目标
        const killTarget = extra.killTarget ?? targetSeat;
        if (killTarget === null) return { valid: false, error: '必须选择击杀目标' };
        const target = this.getPlayerBySeat(killTarget);
        if (!target || target.status !== 'alive') return { valid: false, error: '目标不合法' };
        // 规则八：狼人可以自刀（不再限制不能击杀自己）
        // 不能击杀狼人阵营（隐狼/机械狼除外）
        if (isEvilRole(target.role) && !isHiddenWolf(target.role) && target.role !== 'mechanical_wolf') {
          // 但如果是自刀（目标是狼人自己），允许
          if (killTarget !== player.seatNumber) {
            return { valid: false, error: '不能击杀狼人阵营' };
          }
        }
        return { valid: true };
      }

      case 'witch': {
        // 女巫行动校验
        if (extra.useAntidote && player.witchAntidoteUsed) {
          return { valid: false, error: '解药已使用' };
        }
        if (extra.usePoison && player.witchPoisonUsed) {
          return { valid: false, error: '毒药已使用' };
        }

        // 女巫同一晚能否同时使用解药和毒药
        if (extra.useAntidote && extra.usePoison && !config.witchCanUseBothPotions) {
          return { valid: false, error: '村规禁止同一晚同时使用解药和毒药' };
        }

        // 女巫自救校验
        if (extra.useAntidote && this.state.werewolfTarget !== null) {
          const isSelfSave = this.state.werewolfTarget === player.seatNumber;
          if (isSelfSave) {
            if (config.witchSaveSelf === 'NEVER') {
              return { valid: false, error: '村规禁止女巫自救' };
            }
            if (config.witchSaveSelf === 'FIRST_NIGHT' && this.state.round > 1) {
              return { valid: false, error: '村规仅允许首夜自救' };
            }
          }
        }

        // 毒药目标校验
        if (extra.usePoison) {
          const poisonTarget = extra.poisonTarget;
          if (poisonTarget === null || poisonTarget === undefined) {
            return { valid: false, error: '使用毒药必须指定目标' };
          }
          const target = this.getPlayerBySeat(poisonTarget);
          if (!target || target.status !== 'alive') return { valid: false, error: '毒药目标不合法' };
        }

        return { valid: true };
      }

      case 'seer': {
        if (targetSeat === null) return { valid: false, error: '必须选择查验目标' };
        const target = this.getPlayerBySeat(targetSeat);
        if (!target || target.status !== 'alive') return { valid: false, error: '目标不合法' };
        return { valid: true };
      }

      case 'mechanical_wolf': {
        // 机械狼行动校验
        if (player.mechanicalWolfPhase === 'selecting') {
          if (extra.imitateTarget === null || extra.imitateTarget === undefined) {
            return { valid: false, error: '必须选择模仿目标' };
          }
          const target = this.getPlayerBySeat(extra.imitateTarget);
          if (!target || target.status !== 'alive') return { valid: false, error: '模仿目标不合法' };
          if (extra.imitateTarget === player.seatNumber) return { valid: false, error: '不能模仿自己' };
        }
        if (player.mechanicalWolfPhase === 'active') {
          if (extra.imitateSkillTarget === null || extra.imitateSkillTarget === undefined) {
            return { valid: false, error: '必须选择技能目标' };
          }
          const target = this.getPlayerBySeat(extra.imitateSkillTarget);
          if (!target || target.status !== 'alive') return { valid: false, error: '技能目标不合法' };
        }
        return { valid: true };
      }

      default:
        return { valid: false, error: '该角色没有夜间行动' };
    }
  }

  /**
   * 执行夜间行动并返回结果
   */
  private executeNightAction(
    roleId: RoleId,
    player: Player,
    targetSeat: number | null,
    extra: NightActionExtra,
  ): { seerResult?: Faction } {
    const config = this.state.config;

    switch (roleId) {
      case 'nightmare_shadow': {
        // 噩梦之影恐惧目标
        if (targetSeat !== null) {
          this.state.nightmareTarget = targetSeat;
          // 规则二：记录恐惧历史
          if (!player.nightmareTargetHistory.includes(targetSeat)) {
            player.nightmareTargetHistory.push(targetSeat);
          }
          // 规则七重构：恐惧当夜立即生效
          this.applyNightmareEffect(targetSeat);
        }
        return {};
      }

      case 'guard': {
        const protectTarget = extra.protectTarget ?? targetSeat;
        if (protectTarget !== null) {
          this.state.guardProtectTarget = protectTarget;
          player.guardLastProtected = protectTarget;
          // 规则二：记录守护历史
          if (!player.guardProtectedHistory.includes(protectTarget)) {
            player.guardProtectedHistory.push(protectTarget);
          }
        }
        return {};
      }

      case 'werewolf':
      case 'white_wolf_king':
      case 'wolf_king': {
        // 狼人击杀目标（多狼投票时取多数，此处简化为直接设置）
        const killTarget = extra.killTarget ?? targetSeat;
        this.state.werewolfTarget = killTarget;
        return {};
      }

      case 'witch': {
        // 女巫解药
        if (extra.useAntidote && !player.witchAntidoteUsed) {
          this.state.witchSaveTarget = this.state.werewolfTarget;
          player.witchAntidoteUsed = true;
        }

        // 女巫毒药
        if (extra.usePoison && !player.witchPoisonUsed && extra.poisonTarget != null) {
          this.state.witchPoisonTarget = extra.poisonTarget;
          player.witchPoisonUsed = true;
        }
        return {};
      }

      case 'seer': {
        // 预言家查验
        if (targetSeat !== null) {
          const target = this.getPlayerBySeat(targetSeat);
          if (target) {
            // 规则三：隐狼查验结果取决于是否已以狼人身份行动过
            if (isHiddenWolf(target.role)) {
              const seerResult: Faction = target.hiddenWolfHasActed ? 'evil' : 'good';
              return { seerResult };
            }
            // 规则四：机械狼查验结果取决于模仿状态
            if (target.role === 'mechanical_wolf') {
              const seerResult = this.getMechanicalWolfSeerResult(target);
              return { seerResult };
            }
            return { seerResult: ROLE_META[target.role].faction };
          }
        }
        return {};
      }

      case 'mechanical_wolf': {
        // 机械狼行动
        const mwPlayer = player;
        if (mwPlayer.mechanicalWolfPhase === 'selecting' && extra.imitateTarget != null) {
          // 第一晚：选择模仿目标
          mwPlayer.mechanicalWolfImitateTarget = extra.imitateTarget;
          mwPlayer.mechanicalWolfPhase = 'learning';
          return {};
        }
        if (mwPlayer.mechanicalWolfPhase === 'active' && extra.imitateSkillTarget != null) {
          // 第二晚：使用模仿的技能
          // 技能效果在结算阶段处理
          // 规则6：使用技能后进入silent阶段，只能使用一次
          mwPlayer.mechanicalWolfPhase = 'silent';
          // 规则13：成功使用技能后清除恐惧延迟标记
          mwPlayer.mechanicalWolfSkillDeferred = false;
          return {};
        }
        return {};
      }

      default:
        return {};
    }
  }

  // ==========================================================================
  // 第四部分：夜间结算引擎 (Night Settlement)
  // ==========================================================================

  /**
   * 进入夜间结算阶段
   *
   * 核心结算逻辑（严格按以下顺序执行）：
   *
   * 1. 确定狼人击杀目标
   * 2. 判断守卫是否守护了击杀目标
   * 3. 判断女巫是否使用解药救了击杀目标
   * 4. 处理同守同救冲突（根据 guardWitchConflict 规则）
   * 5. 判断女巫毒药目标
   * 6. 处理毒封技能逻辑（poisonBlockGun）
   * 7. 汇总死亡列表
   * 8. 检查胜负条件
   *
   * 关键设计：
   *   - 同守同救自适应：守卫和女巫的最终选择在结算阶段统一比对，
   *     不依赖行动先后顺序。如果女巫先行动时看不到守护信息，
   *     前端显示为"守护目标：未知"，女巫只能盲救。
   *   - 毒封技能：如果 poisonBlockGun 为 true，被毒死的猎人和狼王
   *     均不能开枪。
   */
  private enterNightSettlement(): void {
    this.state.phase = 'NIGHT_SETTLEMENT';

    const config = this.state.config;
    const deaths: NightDeathRecord[] = [];

    // ---- 1. 狼人击杀判定 ----
    let wolfKillSaved = false;
    if (this.state.werewolfTarget !== null) {
      const isGuarded = this.state.guardProtectTarget === this.state.werewolfTarget;
      const isSaved = this.state.witchSaveTarget === this.state.werewolfTarget;

      if (isGuarded && isSaved) {
        // ---- 同守同救冲突 ----
        // Bug 81 说明：guardWitchConflict 规则决定同守同救时的结果
        // DEATH: 守卫和女巫同时保护同一人，导致该人死亡（双药冲突）
        // ALIVE: 算作救活，该人存活
        // 这是游戏规则设计，两种模式都是合理的
        if (config.guardWitchConflict === 'DEATH') {
          // 双药冲突导致死亡
          deaths.push({
            seatNumber: this.state.werewolfTarget,
            cause: 'guard_witch_conflict',
            saved: false,
            overridden: false,
            overrideReason: null,
          });
        } else {
          // ALIVE: 算作救活
          wolfKillSaved = true;
        }
      } else if (isGuarded) {
        // 守卫守护成功
        wolfKillSaved = true;
      } else if (isSaved) {
        // 女巫解药救活
        wolfKillSaved = true;
      } else {
        // 无人救援，狼人击杀成功
        deaths.push({
          seatNumber: this.state.werewolfTarget,
          cause: 'werewolf_kill',
          saved: false,
          overridden: false,
          overrideReason: null,
        });
      }
    }

    // ---- 2. 女巫毒药判定 ----
    if (this.state.witchPoisonTarget !== null) {
      // Bug 82 说明：检查毒药目标是否已被狼人击杀
      // 同一人不可能死两次，如果狼人已经杀了该目标，毒药不再重复添加死亡记录
      // 这是正确的行为：狼刀和毒药作用于同一人时，只记录一次死亡
      const alreadyDead = deaths.some((d) => d.seatNumber === this.state.witchPoisonTarget);
      if (!alreadyDead) {
        deaths.push({
          seatNumber: this.state.witchPoisonTarget,
          cause: 'witch_poison',
          saved: false,
          overridden: false,
          overrideReason: null,
        });
      }
    }

    // ---- 3. 执行死亡 ----
    for (const death of deaths) {
      const player = this.getPlayerBySeat(death.seatNumber);
      if (player) {
        player.status = 'dead';
        player.deathCause = death.cause;
        player.deathRound = this.state.round;

        // ---- 毒封技能逻辑 ----
        // 如果 poisonBlockGun 为 true，被毒死的猎人和狼王不能开枪
        if (config.poisonBlockGun && death.cause === 'witch_poison') {
          if (player.role === 'hunter') {
            player.hunterGunFired = true; // 标记为已开枪（实际是封印，不能再开枪）
          }
          if (player.role === 'wolf_king') {
            player.wolfKingGunFired = true; // 同理封印
          }
        }
      }
    }

    this.state.nightDeaths = deaths;

    // ---- 4. 记录结算日志 ----
    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'NIGHT_SETTLEMENT',
      targetSeat: null,
      targetNickname: null,
      detail: {
        round: this.state.round,
        werewolfTarget: this.state.werewolfTarget,
        witchSaveTarget: this.state.witchSaveTarget,
        witchPoisonTarget: this.state.witchPoisonTarget,
        guardProtectTarget: this.state.guardProtectTarget,
        nightmareTarget: this.state.nightmareTarget,
        totalDeaths: deaths.filter((d) => !d.saved && !d.overridden).length,
        deaths: deaths.map((d) => ({
          seatNumber: d.seatNumber,
          cause: d.cause,
          saved: d.saved,
        })),
        wolfKillSaved,
        guardWitchConflict: config.guardWitchConflict,
      },
    });

    // ---- 5. 检查胜负 ----
    const winner = this.checkWinCondition();
    if (winner) {
      this.endGame(winner);
      return;
    }

    // ---- 6. 进入白天公布死讯 ----
    this.enterDayAnnounce();
  }

  // ==========================================================================
  // 第五部分：白天阶段
  // ==========================================================================

  /**
   * 天亮公告 → 警长选举（第一天且启用时） → 发言阶段
   */
  private enterDayAnnounce(): void {
    // 设置 DAY_ANNOUNCE 阶段（让客户端能正确显示天亮公告）
    this.state.phase = 'DAY_ANNOUNCE';

    // 计算发言顺序（原先由 enterDayAnnounce 负责）
    this.calculateSpeechOrder();

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'DAY_ANNOUNCE',
      targetSeat: null,
      targetNickname: null,
      detail: {
        round: this.state.round,
        deaths: this.state.nightDeaths.map((d) => {
          const p = this.getPlayerBySeat(d.seatNumber);
          return {
            seatNumber: d.seatNumber,
            nickname: p?.nickname ?? '',
            cause: d.cause,
          };
        }),
        mutedSeats: this.state.players
          .filter((p) => p.isMuted)
          .map((p) => p.seatNumber),
        isPeacefulNight: this.state.nightDeaths.length === 0,
      },
    });

    // 广播天亮公告数据给客户端（含死亡名单、禁言名单）
    const announceDeaths = this.state.nightDeaths
      .filter((d) => !d.overridden)
      .map((d) => {
        const p = this.getPlayerBySeat(d.seatNumber);
        return {
          seatNumber: d.seatNumber,
          nickname: p?.nickname ?? '',
          cause: d.cause,
        };
      });

    const mutedSeats = this.state.players
      .filter((p) => p.isMuted)
      .map((p) => p.seatNumber);

    this.onDayAnnounce(this.state.roomCode, announceDeaths, mutedSeats);

    this.onPhaseChange('DAY_ANNOUNCE', null, this.state.round);

    // 检查夜间是否有警长死亡
    const deadSheriffSeat = this.findDeadSheriffInNightDeaths();

    // 5秒后自动过渡到下一阶段（警徽移交/警长选举或发言阶段）
    this.setTimer('day_announce', 5, () => {
      if (deadSheriffSeat !== null) {
        // 警长夜间死亡，先进入警徽移交
        this.enterSheriffTransfer(deadSheriffSeat, () => {
          if (this.state.round === 1 && this.state.config.sheriffElectionEnabled) {
            this.enterSheriffElection();
          } else {
            this.enterDaySpeech();
          }
        });
      } else if (this.state.round === 1 && this.state.config.sheriffElectionEnabled) {
        this.enterSheriffElection();
      } else {
        this.enterDaySpeech();
      }
    });
  }

  /**
   * 进入白天发言阶段
   */
  private enterDaySpeech(): void {
    this.state.phase = 'DAY_SPEECH';
    this.state.currentSpeakerIndex = 0;
    this.state.currentSpeechRound = 1;

    // 跳过已死亡和被禁言的玩家
    this.skipUnavailableSpeakers();

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'SPEECH_START',
      targetSeat: null,
      targetNickname: null,
      detail: {
        speechOrder: this.state.speechOrder,
        currentSpeakerIndex: this.state.currentSpeakerIndex,
        speakerSeat: this.state.speechOrder[this.state.currentSpeakerIndex] ?? null,
        speakerNickname: this.state.speechOrder[this.state.currentSpeakerIndex]
          ? this.getPlayerBySeat(this.state.speechOrder[this.state.currentSpeakerIndex])?.nickname ?? null
          : null,
        speechRound: 1,
      },
    });

    this.onPhaseChange('DAY_SPEECH', null, this.state.round);

    // 设置发言超时
    if (this.state.config.speechTimeout > 0) {
      this.setSpeechTimer();
    }
  }

  /**
   * 进入首日第二轮发言
   * 仅在 firstDayDoubleSpeech 为 true 且为首日时调用
   */
  private enterSecondSpeechRound(): void {
    this.state.currentSpeechRound = 2;
    this.state.currentSpeakerIndex = 0;

    // 重新计算发言顺序
    this.calculateSpeechOrder();

    // 跳过已死亡和被禁言的玩家
    this.skipUnavailableSpeakers();

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'SECOND_SPEECH_ROUND_START',
      targetSeat: null,
      targetNickname: null,
      detail: {
        speechOrder: this.state.speechOrder,
        currentSpeakerIndex: this.state.currentSpeakerIndex,
        speakerSeat: this.state.speechOrder[this.state.currentSpeakerIndex] ?? null,
        speakerNickname: this.state.speechOrder[this.state.currentSpeakerIndex]
          ? this.getPlayerBySeat(this.state.speechOrder[this.state.currentSpeakerIndex])?.nickname ?? null
          : null,
        speechRound: 2,
      },
    });

    this.onPhaseChange('DAY_SPEECH', null, this.state.round);

    // 设置发言超时
    if (this.state.config.speechTimeout > 0) {
      this.setSpeechTimer();
    }
  }

  // ==========================================================================
  // 警长选举
  // ==========================================================================

  /**
   * 进入警长选举阶段
   */
  private enterSheriffElection(): void {
    this.state.phase = 'SHERIFF_ELECTION';
    this.state.sheriffElectionVotes = {};

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'SHERIFF_ELECTION_START',
      targetSeat: null,
      targetNickname: null,
      detail: {
        candidates: this.state.players
          .filter((p) => p.status === 'alive' && !p.isSheriff && !p.isJudge)
          .map((p) => p.seatNumber),
      },
    });

    this.onPhaseChange('SHERIFF_ELECTION', null, this.state.round);

    // 设置选举超时
    if (this.state.config.voteTimeout > 0) {
      this.setTimer('sheriff_election', this.state.config.voteTimeout, () => {
        this.resolveSheriffElection();
      });
    }
  }

  /**
   * 提交警长选举投票
   */
  submitSheriffElectionVote(
    playerId: string,
    targetSeat: number | null,
  ): { success: boolean; error?: string } {
    if (this.state.phase !== 'SHERIFF_ELECTION') {
      return { success: false, error: '当前不在警长选举阶段' };
    }

    const player = this.getPlayerById(playerId);
    if (!player) return { success: false, error: '玩家不存在' };
    if (player.status !== 'alive') return { success: false, error: '你已死亡，无法投票' };
    if (player.isJudge) return { success: false, error: '法官（上帝）不参与选举投票' };
    if (player.idiotRevealed) return { success: false, error: '白痴翻牌后失去投票权' };

    // 校验目标合法性
    if (targetSeat !== null) {
      const target = this.getPlayerBySeat(targetSeat);
      if (!target || target.status !== 'alive') {
        return { success: false, error: '投票目标不合法' };
      }
      if (target.isSheriff) {
        return { success: false, error: '不能投给现任警长' };
      }
    }

    this.state.sheriffElectionVotes[player.seatNumber] = targetSeat ?? -1; // -1 表示弃票

    this.logAction({
      actorSeat: player.seatNumber,
      actorNickname: player.nickname,
      actionType: 'SHERIFF_ELECTION_VOTE',
      targetSeat,
      targetNickname: targetSeat ? this.getPlayerBySeat(targetSeat)?.nickname || null : null,
      detail: { isAbstain: targetSeat === null },
    });

    // 检查是否所有存活玩家都已投票
    const aliveNonJudge = this.state.players.filter(
      (p) => p.status === 'alive' && !p.isJudge && !p.idiotRevealed,
    );
    const allVoted = aliveNonJudge.every((p) => this.state.sheriffElectionVotes[p.seatNumber] !== undefined);
    if (allVoted) {
      this.clearTimer('sheriff_election');
      this.resolveSheriffElection();
    }

    return { success: true };
  }

  /**
   * 结算警长选举
   */
  private resolveSheriffElection(): void {
    const votes = this.state.sheriffElectionVotes;

    // 统计票数
    const voteCount: Record<number, number> = {};
    for (const [, target] of Object.entries(votes)) {
      if (target !== null && target !== -1) {
        voteCount[target] = (voteCount[target] || 0) + 1;
      }
    }

    // 找最高票
    let maxVotes = 0;
    let winners: number[] = [];
    for (const [seat, count] of Object.entries(voteCount)) {
      if (count > maxVotes) {
        maxVotes = count;
        winners = [Number(seat)];
      } else if (count === maxVotes) {
        winners.push(Number(seat));
      }
    }

    if (winners.length === 1) {
      // 有明确当选者
      const winnerSeat = winners[0];
      const winnerPlayer = this.getPlayerBySeat(winnerSeat);
      if (winnerPlayer) {
        // 清除旧警长标记
        for (const p of this.state.players) {
          if (p.isSheriff) {
            p.isSheriff = false;
          }
        }
        winnerPlayer.isSheriff = true;

        this.logAction({
          actorSeat: 0,
          actorNickname: '系统',
          actionType: 'SHERIFF_ELECTED',
          targetSeat: winnerSeat,
          targetNickname: winnerPlayer.nickname,
          detail: { votes: voteCount },
        });

        this.onGameEvent(this.state.roomCode, 'SHERIFF_ELECTED', {
          seatNumber: winnerSeat,
          nickname: winnerPlayer.nickname,
          votes: voteCount,
        });
      }
    } else if (winners.length > 1) {
      // Bug 52 说明：警长选举平票时直接进入发言阶段，无 PK 机制
      // 这是有意为之的设计决策：
      // 1. 警长选举不如白天投票关键，平票时无人当选即可
      // 2. 避免增加游戏复杂度和时长
      // 3. 第一轮无警长时，发言顺序按默认规则进行
      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'SHERIFF_ELECTION_TIE',
        targetSeat: null,
        targetNickname: null,
        detail: { tieCandidates: winners, votes: voteCount },
      });

      this.onGameEvent(this.state.roomCode, 'SHERIFF_ELECTION_TIE', {
        tieCandidates: winners,
        votes: voteCount,
      });
    } else {
      // 所有弃票，无人当选
      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'SHERIFF_ELECTION_TIE',
        targetSeat: null,
        targetNickname: null,
        detail: { tieCandidates: [], votes: voteCount, allAbstained: true },
      });

      this.onGameEvent(this.state.roomCode, 'SHERIFF_ELECTION_TIE', {
        tieCandidates: [],
        votes: voteCount,
      });
    }

    // 选举结束，进入发言阶段
    this.enterDaySpeech();
  }

  // ==========================================================================
  // 警徽移交
  // ==========================================================================

  /**
   * 进入警徽移交阶段
   *
   * 触发条件：警长死亡（夜间或白天）
   * 流程：
   *   1. 天亮告知昨晚情况后（DAY_ANNOUNCE），检测夜间死亡的警长
   *   2. 提示警长死亡，需要移交警徽
   *   3. 代表警长的玩家在限定时间内选择移交目标
   *   4. 超时未移交则自动移交给场上存活的最小序号玩家
   *   5. 移交后进入下一进程
   *   6. 移交结果写入日志
   */
  private enterSheriffTransfer(deadSheriffSeat: number, afterTransfer: () => void): void {
    this.state.phase = 'SHERIFF_TRANSFER';

    // Bug 51 修复：保存死亡警长座位号
    this._deadSheriffSeat = deadSheriffSeat;

    const deadSheriff = this.getPlayerBySeat(deadSheriffSeat);
    const deadSheriffNickname = deadSheriff?.nickname ?? '';

    // 可移交目标：所有存活且非法官的玩家
    const availableTargets = this.state.players
      .filter((p) => p.status === 'alive' && !p.isJudge)
      .map((p) => p.seatNumber);

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'SHERIFF_TRANSFER',
      targetSeat: null,
      targetNickname: null,
      detail: {
        deadSheriffSeat,
        deadSheriffNickname,
        availableTargets,
        message: `警长 ${deadSheriffNickname}（${deadSheriffSeat}号）死亡，需要移交警徽`,
      },
    });

    this.onPhaseChange('SHERIFF_TRANSFER', null, this.state.round);

    // 广播移交请求给所有客户端
    this.onGameEvent(this.state.roomCode, 'SHERIFF_TRANSFER_REQUEST', {
      deadSheriffSeat,
      deadSheriffNickname,
      availableTargets,
      timeout: this.state.config.voteTimeout,
    });

    // 保存回调，移交完成后执行
    this._afterSheriffTransfer = afterTransfer;

    // 设置移交超时
    if (this.state.config.voteTimeout > 0) {
      this.setTimer('sheriff_transfer', this.state.config.voteTimeout, () => {
        this.resolveSheriffTransferTimeout(deadSheriffSeat);
      });
    }
  }

  /** 移交完成后执行的回调 */
  private _afterSheriffTransfer: (() => void) | null = null;

  /** Bug 51 修复：保存死亡警长的座位号，用于移交广播 */
  private _deadSheriffSeat: number | null = null;

  /**
   * 提交警徽移交选择
   */
  submitSheriffTransfer(
    playerId: string,
    targetSeat: number,
  ): { success: boolean; error?: string } {
    if (this.state.phase !== 'SHERIFF_TRANSFER') {
      return { success: false, error: '当前不在警徽移交阶段' };
    }

    // 校验目标合法性
    const target = this.getPlayerBySeat(targetSeat);
    if (!target || target.status !== 'alive') {
      return { success: false, error: '移交目标不合法' };
    }
    if (target.isJudge) {
      return { success: false, error: '不能移交给法官' };
    }

    // 执行移交
    this.clearTimer('sheriff_transfer');
    this.executeSheriffTransfer(targetSeat, false);

    return { success: true };
  }

  /**
   * 警徽移交超时处理：自动移交给场上存活的最小序号玩家
   */
  private resolveSheriffTransferTimeout(deadSheriffSeat: number): void {
    const availableTargets = this.state.players
      .filter((p) => p.status === 'alive' && !p.isJudge)
      .map((p) => p.seatNumber)
      .sort((a, b) => a - b);

    if (availableTargets.length === 0) {
      // 没有存活玩家可移交，跳过移交
      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'SHERIFF_TRANSFER',
        targetSeat: null,
        targetNickname: null,
        detail: { message: '警徽移交超时，无存活玩家可移交', isTimeout: true },
      });
      this.finishSheriffTransfer();
      return;
    }

    // 移交给最小序号玩家
    const autoTarget = availableTargets[0];
    this.executeSheriffTransfer(autoTarget, true);
  }

  /**
   * 执行警徽移交
   */
  private executeSheriffTransfer(targetSeat: number, isTimeout: boolean): void {
    // 清除旧警长标记
    for (const p of this.state.players) {
      if (p.isSheriff) {
        p.isSheriff = false;
      }
    }

    // 设置新警长
    const newSheriff = this.getPlayerBySeat(targetSeat);
    if (newSheriff) {
      newSheriff.isSheriff = true;
    }

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'SHERIFF_TRANSFER',
      targetSeat,
      targetNickname: newSheriff?.nickname ?? null,
      detail: {
        toSeat: targetSeat,
        toNickname: newSheriff?.nickname ?? '',
        isTimeout,
        message: isTimeout
          ? `警徽移交超时，自动移交给 ${targetSeat}号 ${newSheriff?.nickname ?? ''}`
          : `警徽移交给 ${targetSeat}号 ${newSheriff?.nickname ?? ''}`,
      },
    });

    // 广播移交结果
    // Bug 51 修复：使用保存的死亡警长座位号，而非错误的查找逻辑
    this.onGameEvent(this.state.roomCode, 'SHERIFF_TRANSFER_RESULT', {
      fromSeat: this._deadSheriffSeat ?? 0,
      toSeat: targetSeat,
      toNickname: newSheriff?.nickname ?? '',
      isTimeout,
    });

    this.finishSheriffTransfer();
  }

  /**
   * 完成警徽移交，执行后续流程
   */
  private finishSheriffTransfer(): void {
    const afterTransfer = this._afterSheriffTransfer;
    this._afterSheriffTransfer = null;

    if (afterTransfer) {
      afterTransfer();
    }
  }

  /**
   * 检查是否有警长在死亡名单中
   * 返回死亡警长的座位号，如果没有则返回 null
   */
  private findDeadSheriffInNightDeaths(): number | null {
    for (const death of this.state.nightDeaths) {
      if (death.saved || death.overridden) continue;
      const player = this.getPlayerBySeat(death.seatNumber);
      if (player && player.isSheriff) {
        return death.seatNumber;
      }
    }
    return null;
  }

  /**
   * 检查白天出局的玩家是否为警长
   */
  private findDeadSheriffInDayDeaths(eliminated: number | null): number | null {
    if (eliminated === null) return null;
    const player = this.getPlayerBySeat(eliminated);
    if (player && player.isSheriff) {
      return eliminated;
    }
    return null;
  }

  /**
   * 跳过不可发言的玩家（已死亡/被禁言）
   */
  private skipUnavailableSpeakers(): void {
    while (this.state.currentSpeakerIndex < this.state.speechOrder.length) {
      const seatNumber = this.state.speechOrder[this.state.currentSpeakerIndex];
      const player = this.getPlayerBySeat(seatNumber);
      if (player && player.status === 'alive' && !player.isMuted) {
        break;
      }
      this.state.currentSpeakerIndex++;
    }
  }

  /**
   * 下一位发言者
   */
  nextSpeaker(): { success: boolean; error?: string; finished?: boolean } {
    if (this.state.phase !== 'DAY_SPEECH') {
      return { success: false, error: '当前不在发言阶段' };
    }

    // 清除当前发言者的超时定时器和倒计时广播
    this.clearTimer('speech');
    this.clearSpeechCountdownTimer();

    this.state.currentSpeakerIndex++;
    this.skipUnavailableSpeakers();

    if (this.state.currentSpeakerIndex >= this.state.speechOrder.length) {
      // 首日双轮发言：第一轮结束后进入第二轮
      if (this.state.round === 1 && this.state.config.firstDayDoubleSpeech && this.state.currentSpeechRound === 1) {
        this.enterSecondSpeechRound();
        return { success: true, finished: false };
      }
      // 所有玩家发言完毕，进入投票前等待阶段（骑士可发动技能）
      this.enterPreVoteWait();
      return { success: true, finished: true };
    }

    // 设置下一位发言者的超时
    if (this.state.config.speechTimeout > 0) {
      this.setSpeechTimer();
    }

    return { success: true, finished: false };
  }

  /**
   * 进入投票前等待阶段（Bug 4+6 修复）
   * 所有发言结束后，等待 preVoteWaitTime 秒再进入投票
   * 此阶段骑士可以发动决斗技能
   */
  private enterPreVoteWait(): void {
    this.state.phase = 'PRE_VOTE_WAIT';
    this.onPhaseChange('PRE_VOTE_WAIT', null, this.state.round);

    const waitTime = this.state.config.preVoteWaitTime || 10;

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'PHASE_CHANGE',
      targetSeat: null,
      targetNickname: null,
      detail: { phase: 'PRE_VOTE_WAIT', waitTime },
    });

    if (waitTime > 0) {
      this.setTimer('pre_vote_wait', waitTime, () => {
        this.enterDayVote();
      });
    }
  }

  /**
   * 进入白天投票阶段
   */
  private enterDayVote(): void {
    this.state.phase = 'DAY_VOTE';
    this.state.votes = {};

    this.onPhaseChange('DAY_VOTE', null, this.state.round);

    // 设置投票超时
    if (this.state.config.voteTimeout > 0) {
      this.setTimer('vote', this.state.config.voteTimeout, () => {
        this.resolveDayVote();
      });
    }
  }

  /**
   * 提交投票
   */
  submitVote(
    playerId: string,
    targetSeat: number | null,
  ): { success: boolean; error?: string } {
    const isPK = this.state.phase === 'PK_VOTE';
    if (this.state.phase !== 'DAY_VOTE' && !isPK) {
      return { success: false, error: '当前不在投票阶段' };
    }

    const player = this.getPlayerById(playerId);
    if (!player) return { success: false, error: '玩家不存在' };
    if (player.status !== 'alive') return { success: false, error: '你已死亡，无法投票' };
    if (player.isJudge) return { success: false, error: '法官不参与投票' };
    if (player.idiotRevealed) return { success: false, error: '白痴翻牌后失去投票权' };

    // 校验目标合法性
    if (targetSeat !== null) {
      const target = this.getPlayerBySeat(targetSeat);
      if (!target || target.status !== 'alive') {
        return { success: false, error: '投票目标不合法' };
      }
      if (targetSeat === player.seatNumber) {
        return { success: false, error: '不能投自己' };
      }
      // PK投票阶段：只能投给PK候选人
      if (isPK && !this.state.pkCandidates.includes(targetSeat)) {
        return { success: false, error: 'PK投票只能投给候选人' };
      }
    }

    this.state.votes[player.seatNumber] = targetSeat ?? -1; // -1 表示弃票

    this.logAction({
      actorSeat: player.seatNumber,
      actorNickname: player.nickname,
      actionType: 'VOTE_CAST',
      targetSeat,
      targetNickname: targetSeat ? this.getPlayerBySeat(targetSeat)?.nickname || null : null,
      detail: {
        isAbstain: targetSeat === null,
        isPK,
        voterSeat: player.seatNumber,
        targetSeat,
      },
    });

    // 检查是否所有存活玩家都已投票（白痴翻牌后无投票权，跳过）
    const aliveNonJudge = this.state.players.filter(
      (p) => p.status === 'alive' && !p.isJudge && !p.idiotRevealed,
    );
    const allVoted = aliveNonJudge.every((p) => this.state.votes[p.seatNumber] !== undefined);
    if (allVoted) {
      if (isPK) {
        this.clearTimer('pk_vote');
        this.resolvePKVote();
      } else {
        this.clearTimer('vote');
        this.resolveDayVote();
      }
    }

    return { success: true };
  }

  /**
   * 结算白天投票
   */
  private resolveDayVote(): void {
    const config = this.state.config;

    // 统计票数（警长按权重计票）
    const voteCount: Record<number, number> = {};
    for (const [voter, target] of Object.entries(this.state.votes)) {
      const targetSeat = Number(target);
      if (targetSeat > 0) {
        const voterPlayer = this.getPlayerBySeat(Number(voter));
        const weight = voterPlayer?.isSheriff ? this.state.config.sheriffVoteWeight : 1;
        voteCount[targetSeat] = (voteCount[targetSeat] || 0) + weight;
      }
    }

    // 找出最高票
    let maxVotes = 0;
    let candidates: number[] = [];
    for (const [seat, count] of Object.entries(voteCount)) {
      if (count > maxVotes) {
        maxVotes = count;
        candidates = [Number(seat)];
      } else if (count === maxVotes) {
        candidates.push(Number(seat));
      }
    }

    let eliminated: number | null = null;
    let isPK = false;

    if (candidates.length === 0) {
      // 全员弃票
      eliminated = null;
    } else if (candidates.length === 1) {
      eliminated = candidates[0];
    } else {
      // 平票处理
      switch (config.tieVoteResolution) {
        case 'SKIP':
          eliminated = null;
          break;
        case 'PK_VOTE':
          isPK = true;
          break;
        case 'RANDOM':
          eliminated = candidates[Math.floor(Math.random() * candidates.length)];
          break;
      }
    }

    if (isPK) {
      // 广播投票结果（平票进入PK）
      this.onVoteResult(
        this.state.roomCode,
        { ...this.state.votes },
        null, // 平票无人出局
        true, // isPK
        candidates,
      );

      // 进入PK投票
      this.state.phase = 'PK_VOTE';
      this.state.votes = {};
      this.state.pkCandidates = candidates;
      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'PK_VOTE_START',
        targetSeat: null,
        targetNickname: null,
        detail: { pkCandidates: candidates, voteCount },
      });
      this.onPhaseChange('PK_VOTE', null, this.state.round);

      // 设置PK投票超时
      if (this.state.config.voteTimeout > 0) {
        this.setTimer('pk_vote', this.state.config.voteTimeout, () => {
          this.resolvePKVote();
        });
      }

      return;
    }

    // 执行出局
    this.executeDaySettlement(eliminated, 'vote_out');
  }

  /**
   * 结算PK投票
   * PK投票仅限候选人，再次平票则无人出局
   */
  private resolvePKVote(): void {
    const pkCandidates = this.state.pkCandidates;

    // 统计票数（警长按权重计票）
    const voteCount: Record<number, number> = {};
    for (const [voter, target] of Object.entries(this.state.votes)) {
      const targetSeat = Number(target);
      if (targetSeat > 0 && pkCandidates.includes(targetSeat)) {
        const voterPlayer = this.getPlayerBySeat(Number(voter));
        const weight = voterPlayer?.isSheriff ? this.state.config.sheriffVoteWeight : 1;
        voteCount[targetSeat] = (voteCount[targetSeat] || 0) + weight;
      }
    }

    // 找出最高票
    let maxVotes = 0;
    let winners: number[] = [];
    for (const [seat, count] of Object.entries(voteCount)) {
      if (count > maxVotes) {
        maxVotes = count;
        winners = [Number(seat)];
      } else if (count === maxVotes) {
        winners.push(Number(seat));
      }
    }

    let eliminated: number | null = null;

    if (winners.length === 1) {
      eliminated = winners[0];
    }
    // PK再次平票，无人出局

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'VOTE_RESULT',
      targetSeat: eliminated,
      targetNickname: eliminated ? this.getPlayerBySeat(eliminated)?.nickname || null : null,
      detail: {
        voteDetails: this.state.votes,
        eliminated,
        isPK: true,
        voteCounts: voteCount,
      },
    });

    // 清除PK候选人
    this.state.pkCandidates = [];

    // 执行出局
    this.executeDaySettlement(eliminated, 'vote_out');
  }

  /**
   * 执行白天结算
   */
  private executeDaySettlement(eliminated: number | null, cause: DeathCause): void {
    this.state.phase = 'DAY_SETTLEMENT';
    const config = this.state.config;
    const dayDeaths: DayDeathRecord[] = [];

    if (eliminated !== null) {
      const player = this.getPlayerBySeat(eliminated);
      if (player) {
        player.status = 'dead';
        player.deathCause = cause;
        player.deathRound = this.state.round;

        dayDeaths.push({
          seatNumber: eliminated,
          cause,
          triggeredBy: null,
          triggersChain: false,
          overridden: false,
          overrideReason: null,
        });

        // ---- 白痴翻牌免死 ----
        if (player.role === 'idiot' && cause === 'vote_out' && !player.idiotRevealed) {
          player.status = 'alive';
          player.deathCause = null;
          player.deathRound = null;
          player.idiotRevealed = true;
          // 白痴翻牌免死，从死亡记录中移除
          dayDeaths.length = 0;
          this.onGameEvent(this.state.roomCode, 'IDIOT_REVEAL', {
            seatNumber: player.seatNumber,
            nickname: player.nickname,
          });
          this.logAction({
            actorSeat: player.seatNumber,
            actorNickname: player.nickname,
            actionType: 'IDIOT_REVEAL',
            targetSeat: null,
            targetNickname: null,
            detail: { message: '白痴翻牌免死' },
          });
        }

        // ---- 猎人开枪 ----
        if (player.role === 'hunter' && !player.hunterGunFired) {
          // 毒封技能检查：如果被毒死且 poisonBlockGun 为 true，不能开枪
          const isPoisoned = player.deathCause === 'witch_poison';
          if (!(isPoisoned && config.poisonBlockGun)) {
            // 通知客户端猎人可以开枪
            this.onGameEvent(this.state.roomCode, 'HUNTER_CAN_SHOOT', {
              seatNumber: player.seatNumber,
              nickname: player.nickname,
            });
          }
        }

        // ---- 狼王开枪 ----
        if (player.role === 'wolf_king' && !player.wolfKingGunFired && cause !== 'white_wolf_explode') {
          // 狼王被票出或被杀时可开枪（非自爆）
          const isPoisoned = player.deathCause === 'witch_poison';
          if (!(isPoisoned && config.poisonBlockGun)) {
            // 通知客户端狼王可以开枪
            this.onGameEvent(this.state.roomCode, 'WOLF_KING_CAN_SHOOT', {
              seatNumber: player.seatNumber,
              nickname: player.nickname,
            });
          }
        }

        // ---- 规则5：被票出时身份揭示 ----
        if (cause === 'vote_out' && config.revealIdentityOnDayVote !== 'NONE') {
          let revealInfo: string;
          if (config.revealIdentityOnDayVote === 'FACTION') {
            revealInfo = isEvilRole(player.role) ? 'evil' : 'good';
          } else {
            // 'ROLE'
            revealInfo = ROLE_META[player.role].name;
          }
          this.logAction({
            actorSeat: 0,
            actorNickname: '系统',
            actionType: 'DAY_VOTE_IDENTITY_REVEAL',
            targetSeat: eliminated,
            targetNickname: player.nickname,
            detail: {
              revealType: config.revealIdentityOnDayVote,
              revealInfo,
            },
          });
        }
      }
    }

    this.state.dayDeaths = dayDeaths;

    // 广播投票结果给客户端
    // 白痴翻牌免死时，eliminated 应为 null（无人实际出局）
    const actualEliminated = dayDeaths.length > 0 ? eliminated : null;
    this.onVoteResult(
      this.state.roomCode,
      { ...this.state.votes },
      actualEliminated,
      false,
      [],
    );

    // 规则5：被票出时身份揭示广播
    if (eliminated !== null && cause === 'vote_out' && this.state.config.revealIdentityOnDayVote !== 'NONE') {
      const eliminatedPlayer = this.getPlayerBySeat(eliminated);
      if (eliminatedPlayer) {
        let revealInfo: string;
        if (this.state.config.revealIdentityOnDayVote === 'FACTION') {
          revealInfo = isEvilRole(eliminatedPlayer.role) ? 'evil' : 'good';
        } else {
          revealInfo = ROLE_META[eliminatedPlayer.role].name;
        }
        this.onIdentityReveal(
          this.state.roomCode,
          eliminated,
          eliminatedPlayer.nickname,
          this.state.config.revealIdentityOnDayVote,
          revealInfo,
        );
      }
    }

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'VOTE_RESULT',
      targetSeat: eliminated,
      targetNickname: eliminated ? this.getPlayerBySeat(eliminated)?.nickname || null : null,
      detail: {
        voteDetails: this.state.votes,
        eliminated,
        isPK: cause === 'vote_out' && this.state.pkCandidates.length > 0,
        voteCounts: Object.values(this.state.votes).reduce<Record<number, number>>((acc, target) => {
          const t = Number(target);
          if (t > 0) {
            acc[t] = (acc[t] || 0) + 1;
          }
          return acc;
        }, {}),
        dayDeaths: dayDeaths.map((d) => ({ seat: d.seatNumber, cause: d.cause })),
      },
    });

    // 检查胜负
    const winner = this.checkWinCondition();
    if (winner) {
      this.endGame(winner);
      return;
    }

    this.onPhaseChange('DAY_SETTLEMENT', null, this.state.round);

    // 检查白天出局者是否为警长
    const dayDeadSheriff = this.findDeadSheriffInDayDeaths(actualEliminated);

    // 所有模式：进入入夜前等待阶段（给予技能发动时间）
    this.state.phase = 'PRE_NIGHT';
    this.onPhaseChange('PRE_NIGHT', null, this.state.round);
    // 使用可配置的技能发动等待时间，而非固定5秒
    const preNightWait = this.state.config.skillActivationTimeout || 15;
    this.setTimer('pre_night', preNightWait, () => {
      if (dayDeadSheriff !== null) {
        // 警长白天死亡，先进行警徽移交再入夜
        this.enterSheriffTransfer(dayDeadSheriff, () => {
          this.state.round++;
          this.enterNightPhase();
        });
      } else {
        this.state.round++;
        this.enterNightPhase();
      }
    });
  }

  // ==========================================================================
  // 第六部分：白天中断连锁结算 (Day Interrupt & Chain Settlement)
  // ==========================================================================

  /**
   * 处理骑士决斗
   *
   * 可中断 DAY_SPEECH 阶段
   * 决斗结果：
   *   - 目标为狼人：狼人死亡，根据 daytimeKillSequence 决定是否立即触发亡语
   *     - 如果目标是狼王且 knightDuelWolfKing === 'CAN_SHOOT'，狼王可开枪
   *     - 如果目标是白狼王，白狼王绝对无法自爆
   *     - 决斗出狼后强制入夜
   *   - 目标为好人：
   *     - knightDuelSuicide === 'SUICIDE'：骑士自尽
   *     - knightDuelSuicide === 'REVEAL_ONLY'：仅暴露身份，继续白天流程
   */
  handleKnightDuel(
    knightPlayerId: string,
    targetSeat: number,
  ): { success: boolean; error?: string; result?: { targetIsWolf: boolean; knightDied: boolean; forceNight: boolean; revealedRole?: RoleId } } {
    // ---- 校验 ----
    // 规则六：骑士决斗只能在白天发言阶段或投票前等待阶段发动
    if (!['DAY_SPEECH', 'PRE_VOTE_WAIT'].includes(this.state.phase)) {
      return { success: false, error: '决斗只能在白天发言阶段或投票前等待阶段发动' };
    }

    const knight = this.getPlayerById(knightPlayerId);
    if (!knight) return { success: false, error: '玩家不存在' };
    if (knight.role !== 'knight') return { success: false, error: '你不是骑士' };
    if (knight.status !== 'alive') return { success: false, error: '你已死亡' };

    const target = this.getPlayerBySeat(targetSeat);
    if (!target || target.status !== 'alive') return { success: false, error: '目标不合法' };

    const config = this.state.config;

    // ---- 记录中断前的阶段，用于决斗失败后恢复 ----
    const interruptedPhase = this.state.phase;

    // ---- 中断当前白天流程 ----
    this.interruptDayPhase();

    // ---- 判定决斗结果 ----
    // 规则三：隐狼已行动视为狼人，未行动视为好人
    let targetIsWolf: boolean;
    if (isHiddenWolf(target.role)) {
      targetIsWolf = target.hiddenWolfHasActed;
    } else if (target.role === 'mechanical_wolf') {
      // 规则四：机械狼根据模仿状态判定
      targetIsWolf = this.isMechanicalWolfRevealed(target);
    } else {
      targetIsWolf = isEvilRole(target.role);
    }
    let knightDied = false;
    let forceNight = false;

    if (targetIsWolf) {
      // 目标是狼人，狼人死亡
      target.status = 'dead';
      target.deathCause = 'knight_duel';
      target.deathRound = this.state.round;

      // 白狼王被决斗时绝对无法自爆
      // 狼王被决斗时根据 knightDuelWolfKing 规则
      if (target.role === 'wolf_king' && config.knightDuelWolfKing === 'CAN_SHOOT') {
        // 狼王可开枪（由客户端提交目标）
        // 此处不自动开枪，等待狼王玩家或法官操作
      }
      // knightDuelWolfKing === 'SILENCED' 时，狼王不可开枪

      // 决斗出狼后强制入夜
      forceNight = true;

      // 根据 daytimeKillSequence 决定亡语结算时机
      if (config.daytimeKillSequence === 'TRIGGER_ALL') {
        // 立即结算所有亡语
        this.resolveDeathChain(target);
      }
      // TRIGGER_DEFERRED: 延期至入夜前统一结算
    } else {
      // 目标是好人
      if (config.knightDuelSuicide === 'SUICIDE') {
        knight.status = 'dead';
        knight.deathCause = 'knight_suicide';
        knight.deathRound = this.state.round;
        knightDied = true;
      }
      // REVEAL_ONLY: 仅暴露身份，继续白天流程
    }

    // ---- 记录日志 ----
    this.logAction({
      actorSeat: knight.seatNumber,
      actorNickname: knight.nickname,
      actionType: 'KNIGHT_DUEL',
      targetSeat,
      targetNickname: target.nickname,
      detail: {
        targetIsWolf,
        targetRole: target.role,
        knightDied,
        forceNight,
        knightDuelWolfKing: config.knightDuelWolfKing,
        knightDuelSuicide: config.knightDuelSuicide,
      },
    });

    // ---- 检查胜负 ----
    const winner = this.checkWinCondition();
    if (winner) {
      this.endGame(winner);
      return { success: true, result: { targetIsWolf, knightDied, forceNight, revealedRole: isHiddenWolf(target.role) ? target.role as RoleId : undefined } };
    }

    // ---- 流程跳转 ----
    if (forceNight) {
      // 决斗出狼，强制入夜
      if (config.daytimeKillSequence === 'TRIGGER_DEFERRED') {
        this.resolveDeferredDeathChain();
      }
      this.state.round++;
      this.enterNightPhase();
    } else {
      // Bug 53 说明：继续白天流程（恢复到中断前的阶段）
      // interruptDayPhase() 将 phase 设为 DAY_INTERRUPT 并清除定时器
      // 这里恢复到原阶段并重新设置定时器，中断状态已完全清理
      this.state.phase = interruptedPhase;
      this.onPhaseChange(interruptedPhase, null, this.state.round);

      // 恢复发言阶段的定时器
      if (interruptedPhase === 'DAY_SPEECH' && this.state.config.speechTimeout > 0) {
        this.setSpeechTimer();
      }
    }

    return { success: true, result: { targetIsWolf, knightDied, forceNight, revealedRole: isHiddenWolf(target.role) ? target.role as RoleId : undefined } };
  }

  /**
   * 处理白狼王自爆
   *
   * 可中断 DAY_SPEECH / DAY_VOTE 阶段
   * 自爆后带走一人并强制入夜
   * 注：白狼王被骑士决斗时绝对无法自爆（在 handleKnightDuel 中已保证）
   */
  handleWhiteWolfExplode(
    wolfPlayerId: string,
    targetSeat: number,
  ): { success: boolean; error?: string } {
    // ---- 校验 ----
    if (!['DAY_SPEECH', 'PRE_VOTE_WAIT', 'DAY_VOTE'].includes(this.state.phase)) {
      return { success: false, error: '自爆只能在白天阶段发动' };
    }

    const wolf = this.getPlayerById(wolfPlayerId);
    if (!wolf) return { success: false, error: '玩家不存在' };
    if (wolf.role !== 'white_wolf_king') return { success: false, error: '你不是白狼王' };
    if (wolf.status !== 'alive') return { success: false, error: '你已死亡' };

    const target = this.getPlayerBySeat(targetSeat);
    if (!target || target.status !== 'alive') return { success: false, error: '目标不合法' };

    const config = this.state.config;

    // 中断当前白天流程
    this.interruptDayPhase();

    // 白狼王死亡
    wolf.status = 'dead';
    wolf.deathCause = 'white_wolf_explode';
    wolf.deathRound = this.state.round;
    wolf.wolfKingGunFired = true; // 白狼王自爆不能开枪

    // 目标死亡
    target.status = 'dead';
    target.deathCause = 'white_wolf_explode';
    target.deathRound = this.state.round;

    // 记录白天死亡
    this.state.dayDeaths.push({
      seatNumber: wolf.seatNumber,
      cause: 'white_wolf_explode',
      triggeredBy: null,
      triggersChain: false,
      overridden: false,
      overrideReason: null,
    });
    this.state.dayDeaths.push({
      seatNumber: target.seatNumber,
      cause: 'white_wolf_explode',
      triggeredBy: wolf.seatNumber,
      triggersChain: false,
      overridden: false,
      overrideReason: null,
    });

    // 白狼王死亡亡语结算（自爆不触发毒封检查，因为 deathCause 为 white_wolf_explode）
    this.resolveDeathChain(wolf);

    // 记录日志
    this.logAction({
      actorSeat: wolf.seatNumber,
      actorNickname: wolf.nickname,
      actionType: 'WHITE_WOLF_EXPLODE',
      targetSeat,
      targetNickname: target.nickname,
      detail: {
        wolfRole: wolf.role,
        targetRole: target.role,
        forceNight: true,
      },
    });

    // 检查胜负
    const winner = this.checkWinCondition();
    if (winner) {
      this.endGame(winner);
      return { success: true };
    }

    // 强制入夜
    if (config.daytimeKillSequence === 'TRIGGER_DEFERRED') {
      this.resolveDeferredDeathChain();
    }
    this.state.round++;
    this.enterNightPhase();

    return { success: true };
  }

  /**
   * 中断当前白天阶段
   * 清除所有定时器，进入 DAY_INTERRUPT 子阶段
   */
  private interruptDayPhase(): void {
    this.clearAllTimers();
    const fromPhase = this.state.phase;
    this.state.phase = 'DAY_INTERRUPT';

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'PHASE_CHANGE',
      targetSeat: null,
      targetNickname: null,
      detail: {
        fromPhase,
        toPhase: 'DAY_INTERRUPT',
        reason: '白天流程被中断',
      },
    });

    this.onPhaseChange('DAY_INTERRUPT', null, this.state.round);
  }

  /**
   * 结算死亡连锁（亡语触发）
   *
   * 当 daytimeKillSequence === 'TRIGGER_ALL' 时，每个死亡事件立即触发其亡语：
   * - 猎人死亡 → 可开枪带走一人
   * - 狼王死亡 → 可开枪带走一人
   *
   * 注意：此方法不自动执行亡语，而是标记可触发状态，
   * 实际操作由玩家或法官通过 triggerHunterGun/triggerWolfKingGun 提交
   */
  private resolveDeathChain(deadPlayer: Player): void {
    // 标记亡语可触发状态
    // 实际的亡语执行由客户端提交目标后处理
    // 此处仅做日志记录
    if (deadPlayer.role === 'hunter' || (deadPlayer.role === 'mechanical_wolf' && deadPlayer.mechanicalWolfImitatedRole === 'hunter')) {
      if (!deadPlayer.hunterGunFired) {
        const isPoisoned = deadPlayer.deathCause === 'witch_poison';
        if (!(isPoisoned && this.state.config.poisonBlockGun)) {
          this.logAction({
            actorSeat: deadPlayer.seatNumber,
            actorNickname: deadPlayer.nickname,
            actionType: 'HUNTER_GUN',
            targetSeat: null,
            targetNickname: null,
            detail: { message: '猎人可开枪（等待目标选择）' },
          });
        }
      }
    }

    if (deadPlayer.role === 'wolf_king' || (deadPlayer.role === 'mechanical_wolf' && deadPlayer.mechanicalWolfImitatedRole === 'wolf_king')) {
      if (!deadPlayer.wolfKingGunFired) {
        const isPoisoned = deadPlayer.deathCause === 'witch_poison';
        if (!(isPoisoned && this.state.config.poisonBlockGun)) {
          this.logAction({
            actorSeat: deadPlayer.seatNumber,
            actorNickname: deadPlayer.nickname,
            actionType: 'WOLF_KING_GUN',
            targetSeat: null,
            targetNickname: null,
            detail: { message: '狼王可开枪（等待目标选择）' },
          });
        }
      }
    }
  }

  /**
   * 结算延期的死亡连锁
   * 当 daytimeKillSequence === 'TRIGGER_DEFERRED' 时，
   * 所有亡语在入夜前统一结算
   */
  private resolveDeferredDeathChain(): void {
    // 收集所有待结算的亡语
    const pendingChains = this.state.dayDeaths.filter((d) => d.triggersChain);
    for (const chain of pendingChains) {
      const player = this.getPlayerBySeat(chain.seatNumber);
      if (player) {
        this.resolveDeathChain(player);
      }
    }
  }

  /**
   * 触发猎人开枪
   */
  triggerHunterGun(
    hunterPlayerId: string,
    targetSeat: number,
  ): { success: boolean; error?: string } {
    const hunter = this.getPlayerById(hunterPlayerId);
    if (!hunter) return { success: false, error: '玩家不存在' };
    if (hunter.role !== 'hunter') return { success: false, error: '你不是猎人' };
    if (hunter.hunterGunFired) return { success: false, error: '你已经开过枪了' };
    if (hunter.status !== 'dead') return { success: false, error: '你还没有死亡' };

    // 毒封检查
    if (this.state.config.poisonBlockGun && hunter.deathCause === 'witch_poison') {
      return { success: false, error: '你被毒死，无法开枪' };
    }

    const target = this.getPlayerBySeat(targetSeat);
    if (!target || target.status !== 'alive') return { success: false, error: '目标不合法' };

    hunter.hunterGunFired = true;
    target.status = 'dead';
    target.deathCause = 'hunter_gun';
    target.deathRound = this.state.round;

    this.logAction({
      actorSeat: hunter.seatNumber,
      actorNickname: hunter.nickname,
      actionType: 'HUNTER_GUN',
      targetSeat,
      targetNickname: target.nickname,
      detail: {},
    });

    // 连锁触发：如果猎人打死的是狼王，狼王也可以开枪
    if (target.role === 'wolf_king' && !target.wolfKingGunFired) {
      this.onGameEvent(this.state.roomCode, 'WOLF_KING_CAN_SHOOT', {
        seatNumber: target.seatNumber,
        nickname: target.nickname,
      });
    }

    // 广播死亡事件给所有客户端
    this.onGameEvent(this.state.roomCode, 'PLAYER_KILLED_BY_GUN', {
      seatNumber: target.seatNumber,
      nickname: target.nickname,
      killedBy: hunter.seatNumber,
      killedByNickname: hunter.nickname,
      cause: 'hunter_gun',
    });

    // 检查胜负
    const winner = this.checkWinCondition();
    if (winner) {
      this.endGame(winner);
    }

    return { success: true };
  }

  /**
   * 触发狼王开枪
   */
  triggerWolfKingGun(
    wolfKingPlayerId: string,
    targetSeat: number,
  ): { success: boolean; error?: string } {
    const wolfKing = this.getPlayerById(wolfKingPlayerId);
    if (!wolfKing) return { success: false, error: '玩家不存在' };
    if (wolfKing.role !== 'wolf_king') return { success: false, error: '你不是狼王' };
    if (wolfKing.wolfKingGunFired) return { success: false, error: '你已经开过枪了' };
    if (wolfKing.status !== 'dead') return { success: false, error: '你还没有死亡' };

    // 毒封检查
    if (this.state.config.poisonBlockGun && wolfKing.deathCause === 'witch_poison') {
      return { success: false, error: '你被毒死，无法开枪' };
    }

    const target = this.getPlayerBySeat(targetSeat);
    if (!target || target.status !== 'alive') return { success: false, error: '目标不合法' };

    wolfKing.wolfKingGunFired = true;
    target.status = 'dead';
    target.deathCause = 'wolf_king_gun';
    target.deathRound = this.state.round;

    this.logAction({
      actorSeat: wolfKing.seatNumber,
      actorNickname: wolfKing.nickname,
      actionType: 'WOLF_KING_GUN',
      targetSeat,
      targetNickname: target.nickname,
      detail: {},
    });

    // 连锁触发：如果狼王打死的是猎人，猎人也可以开枪
    if (target.role === 'hunter' && !target.hunterGunFired) {
      this.onGameEvent(this.state.roomCode, 'HUNTER_CAN_SHOOT', {
        seatNumber: target.seatNumber,
        nickname: target.nickname,
      });
    }

    // 广播死亡事件给所有客户端
    this.onGameEvent(this.state.roomCode, 'PLAYER_KILLED_BY_GUN', {
      seatNumber: target.seatNumber,
      nickname: target.nickname,
      killedBy: wolfKing.seatNumber,
      killedByNickname: wolfKing.nickname,
      cause: 'wolf_king_gun',
    });

    // 检查胜负
    const winner = this.checkWinCondition();
    if (winner) {
      this.endGame(winner);
    }

    return { success: true };
  }

  // ==========================================================================
  // 第七部分：法官覆盖接口 (Judge Override APIs)
  // ==========================================================================

  /**
   * 判断当前是否为夜间阶段
   */
  isNightPhase(): boolean {
    return this.state.phase === 'NIGHT' || this.state.phase === 'NIGHT_SETTLEMENT';
  }

  /**
   * 法官夜间权限守卫
   * 在夜晚阶段，法官禁止执行写操作
   */
  private guardNightJudgeOperation(callerRole: string): { allowed: boolean; error?: string } {
    if (this.isNightPhase() && callerRole === 'JUDGE') {
      return { allowed: false, error: '法官在夜晚阶段无法执行此操作' };
    }
    return { allowed: true };
  }

  /**
   * 法官强制修改结算结果
   *
   * 最高裁决权：法官可强行改判任何玩家的生死状态
   * 所有改判操作都会被记录在 ActionLog 中（overridden: true）
   *
   * @param judgeId - 法官玩家 ID
   * @param targetSeat - 目标座位号
   * @param newStatus - 新状态
   * @param reason - 改判原因
   */
  overrideSettlement(
    judgeId: string,
    targetSeat: number,
    newStatus: PlayerStatus,
    reason: string,
  ): { success: boolean; error?: string } {
    // 校验法官身份
    const judge = this.getPlayerById(judgeId);
    if (!judge || !judge.isJudge) {
      return { success: false, error: '只有法官可以执行此操作' };
    }

    // 夜间权限守卫
    const guard = this.guardNightJudgeOperation('JUDGE');
    if (!guard.allowed) return { success: false, error: guard.error };

    const target = this.getPlayerBySeat(targetSeat);
    if (!target) return { success: false, error: '目标玩家不存在' };

    const oldStatus = target.status;
    target.status = newStatus;

    if (newStatus === 'dead' && oldStatus === 'alive') {
      target.deathCause = 'judge_override';
      target.deathRound = this.state.round;
    } else if (newStatus === 'alive' && oldStatus !== 'alive') {
      target.deathCause = null;
      target.deathRound = null;
    }

    // 标记相关死亡记录为被改判
    for (const death of this.state.nightDeaths) {
      if (death.seatNumber === targetSeat) {
        death.overridden = true;
        death.overrideReason = reason;
      }
    }
    for (const death of this.state.dayDeaths) {
      if (death.seatNumber === targetSeat) {
        death.overridden = true;
        death.overrideReason = reason;
      }
    }

    this.logAction({
      actorSeat: judge.seatNumber,
      actorNickname: judge.nickname,
      actionType: 'JUDGE_OVERRIDE_SETTLEMENT',
      targetSeat,
      targetNickname: target.nickname,
      detail: {
        oldStatus,
        newStatus,
        reason,
      },
      overridden: true,
      overrideReason: reason,
    });

    this.onJudgeWarning(
      'OVERRIDE_APPLIED',
      `法官改判：${target.nickname} 的状态从 ${oldStatus} 改为 ${newStatus}`,
      { targetSeat, oldStatus, newStatus, reason },
    );

    // 改判后重新检查胜负
    const winner = this.checkWinCondition();
    if (winner) {
      this.endGame(winner);
    }

    return { success: true };
  }

  /**
   * 法官实时修改夜间行动顺序（下一晚生效）
   *
   * @param judgeId - 法官玩家 ID
   * @param newOrder - 新的夜间行动顺序
   */
  overrideNightOrder(
    judgeId: string,
    newOrder: RoleId[],
  ): { success: boolean; error?: string; warnings?: string[] } {
    const judge = this.getPlayerById(judgeId);
    if (!judge || !judge.isJudge) {
      return { success: false, error: '只有法官可以执行此操作' };
    }

    // 夜间权限守卫
    const guard = this.guardNightJudgeOperation('JUDGE');
    if (!guard.allowed) return { success: false, error: guard.error };

    // 校验新顺序的合法性
    const validRoles = new Set([
      'villager', 'seer', 'witch', 'hunter', 'guard', 'idiot', 'knight',
      'werewolf', 'white_wolf_king', 'wolf_king', 'nightmare_shadow',
      'hidden_wolf', 'mechanical_wolf',
    ]);
    if (!newOrder.every((r) => validRoles.has(r))) {
      return { success: false, error: '夜间行动顺序包含非法角色ID' };
    }

    // 规则1：噩梦之影不能排在最后
    if (newOrder[newOrder.length - 1] === 'nightmare_shadow') {
      return { success: false, error: '噩梦之影不能排在最后一个位置' };
    }

    const warnings: string[] = [];

    // 更新配置（下一晚生效）
    this.state.config.nightActionOrder = newOrder;
    this.state.config.nightActionOrderPreset = 'chaos';

    this.logAction({
      actorSeat: judge.seatNumber,
      actorNickname: judge.nickname,
      actionType: 'JUDGE_MODIFY_NIGHT_ORDER',
      targetSeat: null,
      targetNickname: null,
      detail: {
        newOrder,
        warnings,
      },
    });

    this.onJudgeWarning(
      'NIGHT_ORDER_CHANGED',
      `法官修改了夜间行动顺序，下一晚生效`,
      { newOrder, warnings },
    );

    return { success: true, warnings };
  }

  /**
   * 法官强制进入下一阶段
   */
  forceNextPhase(judgeId: string): { success: boolean; error?: string } {
    const judge = this.getPlayerById(judgeId);
    if (!judge || !judge.isJudge) {
      return { success: false, error: '只有法官可以执行此操作' };
    }

    // 夜间权限守卫
    const guard = this.guardNightJudgeOperation('JUDGE');
    if (!guard.allowed) return { success: false, error: guard.error };

    this.clearAllTimers();

    const currentPhase = this.state.phase;

    this.logAction({
      actorSeat: judge.seatNumber,
      actorNickname: judge.nickname,
      actionType: 'JUDGE_FORCE_NEXT_PHASE',
      targetSeat: null,
      targetNickname: null,
      detail: { fromPhase: currentPhase },
    });

    // 根据当前阶段决定下一阶段
    switch (currentPhase) {
      case 'LOBBY':
        this.startGame();
        break;
      case 'ROLE_REVEAL':
        this.clearTimer('role_reveal');
        this.enterNightPhase();
        break;
      case 'PRE_NIGHT':
        this.clearTimer('pre_night');
        this.state.round++;
        this.enterNightPhase();
        break;
      case 'NIGHT':
        // 强制完成当前夜间子阶段，推进到下一个
        if (this.state.nightSubPhase) {
          const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
          this.advanceNightSubPhase(nextIndex);
        } else {
          this.enterNightSettlement();
        }
        break;
      case 'NIGHT_SETTLEMENT':
        this.enterDayAnnounce();
        break;
      case 'DAY_ANNOUNCE':
        this.clearTimer('day_announce');
        {
          const deadSheriff = this.findDeadSheriffInNightDeaths();
          if (deadSheriff !== null) {
            this.enterSheriffTransfer(deadSheriff, () => {
              if (this.state.round === 1 && this.state.config.sheriffElectionEnabled) {
                this.enterSheriffElection();
              } else {
                this.enterDaySpeech();
              }
            });
          } else if (this.state.round === 1 && this.state.config.sheriffElectionEnabled) {
            this.enterSheriffElection();
          } else {
            this.enterDaySpeech();
          }
        }
        break;
      case 'DAY_SPEECH':
        // 发言阶段：强制推进到下一位发言者，而非直接跳到投票
        this.nextSpeaker();
        break;
      case 'PRE_VOTE_WAIT':
        // 投票前等待：跳过等待直接进入投票
        this.clearTimer('pre_vote_wait');
        this.enterDayVote();
        break;
      case 'DAY_VOTE':
        this.resolveDayVote();
        break;
      case 'SHERIFF_ELECTION':
        this.clearTimer('sheriff_election');
        this.resolveSheriffElection();
        break;
      case 'SHERIFF_TRANSFER':
        this.clearTimer('sheriff_transfer');
        // 超时自动移交给最小序号
        {
          const availableTargets = this.state.players
            .filter((p) => p.status === 'alive' && !p.isJudge)
            .map((p) => p.seatNumber)
            .sort((a, b) => a - b);
          if (availableTargets.length > 0) {
            this.executeSheriffTransfer(availableTargets[0], true);
          } else {
            this.finishSheriffTransfer();
          }
        }
        break;
      case 'DAY_SETTLEMENT':
        this.state.round++;
        this.enterNightPhase();
        break;
      case 'DAY_INTERRUPT':
        // 中断后继续白天流程
        this.state.phase = 'DAY_SPEECH';
        this.onPhaseChange('DAY_SPEECH', null, this.state.round);
        break;
      case 'PK_VOTE':
        this.clearTimer('pk_vote');
        this.resolvePKVote();
        break;
      case 'GAME_OVER':
        return { success: false, error: '游戏已结束' };
    }

    return { success: true };
  }

  /**
   * 法官暂停游戏
   */
  pauseGame(judgeId: string): { success: boolean; error?: string; isPaused?: boolean } {
    const judge = this.getPlayerById(judgeId);
    if (!judge || !judge.isJudge) {
      return { success: false, error: '只有法官可以执行此操作' };
    }

    const guard = this.guardNightJudgeOperation('JUDGE');
    if (!guard.allowed) return { success: false, error: guard.error };

    if (this.state.isPaused) {
      return { success: true, isPaused: true };
    }

    this.state.isPaused = true;
    this.pausedPhaseRemainingTime = null;
    this.pausedPhaseTimerName = null;
    this.pausedPhaseTimerCallback = null;
    const currentPhaseTimerName = this.getCurrentPhaseTimerName();
    if (currentPhaseTimerName) {
      const deadline = this.timerDeadlines.get(currentPhaseTimerName);
      const callback = this.timerCallbacks.get(currentPhaseTimerName);
      if (deadline && callback) {
        this.pausedPhaseRemainingTime = Math.max(1, deadline - Date.now());
        this.pausedPhaseTimerName = currentPhaseTimerName;
        this.pausedPhaseTimerCallback = callback;
      }
    }
    this.clearAllTimers();

    this.logAction({
      actorSeat: judge.seatNumber,
      actorNickname: judge.nickname,
      actionType: 'JUDGE_PAUSE',
      targetSeat: null,
      targetNickname: null,
      detail: {},
    });

    return { success: true, isPaused: true };
  }

  /**
   * 法官恢复游戏
   */
  resumeGame(judgeId: string): { success: boolean; error?: string; isPaused?: boolean } {
    const judge = this.getPlayerById(judgeId);
    if (!judge || !judge.isJudge) {
      return { success: false, error: '只有法官可以执行此操作' };
    }

    const guard = this.guardNightJudgeOperation('JUDGE');
    if (!guard.allowed) return { success: false, error: guard.error };

    if (!this.state.isPaused) {
      return { success: true, isPaused: false };
    }

    this.state.isPaused = false;
    if (this.pausedPhaseRemainingTime !== null && this.pausedPhaseTimerName && this.pausedPhaseTimerCallback) {
      const remainingMs = this.pausedPhaseRemainingTime;
      const timerName = this.pausedPhaseTimerName;
      const callback = this.pausedPhaseTimerCallback;
      this.timerDeadlines.set(timerName, Date.now() + remainingMs);
      this.timerCallbacks.set(timerName, callback);
      this.timers.set(timerName, setTimeout(callback, remainingMs));
      if (this.state.phase === 'NIGHT') {
        this.nightActionStartTime = Date.now();
      }

      // 恢复倒计时广播
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      if (this.state.phase === 'NIGHT' && this.state.nightSubPhase?.currentRole) {
        // 夜晚阶段：恢复夜间倒计时广播
        this.startNightCountdownBroadcast(this.state.nightSubPhase.currentRole, remainingSeconds);
      } else if (this.state.phase === 'DAY_SPEECH' && this.state.speechOrder.length > 0) {
        // 发言阶段：恢复发言倒计时广播
        const currentSpeakerSeat = this.state.speechOrder[this.state.currentSpeakerIndex] ?? 0;
        this.startSpeechCountdownBroadcast(currentSpeakerSeat, remainingSeconds);
      }
    }
    this.pausedPhaseRemainingTime = null;
    this.pausedPhaseTimerName = null;
    this.pausedPhaseTimerCallback = null;

    this.logAction({
      actorSeat: judge.seatNumber,
      actorNickname: judge.nickname,
      actionType: 'JUDGE_RESUME',
      targetSeat: null,
      targetNickname: null,
      detail: {},
    });

    return { success: true, isPaused: false };
  }

  /**
   * 法官暂停/恢复游戏（兼容旧接口，按当前状态自动判断）
   * @deprecated 请使用 pauseGame / resumeGame
   */
  togglePause(judgeId: string): { success: boolean; error?: string; isPaused?: boolean } {
    const judge = this.getPlayerById(judgeId);
    if (!judge || !judge.isJudge) {
      return { success: false, error: '只有法官可以执行此操作' };
    }

    const guard = this.guardNightJudgeOperation('JUDGE');
    if (!guard.allowed) return { success: false, error: guard.error };

    if (this.state.isPaused) {
      return this.resumeGame(judgeId);
    } else {
      return this.pauseGame(judgeId);
    }
  }

  /**
   * 法官修改发言顺序
   */
  modifySpeechOrder(
    judgeId: string,
    order: number[],
  ): { success: boolean; error?: string } {
    const judge = this.getPlayerById(judgeId);
    if (!judge || !judge.isJudge) {
      return { success: false, error: '只有法官可以执行此操作' };
    }

    // 校验顺序合法性
    const aliveSeats = this.state.players
      .filter((p) => p.status === 'alive' && !p.isJudge)
      .map((p) => p.seatNumber)
      .sort();

    const orderSorted = [...order].sort();
    if (JSON.stringify(aliveSeats) !== JSON.stringify(orderSorted)) {
      return { success: false, error: '发言顺序必须包含所有存活玩家' };
    }

    this.state.speechOrder = order;
    this.state.config.speechOrderStrategy = 'JUDGE_CUSTOM';

    this.logAction({
      actorSeat: judge.seatNumber,
      actorNickname: judge.nickname,
      actionType: 'JUDGE_MODIFY_SPEECH_ORDER',
      targetSeat: null,
      targetNickname: null,
      detail: { newOrder: order },
    });

    return { success: true };
  }

  /**
   * 法官跳过某玩家发言
   */
  skipPlayerSpeech(
    judgeId: string,
    seatNumber: number,
  ): { success: boolean; error?: string } {
    const judge = this.getPlayerById(judgeId);
    if (!judge || !judge.isJudge) {
      return { success: false, error: '只有法官可以执行此操作' };
    }

    if (this.state.phase !== 'DAY_SPEECH') {
      return { success: false, error: '当前不在发言阶段' };
    }

    // 校验：只能跳过当前发言者
    const currentSpeakerSeat = this.state.speechOrder[this.state.currentSpeakerIndex] ?? null;
    if (currentSpeakerSeat === null) {
      return { success: false, error: '发言顺序为空' };
    }
    if (seatNumber !== currentSpeakerSeat) {
      return { success: false, error: '只能跳过当前发言者' };
    }

    this.logAction({
      actorSeat: judge.seatNumber,
      actorNickname: judge.nickname,
      actionType: 'JUDGE_SKIP_SPEECH',
      targetSeat: seatNumber,
      targetNickname: this.getPlayerBySeat(seatNumber)?.nickname || '',
      detail: {},
    });

    // 推进到下一位
    return this.nextSpeaker();
  }

  /**
   * 当前发言者主动结束发言
   */
  finishSpeech(
    playerId: string,
  ): { success: boolean; error?: string } {
    if (this.state.phase !== 'DAY_SPEECH') {
      return { success: false, error: '当前不在发言阶段' };
    }

    const player = this.getPlayerById(playerId);
    if (!player) {
      return { success: false, error: '玩家不存在' };
    }

    const currentSpeakerSeat = this.state.speechOrder[this.state.currentSpeakerIndex] ?? null;
    if (currentSpeakerSeat === null || player.seatNumber !== currentSpeakerSeat) {
      return { success: false, error: '当前不是你的发言回合' };
    }

    this.logAction({
      actorSeat: player.seatNumber,
      actorNickname: player.nickname,
      actionType: 'SPEECH_FINISH',
      targetSeat: null,
      targetNickname: null,
      detail: {},
    });

    this.nextSpeaker();
    return { success: true };
  }

  // ==========================================================================
  // 第八部分：胜负判定
  // ==========================================================================

  /**
   * 检查胜负条件
   *
   * SLAUGHTER_SIDE（屠边）：
   *   - 所有狼人死亡 → 好人阵营获胜
   *   - 神职全灭或平民全灭 → 狼人阵营获胜
   *   - 狼人数量 > 好人数量 → 狼人阵营获胜
   *
   * SLAUGHTER_ALL（屠城）：
   *   - 所有狼人死亡 → 好人阵营获胜
   *   - 所有好人死亡 → 狼人阵营获胜
   *   - 狼人数量 > 好人数量 → 狼人阵营获胜
   */
  private checkWinCondition(): Faction | null {
    return checkWinConditionUtil(this.state.players, this.state.config.winCondition);
  }

  /**
   * 结束游戏
   */
  private endGame(winner: Faction): void {
    this.state.phase = 'GAME_OVER';
    this.state.winner = winner;
    this.state.endedAt = Date.now();
    this.clearAllTimers();

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'GAME_OVER',
      targetSeat: null,
      targetNickname: null,
      detail: {
        winner,
        round: this.state.round,
        duration: this.state.endedAt - (this.state.startedAt || this.state.endedAt),
      },
    });

    this.onPhaseChange('GAME_OVER', null, this.state.round);

    // 广播游戏结束消息给客户端
    this.onGameOver(
      this.state.roomCode,
      winner,
      this.state.round,
      [...this.state.players],
    );
  }

  // ==========================================================================
  // 第九部分：发言顺序计算
  // ==========================================================================

  /**
   * 根据发言顺序策略计算发言顺序
   */
  private calculateSpeechOrder(): void {
    const config = this.state.config;
    const alivePlayers = this.state.players.filter(
      (p) => p.status === 'alive' && !p.isJudge,
    );

    if (alivePlayers.length === 0) {
      this.state.speechOrder = [];
      return;
    }

    switch (config.speechOrderStrategy) {
      case 'DEATH_LEFT': {
        // 从上一个死亡者的左手边开始
        const lastDead = this.findLastDeadPlayer();
        if (lastDead) {
          this.state.speechOrder = this.buildOrderFromSeat(alivePlayers, lastDead.seatNumber, 'left');
        } else {
          this.state.speechOrder = alivePlayers.map((p) => p.seatNumber);
        }
        break;
      }
      case 'DEATH_RIGHT': {
        const lastDead = this.findLastDeadPlayer();
        if (lastDead) {
          this.state.speechOrder = this.buildOrderFromSeat(alivePlayers, lastDead.seatNumber, 'right');
        } else {
          this.state.speechOrder = alivePlayers.map((p) => p.seatNumber);
        }
        break;
      }
      case 'SHERIFF_LEFT':
      case 'SHERIFF_RIGHT': {
        // 警长相关策略（当前版本暂未实现警长系统，降级为从1号位开始）
        this.state.speechOrder = alivePlayers.map((p) => p.seatNumber);
        break;
      }
      case 'JUDGE_CUSTOM': {
        // 法官手动指定，不自动计算
        break;
      }
      default: {
        this.state.speechOrder = alivePlayers.map((p) => p.seatNumber);
      }
    }
  }

  /**
   * 找到最近死亡的玩家
   */
  private findLastDeadPlayer(): Player | null {
    const deadPlayers = this.state.players.filter(
      (p) => p.status !== 'alive' && !p.isJudge && p.deathRound === this.state.round,
    );
    return deadPlayers.length > 0 ? deadPlayers[deadPlayers.length - 1] : null;
  }

  /**
   * 从指定座位号开始构建发言顺序
   */
  private buildOrderFromSeat(
    alivePlayers: Player[],
    startSeat: number,
    direction: 'left' | 'right',
  ): number[] {
    const seats = alivePlayers.map((p) => p.seatNumber).sort((a, b) => a - b);
    const startIndex = seats.findIndex((s) => s === startSeat);
    // 如果起始座位不在存活列表中（已死亡），从最近的下一个座位开始
    const effectiveStartIndex = startIndex >= 0 ? startIndex : 0;
    const offset = direction === 'left' ? 1 : -1;

    const order: number[] = [];
    for (let i = 1; i <= seats.length; i++) {
      const idx = ((effectiveStartIndex + offset * i) % seats.length + seats.length) % seats.length;
      order.push(seats[idx]);
    }
    return order;
  }

  // ==========================================================================
  // 第十部分：定时器管理
  // ==========================================================================

  private setTimer(name: string, seconds: number, callback: () => void): void {
    this.clearTimer(name);
    this.timerDeadlines.set(name, Date.now() + seconds * 1000);
    this.timerCallbacks.set(name, callback);
    this.timers.set(name, setTimeout(callback, seconds * 1000));
  }

  private setNightActionTimer(roleId: RoleId, seconds: number): void {
    this.nightActionStartTime = Date.now();
    this.setTimer(`night_${roleId}`, seconds, () => {
      // 防护：如果当前已不在夜间阶段（可能已被共识/其他路径推进），忽略孤儿定时器
      if (this.state.phase !== 'NIGHT') return;

      // 防护：如果当前子阶段已不匹配此定时器（可能已被共识/其他路径推进），忽略孤儿定时器
      if (this.state.nightSubPhase?.currentRole !== roleId) return;

      // 超时处理：根据角色不同采取不同策略
      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'TIMER_EXPIRED',
        targetSeat: null,
        targetNickname: null,
        detail: { roleId, phase: 'NIGHT', reason: '夜间行动超时' },
      });

      // 清除倒计时广播定时器
      this.clearNightCountdownTimer(roleId);

      // 被恐惧封印的阶段：不执行任何行动，直接推进到下一个子阶段
      if (this.state.nightSubPhase?.isBlockedByNightmare) {
        const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
        this.advanceNightSubPhase(nextIndex);
        return;
      }

      // 夜间行动超时始终自动推进（无论游戏模式）
      // 超时策略：狼人以多数票/最小号/随机选人，预言家/守卫/机械狼/噩梦随机选人，女巫不释放技能

      if (roleId === 'werewolf') {
        // 狼人投票超时：系统随机选择一名存活玩家作为刀人目标
        this.handleWolfVoteTimeout();
      } else if (roleId === 'witch') {
        // 女巫超时：放弃操作（不解人不毒人）
        this.handleWitchTimeout();
      } else if (roleId === 'guard') {
        // 守卫超时：随机选择除自身外的一名存活玩家作为守护目标
        this.handleGuardTimeout();
      } else if (roleId === 'nightmare_shadow') {
        // 噩梦之影超时：系统随机选择一名存活好人玩家进行恐惧
        this.handleNightmareTimeout();
      } else if (roleId === 'seer') {
        // 预言家超时：系统随机选择除自身外的一名存活玩家进行查验
        this.handleSeerTimeout();
      } else if (roleId === 'mechanical_wolf') {
        // 机械狼超时：随机选择除自身外的一名存活玩家作为模仿/技能目标
        this.handleMechanicalWolfTimeout();
      } else {
        // 其他角色：直接跳过
        if (this.state.nightSubPhase) {
          const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
          this.advanceNightSubPhase(nextIndex);
        }
      }
    });

    // 启动倒计时广播定时器：每秒向所有客户端推送剩余时间
    this.startNightCountdownBroadcast(roleId, seconds);
  }

  /**
   * 启动夜间倒计时广播：每秒推送剩余时间
   */
  private startNightCountdownBroadcast(roleId: RoleId, totalSeconds: number): void {
    this.clearNightCountdownTimer(roleId);
    let remaining = totalSeconds;
    const timerName = `night_countdown_${roleId}`;
    const tick = () => {
      remaining--;
      if (remaining <= 0) {
        this.clearNightCountdownTimer(roleId);
        return;
      }
      this.onNightCountdown(this.state.roomCode, roleId, remaining);
      this.timers.set(timerName, setTimeout(tick, 1000));
    };
    // 立即广播初始总时间
    this.onNightCountdown(this.state.roomCode, roleId, remaining);
    this.timers.set(timerName, setTimeout(tick, 1000));
  }

  /**
   * 清除夜间倒计时广播定时器
   */
  private clearNightCountdownTimer(roleId: RoleId): void {
    this.clearTimer(`night_countdown_${roleId}`);
  }

  /**
   * 狼人投票超时处理
   * 规则：多数票优先，票数相同取最小座位号；无人投票则随机选择
   */
  private handleWolfVoteTimeout(): void {
    // 防护：如果当前已不在狼人子阶段（可能已被共识推进），直接跳过
    if (this.state.phase !== 'NIGHT' ||
        !this.state.nightSubPhase ||
        this.state.nightSubPhase.currentRole !== 'werewolf') {
      return;
    }

    const votes = this.state.wolfVotes;
    const voteValues = Object.values(votes);

    if (voteValues.length > 0) {
      // 统计每个目标获得的票数
      const tally: Record<number, number> = {};
      for (const target of voteValues) {
        tally[target] = (tally[target] ?? 0) + 1;
      }

      // 找到最高票数
      const maxVotes = Math.max(...Object.values(tally));

      // 找到所有获得最高票数的目标
      const topTargets = Object.entries(tally)
        .filter(([, count]) => count === maxVotes)
        .map(([seat]) => Number(seat));

      // 票数相同时取最小座位号
      this.state.werewolfTarget = Math.min(...topTargets);

      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'WOLF_VOTE_TIMEOUT_RANDOM',
        targetSeat: this.state.werewolfTarget,
        targetNickname: this.state.werewolfTarget ? this.getPlayerBySeat(this.state.werewolfTarget)?.nickname || null : null,
        detail: {
          message: topTargets.length > 1
            ? `狼人投票超时，${topTargets.join('、')}号票数相同（各${maxVotes}票），取最小座位号${this.state.werewolfTarget}号`
            : `狼人投票超时，${this.state.werewolfTarget}号获最多票（${maxVotes}票）`,
          wolfVotes: this.state.wolfVotes,
          tally,
        },
      });
    } else {
      // 无人投票，随机选择除狼人阵营外的任意一名存活玩家
      const alivePlayers = this.state.players.filter(
        (p) => !p.isJudge && p.status === 'alive' && !isEvilRole(p.role),
      );

      if (alivePlayers.length === 0) {
        this.state.werewolfTarget = null;
      } else {
        const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        this.state.werewolfTarget = randomTarget.seatNumber;
      }

      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'WOLF_VOTE_TIMEOUT_RANDOM',
        targetSeat: this.state.werewolfTarget,
        targetNickname: this.state.werewolfTarget ? this.getPlayerBySeat(this.state.werewolfTarget)?.nickname || null : null,
        detail: {
          message: '狼人投票超时且无人投票，随机选择目标',
          wolfVotes: this.state.wolfVotes,
        },
      });
    }

    // 记录狼人夜间行动到 nightActions（供 DTO / MyActionInfo 使用）
    this.state.nightActions['werewolf'] = {
      roleId: 'werewolf',
      actorSeat: 0, // 系统代为执行
      targetSeat: this.state.werewolfTarget,
      extra: { killTarget: this.state.werewolfTarget },
      submitted: true,
      blockedByNightmare: false,
    };

    // 通知投票更新
    this.onWolfVoteUpdate(
      this.state.roomCode,
      this.state.wolfVotes,
      true,
      this.state.werewolfTarget,
    );

    // 推进到下一个子阶段
    if (this.state.nightSubPhase) {
      const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
      this.advanceNightSubPhase(nextIndex);
    }
  }

  /**
   * 女巫超时处理：放弃操作
   */
  private handleWitchTimeout(): void {
    // 防护：如果当前不在女巫子阶段，忽略
    if (this.state.phase !== 'NIGHT' ||
        !this.state.nightSubPhase ||
        this.state.nightSubPhase.currentRole !== 'witch') {
      return;
    }

    this.logAction({
      actorSeat: 0,
      actorNickname: '系统',
      actionType: 'NIGHT_ACTION_SUBMIT',
      targetSeat: null,
      targetNickname: null,
      detail: { roleId: 'witch', message: '女巫超时，放弃操作' },
    });

    this.state.nightActions['witch'] = {
      roleId: 'witch',
      actorSeat: this.state.players.find((p) => p.role === 'witch' && p.status === 'alive')?.seatNumber ?? 0,
      targetSeat: null,
      extra: { useAntidote: false, usePoison: false },
      submitted: true,
      blockedByNightmare: false,
    };

    if (this.state.nightSubPhase) {
      const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
      this.advanceNightSubPhase(nextIndex);
    }
  }

  /**
   * 守卫超时处理：随机选择除自身外的一名存活玩家作为守护目标
   * 需排除守护历史中已守护过的玩家（不可重复守护同一人）
   */
  private handleGuardTimeout(): void {
    // 防护：如果当前不在守卫子阶段，忽略
    if (this.state.phase !== 'NIGHT' ||
        !this.state.nightSubPhase ||
        this.state.nightSubPhase.currentRole !== 'guard') {
      return;
    }

    const guard = this.state.players.find((p) => p.role === 'guard' && p.status === 'alive');
    if (!guard) {
      if (this.state.nightSubPhase) {
        const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
        this.advanceNightSubPhase(nextIndex);
      }
      return;
    }

    const alivePlayers = this.state.players.filter(
      (p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== guard.seatNumber,
    );
    // 排除已守护过的玩家（不可重复守护同一人）
    const validTargets = alivePlayers.filter(
      (p) => !guard.guardProtectedHistory.includes(p.seatNumber),
    );

    if (validTargets.length > 0) {
      const randomTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
      this.state.guardProtectTarget = randomTarget.seatNumber;
      guard.guardLastProtected = randomTarget.seatNumber;
      if (!guard.guardProtectedHistory.includes(randomTarget.seatNumber)) {
        guard.guardProtectedHistory.push(randomTarget.seatNumber);
      }

      this.state.nightActions['guard'] = {
        roleId: 'guard',
        actorSeat: guard.seatNumber,
        targetSeat: randomTarget.seatNumber,
        extra: { protectTarget: randomTarget.seatNumber },
        submitted: true,
        blockedByNightmare: false,
      };

      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'NIGHT_ACTION_SUBMIT',
        targetSeat: randomTarget.seatNumber,
        targetNickname: randomTarget.nickname,
        detail: { roleId: 'guard', message: '守卫超时，系统随机选择守护目标' },
      });
    } else {
      // 无合法目标（所有其他玩家都被守护过），放弃操作
      this.state.nightActions['guard'] = {
        roleId: 'guard',
        actorSeat: guard.seatNumber,
        targetSeat: null,
        extra: {},
        submitted: true,
        blockedByNightmare: false,
      };

      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'NIGHT_ACTION_SUBMIT',
        targetSeat: null,
        targetNickname: null,
        detail: { roleId: 'guard', message: '守卫超时且无合法目标，放弃操作' },
      });
    }

    if (this.state.nightSubPhase) {
      const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
      this.advanceNightSubPhase(nextIndex);
    }
  }

  /**
   * 噩梦之影超时处理：系统随机选择除自身外的一名存活好人玩家进行恐惧
   */
  private handleNightmareTimeout(): void {
    // 防护：如果当前不在噩梦之影子阶段，忽略
    if (this.state.phase !== 'NIGHT' ||
        !this.state.nightSubPhase ||
        this.state.nightSubPhase.currentRole !== 'nightmare_shadow') {
      return;
    }

    const nightmare = this.state.players.find((p) => p.role === 'nightmare_shadow' && p.status === 'alive');
    // 噩梦可以恐惧任何阵营角色（包括狼人阵营），排除自己、法官和已恐惧过的
    const aliveFearablePlayers = this.state.players.filter(
      (p) => !p.isJudge && p.status === 'alive' &&
        (nightmare ? p.seatNumber !== nightmare.seatNumber : true) &&
        (nightmare ? !nightmare.nightmareTargetHistory.includes(p.seatNumber) : true),
    );

    if (aliveFearablePlayers.length > 0 && nightmare) {
      const randomTarget = aliveFearablePlayers[Math.floor(Math.random() * aliveFearablePlayers.length)];
      this.state.nightmareTarget = randomTarget.seatNumber;

      // 记录恐惧历史
      if (!nightmare.nightmareTargetHistory.includes(randomTarget.seatNumber)) {
        nightmare.nightmareTargetHistory.push(randomTarget.seatNumber);
      }

      // 恐惧当夜立即生效（规则七：全技能封禁当夜）
      this.applyNightmareEffect(randomTarget.seatNumber);

      // 记录夜间行动
      this.state.nightActions['nightmare_shadow'] = {
        roleId: 'nightmare_shadow',
        actorSeat: nightmare.seatNumber,
        targetSeat: randomTarget.seatNumber,
        extra: {},
        submitted: true,
        blockedByNightmare: false,
      };

      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'NIGHT_ACTION_SUBMIT',
        targetSeat: randomTarget.seatNumber,
        targetNickname: randomTarget.nickname,
        detail: { roleId: 'nightmare_shadow', message: '噩梦之影超时，系统随机选择恐惧目标' },
      });
    }

    if (this.state.nightSubPhase) {
      const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
      this.advanceNightSubPhase(nextIndex);
    }
  }

  /**
   * 预言家超时处理：系统随机选择除自身外的一名存活玩家进行查验
   */
  private handleSeerTimeout(): void {
    // 防护：如果当前不在预言家子阶段，忽略
    if (this.state.phase !== 'NIGHT' ||
        !this.state.nightSubPhase ||
        this.state.nightSubPhase.currentRole !== 'seer') {
      return;
    }

    const seer = this.state.players.find((p) => p.role === 'seer' && p.status === 'alive');
    if (!seer) {
      if (this.state.nightSubPhase) {
        const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
        this.advanceNightSubPhase(nextIndex);
      }
      return;
    }

    const alivePlayers = this.state.players.filter(
      (p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== seer.seatNumber,
    );

    if (alivePlayers.length > 0) {
      const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const seerResult: Faction = isHiddenWolf(randomTarget.role)
        ? (randomTarget.hiddenWolfHasActed ? 'evil' : 'good')
        : (randomTarget.role === 'mechanical_wolf'
          ? this.getMechanicalWolfSeerResult(randomTarget)
          : ROLE_META[randomTarget.role].faction);

      // 记录夜间行动（含查验结果），供 DTO 展示
      this.state.nightActions['seer'] = {
        roleId: 'seer',
        actorSeat: seer.seatNumber,
        targetSeat: randomTarget.seatNumber,
        extra: { seerResult },
        submitted: true,
        blockedByNightmare: false,
      };

      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'NIGHT_ACTION_SUBMIT',
        targetSeat: randomTarget.seatNumber,
        targetNickname: randomTarget.nickname,
        detail: { roleId: 'seer', message: '预言家超时，系统随机选择查验目标', seerResult },
      });
    }

    if (this.state.nightSubPhase) {
      const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
      this.advanceNightSubPhase(nextIndex);
    }
  }

  /**
   * 机械狼超时处理：随机选择除自身外的一名存活玩家作为模仿/技能目标
   *
   * - selecting 阶段：随机选择模仿目标 → 进入 learning 阶段
   * - active 阶段：随机选择技能目标 → 进入 silent 阶段
   */
  private handleMechanicalWolfTimeout(): void {
    // 防护：如果当前不在机械狼子阶段，忽略
    if (this.state.phase !== 'NIGHT' ||
        !this.state.nightSubPhase ||
        this.state.nightSubPhase.currentRole !== 'mechanical_wolf') {
      return;
    }

    const mwPlayer = this.state.players.find(
      (p) => p.role === 'mechanical_wolf' && p.status === 'alive',
    );
    if (!mwPlayer) {
      if (this.state.nightSubPhase) {
        const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
        this.advanceNightSubPhase(nextIndex);
      }
      return;
    }

    const alivePlayers = this.state.players.filter(
      (p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== mwPlayer.seatNumber,
    );

    if (mwPlayer.mechanicalWolfPhase === 'selecting' && alivePlayers.length > 0) {
      // selecting 阶段：随机选择模仿目标
      const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      mwPlayer.mechanicalWolfImitateTarget = randomTarget.seatNumber;
      mwPlayer.mechanicalWolfPhase = 'learning';

      this.state.nightActions['mechanical_wolf'] = {
        roleId: 'mechanical_wolf',
        actorSeat: mwPlayer.seatNumber,
        targetSeat: randomTarget.seatNumber,
        extra: { imitateTarget: randomTarget.seatNumber, phase: 'selecting' },
        submitted: true,
        blockedByNightmare: false,
      };

      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'NIGHT_ACTION_SUBMIT',
        targetSeat: randomTarget.seatNumber,
        targetNickname: randomTarget.nickname,
        detail: {
          roleId: 'mechanical_wolf',
          message: '机械狼超时，系统随机选择模仿目标',
          phase: 'selecting',
        },
      });
    } else if (mwPlayer.mechanicalWolfPhase === 'active' && alivePlayers.length > 0) {
      // active 阶段：随机选择技能目标
      const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      mwPlayer.mechanicalWolfPhase = 'silent';
      mwPlayer.mechanicalWolfSkillDeferred = false;

      this.state.nightActions['mechanical_wolf'] = {
        roleId: 'mechanical_wolf',
        actorSeat: mwPlayer.seatNumber,
        targetSeat: randomTarget.seatNumber,
        extra: { imitateSkillTarget: randomTarget.seatNumber, phase: 'active' },
        submitted: true,
        blockedByNightmare: false,
      };

      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'NIGHT_ACTION_SUBMIT',
        targetSeat: randomTarget.seatNumber,
        targetNickname: randomTarget.nickname,
        detail: {
          roleId: 'mechanical_wolf',
          message: '机械狼超时，系统随机选择技能目标',
          phase: 'active',
        },
      });
    }

    if (this.state.nightSubPhase) {
      const nextIndex = this.state.nightSubPhase.currentRoleIndex + 1;
      this.advanceNightSubPhase(nextIndex);
    }
  }

  private setSpeechTimer(): void {
    if (this.state.config.speechTimeout <= 0) return;
    this.setTimer('speech', this.state.config.speechTimeout, () => {
      // 清除发言倒计时广播
      this.clearSpeechCountdownTimer();
      this.logAction({
        actorSeat: 0,
        actorNickname: '系统',
        actionType: 'TIMER_EXPIRED',
        targetSeat: null,
        targetNickname: null,
        detail: { phase: 'DAY_SPEECH', reason: '发言超时' },
      });
      this.nextSpeaker();
    });

    // 启动发言倒计时广播：每秒向所有客户端推送剩余时间
    const currentSpeakerSeat = this.state.speechOrder[this.state.currentSpeakerIndex] ?? 0;
    this.startSpeechCountdownBroadcast(currentSpeakerSeat, this.state.config.speechTimeout);
  }

  /**
   * 启动发言倒计时广播：每秒推送剩余时间
   */
  private startSpeechCountdownBroadcast(seatNumber: number, totalSeconds: number): void {
    this.clearSpeechCountdownTimer();
    let remaining = totalSeconds;
    const timerName = 'speech_countdown';
    const tick = () => {
      remaining--;
      if (remaining <= 0) {
        this.clearSpeechCountdownTimer();
        return;
      }
      this.onSpeechCountdown(this.state.roomCode, seatNumber, remaining);
      this.timers.set(timerName, setTimeout(tick, 1000));
    };
    // 立即广播初始总时间
    this.onSpeechCountdown(this.state.roomCode, seatNumber, remaining);
    this.timers.set(timerName, setTimeout(tick, 1000));
  }

  /**
   * 清除发言倒计时广播定时器
   */
  private clearSpeechCountdownTimer(): void {
    this.clearTimer('speech_countdown');
  }

  private getCurrentPhaseTimerName(): string | null {
    if (this.state.phase === 'NIGHT' && this.state.nightSubPhase?.currentRole) {
      const roleId = this.state.nightSubPhase.currentRole;
      if (this.timers.has(`night_${roleId}`)) return `night_${roleId}`;
      if (this.timers.has('dead_role_auto_advance')) return 'dead_role_auto_advance';
      if (this.timers.has('blocked_auto_advance')) return 'blocked_auto_advance';
      if (this.timers.has('guard_skip')) return 'guard_skip';
      return null;
    }

    const phaseTimerMap: Partial<Record<GamePhase, string>> = {
      ROLE_REVEAL: 'role_reveal',
      DAY_ANNOUNCE: 'day_announce',
      DAY_SPEECH: 'speech',
      PRE_VOTE_WAIT: 'pre_vote_wait',
      DAY_VOTE: 'vote',
      PK_VOTE: 'pk_vote',
      SHERIFF_ELECTION: 'sheriff_election',
      SHERIFF_TRANSFER: 'sheriff_transfer',
      PRE_NIGHT: 'pre_night',
    };

    const timerName = phaseTimerMap[this.state.phase];
    return timerName && this.timers.has(timerName) ? timerName : null;
  }

  private clearTimer(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
    }
    this.timerDeadlines.delete(name);
    this.timerCallbacks.delete(name);
  }

  // Bug 55 说明：clearAllTimers 会清除所有通过 setTimer 创建的定时器
  // 所有定时器都通过 setTimer 方法创建并存储在 this.timers Map 中
  // 因此 clearAllTimers 能够完整清理所有定时器
  private clearAllTimers(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.timerDeadlines.clear();
    this.timerCallbacks.clear();
  }

  // ==========================================================================
  // 第十一部分：工具方法
  // ==========================================================================

  /**
   * Fisher-Yates 洗牌算法
   */
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * 构建并写入操作日志
   */
  public logAction(params: {
    actorSeat: number;
    actorNickname: string;
    actionType: ActionType;
    targetSeat: number | null;
    targetNickname: string | null;
    detail: Record<string, unknown>;
    overridden?: boolean;
    overrideReason?: string | null;
  }): void {
    const log: ActionLog = {
      roomCode: this.state.roomCode,
      gameId: this.gameId,
      timestamp: Date.now(),
      actorSeat: params.actorSeat,
      actorNickname: params.actorNickname,
      actionType: params.actionType,
      targetSeat: params.targetSeat,
      targetNickname: params.targetNickname,
      phase: this.state.phase,
      round: this.state.round,
      detail: params.detail,
      overridden: params.overridden ?? false,
      overrideReason: params.overrideReason ?? null,
      nightActionOrderSnapshot: [...this.state.config.nightActionOrder],
    };

    this.onLog(log);
  }



  // ==========================================================================
  // 第十二部分：狼人共群规则处理
  // ==========================================================================

  /**
   * 获取狼人阵营的可见同伴信息
   * 根据 werewolfSharedVision 配置决定哪些狼人可以互相看到
   */
  getWerewolfVision(playerId: string): { visibleAllies: Player[]; visionType: string } {
    const player = this.getPlayerById(playerId);
    if (!player || !isEvilRole(player.role)) {
      return { visibleAllies: [], visionType: 'NONE' };
    }

    const config = this.state.config;
    const aliveEvilPlayers = this.state.players.filter(
      (p) => isEvilRole(p.role) && p.status === 'alive' && !p.isJudge,
    );

    switch (config.werewolfSharedVision) {
      case 'ALL_SHARE':
        // 所有狼人互相知晓身份
        return {
          visibleAllies: aliveEvilPlayers.filter((p) => p.id !== playerId),
          visionType: 'ALL_SHARE',
        };

      case 'LEADER_ONLY': {
        // 仅狼王/白狼王知道普通狼人，噩梦之影单独行动
        if (player.role === 'wolf_king' || player.role === 'white_wolf_king') {
          return {
            visibleAllies: aliveEvilPlayers.filter(
              (p) => p.id !== playerId && p.role !== 'nightmare_shadow',
            ),
            visionType: 'LEADER_ONLY',
          };
        }
        if (player.role === 'nightmare_shadow') {
          return { visibleAllies: [], visionType: 'LEADER_ONLY' };
        }
        // 普通狼人看不到其他狼人
        return { visibleAllies: [], visionType: 'LEADER_ONLY' };
      }

      case 'NONE':
        // 各自独立行动
        return { visibleAllies: [], visionType: 'NONE' };

      default:
        return { visibleAllies: [], visionType: 'NONE' };
    }
  }

  // ==========================================================================
  // 第十三部分：狼人聊天与隐狼权限
  // ==========================================================================

  /**
   * 处理狼人聊天消息
   * 仅在狼人子阶段允许发送
   */
  submitWolfChat(
    playerId: string,
    content: string,
  ): { success: boolean; error?: string } {
    if (this.state.phase !== 'NIGHT') {
      return { success: false, error: '当前不在夜间阶段' };
    }

    if (!this.state.nightSubPhase || this.state.nightSubPhase.currentRole !== 'werewolf') {
      return { success: false, error: '当前不在狼人子阶段' };
    }

    const player = this.getPlayerById(playerId);
    if (!player) return { success: false, error: '玩家不存在' };

    const sharedRoles = this.state.config.sharedWolfRoles;
    if (!isSharedWolfRole(player.role, sharedRoles)) {
      return { success: false, error: '你不是共同睁眼的狼人' };
    }

    if (player.status !== 'alive') {
      return { success: false, error: '你已死亡' };
    }

    const message: WolfChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      roomCode: this.state.roomCode,
      round: this.state.round,
      senderSeat: player.seatNumber,
      senderNickname: player.nickname,
      content,
      timestamp: Date.now(),
      visibility: 'wolf_only',
    };

    this.logAction({
      actorSeat: player.seatNumber,
      actorNickname: player.nickname,
      actionType: 'WOLF_CHAT_MESSAGE',
      targetSeat: null,
      targetNickname: null,
      detail: { content, round: this.state.round },
    });

    // 通过回调通知
    this.onWolfChat(this.state.roomCode, message);

    return { success: true };
  }

  /**
   * 获取狼人聊天历史
   *
   * 权限规则：
   * - 共同睁眼的狼人（含噩梦之影）：可查看所有历史消息
   * - 隐狼：仅当狼人阵营其他成员全部死亡时，可回溯查看历史
   * - 非狼人阵营：不可查看
   */
  getWolfChatHistory(playerId: string): { messages: WolfChatMessage[]; isHistorical: boolean } {
    const player = this.getPlayerById(playerId);
    if (!player || !isEvilRole(player.role)) {
      return { messages: [], isHistorical: false };
    }

    const sharedRoles = this.state.config.sharedWolfRoles;

    // 共同睁眼的狼人（含噩梦之影）：可查看所有历史
    if (isSharedWolfRole(player.role, sharedRoles)) {
      return { messages: [], isHistorical: false };
    }

    return { messages: [], isHistorical: false };
  }

  /**
   * 判断隐狼是否可查看狼人聊天历史
   * 条件：狼人阵营其他所有成员均已死亡，且隐狼是唯一存活狼人
   */
  canHiddenWolfViewChat(playerId: string): boolean {
    const player = this.getPlayerById(playerId);
    if (!player || player.role !== 'hidden_wolf') return false;

    const otherEvilAlive = this.state.players.filter(
      (p) => p.id !== player.id && isEvilRole(p.role) && p.status === 'alive',
    );
    return otherEvilAlive.length === 0 && player.status === 'alive';
  }

  // ==========================================================================
  // 第十四部分：机械狼规则体系
  // ==========================================================================

  /**
   * 规则7：判断机械狼是否可以以狼人身份行动
   * 条件：隐狼已死亡 AND 其他sharedWolfRoles狼人全部死亡
   */
  private canMechanicalWolfActAsWolf(): boolean {
    const alivePlayers = this.state.players.filter((p) => !p.isJudge && p.status === 'alive');
    const hiddenWolf = alivePlayers.find((p) => p.role === 'hidden_wolf');
    // 隐狼必须已死亡
    if (hiddenWolf) return false;

    // 其他sharedWolfRoles狼人必须全部死亡
    const sharedRoles = this.state.config.sharedWolfRoles;
    const hasSharedWolfAlive = alivePlayers.some(
      (p) => isSharedWolfRole(p.role, sharedRoles) && p.role !== 'mechanical_wolf'
    );
    return !hasSharedWolfAlive;
  }

  /**
   * 规则9：判断狼人阵营玩家是否对其他共同睁眼狼人可见
   * 机械狼和隐狼的可见性不受werewolfSharedVision配置影响
   */
  private isWolfVisibleToSharedWolves(player: Player): boolean {
    if (player.role === 'mechanical_wolf') {
      // 机械狼仅在以狼人身份行动时可见
      return this.canMechanicalWolfActAsWolf();
    }
    if (player.role === 'hidden_wolf') {
      // 隐狼仅在已以狼人身份行动时可见
      return player.hiddenWolfHasActed;
    }
    // 其他狼人阵营角色：按werewolfSharedVision配置
    return true;
  }

  /**
   * 获取机械狼被预言家查验的结果
   *
   * 规则四：
   * - 尚未选择模仿目标 → 狼人
   * - 已选择模仿目标（无论模仿成功或失败） → 由模仿目标角色的阵营决定
   */
  private getMechanicalWolfSeerResult(player: Player): Faction {
    // 尚未选择模仿目标 → 狼人
    if (!player.mechanicalWolfPhase || player.mechanicalWolfPhase === 'selecting') {
      return 'evil';
    }

    // 已选择模仿目标（无论模仿成功或失败）：由模仿目标角色的阵营决定
    // 包括 learning / active / silent / failed 阶段
    if (player.mechanicalWolfImitatedRole) {
      return ROLE_META[player.mechanicalWolfImitatedRole].faction;
    }

    // 无模仿角色信息时默认为狼人
    return 'evil';
  }

  /**
   * 判断机械狼在骑士决斗中是否暴露为狼人
   */
  private isMechanicalWolfRevealed(player: Player): boolean {
    if (!player.mechanicalWolfPhase || player.mechanicalWolfPhase === 'selecting') {
      return true; // 尚未选择模仿目标，显示为狼人
    }
    if (player.mechanicalWolfPhase === 'failed') {
      return true; // 模仿失败，显示为狼人
    }
    // learning / active / silent：由模仿角色阵营决定
    if (player.mechanicalWolfImitatedRole) {
      return ROLE_META[player.mechanicalWolfImitatedRole].faction === 'evil';
    }
    return true;
  }

  /**
   * 处理机械狼第二晚得知模仿结果
   * 在进入机械狼子阶段时调用
   */
  private processMechanicalWolfLearning(player: Player): void {
    if (player.mechanicalWolfPhase !== 'learning') return;
    if (player.mechanicalWolfImitateTarget === null) return;

    const target = this.getPlayerBySeat(player.mechanicalWolfImitateTarget);
    if (!target) {
      player.mechanicalWolfPhase = 'failed';
      return;
    }

    const imitatedRole = target.role;
    // 规则四：模仿平民/骑士/白痴则失败
    if (isImitationFailRole(imitatedRole)) {
      player.mechanicalWolfPhase = 'failed';
      player.mechanicalWolfImitatedRole = null;
      return;
    }

    // 模仿成功
    player.mechanicalWolfPhase = 'active';
    player.mechanicalWolfImitatedRole = imitatedRole;
  }

  /**
   * 获取禁用目标列表及原因
   * 用于构建 NightActionRequestDTO
   */
  getDisabledTargets(playerId: string): { disabledTargets: number[]; disabledReasons: Record<number, string> } {
    const player = this.getPlayerById(playerId);
    if (!player) return { disabledTargets: [], disabledReasons: {} };

    const disabledTargets: number[] = [];
    const disabledReasons: Record<number, string> = {};

    if (player.role === 'guard') {
      // 规则二：已守护过的目标
      for (const seat of player.guardProtectedHistory) {
        disabledTargets.push(seat);
        disabledReasons[seat] = '已被你守护过';
      }
      // 规则五：第二晚起不能守护自己
      if (this.state.round > 1) {
        disabledTargets.push(player.seatNumber);
        disabledReasons[player.seatNumber] = '仅第一晚可以守护自己';
      }
    }

    if (player.role === 'nightmare_shadow') {
      // 规则七：不能恐惧自己
      disabledTargets.push(player.seatNumber);
      disabledReasons[player.seatNumber] = '不能恐惧自己';
      // 规则二：已恐惧过的目标
      for (const seat of player.nightmareTargetHistory) {
        if (!disabledTargets.includes(seat)) {
          disabledTargets.push(seat);
          disabledReasons[seat] = '已被你恐惧过';
        }
      }
    }

    return { disabledTargets, disabledReasons };
  }

  /**
   * 为指定玩家构建夜间行动请求 DTO
   * 仅在夜间阶段且轮到该玩家行动时返回非 null
   */
  buildNightActionRequest(forPlayerId: string): NightActionRequestDTO | null {
    const player = this.getPlayerById(forPlayerId);
    if (!player || player.isJudge || player.status !== 'alive') return null;
    if (this.state.phase !== 'NIGHT' || !this.state.nightSubPhase) return null;

    const sub = this.state.nightSubPhase;
    const roleId = sub.currentRole;

    // 检查该玩家是否属于当前行动角色
    const isWolfPhase = roleId === 'werewolf';
    const isActor = isWolfPhase
      ? isSharedWolfRole(player.role, this.state.config.sharedWolfRoles)
      : player.role === roleId;

    if (!isActor) return null;

    // 被恐惧的玩家：返回带封印标记的行动请求，让客户端显示"技能被封印"提示
    if (sub.isBlockedByNightmare && player.isNightmared) {
      return {
        roleId,
        availableTargets: [],
        timeout: this.state.config.nightActionTimeout,
        hint: '你被噩梦之影恐惧，技能已被封印',
        isBlockedByNightmare: true,
        werewolfKillTarget: null,
        guardProtectTarget: null,
        wolfVotes: null,
        wolfVoteConsensus: null,
        wolfAllies: null,
        disabledTargets: [],
        disabledReasons: {},
      };
    }

    // 构建可用目标列表
    const alivePlayers = this.state.players.filter(
      (p) => !p.isJudge && p.status === 'alive'
    );
    const allSeats = alivePlayers.map((p) => p.seatNumber);

    // 获取禁用目标（狼人阶段可能需要修改，使用 let）
    let { disabledTargets, disabledReasons } = this.getDisabledTargets(forPlayerId);

    // 根据角色过滤可用目标
    let availableTargets: number[];
    const hint = this.getNightActionHint(roleId, player);

    if (roleId === 'nightmare_shadow') {
      // 噩梦之影：可选所有存活玩家（排除禁用）
      availableTargets = allSeats.filter((s) => !disabledTargets.includes(s));
    } else if (roleId === 'werewolf') {
      // 狼人投票：所有存活玩家都可见，但被恐惧的玩家显示为禁用状态
      // Bug 修复：被恐惧的玩家应该出现在界面中（避免通过"某人消失"推断出恐惧信息）
      // 但设置为禁用状态，狼人无法选择该目标
      const wolfDisabledTargets = [...disabledTargets];
      const wolfDisabledReasons = { ...disabledReasons };
      if (this.state.nightmareTarget !== null) {
        const nightmaredPlayer = this.getPlayerBySeat(this.state.nightmareTarget);
        if (nightmaredPlayer && nightmaredPlayer.status === 'alive') {
          wolfDisabledTargets.push(this.state.nightmareTarget);
          wolfDisabledReasons[this.state.nightmareTarget] = '技能失效';
        }
      }
      // 所有存活玩家都出现在列表中，但被恐惧的玩家被禁用
      availableTargets = allSeats;
      // 更新 disabledTargets 和 disabledReasons
      disabledTargets = wolfDisabledTargets;
      disabledReasons = wolfDisabledReasons;
    } else if (roleId === 'witch') {
      // 女巫：解药目标（被杀者）或毒药目标（所有存活玩家）
      availableTargets = allSeats;
    } else if (roleId === 'seer') {
      // 预言家：可选所有存活玩家（排除自己）
      availableTargets = allSeats.filter((s) => s !== player.seatNumber);
    } else if (roleId === 'guard') {
      // 守卫：可选所有存活玩家（排除禁用）
      availableTargets = allSeats.filter((s) => !disabledTargets.includes(s));
    } else if (roleId === 'mechanical_wolf') {
      // 机械狼：根据阶段不同
      if (player.mechanicalWolfPhase === 'selecting') {
        availableTargets = allSeats.filter((s) => s !== player.seatNumber);
      } else if (player.mechanicalWolfPhase === 'active') {
        availableTargets = allSeats.filter((s) => s !== player.seatNumber);
      } else {
        return null; // learning/failed/silent 阶段无行动
      }
    } else {
      availableTargets = allSeats.filter((s) => s !== player.seatNumber);
    }

    // 女巫专属字段
    let werewolfKillTarget: number | null = null;
    let guardProtectTarget: number | null = null;
    if (roleId === 'witch') {
      werewolfKillTarget = this.state.werewolfTarget ?? null;
      guardProtectTarget = this.state.guardProtectTarget ?? null;
    }

    // 狼人投票专属字段
    let wolfVotes: Record<number, number> | null = null;
    let wolfVoteConsensus: boolean | null = null;
    if (isWolfPhase) {
      wolfVotes = this.state.wolfVotes ?? null;
      wolfVoteConsensus = this.state.wolfVoteConsensus ?? null;
    }

    // 狼人同伴列表
    let wolfAllies: Array<{ seatNumber: number; nickname: string }> | null = null;
    if (isWolfPhase) {
      const sharedRoles = this.state.config.sharedWolfRoles;
      const wolfPlayers = alivePlayers.filter((p) => isSharedWolfRole(p.role, sharedRoles));
      wolfAllies = wolfPlayers.map((p) => ({ seatNumber: p.seatNumber, nickname: p.nickname }));
    }

    return {
      roleId,
      availableTargets,
      timeout: this.state.config.nightActionTimeout,
      hint,
      isBlockedByNightmare: false,
      werewolfKillTarget,
      guardProtectTarget,
      wolfVotes,
      wolfVoteConsensus,
      wolfAllies,
      disabledTargets,
      disabledReasons,
      // 女巫自救规则（从服务端配置下发，确保客户端使用权威值而非本地ruleConfig）
      witchSaveSelfRule: roleId === 'witch'
        ? this.state.config.witchSaveSelf
        : undefined,
    };
  }

  /**
   * 获取夜间行动提示文本
   */
  private getNightActionHint(roleId: RoleId, player: Player): string {
    if (roleId === 'nightmare_shadow') return '选择恐惧目标';
    if (roleId === 'werewolf') return '选择刀人目标（含自刀）';
    if (roleId === 'witch') return '选择使用解药或毒药';
    if (roleId === 'seer') return '选择查验目标';
    if (roleId === 'guard') return '选择守护目标';
    if (roleId === 'mechanical_wolf') {
      if (player.mechanicalWolfPhase === 'selecting') return '选择模仿目标';
      if (player.mechanicalWolfPhase === 'active') return `使用${player.mechanicalWolfImitatedRole}的技能`;
    }
    return '请行动';
  }

  /**
   * 获取入夜前提示信息
   * 如果隐狼/机械狼将代替原有狼人行动，返回提示文本
   */
  getPreNightHint(): string | null {
    const alivePlayers = this.state.players.filter((p) => !p.isJudge && p.status === 'alive');
    const sharedRoles = this.state.config.sharedWolfRoles;
    
    // 检查是否有存活的共同睁眼狼人
    const hasSharedWolfAlive = alivePlayers.some((p) => isSharedWolfRole(p.role, sharedRoles));
    if (hasSharedWolfAlive) return null;
    
    // 检查隐狼是否可以代替狼人行动
    const hiddenWolfAlive = alivePlayers.find((p) => p.role === 'hidden_wolf');
    if (hiddenWolfAlive) {
      return '隐狼将代替狼人行动';
    }
    
    // 检查机械狼是否可以代替狼人行动
    if (this.canMechanicalWolfActAsWolf()) {
      return '机械狼将代替狼人行动';
    }
    
    return null;
  }

  /**
   * 销毁引擎，清理所有定时器
   */
  destroy(): void {
    this.clearAllTimers();
  }
}
