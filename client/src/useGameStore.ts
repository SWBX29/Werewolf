/**
 * ============================================================================
 * 狼人杀联机游戏 — Zustand 全局状态仓库
 * ============================================================================
 *
 * 架构说明：
 *   本文件是前端的单一状态源（Single Source of Truth），负责：
 *   1. WebSocket 连接管理
 *   2. 服务端消息的接收与状态同步
 *   3. 客户端消息的发送
 *   4. 视图路由状态管理
 *
 * 设计原则：
 *   - 所有游戏状态均来自服务端推送，前端不做任何自主计算
 *   - WebSocket 断线自动重连
 *   - 状态更新粒度最小化，避免不必要的重渲染
 * ============================================================================
 */

import { create } from 'zustand';
import type {
  ClientMessage,
  ServerMessage,
  PlayerRoomStateDTO,
  JudgeRoomStateDTO,
  RuleConfig,
  GameMode,
  NightActionExtra,
  RoleId,
  ActionLogDTO,
  GamePhase,
  NightSubPhase,
  Faction,
  PlayerDTO,
  Player,
  JudgeWarningType,
  NightActionResultMessage,
  KnightDuelResultMessage,
  GameOverMessage,
  DayAnnounceMessage,
  VoteResultMessage,
  WolfChatMessage,
  DeathCause,
} from '@langrensha/shared';
import {
  createDefaultRuleConfig,
  NIGHT_ACTION_ORDER_PRESETS,
} from '@langrensha/shared';

// ============================================================================
// 视图路由状态
// ============================================================================

export type ViewType = 'home' | 'game' | 'admin';

// ============================================================================
// Store 状态接口
// ============================================================================

interface GameState {
  // ---- 连接状态 ----
  ws: WebSocket | null;
  isConnected: boolean;
  isReconnecting: boolean;
  playerId: string | null;
  nickname: string | null;

  // ---- 视图路由 ----
  currentView: ViewType;

  // ---- 房间状态 ----
  roomCode: string | null;
  inviteLink: string | null;
  qrCodeDataUrl: string | null;
  gameMode: GameMode | null;

  // ---- 游戏状态（来自服务端推送，脱敏后） ----
  playerState: PlayerRoomStateDTO | null;
  judgeState: JudgeRoomStateDTO | null;
  isJudge: boolean;

  // ---- 本地 UI 状态 ----
  error: string | null;
  judgeWarnings: Array<{ type: JudgeWarningType; message: string; data: Record<string, unknown> }>;
  phaseAnnouncement: string | null;

  // ---- 游戏客户端扩展状态 ----
  /** 角色是否已确认（初始展示后点击确认） */
  roleConfirmed: boolean;
  /** 发言记录列表 */
  speechMessages: Array<{ seatNumber: number; nickname: string; content: string; timestamp: number }>;
  /** 夜间行动结果（预言家查验等） */
  nightActionResult: NightActionResultMessage | null;
  /** 骑士决斗结果 */
  knightDuelResult: KnightDuelResultMessage | null;
  /** 游戏结束数据 */
  gameOverData: GameOverMessage | null;
  /** 白天公告数据 */
  dayAnnouncement: DayAnnounceMessage | null;
  /** 投票结果数据 */
  voteResult: VoteResultMessage | null;
  /** 当前阶段倒计时（秒） */
  phaseTimeRemaining: number;
  /** 操作是否已锁定（已提交不可更改） */
  isActionLocked: boolean;
  /** 观战模式：死后暴露的身份信息 */
  spectatorIdentities: Record<number, { role: RoleId; faction: Faction }> | null;
  /** 死后经过的夜晚数（用于身份暴露时间表） */
  deadNightsElapsed: number;
  /** 申诉事件 */
  appealEvent: { eventId: string; description: string; logs: string[] } | null;
  /** 仲裁投票是否可见 */
  showArbitration: boolean;
  /** 仲裁事件详情 */
  arbitrationEvent: { eventId: string; description: string } | null;

  // ---- 管理员 ----
  adminLogs: ActionLogDTO[];
  adminLogsTotal: number;
  /** 管理员密钥（本地存储，用于管理员操作鉴权） */
  adminSecret: string;
  /** 管理员鉴权是否成功（收到服务端成功响应后设为 true） */
  adminAuthSuccess: boolean;

  // ---- 规则26：死亡玩家聊天 ----
  deadChatMessages: Array<{id: string; senderSeat: number; senderNickname: string; content: string; timestamp: number}>;

  // ---- 创建房间配置 ----
  ruleConfig: RuleConfig;

  // ---- Actions ----
  connect: (url: string) => void;
  disconnect: () => void;
  sendMessage: (message: ClientMessage) => void;
  setView: (view: ViewType) => void;
  setError: (error: string | null) => void;
  dismissError: () => void;
  dismissWarning: (index: number) => void;
  dismissAnnouncement: () => void;

  // ---- 大厅操作 ----
  createRoom: (nickname: string, gameMode: GameMode, config: RuleConfig) => void;
  joinRoom: (nickname: string, roomCode: string) => void;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;

  // ---- 游戏操作 ----
  submitNightAction: (roleId: RoleId, targetSeat: number | null, extra: NightActionExtra) => void;
  submitVote: (targetSeat: number | null) => void;
  submitJudgeElectionVote: (targetSeat: number | null) => void;
  knightDuel: (targetSeat: number) => void;
  whiteWolfExplode: (targetSeat: number) => void;
  hunterGun: (targetSeat: number) => void;
  wolfKingGun: (targetSeat: number) => void;
  sendSpeech: (content: string) => void;
  sendWolfChat: (content: string) => void;
  sendWolfVote: (targetSeat: number) => void;
  sendDeadChat: (content: string) => void;
  confirmRole: () => void;
  setActionLocked: (locked: boolean) => void;
  setPhaseTimeRemaining: (seconds: number) => void;
  dismissDayAnnouncement: () => void;
  dismissKnightDuelResult: () => void;
  dismissNightActionResult: () => void;
  dismissVoteResult: () => void;

  // ---- 法官操作 ----
  overrideSettlement: (targetSeat: number, newStatus: string, reason: string) => void;
  forceNextPhase: () => void;
  togglePause: () => void;
  modifyNightOrder: (newOrder: RoleId[]) => void;
  modifySpeechOrder: (order: number[]) => void;
  triggerKnightDuel: (knightSeat: number, targetSeat: number) => void;
  triggerWhiteWolf: (wolfSeat: number, targetSeat: number) => void;
  skipSpeech: (seatNumber: number) => void;

  // ---- 管理员操作 ----
  fetchAdminLogs: (roomCode?: string, fromTime?: number, toTime?: number, limit?: number) => void;
  setAdminSecret: (secret: string) => void;

  // ---- RuleConfig 编辑 ----
  updateRuleConfig: (partial: Partial<RuleConfig>) => void;
  setNightActionOrderPreset: (preset: RuleConfig['nightActionOrderPreset']) => void;
}

// ============================================================================
// WebSocket 连接 URL 计算
// ============================================================================

/**
 * 根据当前环境计算 WebSocket 连接地址
 * 开发环境使用 localhost，生产环境使用 PUBLIC_URL
 */
export function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 开发环境直连后端端口
  if (window.location.port === '5173' || window.location.hostname === 'localhost') {
    return `${protocol}//localhost:3001`;
  }
  // 生产环境使用当前域名
  return `${protocol}//${window.location.host}`;
}

// ============================================================================
// Zustand Store 创建
// ============================================================================

export const useGameStore = create<GameState>((set, get) => ({
  // ---- 初始状态 ----
  ws: null,
  isConnected: false,
  isReconnecting: false,
  playerId: null,
  nickname: null,

  currentView: 'home',

  roomCode: null,
  inviteLink: null,
  qrCodeDataUrl: null,
  gameMode: null,

  playerState: null,
  judgeState: null,
  isJudge: false,

  error: null,
  judgeWarnings: [],
  phaseAnnouncement: null,

  roleConfirmed: false,
  speechMessages: [],
  nightActionResult: null,
  knightDuelResult: null,
  gameOverData: null,
  dayAnnouncement: null,
  voteResult: null,
  phaseTimeRemaining: 0,
  isActionLocked: false,
  spectatorIdentities: null,
  deadNightsElapsed: 0,
  appealEvent: null,
  showArbitration: false,
  arbitrationEvent: null,

  adminLogs: [],
  adminLogsTotal: 0,
  adminSecret: '',
  adminAuthSuccess: false,

  deadChatMessages: [],

  ruleConfig: createDefaultRuleConfig(),

  // ==========================================================================
  // WebSocket 连接管理
  // ==========================================================================

  connect: (url: string) => {
    const existingWs = get().ws;
    if (existingWs && existingWs.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      set({ isConnected: true, isReconnecting: false });
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        handleServerMessage(message, set, get);
      } catch (e) {
        console.error('[WS] 消息解析失败:', e);
      }
    };

    ws.onclose = () => {
      set({ isConnected: false });
      // 自动重连
      setTimeout(() => {
        if (get().playerId) {
          set({ isReconnecting: true });
          get().connect(url);
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('[WS] 连接错误:', error);
    };

    set({ ws });
  },

  disconnect: () => {
    const ws = get().ws;
    if (ws) {
      ws.close();
      set({ ws: null, isConnected: false, playerId: null });
    }
  },

  sendMessage: (message: ClientMessage) => {
    const ws = get().ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      set({ error: '未连接到服务器' });
      return;
    }
    ws.send(JSON.stringify(message));
  },

  // ==========================================================================
  // 视图路由
  // ==========================================================================

  setView: (view: ViewType) => {
    set({ currentView: view });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  dismissError: () => {
    set({ error: null });
  },

  dismissWarning: (index: number) => {
    set({ judgeWarnings: get().judgeWarnings.filter((_, i) => i !== index) });
  },

  dismissAnnouncement: () => {
    set({ phaseAnnouncement: null });
  },

  // ==========================================================================
  // 大厅操作
  // ==========================================================================

  createRoom: (nickname: string, gameMode: GameMode, config: RuleConfig) => {
    set({ nickname });
    get().sendMessage({
      type: 'CREATE_ROOM',
      nickname,
      gameMode,
      config,
    });
  },

  joinRoom: (nickname: string, roomCode: string) => {
    set({ nickname });
    get().sendMessage({
      type: 'JOIN_ROOM',
      nickname,
      roomCode: roomCode.toUpperCase(),
    });
  },

  leaveRoom: () => {
    get().sendMessage({ type: 'LEAVE_ROOM' });
    set({
      roomCode: null,
      inviteLink: null,
      qrCodeDataUrl: null,
      playerState: null,
      judgeState: null,
      isJudge: false,
      currentView: 'home',
      roleConfirmed: false,
      speechMessages: [],
      nightActionResult: null,
      knightDuelResult: null,
      gameOverData: null,
      dayAnnouncement: null,
      voteResult: null,
      phaseTimeRemaining: 0,
      isActionLocked: false,
      spectatorIdentities: null,
      deadNightsElapsed: 0,
      appealEvent: null,
      showArbitration: false,
      arbitrationEvent: null,
      deadChatMessages: [],
    });
  },

  setReady: (ready: boolean) => {
    get().sendMessage({ type: 'READY', ready });
  },

  startGame: () => {
    get().sendMessage({ type: 'START_GAME' });
  },

  // ==========================================================================
  // 游戏操作
  // ==========================================================================

  submitNightAction: (roleId: RoleId, targetSeat: number | null, extra: NightActionExtra) => {
    get().sendMessage({
      type: 'NIGHT_ACTION',
      roleId,
      targetSeat,
      extra,
    });
  },

  submitVote: (targetSeat: number | null) => {
    get().sendMessage({
      type: 'DAY_VOTE',
      targetSeat,
    });
  },

  submitJudgeElectionVote: (targetSeat: number | null) => {
    get().sendMessage({
      type: 'JUDGE_ELECTION_VOTE',
      targetSeat,
    });
  },

  knightDuel: (targetSeat: number) => {
    get().sendMessage({
      type: 'KNIGHT_DUEL',
      targetSeat,
    });
  },

  whiteWolfExplode: (targetSeat: number) => {
    get().sendMessage({
      type: 'WHITE_WOLF_EXPLODE',
      targetSeat,
    });
  },

  hunterGun: (targetSeat: number) => {
    get().sendMessage({
      type: 'HUNTER_GUN',
      targetSeat,
    });
  },

  wolfKingGun: (targetSeat: number) => {
    get().sendMessage({
      type: 'WOLF_KING_GUN',
      targetSeat,
    });
  },

  sendSpeech: (content: string) => {
    get().sendMessage({ type: 'SPEECH', content });
  },

  sendWolfChat: (content: string) => {
    get().sendMessage({ type: 'WOLF_CHAT', content });
  },

  sendWolfVote: (targetSeat: number) => {
    get().sendMessage({ type: 'WOLF_VOTE', targetSeat });
  },

  sendDeadChat: (content: string) => {
    get().sendMessage({ type: 'DEAD_CHAT', content });
  },

  confirmRole: () => {
    set({ roleConfirmed: true });
  },

  setActionLocked: (locked: boolean) => {
    set({ isActionLocked: locked });
  },

  setPhaseTimeRemaining: (seconds: number) => {
    set({ phaseTimeRemaining: seconds });
  },

  dismissDayAnnouncement: () => {
    set({ dayAnnouncement: null });
  },

  dismissKnightDuelResult: () => {
    set({ knightDuelResult: null });
  },

  dismissNightActionResult: () => {
    set({ nightActionResult: null });
  },

  dismissVoteResult: () => {
    set({ voteResult: null });
  },

  // ==========================================================================
  // 法官操作
  // ==========================================================================

  overrideSettlement: (targetSeat: number, newStatus: string, reason: string) => {
    get().sendMessage({
      type: 'JUDGE_OVERRIDE_SETTLEMENT',
      targetSeat,
      newStatus: newStatus as any,
      reason,
    });
  },

  forceNextPhase: () => {
    get().sendMessage({ type: 'JUDGE_FORCE_NEXT_PHASE' });
  },

  togglePause: () => {
    const state = get();
    // 根据当前暂停状态决定发送暂停还是恢复
    const isPaused = state.judgeState?.isPaused ?? state.playerState?.isPaused ?? false;
    get().sendMessage({ type: isPaused ? 'JUDGE_RESUME' : 'JUDGE_PAUSE' });
  },

  modifyNightOrder: (newOrder: RoleId[]) => {
    get().sendMessage({
      type: 'UPDATE_NIGHT_ORDER',
      newOrder,
    });
  },

  modifySpeechOrder: (order: number[]) => {
    get().sendMessage({
      type: 'JUDGE_MODIFY_SPEECH_ORDER',
      order,
    });
  },

  triggerKnightDuel: (knightSeat: number, targetSeat: number) => {
    get().sendMessage({
      type: 'JUDGE_TRIGGER_KNIGHT_DUEL',
      knightSeat,
      targetSeat,
    });
  },

  triggerWhiteWolf: (wolfSeat: number, targetSeat: number) => {
    get().sendMessage({
      type: 'JUDGE_TRIGGER_WHITE_WOLF',
      wolfSeat,
      targetSeat,
    });
  },

  skipSpeech: (seatNumber: number) => {
    get().sendMessage({
      type: 'JUDGE_SKIP_SPEECH',
      seatNumber,
    });
  },

  // ==========================================================================
  // 管理员操作
  // ==========================================================================

  fetchAdminLogs: (roomCode?: string, fromTime?: number, toTime?: number, limit?: number) => {
    get().sendMessage({
      type: 'ADMIN_FETCH_LOGS',
      secret: get().adminSecret,
      roomCode,
      fromTime,
      toTime,
      limit,
    });
  },

  setAdminSecret: (secret: string) => {
    set({ adminSecret: secret });
  },

  // ==========================================================================
  // RuleConfig 编辑
  // ==========================================================================

  updateRuleConfig: (partial: Partial<RuleConfig>) => {
    set({ ruleConfig: { ...get().ruleConfig, ...partial } });
  },

  setNightActionOrderPreset: (preset: RuleConfig['nightActionOrderPreset']) => {
    if (preset === 'chaos') {
      // 混沌模式：保持当前顺序，允许手动拖拽
      set({ ruleConfig: { ...get().ruleConfig, nightActionOrderPreset: 'chaos' } });
    } else {
      // 预置模板：直接替换顺序
      set({
        ruleConfig: {
          ...get().ruleConfig,
          nightActionOrderPreset: preset,
          nightActionOrder: [...NIGHT_ACTION_ORDER_PRESETS[preset]],
        },
      });
    }
  },
}));

// ============================================================================
// 服务端消息处理器
// ============================================================================

function handleServerMessage(
  message: ServerMessage,
  set: (partial: Partial<GameState>) => void,
  get: () => GameState,
): void {
  switch (message.type) {
    case 'ROOM_CREATED': {
      set({
        roomCode: message.roomCode,
        inviteLink: message.inviteLink,
        qrCodeDataUrl: message.qrCodeDataUrl,
        currentView: 'game',
      });
      break;
    }

    case 'ROOM_STATE': {
      const state = message.state;
      if ('config' in state) {
        // 法官视角
        set({
          judgeState: state as JudgeRoomStateDTO,
          isJudge: true,
          roomCode: state.roomCode,
          gameMode: state.gameMode,
          currentView: 'game',
        });
      } else {
        // 普通玩家视角
        const playerState = state as PlayerRoomStateDTO;
        const prevPlayerState = get().playerState;
        const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
        const isDead = myPlayer && myPlayer.status !== 'alive';

        // 计算死亡后经过的夜晚数
        let deadNightsElapsed = get().deadNightsElapsed;
        if (isDead && prevPlayerState) {
          // 如果从白天阶段进入夜晚阶段，递增计数
          const prevPhase = prevPlayerState.phase;
          const newPhase = playerState.phase;
          if (prevPhase !== 'NIGHT' && newPhase === 'NIGHT') {
            deadNightsElapsed += 1;
          }
        }

        // 阶段切换时重置操作锁定状态
        const phaseChanged = prevPlayerState && prevPlayerState.phase !== playerState.phase;
        const subPhaseChanged = prevPlayerState &&
          prevPlayerState.nightActionRequest?.roleId !== playerState.nightActionRequest?.roleId;

        set({
          playerState,
          isJudge: false,
          roomCode: playerState.roomCode,
          gameMode: playerState.gameMode,
          currentView: 'game',
          deadNightsElapsed,
          // 阶段或子阶段切换时重置操作锁定
          isActionLocked: phaseChanged || subPhaseChanged ? false : get().isActionLocked,
        });
      }
      break;
    }

    case 'PHASE_CHANGE': {
      const phaseNames: Record<GamePhase, string> = {
        LOBBY: '大厅等待',
        NIGHT: '天黑请闭眼',
        NIGHT_SETTLEMENT: '夜间结算中',
        DAY_ANNOUNCE: '天亮了',
        DAY_SPEECH: '发言阶段',
        DAY_VOTE: '投票阶段',
        DAY_SETTLEMENT: '白天结算中',
        DAY_INTERRUPT: '白天中断',
        PK_VOTE: 'PK投票',
        JUDGE_ELECTION: '法官选举',
        GAME_OVER: '游戏结束',
      };
      set({ phaseAnnouncement: phaseNames[message.phase] || message.phase });
      break;
    }

    case 'NIGHT_ACTION_REQUEST': {
      // 通知玩家该行动了（UI 层监听此状态变化来显示操作面板）
      if (get().playerState) {
        set({
          playerState: { ...get().playerState!, nightActionRequest: message.request },
        });
      }
      break;
    }

    case 'NIGHT_ACTION_RESULT': {
      set({ nightActionResult: message as NightActionResultMessage });
      if (message.seerResult) {
        const factionName = message.seerResult === 'good' ? '好人' : '狼人';
        set({ phaseAnnouncement: `查验结果：${factionName}阵营` });
      }
      break;
    }

    case 'DAY_ANNOUNCE': {
      const deathNames = message.deaths.map((d) => `${d.seatNumber}号`).join('、');
      const mutedNames = message.mutedSeats.map((s) => `${s}号`).join('、');
      let announcement = deathNames ? `昨晚 ${deathNames} 死亡` : '昨晚是平安夜';
      if (mutedNames) announcement += ` | ${mutedNames} 被禁言`;
      set({ phaseAnnouncement: announcement, dayAnnouncement: message as DayAnnounceMessage });
      break;
    }

    case 'VOTE_RESULT': {
      const eliminated = message.eliminated;
      if (eliminated) {
        set({ phaseAnnouncement: `${eliminated}号玩家被投票出局` });
      } else {
        set({ phaseAnnouncement: '无人出局' });
      }
      set({ voteResult: message as VoteResultMessage });
      break;
    }

    case 'KNIGHT_DUEL_RESULT': {
      const result = message.targetIsWolf
        ? `骑士决斗成功！${message.targetSeat}号是狼人，狼人死亡`
        : `骑士决斗失败！${message.targetSeat}号是好人${message.knightDied ? '，骑士自尽' : ''}`;
      const revealText = message.revealedRole ? `（真实身份：${message.revealedRole}）` : '';
      set({ phaseAnnouncement: result + revealText, knightDuelResult: message as KnightDuelResultMessage });
      break;
    }

    case 'WHITE_WOLF_EXPLODE_RESULT': {
      set({ phaseAnnouncement: `白狼王自爆！带走${message.targetSeat}号玩家` });
      break;
    }

    case 'GAME_OVER': {
      const winnerName = message.winner === 'good' ? '好人阵营' : '狼人阵营';
      set({ phaseAnnouncement: `游戏结束！${winnerName}获胜`, gameOverData: message as GameOverMessage });
      break;
    }

    case 'ERROR': {
      set({ error: message.message });
      break;
    }

    case 'JUDGE_WARNING': {
      set({
        judgeWarnings: [...get().judgeWarnings, {
          type: message.warningType,
          message: message.message,
          data: message.data,
        }],
      });
      break;
    }

    case 'SPEECH_ORDER_UPDATE': {
      // 发言顺序更新 — 更新 playerState 中的发言顺序
      const curState = get().playerState;
      if (curState) {
        set({
          playerState: {
            ...curState,
            speechOrder: message.order,
          },
        });
      }
      break;
    }

    case 'PLAYER_JOINED': {
      // 玩家加入 — ROOM_STATE 会推送最新状态，此处无需额外处理
      break;
    }

    case 'PLAYER_LEFT': {
      // 玩家离开 — ROOM_STATE 会推送最新状态，此处无需额外处理
      break;
    }

    case 'PLAYER_READY': {
      // 玩家准备 — ROOM_STATE 会推送最新状态，此处无需额外处理
      break;
    }

    case 'WOLF_CHAT_HISTORY': {
      // 狼人聊天消息 — 存储到 playerState 中
      const currentState = get().playerState;
      if (currentState) {
        set({
          playerState: {
            ...currentState,
            wolfChatMessages: [
              ...(currentState.wolfChatMessages || []),
              ...message.messages,
            ],
          },
        });
      }
      break;
    }

    case 'WOLF_VOTE_UPDATE': {
      const curState = get().playerState;
      if (curState) {
        set({
          playerState: {
            ...curState,
            wolfVotes: message.votes,
            wolfVoteConsensus: message.consensus,
          },
        });
      }
      break;
    }

    case 'PHASE_REMINDER': {
      // 阶段提醒 — 显示通知
      const roleMeta: Record<string, string> = {
        nightmare_shadow: '噩梦之影',
        werewolf: '狼人',
        witch: '女巫',
        seer: '预言家',
        guard: '守卫',
        mechanical_wolf: '机械狼',
      };
      const roleName = roleMeta[message.roleId] || message.roleId;
      set({ phaseAnnouncement: `轮到${roleName}行动` });
      break;
    }

    case 'DEAD_CHAT': {
      set({ deadChatMessages: [...get().deadChatMessages, { id: message.id, senderSeat: message.senderSeat, senderNickname: message.senderNickname, content: message.content, timestamp: message.timestamp }] });
      break;
    }

    case 'WOLF_PHASE_SKIPPED': {
      set({ phaseAnnouncement: message.publicMessage });
      break;
    }

    case 'DAY_VOTE_REVEAL': {
      const faction = message.revealedFaction;
      const role = message.revealedRole;
      let revealText = `${message.seatNumber}号玩家被票出`;
      if (role) {
        revealText += `，身份为${role}`;
      } else if (faction) {
        revealText += `，${faction === 'good' ? '好人' : '狼人'}阵营`;
      }
      set({ phaseAnnouncement: revealText });
      break;
    }

    case 'SPEECH_CONTENT': {
      set({
        speechMessages: [...get().speechMessages, {
          seatNumber: message.seatNumber,
          nickname: message.nickname,
          content: message.content,
          timestamp: Date.now(),
        }],
      });
      break;
    }

    case 'APPEAL_EVENT': {
      set({
        appealEvent: {
          eventId: message.eventId,
          description: message.description,
          logs: message.logs,
        },
      });
      break;
    }

    case 'ARBITRATION_VOTE': {
      set({
        showArbitration: true,
        arbitrationEvent: {
          eventId: message.eventId,
          description: message.description,
        },
      });
      break;
    }

    case 'ADMIN_LOGS_RESULT': {
      set({
        adminLogs: message.logs,
        adminLogsTotal: message.total,
        adminAuthSuccess: true,
      });
      break;
    }

    case 'HUNTER_GUN_RESULT': {
      set({ phaseAnnouncement: `猎人开枪！带走了${message.targetSeat}号 ${message.targetNickname}` });
      break;
    }

    case 'WOLF_KING_GUN_RESULT': {
      set({ phaseAnnouncement: `狼王开枪！带走了${message.targetSeat}号 ${message.targetNickname}` });
      break;
    }

    case 'IDIOT_REVEAL': {
      set({ phaseAnnouncement: `${message.seatNumber}号 ${message.nickname} 翻牌白痴，免死！` });
      break;
    }

    case 'JUDGE_ELECTED': {
      set({ phaseAnnouncement: `👑 ${message.seatNumber}号 ${message.nickname} 当选法官！` });
      break;
    }

    case 'JUDGE_ELECTION_TIE': {
      set({ phaseAnnouncement: `法官选举平票，无人当选` });
      break;
    }
  }
}
