/**
 * ============================================================================
 * 狼人杀模拟器 — Zustand 全局状态仓库
 * ============================================================================
 *
 * 管理多个 WebSocket 连接（1 法官 + N 玩家），提供模拟器的完整状态管理。
 * 核心职责：
 *   1. 多连接 WebSocket 生命周期管理
 *   2. 服务端消息的接收与状态同步
 *   3. 自动策略建议与执行
 *   4. 事件日志记录
 * ============================================================================
 */

import { create } from 'zustand';
import type {
  ClientMessage,
  ServerMessage,
  GameMode,
  RuleConfig,
  GamePhase,
  NightSubPhase,
  RoleId,
  JudgeRoomStateDTO,
  PlayerRoomStateDTO,
  PlayerDTO,
  Player,
  Faction,
} from '@langrensha/shared';
import {
  createDefaultRuleConfig,
  ROLE_META,
  PHASE_NAMES,
  DEATH_CAUSE_NAMES,
  isEvilRole,
  isGodRole,
} from '@langrensha/shared';
import type {
  SimConnection,
  SimEvent,
  AutoMode,
  SimulatorPhase,
  AutoStrategies,
} from './types';
import {
  DEFAULT_AUTO_STRATEGIES,
  MAX_EVENT_LOG_SIZE,
  EVENT_ICONS,
  DEFAULT_PLAYER_NAMES,
} from './constants';
import {
  createConnection,
  sendMessage,
  setupHeartbeat,
  closeConnection,
  parseMessage,
  getSimulatorWsUrl,
} from './websocket';
import { injectStateToGameStore, clearInjectedState, updateGameStoreFromMessage } from './storeInjector';

// ============================================================================
// 心跳定时器追踪
// ============================================================================

/** 每个连接的心跳 interval ID，用于清理 */
const heartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

/** 自动执行定时器追踪 */
const autoExecuteTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

// ============================================================================
// Store 状态接口
// ============================================================================

interface SimulatorState {
  // ---- 连接状态 ----
  connections: Map<string, SimConnection>;
  judgeConnection: SimConnection | null;
  serverUrl: string;
  roomCode: string | null;
  judgeState: JudgeRoomStateDTO | null;
  playerStates: Map<string, PlayerRoomStateDTO>;
  currentPhase: GamePhase;
  currentRound: number;
  nightSubPhase: NightSubPhase | null;
  selectedPlayerId: string | null;
  eventLog: SimEvent[];
  autoStrategies: AutoStrategies;
  autoMode: AutoMode;
  isInitialized: boolean;
  error: string | null;
  simulatorPhase: SimulatorPhase;

  /** 房间创建前暂存的玩家昵称列表 */
  pendingPlayerNames: string[];

  // ---- Actions ----
  setServerUrl: (url: string) => void;
  createRoom: (nickname: string, gameMode: GameMode, config: RuleConfig) => void;
  addPlayer: (nickname: string) => void;
  removePlayer: (playerId: string) => void;
  readyPlayer: (playerId: string, ready: boolean) => void;
  readyAllPlayers: () => void;
  startGame: () => void;
  submitAction: (playerId: string, message: ClientMessage) => void;
  submitJudgeAction: (message: ClientMessage) => void;
  selectPlayer: (playerId: string | null) => void;
  setAutoMode: (mode: AutoMode) => void;
  setAutoStrategy: (roleId: string, strategy: Record<string, unknown>) => void;
  executeSuggestedAction: (playerId: string) => void;
  executeAllSuggested: () => void;
  generateSuggestion: (playerId: string) => ClientMessage | null;
  disconnectAll: () => void;
  clearError: () => void;
  addEvent: (event: Omit<SimEvent, 'timestamp'>) => void;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 清理指定连接的心跳定时器 */
function clearHeartbeat(key: string): void {
  const timer = heartbeatTimers.get(key);
  if (timer !== undefined) {
    clearInterval(timer);
    heartbeatTimers.delete(key);
  }
}

/** 清理所有心跳定时器 */
function clearAllHeartbeats(): void {
  heartbeatTimers.forEach((timer) => clearInterval(timer));
  heartbeatTimers.clear();
}

/** 从法官状态中同步玩家角色到 connections */
function syncPlayerRolesFromJudge(
  connections: Map<string, SimConnection>,
  judgeState: JudgeRoomStateDTO | null,
): Map<string, SimConnection> {
  if (!judgeState) return connections;
  const next = new Map(connections);
  let changed = false;

  for (const player of judgeState.players) {
    const conn = next.get(player.id);
    if (conn && (conn.role !== player.role || conn.seatNumber !== player.seatNumber)) {
      next.set(player.id, {
        ...conn,
        role: player.role,
        seatNumber: player.seatNumber,
        isReady: player.isReady,
      });
      changed = true;
    }
  }

  return changed ? next : connections;
}

/** 从存活玩家列表中随机选择一个座位号 */
function pickRandomSeat(players: Array<{ seatNumber: number; status: string }>): number | null {
  const alive = players.filter((p) => p.status === 'alive');
  if (alive.length === 0) return null;
  return alive[Math.floor(Math.random() * alive.length)].seatNumber;
}

/** 从存活玩家列表中随机选择一个神职座位号 */
function pickRandomGodSeat(players: Player[]): number | null {
  const aliveGods = players.filter(
    (p) => p.status === 'alive' && isGodRole(p.role),
  );
  if (aliveGods.length === 0) return null;
  return aliveGods[Math.floor(Math.random() * aliveGods.length)].seatNumber;
}

/** 从存活玩家列表中随机选择一个狼人座位号 */
function pickRandomEvilSeat(players: Player[]): number | null {
  const aliveEvil = players.filter(
    (p) => p.status === 'alive' && isEvilRole(p.role),
  );
  if (aliveEvil.length === 0) return null;
  return aliveEvil[Math.floor(Math.random() * aliveEvil.length)].seatNumber;
}

/** 从存活玩家列表中随机选择一个好人座位号 */
function pickRandomGoodSeat(players: Player[]): number | null {
  const aliveGood = players.filter(
    (p) => p.status === 'alive' && !isEvilRole(p.role),
  );
  if (aliveGood.length === 0) return null;
  return aliveGood[Math.floor(Math.random() * aliveGood.length)].seatNumber;
}

// ============================================================================
// Zustand Store 创建
// ============================================================================

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  // ---- 初始状态 ----
  connections: new Map(),
  judgeConnection: null,
  serverUrl: getSimulatorWsUrl(),
  roomCode: null,
  judgeState: null,
  playerStates: new Map(),
  currentPhase: 'LOBBY',
  currentRound: 0,
  nightSubPhase: null,
  selectedPlayerId: null,
  eventLog: [],
  autoStrategies: { ...DEFAULT_AUTO_STRATEGIES },
  autoMode: 'off',
  isInitialized: false,
  error: null,
  simulatorPhase: 'setup',
  pendingPlayerNames: [],

  // ---- Actions ----

  setServerUrl: (url: string) => {
    set({ serverUrl: url });
  },

  createRoom: (nickname: string, gameMode: GameMode, config: RuleConfig) => {
    const state = get();

    // 强制关闭语音
    const forcedConfig: RuleConfig = { ...config, enableVoice: false };

    // 创建法官 WebSocket 连接
    const ws = createConnection(state.serverUrl);

    const judgeConn: SimConnection = {
      playerId: '__judge__',
      nickname,
      seatNumber: null,
      role: null,
      ws,
      isConnected: false,
      isJudge: true,
      isReady: false,
      state: null,
      suggestedAction: null,
      connectedAt: Date.now(),
    };

    set({
      judgeConnection: judgeConn,
      simulatorPhase: 'setup',
      error: null,
    });

    ws.onopen = () => {
      set((s) => {
        if (s.judgeConnection?.ws !== ws) return s;
        return {
          judgeConnection: { ...s.judgeConnection, isConnected: true },
        };
      });

      // 发送 CREATE_ROOM
      sendMessage(ws, {
        type: 'CREATE_ROOM',
        nickname,
        gameMode,
        config: forcedConfig,
      });

      // 启动心跳
      const hb = setupHeartbeat(ws);
      heartbeatTimers.set('__judge__', hb);
    };

    ws.onmessage = (event) => {
      const msg = parseMessage(event.data);
      if (!msg) return;

      const currentState = get();

      // 只处理当前法官连接的消息
      if (currentState.judgeConnection?.ws !== ws) return;

      handleJudgeMessage(msg, ws);
    };

    ws.onerror = () => {
      // Bug 113 修复：出错时正确关闭连接
      closeConnection(ws);
      clearHeartbeat('__judge__');
      set((s) => {
        if (s.judgeConnection?.ws !== ws) return s;
        return {
          judgeConnection: s.judgeConnection
            ? { ...s.judgeConnection, isConnected: false, ws: null }
            : null,
          error: '法官连接发生错误',
        };
      });
      // Bug 165 修复：onerror 时触发 onclose 清理逻辑
      ws.onclose?.(new CloseEvent('close'));
    };

    ws.onclose = () => {
      clearHeartbeat('__judge__');
      set((s) => {
        if (s.judgeConnection?.ws !== ws) return s;
        return {
          judgeConnection: s.judgeConnection
            ? { ...s.judgeConnection, isConnected: false, ws: null }
            : null,
        };
      });
    };
  },

  addPlayer: (nickname: string) => {
    const state = get();
    const roomCode = state.roomCode;

    // 如果房间尚未创建，暂存玩家名
    if (!roomCode) {
      set((s) => ({
        pendingPlayerNames: [...s.pendingPlayerNames, nickname],
      }));
      return;
    }

    // 创建玩家 WebSocket 连接
    const ws = createConnection(state.serverUrl);
    const tempId = `__pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`;

    const conn: SimConnection = {
      playerId: tempId,
      nickname,
      seatNumber: null,
      role: null,
      ws,
      isConnected: false,
      isJudge: false,
      isReady: false,
      state: null,
      suggestedAction: null,
      connectedAt: Date.now(),
    };

    set((s) => {
      const next = new Map(s.connections);
      next.set(tempId, conn);
      return { connections: next };
    });

    ws.onopen = () => {
      // 更新连接状态
      set((s) => {
        const next = new Map(s.connections);
        const c = next.get(tempId);
        if (c && c.ws === ws) {
          next.set(tempId, { ...c, isConnected: true });
        }
        return { connections: next };
      });

      // 发送 JOIN_ROOM
      sendMessage(ws, {
        type: 'JOIN_ROOM',
        nickname,
        roomCode,
      });

      // 启动心跳
      const hb = setupHeartbeat(ws);
      heartbeatTimers.set(tempId, hb);
    };

    ws.onmessage = (event) => {
      const msg = parseMessage(event.data);
      if (!msg) return;

      // 找到对应的连接
      const currentState = get();
      let playerId: string | null = null;
      for (const [id, c] of currentState.connections) {
        if (c.ws === ws) {
          playerId = id;
          break;
        }
      }
      if (!playerId) return;

      handlePlayerMessage(playerId, msg, ws);
    };

    ws.onerror = () => {
      // Bug 113 修复：出错时正确关闭连接
      closeConnection(ws);
      // Bug 143 修复：onerror 时清理心跳并更新连接状态
      const currentState = get();
      let playerId: string | null = null;
      for (const [id, c] of currentState.connections) {
        if (c.ws === ws) {
          playerId = id;
          break;
        }
      }
      if (playerId) {
        clearHeartbeat(playerId);
      }
      set((s) => {
        const next = new Map(s.connections);
        if (playerId) {
          const c = next.get(playerId);
          if (c) {
            next.set(playerId, { ...c, isConnected: false, ws: null });
          }
        }
        return { connections: next, error: `玩家 ${nickname} 连接发生错误` };
      });
      // Bug 165 修复：onerror 时触发 onclose 清理逻辑
      ws.onclose?.(new CloseEvent('close'));
    };

    ws.onclose = () => {
      // 找到并清理
      const currentState = get();
      let playerId: string | null = null;
      for (const [id, c] of currentState.connections) {
        if (c.ws === ws) {
          playerId = id;
          break;
        }
      }
      if (playerId) {
        clearHeartbeat(playerId);
        // Bug 170 修复：清理自动执行定时器
        const timer = autoExecuteTimers.get(playerId);
        if (timer !== undefined) {
          clearTimeout(timer);
          autoExecuteTimers.delete(playerId);
        }
        set((s) => {
          const next = new Map(s.connections);
          const c = next.get(playerId);
          if (c) {
            next.set(playerId, { ...c, isConnected: false, ws: null });
          }
          return { connections: next };
        });
      }
    };
  },

  removePlayer: (playerId: string) => {
    const state = get();
    const conn = state.connections.get(playerId);
    if (!conn) return;

    // 发送 LEAVE_ROOM
    if (conn.ws && conn.isConnected) {
      sendMessage(conn.ws, { type: 'LEAVE_ROOM' });
    }

    // 关闭连接
    closeConnection(conn.ws);
    clearHeartbeat(playerId);

    // Bug 170 修复：清理自动执行定时器
    const timer = autoExecuteTimers.get(playerId);
    if (timer !== undefined) {
      clearTimeout(timer);
      autoExecuteTimers.delete(playerId);
    }

    // 从状态中移除（Bug 166 修复：同时清除 suggestedAction）
    set((s) => {
      const next = new Map(s.connections);
      next.delete(playerId);
      const nextPlayerStates = new Map(s.playerStates);
      nextPlayerStates.delete(playerId);
      return {
        connections: next,
        playerStates: nextPlayerStates,
        selectedPlayerId: s.selectedPlayerId === playerId ? null : s.selectedPlayerId,
      };
    });
  },

  readyPlayer: (playerId: string, ready: boolean) => {
    const state = get();
    const conn = state.connections.get(playerId);
    if (!conn?.ws || !conn.isConnected) return;

    sendMessage(conn.ws, { type: 'READY', ready });

    set((s) => {
      const next = new Map(s.connections);
      const c = next.get(playerId);
      if (c) {
        next.set(playerId, { ...c, isReady: ready });
      }
      return { connections: next };
    });
  },

  readyAllPlayers: () => {
    const state = get();
    for (const [playerId, conn] of state.connections) {
      if (conn.isConnected && !conn.isJudge && !conn.isReady) {
        sendMessage(conn.ws, { type: 'READY', ready: true });
        // 更新本地状态
        set((s) => {
          const next = new Map(s.connections);
          const c = next.get(playerId);
          if (c) {
            next.set(playerId, { ...c, isReady: true });
          }
          return { connections: next };
        });
      }
    }
  },

  startGame: () => {
    const state = get();
    if (!state.judgeConnection?.ws || !state.judgeConnection.isConnected) return;
    sendMessage(state.judgeConnection.ws, { type: 'START_GAME' });
  },

  submitAction: (playerId: string, message: ClientMessage) => {
    const state = get();
    const conn = state.connections.get(playerId);
    if (!conn?.ws || !conn.isConnected) return;
    sendMessage(conn.ws, message);

    // 清除该玩家的建议操作
    set((s) => {
      const next = new Map(s.connections);
      const c = next.get(playerId);
      if (c) {
        next.set(playerId, { ...c, suggestedAction: null });
      }
      return { connections: next };
    });
  },

  submitJudgeAction: (message: ClientMessage) => {
    const state = get();
    if (!state.judgeConnection?.ws || !state.judgeConnection.isConnected) return;
    sendMessage(state.judgeConnection.ws, message);
  },

  selectPlayer: (playerId: string | null) => {
    set({ selectedPlayerId: playerId });

    // 注入状态到游戏 store（切换玩家时完全重置）
    const state = get();
    if (playerId) {
      const playerState = state.playerStates.get(playerId);
      const conn = state.connections.get(playerId);
      if (playerState && conn) {
        injectStateToGameStore(playerState, conn, true);
      }
    } else {
      // 如果选中法官，注入法官状态
      if (state.judgeState && state.judgeConnection) {
        injectStateToGameStore(state.judgeState, state.judgeConnection, true);
      } else {
        clearInjectedState();
      }
    }
  },

  setAutoMode: (mode: AutoMode) => {
    set((s) => {
      // Bug 167 修复：深拷贝 autoStrategies 再修改
      const strategies = JSON.parse(JSON.stringify(s.autoStrategies)) as AutoStrategies;
      strategies.mode = mode;
      return {
        autoMode: mode,
        autoStrategies: strategies,
      };
    });
  },

  setAutoStrategy: (roleId: string, strategy: Record<string, unknown>) => {
    set((s) => {
      const current = s.autoStrategies[roleId as keyof AutoStrategies];
      if (!current || typeof current !== 'object') return s;
      return {
        autoStrategies: {
          ...s.autoStrategies,
          [roleId]: { ...current, ...strategy },
        },
      };
    });
  },

  executeSuggestedAction: (playerId: string) => {
    const state = get();
    const conn = state.connections.get(playerId);
    if (!conn?.suggestedAction || !conn.ws || !conn.isConnected) return;

    sendMessage(conn.ws, conn.suggestedAction);

    set((s) => {
      const next = new Map(s.connections);
      const c = next.get(playerId);
      if (c) {
        next.set(playerId, { ...c, suggestedAction: null });
      }
      return { connections: next };
    });
  },

  executeAllSuggested: () => {
    const state = get();
    const updates = new Map<string, SimConnection>();

    for (const [playerId, conn] of state.connections) {
      if (conn.suggestedAction && conn.ws && conn.isConnected) {
        sendMessage(conn.ws, conn.suggestedAction);
        updates.set(playerId, { ...conn, suggestedAction: null });
      }
    }

    if (updates.size > 0) {
      set((s) => {
        const next = new Map(s.connections);
        for (const [id, c] of updates) {
          next.set(id, c);
        }
        return { connections: next };
      });
    }
  },

  generateSuggestion: (playerId: string): ClientMessage | null => {
    const state = get();
    const conn = state.connections.get(playerId);
    if (!conn?.role) return null;

    const playerState = state.playerStates.get(playerId);
    if (!playerState) return null;

    const request = playerState.nightActionRequest;
    if (!request || request.isBlockedByNightmare) return null;

    const roleId = conn.role;
    const strategies = state.autoStrategies;
    const judgeState = state.judgeState;

    // 根据角色和策略生成建议
    switch (roleId) {
      case 'seer': {
        const seerStrat = strategies.seer;
        let targetSeat: number | null = null;

        if (seerStrat.strategy === 'random') {
          const targets = request.availableTargets.filter(
            (s) => !request.disabledTargets.includes(s),
          );
          targetSeat = targets.length > 0
            ? targets[Math.floor(Math.random() * targets.length)]
            : null;
        } else if (seerStrat.strategy === 'suspicious_first') {
          // 优先查验未发言或行为可疑的玩家 — 简化实现：随机选
          const targets = request.availableTargets.filter(
            (s) => !request.disabledTargets.includes(s),
          );
          targetSeat = targets.length > 0
            ? targets[Math.floor(Math.random() * targets.length)]
            : null;
        } else if (seerStrat.strategy === 'custom_list' && seerStrat.customTargets?.length) {
          const available = seerStrat.customTargets.filter(
            (s) => request.availableTargets.includes(s) && !request.disabledTargets.includes(s),
          );
          targetSeat = available.length > 0 ? available[0] : null;
        }

        return {
          type: 'NIGHT_ACTION',
          roleId: 'seer',
          targetSeat,
          extra: { checkTarget: targetSeat },
        };
      }

      case 'witch': {
        const witchStrat = strategies.witch;
        let useAntidote = false;
        let usePoison = false;
        let poisonTarget: number | null = null;

        // 解药逻辑
        if (witchStrat.autoSave && request.werewolfKillTarget !== null) {
          useAntidote = true;
        }

        // 毒药逻辑
        if (witchStrat.autoPoison && judgeState) {
          // 判断毒药是否已用：从法官视角的 nightActions 中检查
          const mySeat = conn.seatNumber;
          const hasUsedPoison = mySeat != null && Object.values(judgeState.nightActions).some(
            (a) => a.roleId === 'witch' && a.extra?.usePoison === true && a.actorSeat === mySeat,
          );
          const canPoison = !hasUsedPoison;
          if (canPoison) {
            if (witchStrat.poisonPriority === 'random') {
              const targets = request.availableTargets.filter(
                (s) => !request.disabledTargets.includes(s) && s !== request.werewolfKillTarget,
              );
              poisonTarget = targets.length > 0
                ? targets[Math.floor(Math.random() * targets.length)]
                : null;
            } else if (witchStrat.poisonPriority === 'evil_first') {
              poisonTarget = pickRandomEvilSeat(judgeState.players);
            } else if (witchStrat.poisonPriority === 'custom' && witchStrat.customPoisonTargets?.length) {
              // Bug 115 修复：验证自定义毒药目标是否在可用列表中
              const available = witchStrat.customPoisonTargets.filter(
                (s) => typeof s === 'number' && request.availableTargets.includes(s) && !request.disabledTargets.includes(s),
              );
              poisonTarget = available.length > 0 ? available[0] : null;
            }
            if (poisonTarget !== null) {
              usePoison = true;
            }
          }
        }

        return {
          type: 'NIGHT_ACTION',
          roleId: 'witch',
          targetSeat: usePoison ? poisonTarget : null,
          extra: {
            useAntidote,
            usePoison,
            poisonTarget: usePoison ? poisonTarget : null,
          },
        };
      }

      case 'guard': {
        const guardStrat = strategies.guard;
        let targetSeat: number | null = null;

        if (guardStrat.strategy === 'random') {
          const targets = request.availableTargets.filter(
            (s) => !request.disabledTargets.includes(s),
          );
          targetSeat = targets.length > 0
            ? targets[Math.floor(Math.random() * targets.length)]
            : null;
        } else if (guardStrat.strategy === 'protect_gods' && judgeState) {
          const godSeats = judgeState.players
            .filter((p) => p.status === 'alive' && isGodRole(p.role))
            .map((p) => p.seatNumber)
            .filter((s) => request.availableTargets.includes(s) && !request.disabledTargets.includes(s));
          targetSeat = godSeats.length > 0
            ? godSeats[Math.floor(Math.random() * godSeats.length)]
            : null;
        } else if (guardStrat.strategy === 'custom_list' && guardStrat.customTargets?.length) {
          const available = guardStrat.customTargets.filter(
            (s) => request.availableTargets.includes(s) && !request.disabledTargets.includes(s),
          );
          targetSeat = available.length > 0 ? available[0] : null;
        }

        return {
          type: 'NIGHT_ACTION',
          roleId: 'guard',
          targetSeat,
          extra: { protectTarget: targetSeat },
        };
      }

      case 'werewolf':
      case 'white_wolf_king':
      case 'wolf_king':
      case 'hidden_wolf': {
        const wolfStrat = strategies.werewolf;
        let targetSeat: number | null = null;

        if (wolfStrat.killStrategy === 'random') {
          const targets = request.availableTargets.filter(
            (s) => !request.disabledTargets.includes(s),
          );
          targetSeat = targets.length > 0
            ? targets[Math.floor(Math.random() * targets.length)]
            : null;
        } else if (wolfStrat.killStrategy === 'kill_gods_first' && judgeState) {
          targetSeat = pickRandomGodSeat(judgeState.players);
          if (targetSeat === null) {
            const targets = request.availableTargets.filter(
              (s) => !request.disabledTargets.includes(s),
            );
            targetSeat = targets.length > 0
              ? targets[Math.floor(Math.random() * targets.length)]
              : null;
          }
        } else if (wolfStrat.killStrategy === 'custom' && wolfStrat.customTarget !== undefined) {
          // Bug 116 修复：防御性检查 customTarget 是否为有效数字
          const custom = wolfStrat.customTarget;
          if (typeof custom === 'number' && request.availableTargets.includes(custom) &&
            !request.disabledTargets.includes(custom)) {
            targetSeat = custom;
          } else {
            targetSeat = null;
          }
        }

        return {
          type: 'NIGHT_ACTION',
          roleId,
          targetSeat,
          extra: { killTarget: targetSeat },
        };
      }

      case 'nightmare_shadow': {
        const nmStrat = strategies.nightmare;
        let targetSeat: number | null = null;

        if (nmStrat.strategy === 'random') {
          const targets = request.availableTargets.filter(
            (s) => !request.disabledTargets.includes(s),
          );
          targetSeat = targets.length > 0
            ? targets[Math.floor(Math.random() * targets.length)]
            : null;
        } else if (nmStrat.strategy === 'block_gods' && judgeState) {
          const godSeats = judgeState.players
            .filter((p) => p.status === 'alive' && isGodRole(p.role))
            .map((p) => p.seatNumber)
            .filter((s) => request.availableTargets.includes(s) && !request.disabledTargets.includes(s));
          targetSeat = godSeats.length > 0
            ? godSeats[Math.floor(Math.random() * godSeats.length)]
            : null;
        } else if (nmStrat.strategy === 'custom_list' && nmStrat.customTargets?.length) {
          const available = nmStrat.customTargets.filter(
            (s) => request.availableTargets.includes(s) && !request.disabledTargets.includes(s),
          );
          targetSeat = available.length > 0 ? available[0] : null;
        }

        return {
          type: 'NIGHT_ACTION',
          roleId: 'nightmare_shadow',
          targetSeat,
          extra: { nightmareTarget: targetSeat },
        };
      }

      case 'mechanical_wolf': {
        const mwStrat = strategies.mechanicalWolf;
        let targetSeat: number | null = null;

        if (mwStrat.imitateStrategy === 'random') {
          const targets = request.availableTargets.filter(
            (s) => !request.disabledTargets.includes(s),
          );
          targetSeat = targets.length > 0
            ? targets[Math.floor(Math.random() * targets.length)]
            : null;
        } else if (mwStrat.imitateStrategy === 'custom' && mwStrat.customTarget !== undefined) {
          targetSeat = request.availableTargets.includes(mwStrat.customTarget) &&
            !request.disabledTargets.includes(mwStrat.customTarget)
            ? mwStrat.customTarget
            : null;
        }

        return {
          type: 'NIGHT_ACTION',
          roleId: 'mechanical_wolf',
          targetSeat,
          extra: { imitateTarget: targetSeat },
        };
      }

      default:
        return null;
    }
  },

  disconnectAll: () => {
    const state = get();

    // 关闭所有玩家连接
    for (const [, conn] of state.connections) {
      closeConnection(conn.ws);
    }

    // 关闭法官连接
    if (state.judgeConnection) {
      closeConnection(state.judgeConnection.ws);
    }

    // 清理所有心跳
    clearAllHeartbeats();

    // 清理所有自动执行定时器
    autoExecuteTimers.forEach((timer) => clearTimeout(timer));
    autoExecuteTimers.clear();

    // 重置状态
    set({
      connections: new Map(),
      judgeConnection: null,
      roomCode: null,
      judgeState: null,
      playerStates: new Map(),
      currentPhase: 'LOBBY',
      currentRound: 0,
      nightSubPhase: null,
      selectedPlayerId: null,
      eventLog: [],
      autoStrategies: { ...DEFAULT_AUTO_STRATEGIES },
      autoMode: 'off',
      isInitialized: false,
      error: null,
      simulatorPhase: 'setup',
      pendingPlayerNames: [],
    });

    clearInjectedState();
  },

  clearError: () => {
    set({ error: null });
  },

  addEvent: (event: Omit<SimEvent, 'timestamp'>) => {
    const fullEvent: SimEvent = {
      ...event,
      timestamp: Date.now(),
    };

    set((s) => {
      const newLog = [...s.eventLog, fullEvent];
      if (newLog.length > MAX_EVENT_LOG_SIZE) {
        newLog.splice(0, newLog.length - MAX_EVENT_LOG_SIZE);
      }
      return { eventLog: newLog };
    });
  },
}));

// ============================================================================
// 法官消息处理
// ============================================================================

function handleJudgeMessage(msg: ServerMessage, ws: WebSocket): void {
  const store = useSimulatorStore;

  switch (msg.type) {
    case 'ROOM_CREATED': {
      const currentState = store.getState();
      store.setState({
        roomCode: msg.roomCode,
        simulatorPhase: 'lobby',
        isInitialized: true,
      });

      store.getState().addEvent({
        phase: currentState.currentPhase,
        round: currentState.currentRound,
        category: 'system',
        icon: EVENT_ICONS.system,
        message: `房间已创建，房间号: ${msg.roomCode}`,
      });

      // 自动添加暂存的玩家
      const pendingNames = [...store.getState().pendingPlayerNames];
      store.setState({ pendingPlayerNames: [] });

      for (const name of pendingNames) {
        store.getState().addPlayer(name);
      }
      break;
    }

    case 'ROOM_STATE': {
      if ('nightSubPhase' in msg.state && 'config' in msg.state) {
        // JudgeRoomStateDTO
        const judgeState = msg.state as JudgeRoomStateDTO;
        const updatedConnections = syncPlayerRolesFromJudge(
          store.getState().connections,
          judgeState,
        );

        store.setState((s) => ({
          judgeState,
          connections: updatedConnections,
          currentPhase: judgeState.phase,
          currentRound: judgeState.round,
          nightSubPhase: judgeState.nightSubPhase,
          simulatorPhase: deriveSimulatorPhase(judgeState.phase),
        }));
      }
      break;
    }

    case 'PHASE_CHANGE': {
      store.setState({
        currentPhase: msg.phase,
        // Bug 114 修复：提供默认值防止 undefined
        currentRound: msg.round ?? 0,
        nightSubPhase: msg.nightSubPhase ?? null,
        simulatorPhase: deriveSimulatorPhase(msg.phase),
      });

      store.getState().addEvent({
        phase: msg.phase,
        round: msg.round,
        category: 'system',
        icon: EVENT_ICONS.system,
        message: `阶段变更: ${PHASE_NAMES[msg.phase]}${msg.nightSubPhase ? ` (${ROLE_META[msg.nightSubPhase.currentRole]?.name ?? msg.nightSubPhase.currentRole})` : ''}`,
      });
      break;
    }

    case 'PLAYER_JOINED': {
      store.getState().addEvent({
        phase: store.getState().currentPhase,
        round: store.getState().currentRound,
        category: 'system',
        icon: EVENT_ICONS.system,
        message: `${msg.player.nickname} 加入房间 (座位 ${msg.player.seatNumber})`,
      });
      break;
    }

    case 'PLAYER_LEFT': {
      store.getState().addEvent({
        phase: store.getState().currentPhase,
        round: store.getState().currentRound,
        category: 'system',
        icon: EVENT_ICONS.system,
        message: `${msg.nickname} 离开房间 (座位 ${msg.seatNumber})`,
      });
      break;
    }

    case 'PLAYER_READY': {
      store.getState().addEvent({
        phase: store.getState().currentPhase,
        round: store.getState().currentRound,
        category: 'system',
        icon: EVENT_ICONS.system,
        message: `座位 ${msg.seatNumber} ${msg.ready ? '已准备' : '取消准备'}`,
      });
      break;
    }

    case 'DAY_ANNOUNCE': {
      const deathInfo = msg.deaths.length > 0
        ? msg.deaths.map((d) => `${d.nickname}(${DEATH_CAUSE_NAMES[d.cause] ?? d.cause})`).join(', ')
        : '昨晚是平安夜';
      store.getState().addEvent({
        phase: store.getState().currentPhase,
        round: store.getState().currentRound,
        category: 'result',
        icon: EVENT_ICONS.result,
        message: `天亮了: ${deathInfo}`,
      });
      break;
    }

    case 'VOTE_RESULT': {
      const eliminated = msg.eliminated
        ? `座位 ${msg.eliminated} 被投出`
        : '无人被投出';
      store.getState().addEvent({
        phase: store.getState().currentPhase,
        round: store.getState().currentRound,
        category: 'result',
        icon: EVENT_ICONS.result,
        message: `投票结果: ${eliminated}${msg.isPK ? ' (进入PK)' : ''}`,
      });
      break;
    }

    case 'GAME_OVER': {
      store.setState({ simulatorPhase: 'gameover' });
      store.getState().addEvent({
        phase: 'GAME_OVER',
        round: store.getState().currentRound,
        category: 'result',
        icon: EVENT_ICONS.result,
        message: `游戏结束，${msg.winner === 'good' ? '好人阵营' : '狼人阵营'}获胜`,
      });
      break;
    }

    case 'ERROR': {
      store.setState({ error: msg.message });
      store.getState().addEvent({
        phase: store.getState().currentPhase,
        round: store.getState().currentRound,
        category: 'error',
        icon: EVENT_ICONS.error,
        message: `错误: ${msg.message}`,
      });
      break;
    }

    case 'JUDGE_WARNING': {
      store.getState().addEvent({
        phase: store.getState().currentPhase,
        round: store.getState().currentRound,
        category: 'judge',
        icon: EVENT_ICONS.judge,
        message: `法官警告: ${msg.message}`,
      });
      break;
    }

    case 'PONG':
      // 心跳响应，无需处理
      break;

    default:
      // 其他消息类型忽略（法官不需要处理所有玩家专属消息）
      break;
  }

  // Sync judge messages to useGameStore when in judge view (selectedPlayerId === null)
  const currentState = store.getState();
  if (currentState.selectedPlayerId === null) {
    updateGameStoreFromMessage(msg);
  }
}

// ============================================================================
// 玩家消息处理
// ============================================================================

function handlePlayerMessage(playerId: string, msg: ServerMessage, ws: WebSocket): void {
  const store = useSimulatorStore;

  switch (msg.type) {
    case 'ROOM_STATE': {
      if ('myPlayerId' in msg.state) {
        // PlayerRoomStateDTO
        const playerState = msg.state as PlayerRoomStateDTO;
        const actualId = playerState.myPlayerId;

        // 如果 playerId 是临时 ID，需要替换为真实 ID
        if (playerId.startsWith('__pending_')) {
          store.setState((s) => {
            const next = new Map(s.connections);
            const conn = next.get(playerId);
            if (conn) {
              const updated: SimConnection = {
                ...conn,
                playerId: actualId,
                seatNumber: playerState.players.find((p) => p.id === actualId)?.seatNumber ?? null,
                // LOBBY 阶段不更新 role（默认为 villager 无意义）
                role: playerState.phase !== 'LOBBY'
                  ? (playerState.players.find((p) => p.id === actualId)?.role ?? null)
                  : conn.role,
              };
              next.delete(playerId);
              next.set(actualId, updated);

              // 迁移心跳定时器
              const hb = heartbeatTimers.get(playerId);
              if (hb !== undefined) {
                heartbeatTimers.delete(playerId);
                heartbeatTimers.set(actualId, hb);
              }

              const nextPlayerStates = new Map(s.playerStates);
              nextPlayerStates.delete(playerId);
              nextPlayerStates.set(actualId, playerState);

              return {
                connections: next,
                playerStates: nextPlayerStates,
                selectedPlayerId: s.selectedPlayerId === playerId ? actualId : s.selectedPlayerId,
              };
            }
            return s;
          });
        } else {
          store.setState((s) => {
            const nextPlayerStates = new Map(s.playerStates);
            nextPlayerStates.set(playerId, playerState);

            // 同步座位号和准备状态
            // 角色信息优先从 judgeState 同步（通过 syncPlayerRolesFromJudge），
            // PlayerDTO.role 在 LOBBY 阶段为默认值 'villager'，不应覆盖
            const nextConnections = new Map(s.connections);
            const conn = nextConnections.get(playerId);
            const selfPlayer = playerState.players.find((p) => p.id === playerId);
            if (conn && selfPlayer) {
              nextConnections.set(playerId, {
                ...conn,
                seatNumber: selfPlayer.seatNumber,
                // LOBBY 阶段不更新 role（默认为 villager 无意义），保留从 judgeState 同步的值
                role: playerState.phase !== 'LOBBY' ? selfPlayer.role : conn.role,
                isReady: selfPlayer.isReady,
              });
            }

            return {
              playerStates: nextPlayerStates,
              connections: nextConnections,
            };
          });
        }
      }
      break;
    }

    case 'NIGHT_ACTION_REQUEST': {
      // 更新玩家状态中的夜间行动请求
      store.setState((s) => {
        const nextPlayerStates = new Map(s.playerStates);
        const ps = nextPlayerStates.get(playerId);
        if (ps) {
          nextPlayerStates.set(playerId, {
            ...ps,
            nightActionRequest: msg.request,
          });
        }
        return { playerStates: nextPlayerStates };
      });

      const state = store.getState();
      const conn = state.connections.get(playerId);

      // 如果自动模式开启且不在 LOBBY 阶段，生成建议
      if (state.autoMode !== 'off' && conn?.role && state.currentPhase !== 'LOBBY') {
        const suggestion = state.generateSuggestion(playerId);
        if (suggestion) {
          store.setState((s) => {
            const next = new Map(s.connections);
            const c = next.get(playerId);
            if (c) {
              next.set(playerId, { ...c, suggestedAction: suggestion });
            }
            return { connections: next };
          });

          // 如果是全自动模式，延迟执行
          if (state.autoMode === 'auto') {
            // Bug 170 修复：清除之前的自动执行定时器
            if (autoExecuteTimers.has(playerId)) {
              clearTimeout(autoExecuteTimers.get(playerId));
            }
            // 延迟一小段时间再执行，模拟思考时间
            const timer = setTimeout(() => {
              autoExecuteTimers.delete(playerId);
              const currentState = store.getState();
              // Bug 112 修复：执行前再次检查自动模式是否仍为 auto 且连接仍然可用
              if (currentState.autoMode !== 'auto') return;
              // Bug 169 修复：验证当前阶段是否仍为夜间
              if (currentState.currentPhase !== 'NIGHT') return;
              const currentConn = currentState.connections.get(playerId);
              // Bug 142 修复：检查连接是否仍然活跃
              if (currentConn?.suggestedAction && currentConn.ws && currentConn.isConnected) {
                sendMessage(currentConn.ws, currentConn.suggestedAction);
                store.setState((s) => {
                  const next = new Map(s.connections);
                  const c = next.get(playerId);
                  if (c) {
                    next.set(playerId, { ...c, suggestedAction: null });
                  }
                  return { connections: next };
                });
              }
            }, 500 + Math.random() * 1000);
            autoExecuteTimers.set(playerId, timer);
          }
        }
      }

      // 记录事件（仅从法官连接去重，玩家侧也记录以方便调试）
      const conn2 = state.connections.get(playerId);
      if (conn2?.role) {
        store.getState().addEvent({
          phase: state.currentPhase,
          round: state.currentRound,
          category: 'action',
          icon: EVENT_ICONS.action,
          message: `${conn2.nickname}(${ROLE_META[conn2.role]?.name ?? conn2.role}) 收到夜间行动请求`,
        });
      }
      break;
    }

    case 'NIGHT_ACTION_RESULT': {
      const state = store.getState();
      const conn = state.connections.get(playerId);
      if (conn?.role === 'seer' && msg.seerResult) {
        store.getState().addEvent({
          phase: state.currentPhase,
          round: state.currentRound,
          category: 'result',
          icon: EVENT_ICONS.result,
          message: `${conn.nickname}(预言家) 查验结果: ${msg.seerResult === 'good' ? '好人' : '狼人'}${msg.success ? '' : ` (失败: ${msg.failReason ?? '未知'})`}`,
        });
      }
      break;
    }

    case 'DAY_ANNOUNCE': {
      // 玩家侧也记录天亮了事件
      const state = store.getState();
      const deathInfo = msg.deaths.length > 0
        ? msg.deaths.map((d) => `${d.nickname}(${DEATH_CAUSE_NAMES[d.cause] ?? d.cause})`).join(', ')
        : '昨晚是平安夜';
      store.getState().addEvent({
        phase: state.currentPhase,
        round: state.currentRound,
        category: 'result',
        icon: EVENT_ICONS.result,
        message: `天亮了: ${deathInfo}`,
      });
      break;
    }

    case 'VOTE_RESULT': {
      const state = store.getState();
      const eliminated = msg.eliminated
        ? `座位 ${msg.eliminated} 被投出`
        : '无人被投出';
      store.getState().addEvent({
        phase: state.currentPhase,
        round: state.currentRound,
        category: 'result',
        icon: EVENT_ICONS.result,
        message: `投票结果: ${eliminated}`,
      });
      break;
    }

    case 'GAME_OVER': {
      store.setState({ simulatorPhase: 'gameover' });
      store.getState().addEvent({
        phase: 'GAME_OVER',
        round: store.getState().currentRound,
        category: 'result',
        icon: EVENT_ICONS.result,
        message: `游戏结束，${msg.winner === 'good' ? '好人阵营' : '狼人阵营'}获胜`,
      });
      break;
    }

    case 'ERROR': {
      store.setState({ error: msg.message });
      store.getState().addEvent({
        phase: store.getState().currentPhase,
        round: store.getState().currentRound,
        category: 'error',
        icon: EVENT_ICONS.error,
        message: `错误: ${msg.message}`,
      });
      break;
    }

    case 'PONG':
      break;

    default:
      break;
  }

  // Sync message to useGameStore if this player is currently selected
  const currentState = store.getState();
  if (currentState.selectedPlayerId === playerId) {
    updateGameStoreFromMessage(msg);
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/** 根据 GamePhase 推导 SimulatorPhase */
function deriveSimulatorPhase(phase: GamePhase): SimulatorPhase {
  switch (phase) {
    case 'LOBBY':
      return 'lobby';
    case 'GAME_OVER':
      return 'gameover';
    default:
      // ROLE_REVEAL, PRE_NIGHT, NIGHT, NIGHT_SETTLEMENT, DAY_ANNOUNCE, etc.
      return 'playing';
  }
}
