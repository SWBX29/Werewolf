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
  RoomDissolvedMessage,
  ActionType,
  JudgeActionType,
} from '@langrensha/shared';
import {
  createDefaultRuleConfig,
  NIGHT_ACTION_ORDER_PRESETS,
} from '@langrensha/shared';
import { useVoiceStore } from './store/useVoiceStore';

// ============================================================================
// 视图路由状态
// ============================================================================

export type ViewType = 'home' | 'game' | 'admin' | 'simulator';

// ============================================================================
// Store 状态接口
// ============================================================================

interface GameState {
  // ---- 连接状态 ----
  ws: WebSocket | null;
  isConnected: boolean;
  isReconnecting: boolean;
  /** 重连尝试次数 */
  reconnectAttempts: number;
  /** 重连定时器引用 */
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  /** 是否正在手动重连（防止 ws.onclose 触发双重重连） */
  isManualReconnecting: boolean;
  /** WebSocket 服务器地址（用于重连） */
  wsUrl: string | null;
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
  /** 房间解散数据 */
  roomDissolvedData: RoomDissolvedMessage | null;
  /** 白天公告数据 */
  dayAnnouncement: DayAnnounceMessage | null;
  /** 投票结果数据 */
  voteResult: VoteResultMessage | null;
  /** 当前阶段倒计时（秒） */
  phaseTimeRemaining: number;
  /** 发言倒计时倒计时（秒），服务端同步 */
  speechTimeRemaining: number;
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

  /** 入夜前提示 */
  preNightHint: string | null;

  /** 警徽移交请求（警长死亡时收到） */
  sheriffTransferRequest: {
    deadSheriffSeat: number;
    deadSheriffNickname: string;
    availableTargets: number[];
    timeout: number;
  } | null;

  /** 警徽移交结果 */
  sheriffTransferResult: {
    fromSeat: number;
    toSeat: number;
    toNickname: string;
    isTimeout: boolean;
  } | null;

  // ---- 管理员 ----
  adminLogs: ActionLogDTO[];
  adminLogsTotal: number;
  adminLogsPage: number;
  adminLogsPageSize: number;
  adminLogsTotalPages: number;
  /** 管理员密钥（本地存储，用于管理员操作鉴权） */
  adminSecret: string;
  /** 管理员鉴权是否成功（收到服务端成功响应后设为 true） */
  adminAuthSuccess: boolean;

  // ---- 规则26：死亡玩家聊天 ----
  deadChatMessages: Array<{id: string; senderSeat: number; senderNickname: string; content: string; timestamp: number}>;

  // ---- 法官操作通知（玩家视角） ----
  judgeActions: Array<{ id: string; action: JudgeActionType; message: string; timestamp: number }>;

  // ---- 创建房间配置 ----
  ruleConfig: RuleConfig;

  /** 是否启用语音功能（来自房间配置，玩家和法官均可访问） */
  enableVoice: boolean;

  // ---- Actions ----
  connect: (url: string) => void;
  disconnect: () => void;
  manualReconnect: () => void;
  sendMessage: (message: ClientMessage) => void;
  setView: (view: ViewType) => void;
  setError: (error: string | null) => void;
  dismissError: () => void;
  dismissWarning: (index: number) => void;
  dismissAnnouncement: () => void;
  dismissJudgeAction: (id: string) => void;

  // ---- 大厅操作 ----
  createRoom: (nickname: string, gameMode: GameMode, config: RuleConfig) => void;
  joinRoom: (nickname: string, roomCode: string) => void;
  leaveRoom: () => void;
  dissolveRoom: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;

  // ---- 游戏操作 ----
  submitNightAction: (roleId: RoleId, targetSeat: number | null, extra: NightActionExtra) => void;
  submitVote: (targetSeat: number | null) => void;
  submitSheriffElectionVote: (targetSeat: number | null) => void;
  submitSheriffTransfer: (targetSeat: number) => void;
  dismissSheriffTransferResult: () => void;
  knightDuel: (targetSeat: number) => void;
  whiteWolfExplode: (targetSeat: number) => void;
  hunterGun: (targetSeat: number) => void;
  wolfKingGun: (targetSeat: number) => void;
  sendSpeech: (content: string) => void;
  finishSpeech: () => void;
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
  fetchAdminLogs: (params: {
    roomCode?: string;
    fromTime?: number;
    toTime?: number;
    limit?: number;
    actionTypes?: ActionType[];
    phases?: GamePhase[];
    actorSeat?: number;
    page?: number;
    pageSize?: number;
  }) => void;
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
 */
export function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 开发环境直连后端端口（仅本地访问时）
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${protocol}//localhost:3001`;
  }
  // 远程访问走当前页面地址的 /ws 代理
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * 重连策略常量 — 固定间隔 2.5s
 */
const RECONNECT_FIXED_DELAY = 2500;  // 固定重连间隔 2.5s
const RECONNECT_MAX_ATTEMPTS = 50;   // 最大重连次数（约 2 分钟后停止）

/**
 * 竞速连接（多线并行）
 * 同时发起多个 WebSocket 连接，第一个连通的胜出，其余立即关闭
 */
const RACE_PARALLEL_COUNT = 3;        // 并行连接数
const RACE_STAGGER_DELAY = 200;       // 每个连接之间的错开延迟 (ms)
const RACE_FALLBACK_TIMEOUT = 8000;   // 所有连接都未响应的兜底超时 (ms)

/**
 * 心跳间隔与超时
 */
const HEARTBEAT_INTERVAL = 25000;    // 每 25 秒发送一次心跳
const HEARTBEAT_TIMEOUT = 10000;     // 心跳超时 10 秒视为断连

/**
 * 固定重连延迟
 */
function getReconnectDelay(_attempts: number): number {
  return RECONNECT_FIXED_DELAY;
}

/**
 * 安排自动重连（固定 2.5s 间隔）
 * 使用 useGameStore.setState 直接更新状态
 */
function scheduleReconnect(): void {
  const state = useGameStore.getState();

  // 取消已有定时器
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
  }

  const attempts = state.reconnectAttempts;

  // 超过最大重连次数，停止重连并通知用户
  if (attempts >= RECONNECT_MAX_ATTEMPTS) {
    console.warn(`[WS] 已达最大重连次数 (${RECONNECT_MAX_ATTEMPTS})，停止自动重连`);
    useGameStore.setState({ isReconnecting: false, error: '连接断开过久，请刷新页面重试' });
    return;
  }

  const delay = getReconnectDelay(attempts);
  console.log(`[WS] 将在 ${(delay / 1000).toFixed(1)}s 后尝试第 ${attempts + 1} 次重连`);

  const timer = setTimeout(() => {
    const url = useGameStore.getState().wsUrl || getWsUrl();
    useGameStore.setState({ isReconnecting: true, reconnectTimer: null });
    useGameStore.getState().connect(url);
  }, delay);

  useGameStore.setState({ reconnectAttempts: attempts + 1, reconnectTimer: timer, isReconnecting: true });
}

// ============================================================================
// 心跳检测 & 页面可见性监听
// ============================================================================

/** 最后一次收到服务端消息的时间戳 */
let _lastPongTime = 0;

/** 竞速连接是否正在进行（防止旧竞速干扰新竞速） */
let _raceInProgress = false;

/** 心跳定时器 */
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** 页面可见性变化监听器 */
let _visibilityHandler: (() => void) | null = null;

/**
 * 启动心跳检测
 * 定期发送 PING 消息，如果超时未收到任何回复则判定连接死亡并触发重连
 */
function _startHeartbeat(ws: WebSocket): void {
  _stopHeartbeat();
  _lastPongTime = Date.now();

  _heartbeatTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const elapsed = Date.now() - _lastPongTime;
    if (elapsed > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT) {
      // 超时未收到回复 — 连接可能已死
      console.warn(`[WS] 心跳超时 (${(elapsed / 1000).toFixed(0)}s 无响应)，强制重连`);
      ws.close();
      return;
    }

    // 发送心跳
    try {
      ws.send(JSON.stringify({ type: 'PING' }));
    } catch {
      // 发送失败说明连接已断
      console.warn('[WS] 心跳发送失败，关闭连接');
      ws.close();
    }
  }, HEARTBEAT_INTERVAL);
}

function _stopHeartbeat(): void {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}

/**
 * 启动页面可见性监听
 * 用户切回前台时检查连接是否仍然存活，如已断开则立即触发重连
 */
function _startVisibilityWatch(ws: WebSocket): void {
  _stopVisibilityWatch();

  if (typeof document === 'undefined') return;

  _visibilityHandler = () => {
    if (document.visibilityState !== 'visible') return;

    const state = useGameStore.getState();
    if (state.ws !== ws) return;

    // 页面回到前台 — 检查连接状态
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      console.log('[WS] 页面回到前台，发现连接已断开，立即重连');
      ws.close(); // 确保 onclose 被触发
      return;
    }

    if (ws.readyState === WebSocket.OPEN) {
      // 连接看起来还在 — 发送一个心跳验证
      const elapsed = Date.now() - _lastPongTime;
      if (elapsed > HEARTBEAT_INTERVAL) {
        console.log(`[WS] 页面回到前台，距上次消息 ${(elapsed / 1000).toFixed(0)}s，发送心跳验证`);
        try {
          ws.send(JSON.stringify({ type: 'PING' }));
        } catch {
          ws.close();
        }
      }
    }
  };

  document.addEventListener('visibilitychange', _visibilityHandler);
}

function _stopVisibilityWatch(): void {
  if (_visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    _visibilityHandler = null;
  }
}

/**
 * 清理连接相关资源（心跳 + 可见性监听）
 */
function _cleanupConnectionResources(): void {
  _stopHeartbeat();
  _stopVisibilityWatch();
  _lastPongTime = 0;
  _raceInProgress = false;
}

// ============================================================================
// Zustand Store 创建
// ============================================================================

/**
 * HMR 状态保持 — 防止热更新时 Zustand store 被重置为初始值
 *
 * 原理：
 *   1. Vite HMR 替换本模块前，dispose 回调将当前 store 快照写入 window
 *   2. 新模块求值时，从 window 读取快照并合并到初始状态中
 *   3. 新模块中重新定义的方法会覆盖快照中的旧方法引用
 *   4. 连接/定时器等运行时资源随旧 store 被 GC，新 store 通过
 *      App.useEffect 自动重新建立连接，并携带保存的 playerId/roomCode 发送 RECONNECT
 */
const _hmrPrev: Partial<GameState> | null =
  typeof window !== 'undefined' ? ((window as any).__ZUSTAND_HMR__ ?? null) : null;

export const useGameStore = create<GameState>((set, get) => ({
  // ---- 初始状态（HMR 时从快照恢复） ----
  ws: null,
  isConnected: false,
  isReconnecting: false,
  reconnectAttempts: 0,
  reconnectTimer: null,
  isManualReconnecting: false,
  wsUrl: null,
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
  roomDissolvedData: null,
  dayAnnouncement: null,
  voteResult: null,
  phaseTimeRemaining: 0,
  speechTimeRemaining: 0,
  isActionLocked: false,
  spectatorIdentities: null,
  deadNightsElapsed: 0,
  appealEvent: null,
  showArbitration: false,
  arbitrationEvent: null,

  preNightHint: null,

  sheriffTransferRequest: null,
  sheriffTransferResult: null,

  adminLogs: [],
  adminLogsTotal: 0,
  adminLogsPage: 1,
  adminLogsPageSize: 25,
  adminLogsTotalPages: 0,
  adminSecret: '',
  adminAuthSuccess: false,

  deadChatMessages: [],

  judgeActions: [],

  ruleConfig: createDefaultRuleConfig(),
  enableVoice: true,

  // ---- HMR 状态恢复 ----
  // 覆盖上面的初始值；方法引用在下方被重新定义，不受影响
  ...(_hmrPrev ?? {}),

  // ==========================================================================
  // WebSocket 连接管理
  // ==========================================================================

  connect: (url: string) => {
    const existingWs = get().ws;
    // 防止重复连接：OPEN 或 CONNECTING 状态都跳过
    if (existingWs && (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING)) return;

    // 清理旧连接的心跳和可见性监听
    _cleanupConnectionResources();

    // 保存服务器地址用于重连
    set({ wsUrl: url });

    // --- 竞速连接：同时发起多个 WebSocket，第一个连通的胜出 ---
    const raceTag = `[WS-Race #${Date.now() % 100000}]`;
    console.log(`${raceTag} 发起 ${RACE_PARALLEL_COUNT} 路并行连接`);

    let settled = false;
    const candidates: WebSocket[] = [];
    _raceInProgress = true;

    function settleWith(winner: WebSocket, idx: number): void {
      if (settled) return;
      // 如果新一轮竞速已开始，当前竞速作废
      if (!_raceInProgress) {
        winner.onopen = winner.onmessage = winner.onclose = winner.onerror = null;
        winner.close();
        return;
      }
      settled = true;
      _raceInProgress = false;

      console.log(`${raceTag} 连接 #${idx + 1} 胜出 (${Math.round(performance.now())}ms)`);
      set({ ws: winner, isConnected: true, isReconnecting: false, reconnectAttempts: 0 });

      // 发送重连消息恢复会话
      const { playerId, roomCode } = get();
      if (playerId && roomCode) {
        console.log(`[WS] 发送重连请求: playerId=${playerId}, roomCode=${roomCode}`);
        winner.send(JSON.stringify({ type: 'RECONNECT', playerId, roomCode }));
      }

      // 启动心跳 & 可见性监听
      _startHeartbeat(winner);
      _startVisibilityWatch(winner);

      // 关闭落选连接
      candidates.forEach((ws, i) => {
        if (ws !== winner) {
          console.log(`${raceTag} 关闭落选连接 #${i + 1}`);
          ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
          ws.close();
        }
      });
    }

    for (let i = 0; i < RACE_PARALLEL_COUNT; i++) {
      setTimeout(() => {
        if (settled || !_raceInProgress) return;

        const ws = new WebSocket(url);
        candidates.push(ws);

        ws.onopen = () => {
          if (settled || !_raceInProgress) { ws.close(); return; }
          settleWith(ws, i);
        };

        ws.onmessage = (event) => {
          if (get().ws !== ws) return;
          _lastPongTime = Date.now();
          try {
            const message: ServerMessage = JSON.parse(event.data);
            // PONG 消息用于心跳检测，不需要处理
            if ((message as any).type === 'PONG') return;
            handleServerMessage(message, set, get);
          } catch (e) {
            console.error('[WS] 消息解析失败:', e);
          }
        };

        ws.onclose = () => {
          if (get().ws !== ws) return;
          _cleanupConnectionResources();
          if (get().isManualReconnecting) {
            set({ isConnected: false });
            return;
          }
          set({ isConnected: false });
          scheduleReconnect();
        };

        ws.onerror = (error) => {
          if (get().ws !== ws) return;
          console.error(`[WS] 连接 #${i + 1} 错误:`, error);
        };
      }, i * RACE_STAGGER_DELAY);
    }

    // 兜底：超时后若仍无胜出，清理所有未决连接并触发重连
    setTimeout(() => {
      if (settled || !_raceInProgress) return;
      console.warn(`${raceTag} 竞速超时 (${RACE_FALLBACK_TIMEOUT}ms)，清理未决连接`);
      settled = true;
      _raceInProgress = false;
      candidates.forEach((ws) => {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        ws.close();
      });
      if (!get().isManualReconnecting) {
        scheduleReconnect();
      }
    }, RACE_FALLBACK_TIMEOUT + (RACE_PARALLEL_COUNT - 1) * RACE_STAGGER_DELAY);
  },

  disconnect: () => {
    // 取消重连定时器
    const timer = get().reconnectTimer;
    if (timer) {
      clearTimeout(timer);
      set({ reconnectTimer: null });
    }
    // 清理心跳和可见性监听
    _cleanupConnectionResources();
    const ws = get().ws;
    if (ws) {
      ws.close();
    }
    set({ ws: null, isConnected: false, isReconnecting: false, reconnectAttempts: 0, playerId: null, wsUrl: null });
  },

  /** 手动触发重连 */
  manualReconnect: () => {
    // 取消现有重连定时器
    const timer = get().reconnectTimer;
    if (timer) {
      clearTimeout(timer);
      set({ reconnectTimer: null });
    }
    // 关闭旧连接（先置空 ws，这样旧 ws 的 onclose 会被 get().ws !== ws 过滤掉）
    const oldWs = get().ws;
    set({ ws: null, isConnected: false, isReconnecting: true, reconnectAttempts: 0 });
    if (oldWs) {
      oldWs.close();
    }
    // 立即重连
    const url = get().wsUrl || getWsUrl();
    get().connect(url);
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

  dismissJudgeAction: (id: string) => {
    set({ judgeActions: get().judgeActions.filter((a) => a.id !== id) });
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

  // Bug 54 说明：leaveRoom 采用乐观更新策略
  // 立即重置本地状态以提供即时反馈，不等待服务端确认
  // 这是有意为之的设计选择，因为：
  // 1. 离开房间是用户主动操作，服务端几乎不会拒绝
  // 2. 即使网络延迟，用户也能立即看到离开效果
  // 3. 如果服务端未收到消息，WebSocket 重连后会自动同步状态
  leaveRoom: () => {
    // 先退出语音房间（确保语音资源释放）
    useVoiceStore.getState().leaveVoiceRoom();
    
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
      roomDissolvedData: null,
      dayAnnouncement: null,
      voteResult: null,
      phaseTimeRemaining: 0,
      speechTimeRemaining: 0,
      isActionLocked: false,
      spectatorIdentities: null,
      deadNightsElapsed: 0,
      appealEvent: null,
      showArbitration: false,
      arbitrationEvent: null,
      deadChatMessages: [],
      judgeActions: [],
      preNightHint: null,
      sheriffTransferRequest: null,
      sheriffTransferResult: null,
    });
  },

  dissolveRoom: () => {
    get().sendMessage({ type: 'DISSOLVE_ROOM' });
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

  submitSheriffElectionVote: (targetSeat: number | null) => {
    get().sendMessage({
      type: 'SHERIFF_ELECTION_VOTE',
      targetSeat,
    });
  },

  submitSheriffTransfer: (targetSeat: number) => {
    get().sendMessage({
      type: 'SHERIFF_TRANSFER',
      targetSeat,
    });
  },

  dismissSheriffTransferResult: () => {
    set({ sheriffTransferResult: null });
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

  finishSpeech: () => {
    get().sendMessage({ type: 'FINISH_SPEECH' });
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

  fetchAdminLogs: (params: {
    roomCode?: string;
    fromTime?: number;
    toTime?: number;
    limit?: number;
    actionTypes?: ActionType[];
    phases?: GamePhase[];
    actorSeat?: number;
    page?: number;
    pageSize?: number;
  }) => {
    get().sendMessage({
      type: 'ADMIN_FETCH_LOGS',
      secret: get().adminSecret,
      ...params,
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

// ---- HMR 状态保存 ----
// 模块被 HMR 替换前，将当前 store 快照写入 window，供新模块恢复
const _hot = (import.meta as any).hot;
if (_hot) {
  _hot.dispose(() => {
    const snapshot = useGameStore.getState();
    // 清理不可序列化的运行时资源，避免泄漏
    if (snapshot.reconnectTimer) clearTimeout(snapshot.reconnectTimer);
    (window as any).__ZUSTAND_HMR__ = {
      ...snapshot,
      ws: null,
      isConnected: false,
      isReconnecting: false,
      reconnectTimer: null,
      reconnectAttempts: 0,
      isManualReconnecting: false,
    };
  });
}

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
        const judgeState = state as JudgeRoomStateDTO;
        const judgePlayerId = judgeState.players.find((p) => p.isJudge)?.id;
        set({
          judgeState,
          isJudge: true,
          roomCode: judgeState.roomCode,
          gameMode: judgeState.gameMode,
          currentView: 'game',
          enableVoice: judgeState.config.enableVoice,
          // 法官视角下保存 playerId（优先使用消息中的 playerId，用于断连重连）
          playerId: judgePlayerId || get().playerId,
        });
      } else {
        // 普通玩家视角
        const playerState = state as PlayerRoomStateDTO;
        const prevPlayerState = get().playerState;
        const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
        const isDead = myPlayer && myPlayer.status !== 'alive';

        // 计算死亡后经过的夜晚数
        let deadNightsElapsed = get().deadNightsElapsed;
        if (isDead) {
          // 如果玩家刚死亡（之前不是死亡状态），初始化计数
          const prevMyPlayer = prevPlayerState?.players.find((p) => p.id === prevPlayerState.myPlayerId);
          const wasDead = prevMyPlayer && prevMyPlayer.status !== 'alive';
          
          if (!wasDead) {
            // 玩家刚死亡，初始化为 0（死亡当晚不算）
            deadNightsElapsed = 0;
          } else if (prevPlayerState) {
            // 玩家已死亡，如果从白天阶段进入夜晚阶段，递增计数
            const prevPhase = prevPlayerState.phase;
            const newPhase = playerState.phase;
            if (prevPhase !== 'NIGHT' && newPhase === 'NIGHT') {
              deadNightsElapsed += 1;
            }
          }
        }

        // 阶段切换时重置操作锁定状态
        const phaseChanged = prevPlayerState && prevPlayerState.phase !== playerState.phase;
        const subPhaseChanged = prevPlayerState &&
          prevPlayerState.nightActionRequest?.roleId !== playerState.nightActionRequest?.roleId;

        // 阶段已过 ROLE_REVEAL 且角色已分配 → 自动确认角色（处理重连场景）
        const autoConfirmRole =
          playerState.phase !== 'LOBBY' &&
          playerState.phase !== 'ROLE_REVEAL' &&
          !!myPlayer?.role;

        set({
          playerState,
          isJudge: false,
          roomCode: playerState.roomCode,
          gameMode: playerState.gameMode,
          currentView: 'game',
          enableVoice: playerState.enableVoice,
          deadNightsElapsed,
          // 阶段或子阶段切换时重置操作锁定
          isActionLocked: phaseChanged || subPhaseChanged ? false : get().isActionLocked,
          preNightHint: playerState.preNightHint ?? null,
          // 重连时自动确认角色，防止 NightPhase 等组件因 roleConfirmed=false 返回空
          roleConfirmed: autoConfirmRole ? true : get().roleConfirmed,
          // 保存 playerId（优先使用消息中的 playerId，确保重连后 playerId 正确）
          playerId: playerState.myPlayerId || get().playerId,
        });
      }
      break;
    }

    case 'PHASE_CHANGE': {
      const phaseNames: Record<GamePhase, string> = {
        LOBBY: '大厅等待',
        ROLE_REVEAL: '身份展示',
        PRE_NIGHT: '入夜等待',
        NIGHT: '天黑请闭眼',
        NIGHT_SETTLEMENT: '夜间结算中',
        DAY_ANNOUNCE: '天亮了',
        DAY_SPEECH: '发言阶段',
        PRE_VOTE_WAIT: '投票前等待',
        DAY_VOTE: '投票阶段',
        DAY_SETTLEMENT: '白天结算中',
        DAY_INTERRUPT: '白天中断',
        PK_VOTE: 'PK投票',
        SHERIFF_ELECTION: '警长选举',
        SHERIFF_TRANSFER: '警徽移交',
        GAME_OVER: '游戏结束',
      };
      // 离开夜间阶段时清除倒计时
      // 天黑/天亮提示由阶段专属面板展示，顶部不再重复显示
      const suppressAnnouncement = ['NIGHT', 'DAY_ANNOUNCE'].includes(message.phase);
      const updates: Partial<GameState> = {
        phaseAnnouncement: suppressAnnouncement ? null : (phaseNames[message.phase] || message.phase),
      };
      if (message.phase !== 'NIGHT') {
        updates.phaseTimeRemaining = 0;
      }
      if (message.phase !== 'DAY_SPEECH') {
        updates.speechTimeRemaining = 0;
      }
      // Bug 2 修复：当仍在 DAY_SPEECH 阶段时（发言者切换），不重置 speechTimeRemaining
      // 新的 SPEECH_COUNTDOWN 消息会很快到达并更新正确的倒计时值
      if (message.phase === 'PRE_NIGHT') {
        // Bug 3 修复：使用可配置的技能发动等待时间
        const skillTimeout = get().ruleConfig?.skillActivationTimeout || 15;
        updates.phaseTimeRemaining = skillTimeout;
      }
      // 非 LOBBY / ROLE_REVEAL 阶段且玩家已有角色 → 自动确认
      // 注意：不能依赖 playerState.phase === 'ROLE_REVEAL'，因为 ROOM_STATE
      // 可能先于 PHASE_CHANGE 到达，已将 phase 覆盖为新阶段
      const hasRole = !!get().playerState?.players.find(
        (p) => p.id === get().playerState?.myPlayerId
      )?.role;
      if (
        message.phase !== 'ROLE_REVEAL' &&
        message.phase !== 'LOBBY' &&
        hasRole &&
        !get().roleConfirmed
      ) {
        updates.roleConfirmed = true;
      }
      set(updates);
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

    case 'ROOM_DISSOLVED': {
      set({
        roomDissolvedData: message as RoomDissolvedMessage,
        currentView: 'game',
      });
      break;
    }

    case 'RECONNECT_SUCCESS': {
      console.log(`[WS] 重连成功: playerId=${message.playerId}, roomCode=${message.roomCode}`);
      // 重连成功后，服务端会通过 ROOM_STATE 等消息推送当前游戏状态
      // 这里只需确保 playerId 和 roomCode 正确
      set({
        playerId: message.playerId,
        roomCode: message.roomCode,
      });
      break;
    }

    case 'ERROR': {
      // 重连失败：服务端会话已过期（宽限期超时 / 房间已解散）
      // 重置所有游戏状态，返回主界面
      if (message.code === 'RECONNECT_FAILED') {
        set({
          error: message.message,
          currentView: 'home',
          playerId: null,
          roomCode: null,
          inviteLink: null,
          qrCodeDataUrl: null,
          playerState: null,
          judgeState: null,
          isJudge: false,
          gameMode: null,
          roleConfirmed: false,
          speechMessages: [],
          nightActionResult: null,
          knightDuelResult: null,
          gameOverData: null,
          roomDissolvedData: null,
          dayAnnouncement: null,
          voteResult: null,
          phaseTimeRemaining: 0,
          speechTimeRemaining: 0,
          isActionLocked: false,
          spectatorIdentities: null,
          deadNightsElapsed: 0,
          appealEvent: null,
          showArbitration: false,
          arbitrationEvent: null,
          deadChatMessages: [],
          judgeActions: [],
          preNightHint: null,
          sheriffTransferRequest: null,
          sheriffTransferResult: null,
          phaseAnnouncement: null,
          judgeWarnings: [],
        });
      } else {
        // 操作被服务器拒绝时，解锁操作锁定，防止界面卡死
        if (message.code === 'NIGHT_ACTION_FAILED' || message.code === 'VOTE_FAILED' || message.code === 'SHERIFF_ELECTION_VOTE_FAILED' || message.code === 'FINISH_SPEECH_FAILED') {
          set({ error: message.message, isActionLocked: false });
        } else {
          set({ error: message.message });
        }
      }
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

    case 'JUDGE_ACTION': {
      const actionId = `ja_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      set({
        judgeActions: [...get().judgeActions, {
          id: actionId,
          action: message.action,
          message: message.message,
          timestamp: Date.now(),
        }],
      });
      // 5秒后自动移除通知
      setTimeout(() => {
        set({ judgeActions: get().judgeActions.filter((a) => a.id !== actionId) });
      }, 5000);
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
      // 狼人聊天消息 — 存储到 playerState 或 judgeState 中
      const currentState = get().playerState;
      const currentJudgeState = get().judgeState;
      
      if (get().isJudge && currentJudgeState) {
        // 法官视角：追加到 judgeState.wolfChatMessages
        set({
          judgeState: {
            ...currentJudgeState,
            wolfChatMessages: [
              ...(currentJudgeState.wolfChatMessages || []),
              ...message.messages,
            ],
          },
        });
      } else if (currentState) {
        // 玩家视角：追加到 playerState.wolfChatMessages
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
      // "轮到xx行动"提示由角色行动面板自行展示，顶部不再重复显示
      break;
    }

    case 'NIGHT_COUNTDOWN': {
      // 夜间倒计时广播 — 更新当前阶段剩余时间
      set({ phaseTimeRemaining: message.remaining });
      break;
    }

    case 'SPEECH_COUNTDOWN': {
      // 发言倒计时广播 — 更新当前发言者剩余时间
      set({ speechTimeRemaining: message.remaining });
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
        adminLogsPage: message.page,
        adminLogsPageSize: message.pageSize,
        adminLogsTotalPages: message.totalPages,
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

    case 'SHERIFF_ELECTED': {
      set({ phaseAnnouncement: `⭐ ${message.seatNumber}号 ${message.nickname} 当选警长！` });
      break;
    }

    case 'SHERIFF_ELECTION_TIE': {
      set({ phaseAnnouncement: `警长选举平票，无人当选` });
      break;
    }

    case 'SHERIFF_TRANSFER_REQUEST': {
      set({
        phaseAnnouncement: `警长 ${message.deadSheriffNickname}（${message.deadSheriffSeat}号）死亡，需要移交警徽`,
        sheriffTransferRequest: {
          deadSheriffSeat: message.deadSheriffSeat,
          deadSheriffNickname: message.deadSheriffNickname,
          availableTargets: message.availableTargets,
          timeout: message.timeout,
        },
      });
      break;
    }

    case 'SHERIFF_TRANSFER_RESULT': {
      const timeoutText = message.isTimeout ? '（超时自动移交）' : '';
      set({
        phaseAnnouncement: `警徽移交给 ${message.toSeat}号 ${message.toNickname}${timeoutText}`,
        sheriffTransferRequest: null,
        sheriffTransferResult: {
          fromSeat: message.fromSeat,
          toSeat: message.toSeat,
          toNickname: message.toNickname,
          isTimeout: message.isTimeout,
        },
      });
      break;
    }
  }
}
