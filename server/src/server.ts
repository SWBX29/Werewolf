/**
 * ============================================================================
 * 狼人杀联机游戏 — 服务端入口 (Server Entry & WebSocket Network Layer)
 * ============================================================================
 *
 * 架构说明：
 *   本文件是整个服务端的入口，负责：
 *   1. 启动 WebSocket 服务器（基于 ws 库）
 *   2. 读取环境变量（PORT / MONGODB_URI / PUBLIC_URL）
 *   3. 连接 MongoDB（带断线重连容错）
 *   4. WebSocket 消息路由与分发
 *   5. 安全的 DTO 脱敏广播（法官视角 vs 普通玩家视角隔离）
 *   6. 服务端启动时打印本地地址和公网地址
 *
 * 网络暴露方案：
 *   - 本地开发：ws://localhost:{PORT}
 *   - 公网联机：通过 chmlfrp 映射，读取 PUBLIC_URL 环境变量
 *   - 启动时打印：服务已启动 | 本地: ws://localhost:{PORT} | 公网: {PUBLIC_URL}
 *
 * 防作弊核心：
 *   - 零信任架构：所有客户端操作在服务端重新校验
 *   - 强制 DTO 过滤：广播时根据接收者身份脱敏
 *   - 法官 payload 包含明文全量数据，普通玩家 payload 禁止包含他人角色
 * ============================================================================
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import type {
  ClientMessage,
  ServerMessage,
  PlayerRoomStateDTO,
  JudgeRoomStateDTO,
  PlayerDTO,
  Player,
  RoomState,
  GamePhase,
  NightSubPhase,
  Faction,
  RoleId,
  ActionLog,
  JudgeWarningType,
  RuleConfig,
  GameMode,
  NightActionExtra,
  PlayerStatus,
  ActionLogDTO,
  WolfChatMessage as WolfChatMessageType,
  DeadChatMessage,
} from '@langrensha/shared';
import {
  ROLE_META,
  isEvilRole,
  isHiddenWolf,
  isSharedWolfRole,
  createDefaultRuleConfig,
} from '@langrensha/shared';
import { LobbyManager, ClientContext } from './LobbyManager.js';
import { GameEngine } from './GameEngine.js';
import { connectMongoDB, disconnectMongoDB, isMongoConnected, RoomModel, GameLogModel } from './models.js';

// ============================================================================
// 环境变量加载
// ============================================================================

import path from 'path';
import fs from 'fs';
// 计算 .env 文件路径：优先找项目根目录（server 目录的父目录），其次当前工作目录
const possibleEnvPaths = [
  path.resolve(__dirname, '../../.env'),    // 从 src/ 往项目根目录
  path.resolve(__dirname, '../.env'),       // 从 dist/ 往 server 目录
  path.resolve(process.cwd(), '.env'),      // 当前工作目录
];
const envPath = possibleEnvPaths.find((p) => fs.existsSync(p)) || possibleEnvPaths[0];

dotenv.config({ path: envPath });

const PORT = parseInt(process.env.PORT || '3001', 10);
const MONGODB_URI = process.env.MONGODB_URI || '';
const PUBLIC_URL = process.env.PUBLIC_URL || `ws://localhost:${PORT}`;
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

// ============================================================================
// 大厅管理器实例化
// ============================================================================

const lobby = new LobbyManager();

// ============================================================================
// DTO 脱敏层 (Anti-Cheat State Stripping)
// ============================================================================

/**
 * 规则26：判断死亡玩家是否可以看到目标玩家的角色
 * - 死亡后第二晚起：所有死亡玩家可见全部存活玩家身份
 * - 死亡后第一晚起：狼人阵营死亡玩家可知"谁在以狼人身份行动"（但不暴露具体身份）
 */
function canDeadViewRole(viewer: Player, target: Player, engine?: GameEngine): boolean {
  // 只有死亡玩家有特殊视野
  if (viewer.status !== 'dead') return false;
  // 只能看到存活玩家
  if (target.status !== 'alive') return false;

  const state = engine?.getState();
  if (!state) return false;

  // 计算死亡后经过的夜晚数
  const nightsSinceDeath = viewer.deathRound ? state.round - viewer.deathRound : 999;

  // 死亡后第二晚起（即经过 >= 2 个夜晚），所有死亡玩家可见全部存活玩家身份
  if (nightsSinceDeath >= 2) return true;

  return false;
}

/**
 * 将完整 Player 转换为脱敏的 PlayerDTO
 *
 * 核心安全准则：
 *   1. 仅当 PlayerDTO 属于当前玩家自身时，role 字段才有值
 *   2. 其他玩家的 role 始终为 null
 *   3. 女巫/守卫/白痴的专属状态仅自己可见
 *   4. 绝对禁止暴露其他人的底牌、夜间操作目标
 *
 * @param player - 完整玩家数据
 * @param forPlayerId - 接收此 DTO 的玩家 ID（null 表示法官视角）
 */
function stripPlayerToDTO(player: Player, forPlayerId: string | null, engine?: GameEngine, viewerPlayer?: Player, phase?: GamePhase): PlayerDTO {
  const isSelf = forPlayerId === player.id;

  // LOBBY 阶段不暴露角色信息，角色仅在游戏开始后告知
  const shouldRevealRole = phase !== undefined && phase !== 'LOBBY';

  // 隐狼是否可查看狼人聊天历史
  let canViewWolfChatHistory: boolean | null = null;
  if (isSelf && player.role === 'hidden_wolf' && engine) {
    canViewWolfChatHistory = engine.canHiddenWolfViewChat(player.id);
  }

  return {
    id: player.id,
    nickname: player.nickname,
    seatNumber: player.seatNumber,
    status: player.status,
    isJudge: player.isJudge,
    isSheriff: player.isSheriff,
    isHost: player.isHost,
    isReady: player.isReady,
    isMuted: player.isMuted,
    // 仅自己可见，且仅在游戏开始后（非 LOBBY 阶段）暴露
    role: shouldRevealRole
      ? (isSelf ? player.role : (viewerPlayer && canDeadViewRole(viewerPlayer, player, engine) ? player.role : null))
      : null,
    witchAntidoteUsed: isSelf && player.role === 'witch' ? player.witchAntidoteUsed : null,
    witchPoisonUsed: isSelf && player.role === 'witch' ? player.witchPoisonUsed : null,
    guardLastProtected: isSelf && player.role === 'guard' ? player.guardLastProtected : null,
    idiotRevealed: player.idiotRevealed ? true : (isSelf && player.role === 'idiot' ? false : null),
    canViewWolfChatHistory,
    guardProtectedHistory: isSelf && player.role === 'guard' ? player.guardProtectedHistory : null,
    nightmareTargetHistory: isSelf && player.role === 'nightmare_shadow' ? player.nightmareTargetHistory : null,
    mechanicalWolfPhase: isSelf && player.role === 'mechanical_wolf' ? player.mechanicalWolfPhase : null,
    mechanicalWolfImitatedRole: isSelf && player.role === 'mechanical_wolf' ? player.mechanicalWolfImitatedRole : null,
    mechanicalWolfSkillDeferred: isSelf && player.role === 'mechanical_wolf' ? player.mechanicalWolfSkillDeferred : null,
  };
}

/**
 * 构建普通玩家视角的房间状态 DTO
 *
 * 所有敏感信息已被脱敏：
 *   - 其他玩家的 role 为 null
 *   - 夜间行动数据不包含
 *   - 狼人击杀目标/女巫毒药目标等不包含
 *   - 投票详情仅在投票阶段结束后可见
 */
function buildPlayerRoomStateDTO(state: RoomState, forPlayerId: string, engine: GameEngine): PlayerRoomStateDTO {
  const player = state.players.find((p) => p.id === forPlayerId);

  return {
    roomCode: state.roomCode,
    gameMode: state.gameMode,
    phase: state.phase,
    round: state.round,
    playerCount: state.config.playerCount,
    myPlayerId: forPlayerId,
    players: state.players.map((p) => stripPlayerToDTO(p, forPlayerId, engine, player, state.phase)),
    speechOrder: state.speechOrder,
    currentSpeakerIndex: state.currentSpeakerIndex,
    isNightmared: player?.isNightmared ?? false,
    isMuted: player?.isMuted ?? false,
    nightActionRequest: engine.buildNightActionRequest(forPlayerId),
    currentNightRole: state.phase === 'NIGHT' ? (state.nightSubPhase?.currentRole ?? null) : null,
    isPaused: state.isPaused,
    winner: state.winner,
    wolfChatMessages: isSharedWolfRole(player?.role ?? 'villager', state.config.sharedWolfRoles) ? state.wolfChatMessages : [],
    wolfVotes: (state.phase === 'NIGHT' && state.nightSubPhase?.currentRole === 'werewolf' && isSharedWolfRole(player?.role ?? 'villager', state.config.sharedWolfRoles)) ? state.wolfVotes : null,
    wolfVoteConsensus: (state.phase === 'NIGHT' && state.nightSubPhase?.currentRole === 'werewolf' && isSharedWolfRole(player?.role ?? 'villager', state.config.sharedWolfRoles)) ? state.wolfVoteConsensus : null,
    witchCanUseBothPotions: state.config.witchCanUseBothPotions,
    pkCandidates: state.pkCandidates,
    sheriffVoteWeight: state.config.sheriffVoteWeight,
    preNightHint: state.phase === 'PRE_NIGHT' ? engine.getPreNightHint() : null,
    // 当玩家自己已提交夜间行动且正在等待他人行动时，展示自己的行动信息
    myNightAction: (() => {
      if (state.phase !== 'NIGHT' || !player) return null;
      const roleId = player.role;
      if (!roleId) return null;

      // 1. 查找当前子阶段对应的行动
      //    对于共同睁眼的狼人（werewolf子阶段），查找'werewolf'键
      const actionKey = isSharedWolfRole(roleId, state.config.sharedWolfRoles) ? 'werewolf' : roleId;
      const action = state.nightActions[actionKey];
      if (action && action.submitted && action.actorSeat === player.seatNumber) {
        return action;
      }

      // 2. 回退查找玩家自身角色的行动
      //    Bug修复：噩梦之影以噩梦身份提交恐惧后，在狼人子阶段投票时
      //    应展示已提交的恐惧行动信息
      if (actionKey !== roleId) {
        const ownAction = state.nightActions[roleId];
        if (ownAction && ownAction.submitted && ownAction.actorSeat === player.seatNumber) {
          return ownAction;
        }
      }

      return null;
    })(),
  };
}

/**
 * 构建法官视角的房间状态 DTO — 包含明文全量数据
 * 仅下发给 isJudge === true 的客户端
 */
function buildJudgeRoomStateDTO(state: RoomState): JudgeRoomStateDTO {
  return {
    roomCode: state.roomCode,
    gameMode: state.gameMode,
    phase: state.phase,
    nightSubPhase: state.nightSubPhase,
    round: state.round,
    config: state.config,
    players: state.players,
    speechOrder: state.speechOrder,
    currentSpeakerIndex: state.currentSpeakerIndex,
    votes: state.votes,
    nightActions: state.nightActions,
    werewolfTarget: state.werewolfTarget,
    witchSaveTarget: state.witchSaveTarget,
    witchPoisonTarget: state.witchPoisonTarget,
    guardProtectTarget: state.guardProtectTarget,
    nightmareTarget: state.nightmareTarget,
    nightDeaths: state.nightDeaths,
    dayDeaths: state.dayDeaths,
    isPaused: state.isPaused,
    winner: state.winner,
    wolfVotes: state.wolfVotes,
    wolfVoteConsensus: state.wolfVoteConsensus,
    wolfChatMessages: state.wolfChatMessages,
    sheriffElectionVotes: state.sheriffElectionVotes,
  };
}

// ============================================================================
// 安全广播器 (Secure Broadcaster)
// ============================================================================

/**
 * 向房间内所有客户端广播房间状态
 *
 * 关键安全机制：
 *   - 遍历房间内所有客户端
 *   - 法官收到 JudgeRoomStateDTO（明文全量数据）
 *   - 普通玩家收到 PlayerRoomStateDTO（脱敏数据）
 *   - 每个玩家看到的 DTO 是独立构建的，确保信息隔离
 */
function broadcastRoomState(roomCode: string): void {
  const engine = lobby.getRoom(roomCode);
  if (!engine) return;

  const state = engine.getState();
  const clients = lobby.getRoomClients(roomCode);

  for (const client of clients) {
    if (!client.ws || client.ws.readyState !== WebSocket.OPEN) continue;

    let message: ServerMessage;

    if (client.isJudge) {
      // 法官视角：明文全量数据
      message = {
        type: 'ROOM_STATE',
        state: buildJudgeRoomStateDTO(state),
      };
    } else {
      // 普通玩家视角：脱敏数据
      message = {
        type: 'ROOM_STATE',
        state: buildPlayerRoomStateDTO(state, client.playerId, engine),
      };
    }

    safeSend(client.ws, message);
  }
}

/**
 * 向房间内所有客户端发送同一条消息（不区分视角）
 */
function broadcastToRoom(roomCode: string, message: ServerMessage): void {
  const clients = lobby.getRoomClients(roomCode);
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    safeSend(client.ws, message);
  }
}

/**
 * 向法官客户端发送消息
 */
function sendToJudge(roomCode: string, message: ServerMessage): void {
  const clients = lobby.getRoomClients(roomCode);
  for (const client of clients) {
    if (client.isJudge && client.ws.readyState === WebSocket.OPEN) {
      safeSend(client.ws, message);
    }
  }
}

/**
 * 向指定玩家发送消息
 */
function sendToPlayer(playerId: string, message: ServerMessage): void {
  const client = lobby.getClient(playerId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    safeSend(client.ws, message);
  }
}

/**
 * 安全发送消息（带错误处理，防止发送失败导致服务崩溃）
 */
function safeSend(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (error) {
    console.error('[WS] 发送消息失败:', (error as Error).message);
  }
}

// ============================================================================
// 消息路由与分发 (Message Router)
// ============================================================================

/**
 * 处理客户端消息
 *
 * 零信任架构：每条消息都在服务端重新校验合法性
 */
function handleMessage(ws: WebSocket, rawMessage: string): void {
  let message: ClientMessage;

  try {
    message = JSON.parse(rawMessage);
  } catch {
    safeSend(ws, { type: 'ERROR', code: 'INVALID_JSON', message: '消息格式错误' });
    return;
  }

  const client = lobby.getClientByWs(ws);
  if (!client) {
    safeSend(ws, { type: 'ERROR', code: 'NOT_CONNECTED', message: '连接未注册' });
    return;
  }

  switch (message.type) {
    // ---- 大厅操作 ----
    case 'CREATE_ROOM':
      handleCreateRoom(client, message);
      break;

    case 'JOIN_ROOM':
      handleJoinRoom(client, message, ws);
      break;

    case 'LEAVE_ROOM':
      handleLeaveRoom(client);
      break;

    case 'DISSOLVE_ROOM':
      handleDissolveRoom(client);
      break;

    case 'READY':
      handleReady(client, message);
      break;

    case 'START_GAME':
      handleStartGame(client);
      break;

    // ---- 夜间操作 ----
    case 'NIGHT_ACTION':
      handleNightAction(client, message);
      break;

    // ---- 白天操作 ----
    case 'DAY_VOTE':
      handleDayVote(client, message);
      break;

    case 'SHERIFF_ELECTION_VOTE':
      handleSheriffElectionVote(client, message);
      break;

    case 'SHERIFF_TRANSFER':
      handleSheriffTransfer(client, message);
      break;

    case 'KNIGHT_DUEL':
      handleKnightDuel(client, message);
      break;

    case 'WHITE_WOLF_EXPLODE':
      handleWhiteWolfExplode(client, message);
      break;

    case 'HUNTER_GUN':
      handleHunterGun(client, message);
      break;

    case 'WOLF_KING_GUN':
      handleWolfKingGun(client, message);
      break;

    case 'SPEECH':
      handleSpeech(client, message);
      break;

    case 'FINISH_SPEECH':
      handleFinishSpeech(client);
      break;

    // ---- 法官操作 ----
    case 'UPDATE_NIGHT_ORDER':
      handleUpdateNightOrder(client, message);
      break;

    case 'JUDGE_OVERRIDE_SETTLEMENT':
      handleJudgeOverrideSettlement(client, message);
      break;

    case 'JUDGE_FORCE_NEXT_PHASE':
      handleJudgeForceNextPhase(client);
      break;

    case 'JUDGE_PAUSE':
      handleJudgePause(client);
      break;

    case 'JUDGE_RESUME':
      handleJudgeResume(client);
      break;

    case 'JUDGE_MODIFY_SPEECH_ORDER':
      handleJudgeModifySpeechOrder(client, message);
      break;

    case 'JUDGE_TRIGGER_KNIGHT_DUEL':
      handleJudgeTriggerKnightDuel(client, message);
      break;

    case 'JUDGE_TRIGGER_WHITE_WOLF':
      handleJudgeTriggerWhiteWolf(client, message);
      break;

    case 'JUDGE_SKIP_SPEECH':
      handleJudgeSkipSpeech(client, message);
      break;

    // ---- 狼人聊天与投票 ----
    case 'WOLF_CHAT':
      handleWolfChat(client, message);
      break;

    case 'DEAD_CHAT':
      handleDeadChat(client, message);
      break;

    case 'WOLF_VOTE':
      handleWolfVote(client, message);
      break;

    case 'APPEAL':
      handleAppeal(client, message);
      break;

    case 'ARBITRATION_VOTE':
      handleArbitrationVote(client, message);
      break;

    // ---- 重连 ----
    case 'RECONNECT':
      handleReconnect(client, message, ws);
      break;

    // ---- 管理员操作 ----
    case 'ADMIN_FETCH_LOGS':
      handleAdminFetchLogs(client, message);
      break;

    case 'ADMIN_CLEANUP_CONFIG':
      handleAdminCleanupConfig(client, message);
      break;

    default:
      safeSend(ws, { type: 'ERROR', code: 'UNKNOWN_MESSAGE', message: `未知消息类型: ${(message as any).type}` });
  }
}

// ============================================================================
// 大厅操作处理器
// ============================================================================

function handleCreateRoom(client: ClientContext, message: ClientMessage & { type: 'CREATE_ROOM' }): void {
  // 检查是否已在房间中
  if (client.roomCode) {
    safeSend(client.ws, { type: 'ERROR', code: 'ALREADY_IN_ROOM', message: '你已在房间中，请先离开当前房间' });
    return;
  }

  const result = lobby.createRoom(
    message.nickname,
    message.gameMode,
    message.config,
    client.ws,
    PUBLIC_URL,
  );

  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'CREATE_FAILED', message: result.error! });
    return;
  }

  // 更新客户端上下文
  client.roomCode = result.roomCode!;
  client.isJudge = message.gameMode === 'HUMAN';

  // 生成邀请链接二维码
  const inviteLink = result.inviteLink!;
  QRCode.toDataURL(inviteLink, { width: 256, margin: 2 })
    .then((qrCodeDataUrl) => {
      safeSend(client.ws, {
        type: 'ROOM_CREATED',
        roomCode: result.roomCode!,
        inviteLink,
        qrCodeDataUrl,
      });
    })
    .catch(() => {
      // 二维码生成失败，仍返回房间信息
      safeSend(client.ws, {
        type: 'ROOM_CREATED',
        roomCode: result.roomCode!,
        inviteLink,
        qrCodeDataUrl: '',
      });
    });

  // 广播房间状态
  broadcastRoomState(result.roomCode!);
}

function handleJoinRoom(client: ClientContext, message: ClientMessage & { type: 'JOIN_ROOM' }, ws: WebSocket): void {
  // 检查是否已在房间中
  if (client.roomCode) {
    safeSend(ws, { type: 'ERROR', code: 'ALREADY_IN_ROOM', message: '你已在房间中' });
    return;
  }

  const result = lobby.joinRoom(
    message.nickname,
    message.roomCode,
    ws,
  );

  if (!result.success) {
    safeSend(ws, { type: 'ERROR', code: 'JOIN_FAILED', message: result.error! });
    return;
  }

  const roomCode = message.roomCode.toUpperCase();

  // 通知房间内其他玩家
  const engine = lobby.getRoom(roomCode);
  if (engine) {
    const state = engine.getState();
    const player = state.players.find((p) => p.id === result.playerId);
    if (player) {
      broadcastToRoom(roomCode, {
        type: 'PLAYER_JOINED',
        player: stripPlayerToDTO(player, null, engine, undefined, state.phase), // 通知时不暴露角色
      });
    }
  }

  // 广播房间状态
  broadcastRoomState(roomCode);
}

function handleLeaveRoom(client: ClientContext): void {
  const roomCode = client.roomCode;
  if (!roomCode) return;

  // 在离开前获取座位号
  const engine = lobby.getRoom(roomCode);
  const player = engine ? engine.getState().players.find((p) => p.id === client.playerId) : undefined;
  const leftSeat = player?.seatNumber ?? 0;

  const result = lobby.leaveRoom(client.playerId);

  if (result.success && result.roomCode) {
    broadcastToRoom(result.roomCode, {
      type: 'PLAYER_LEFT',
      seatNumber: leftSeat,
      nickname: client.nickname,
    });

    broadcastRoomState(result.roomCode);
  }
}

function handleDissolveRoom(client: ClientContext): void {
  const roomCode = client.roomCode;
  if (!roomCode) {
    safeSend(client.ws, { type: 'ERROR', code: 'NOT_IN_ROOM', message: '你不在任何房间中' });
    return;
  }

  if (!client.isJudge) {
    safeSend(client.ws, { type: 'ERROR', code: 'NOT_JUDGE', message: '只有法官可以解散房间' });
    return;
  }

  // 先获取房间内所有客户端，再解散房间
  const clients = lobby.getRoomClients(roomCode);
  const result = lobby.dissolveRoom(client.playerId);

  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'DISSOLVE_FAILED', message: result.error ?? '解散房间失败' });
    return;
  }

  // 向所有客户端广播房间解散消息
  const dissolveMessage = {
    type: 'ROOM_DISSOLVED' as const,
    reason: '法官解散了房间',
    players: result.players ?? [],
  };

  for (const c of clients) {
    safeSend(c.ws, dissolveMessage);
  }
}

function handleReady(client: ClientContext, message: ClientMessage & { type: 'READY' }): void {
  if (!client.roomCode) {
    safeSend(client.ws, { type: 'ERROR', code: 'NOT_IN_ROOM', message: '你不在任何房间中' });
    return;
  }

  const result = lobby.setReady(client.playerId, message.ready);
  if (result.success) {
    const engine = lobby.getRoom(client.roomCode);
    const readyPlayer = engine ? engine.getState().players.find((p) => p.id === client.playerId) : undefined;
    broadcastToRoom(client.roomCode, {
      type: 'PLAYER_READY',
      seatNumber: readyPlayer?.seatNumber ?? 0,
      ready: message.ready,
    });

    broadcastRoomState(client.roomCode);
  }
}

function handleStartGame(client: ClientContext): void {
  if (!client.roomCode) {
    safeSend(client.ws, { type: 'ERROR', code: 'NOT_IN_ROOM', message: '你不在任何房间中' });
    return;
  }

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) {
    safeSend(client.ws, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: '房间不存在' });
    return;
  }

  // 校验是否为房主
  const state = engine.getState();
  const player = state.players.find((p) => p.id === client.playerId);
  if (!player?.isHost) {
    safeSend(client.ws, { type: 'ERROR', code: 'NOT_HOST', message: '只有房主可以开始游戏' });
    return;
  }

  const result = engine.startGame();
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'START_FAILED', message: result.error! });
    return;
  }

  // 广播房间状态（含角色分配结果）
  broadcastRoomState(client.roomCode);
}

// ============================================================================
// 夜间操作处理器
// ============================================================================

function handleNightAction(client: ClientContext, message: ClientMessage & { type: 'NIGHT_ACTION' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.submitNightAction(
    client.playerId,
    message.roleId,
    message.targetSeat,
    message.extra,
  );

  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'NIGHT_ACTION_FAILED', message: result.error! });
    return;
  }

  // 如果是预言家查验，返回查验结果
  if (result.seerResult) {
    safeSend(client.ws, {
      type: 'NIGHT_ACTION_RESULT',
      roleId: message.roleId,
      seerResult: result.seerResult,
      success: true,
      failReason: null,
    });
  }

  // 广播房间状态
  broadcastRoomState(client.roomCode);
}

// ============================================================================
// 白天操作处理器
// ============================================================================

function handleDayVote(client: ClientContext, message: ClientMessage & { type: 'DAY_VOTE' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.submitVote(client.playerId, message.targetSeat);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'VOTE_FAILED', message: result.error! });
    return;
  }

  broadcastRoomState(client.roomCode);
}

function handleSheriffElectionVote(client: ClientContext, message: ClientMessage & { type: 'SHERIFF_ELECTION_VOTE' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.submitSheriffElectionVote(client.playerId, message.targetSeat);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'SHERIFF_ELECTION_VOTE_FAILED', message: result.error! });
    return;
  }

  broadcastRoomState(client.roomCode);
}

function handleSheriffTransfer(client: ClientContext, message: ClientMessage & { type: 'SHERIFF_TRANSFER' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.submitSheriffTransfer(client.playerId, message.targetSeat);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'SHERIFF_TRANSFER_FAILED', message: result.error! });
    return;
  }

  broadcastRoomState(client.roomCode);
}

/**
 * 处理重连消息 — 断连后使用之前的 playerId 恢复会话
 */
function handleReconnect(client: ClientContext, message: ClientMessage & { type: 'RECONNECT' }, ws: WebSocket): void {
  const { playerId, roomCode } = message;

  const result = lobby.reconnectPlayer(playerId, roomCode, ws);
  if (!result.success) {
    safeSend(ws, { type: 'ERROR', code: 'RECONNECT_FAILED', message: result.error! });
    return;
  }

  // 重连成功：删除新连接时创建的临时 context，恢复使用旧 context
  if (result.newPlayerId) {
    lobby.removeClientContext(result.newPlayerId);
  }

  const reconnectedContext = result.context!;

  // 发送重连成功消息
  const rc = reconnectedContext.roomCode!;
  safeSend(ws, { type: 'RECONNECT_SUCCESS', playerId: reconnectedContext.playerId, roomCode: rc });

  // 广播房间状态（让其他玩家看到该玩家已重连）
  broadcastRoomState(rc);
}

function handleKnightDuel(client: ClientContext, message: ClientMessage & { type: 'KNIGHT_DUEL' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.handleKnightDuel(client.playerId, message.targetSeat);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'DUEL_FAILED', message: result.error! });
    return;
  }

  // 广播决斗结果
  const knightState = engine.getState();
  const knight = knightState.players.find((p) => p.id === client.playerId);
  broadcastToRoom(client.roomCode, {
    type: 'KNIGHT_DUEL_RESULT',
    knightSeat: knight?.seatNumber ?? 0,
    targetSeat: message.targetSeat,
    targetIsWolf: result.result?.targetIsWolf ?? false,
    knightDied: result.result?.knightDied ?? false,
    forceNight: result.result?.forceNight ?? false,
  });

  broadcastRoomState(client.roomCode);
}

function handleWhiteWolfExplode(client: ClientContext, message: ClientMessage & { type: 'WHITE_WOLF_EXPLODE' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.handleWhiteWolfExplode(client.playerId, message.targetSeat);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'EXPLODE_FAILED', message: result.error! });
    return;
  }

  const wolfPlayer = engine.getState().players.find((p) => p.id === client.playerId);
  broadcastToRoom(client.roomCode, {
    type: 'WHITE_WOLF_EXPLODE_RESULT',
    wolfSeat: wolfPlayer?.seatNumber ?? 0,
    targetSeat: message.targetSeat,
    forceNight: true,
  });

  broadcastRoomState(client.roomCode);
}

function handleHunterGun(client: ClientContext, message: ClientMessage & { type: 'HUNTER_GUN' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.triggerHunterGun(client.playerId, message.targetSeat);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'HUNTER_GUN_FAILED', message: result.error! });
    return;
  }

  const state = engine.getState();
  const hunter = state.players.find((p) => p.id === client.playerId);
  const target = state.players.find((p) => p.seatNumber === message.targetSeat);

  broadcastToRoom(client.roomCode, {
    type: 'HUNTER_GUN_RESULT',
    hunterSeat: hunter?.seatNumber ?? 0,
    targetSeat: message.targetSeat,
    targetNickname: target?.nickname ?? '',
  });

  broadcastRoomState(client.roomCode);
}

function handleWolfKingGun(client: ClientContext, message: ClientMessage & { type: 'WOLF_KING_GUN' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.triggerWolfKingGun(client.playerId, message.targetSeat);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'WOLF_KING_GUN_FAILED', message: result.error! });
    return;
  }

  const state = engine.getState();
  const wolfKing = state.players.find((p) => p.id === client.playerId);
  const target = state.players.find((p) => p.seatNumber === message.targetSeat);

  broadcastToRoom(client.roomCode, {
    type: 'WOLF_KING_GUN_RESULT',
    wolfKingSeat: wolfKing?.seatNumber ?? 0,
    targetSeat: message.targetSeat,
    targetNickname: target?.nickname ?? '',
  });

  broadcastRoomState(client.roomCode);
}

function handleSpeech(client: ClientContext, message: ClientMessage & { type: 'SPEECH' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const state = engine.getState();
  const player = state.players.find((p) => p.id === client.playerId);
  if (!player || player.status !== 'alive') return;
  if (player.isMuted) return; // 被禁言的玩家不能发言

  // 发言内容广播给房间内所有人（发言是公开的）
  broadcastToRoom(client.roomCode, {
    type: 'SPEECH_CONTENT',
    seatNumber: player.seatNumber,
    nickname: player.nickname,
    content: message.content,
  });
}

function handleFinishSpeech(client: ClientContext): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.finishSpeech(client.playerId);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'FINISH_SPEECH_FAILED', message: result.error! });
    return;
  }

  broadcastRoomState(client.roomCode);
}

function handleAppeal(client: ClientContext, message: ClientMessage & { type: 'APPEAL' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const state = engine.getState();
  const player = state.players.find((p) => p.id === client.playerId);
  if (!player || player.status !== 'alive') {
    safeSend(client.ws, { type: 'ERROR', code: 'APPEAL_FAILED', message: '只有存活玩家可以申诉' });
    return;
  }

  // 广播申诉事件给房间内所有人
  const eventId = message.eventId;
  broadcastToRoom(client.roomCode, {
    type: 'APPEAL_EVENT',
    eventId,
    description: `${player.nickname}（${player.seatNumber}号）发起了申诉`,
    logs: [],
  });
}

function handleArbitrationVote(client: ClientContext, message: ClientMessage & { type: 'ARBITRATION_VOTE' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const state = engine.getState();
  const player = state.players.find((p) => p.id === client.playerId);
  if (!player || player.status !== 'alive') {
    safeSend(client.ws, { type: 'ERROR', code: 'VOTE_FAILED', message: '只有存活玩家可以参与仲裁投票' });
    return;
  }

  // 广播仲裁投票给房间内所有人
  broadcastToRoom(client.roomCode, {
    type: 'ARBITRATION_VOTE',
    eventId: message.eventId,
    description: `${player.nickname}（${player.seatNumber}号）${message.support ? '支持' : '反对'}申诉`,
  });
}

// ============================================================================
// 法官操作处理器
// ============================================================================

function handleUpdateNightOrder(client: ClientContext, message: ClientMessage & { type: 'UPDATE_NIGHT_ORDER' }): void {
  if (!client.roomCode || !client.isJudge) {
    safeSend(client.ws, { type: 'ERROR', code: 'NOT_JUDGE', message: '只有法官可以执行此操作' });
    return;
  }

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.overrideNightOrder(client.playerId, message.newOrder);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'OVERRIDE_FAILED', message: result.error! });
    return;
  }

  // 如果有警告，推送给法官
  if (result.warnings && result.warnings.length > 0) {
    for (const warning of result.warnings) {
      safeSend(client.ws, {
        type: 'JUDGE_WARNING',
        warningType: 'CONFLICT_ORDER_CHANGE',
        message: warning,
        data: {},
      });
    }
  }

  broadcastRoomState(client.roomCode);
}

function handleJudgeOverrideSettlement(client: ClientContext, message: ClientMessage & { type: 'JUDGE_OVERRIDE_SETTLEMENT' }): void {
  if (!client.roomCode || !client.isJudge) {
    safeSend(client.ws, { type: 'ERROR', code: 'NOT_JUDGE', message: '只有法官可以执行此操作' });
    return;
  }

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.overrideSettlement(
    client.playerId,
    message.targetSeat,
    message.newStatus,
    message.reason,
  );

  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'OVERRIDE_FAILED', message: result.error! });
    return;
  }

  broadcastRoomState(client.roomCode);
}

function handleJudgeForceNextPhase(client: ClientContext): void {
  if (!client.roomCode || !client.isJudge) {
    safeSend(client.ws, { type: 'ERROR', code: 'NOT_JUDGE', message: '只有法官可以执行此操作' });
    return;
  }

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.forceNextPhase(client.playerId);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'FORCE_FAILED', message: result.error! });
    return;
  }

  broadcastRoomState(client.roomCode);
}

function handleJudgePause(client: ClientContext): void {
  if (!client.roomCode || !client.isJudge) return;
  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.pauseGame(client.playerId);
  if (result.success) {
    broadcastRoomState(client.roomCode);
  }
}

function handleJudgeResume(client: ClientContext): void {
  if (!client.roomCode || !client.isJudge) return;
  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.resumeGame(client.playerId);
  if (result.success) {
    broadcastRoomState(client.roomCode);
  }
}

function handleJudgeModifySpeechOrder(client: ClientContext, message: ClientMessage & { type: 'JUDGE_MODIFY_SPEECH_ORDER' }): void {
  if (!client.roomCode || !client.isJudge) return;
  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.modifySpeechOrder(client.playerId, message.order);
  if (result.success) {
    broadcastToRoom(client.roomCode, {
      type: 'SPEECH_ORDER_UPDATE',
      order: message.order,
      mutedSeats: engine.getState().players
        .filter((p) => p.isMuted)
        .map((p) => p.seatNumber),
    });
    broadcastRoomState(client.roomCode);
  }
}

function handleJudgeTriggerKnightDuel(client: ClientContext, message: ClientMessage & { type: 'JUDGE_TRIGGER_KNIGHT_DUEL' }): void {
  if (!client.roomCode || !client.isJudge) return;
  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  // 法官代操作：使用骑士座位号对应的玩家ID
  const state = engine.getState();
  const knight = state.players.find((p) => p.seatNumber === message.knightSeat);
  if (!knight) {
    safeSend(client.ws, { type: 'ERROR', code: 'INVALID_TARGET', message: '骑士座位号无效' });
    return;
  }

  const result = engine.handleKnightDuel(knight.id, message.targetSeat);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'DUEL_FAILED', message: result.error! });
    return;
  }

  broadcastToRoom(client.roomCode, {
    type: 'KNIGHT_DUEL_RESULT',
    knightSeat: message.knightSeat,
    targetSeat: message.targetSeat,
    targetIsWolf: result.result?.targetIsWolf ?? false,
    knightDied: result.result?.knightDied ?? false,
    forceNight: result.result?.forceNight ?? false,
  });

  broadcastRoomState(client.roomCode);
}

function handleJudgeTriggerWhiteWolf(client: ClientContext, message: ClientMessage & { type: 'JUDGE_TRIGGER_WHITE_WOLF' }): void {
  if (!client.roomCode || !client.isJudge) return;
  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const state = engine.getState();
  const wolf = state.players.find((p) => p.seatNumber === message.wolfSeat);
  if (!wolf) {
    safeSend(client.ws, { type: 'ERROR', code: 'INVALID_TARGET', message: '白狼王座位号无效' });
    return;
  }

  const result = engine.handleWhiteWolfExplode(wolf.id, message.targetSeat);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'EXPLODE_FAILED', message: result.error! });
    return;
  }

  broadcastToRoom(client.roomCode, {
    type: 'WHITE_WOLF_EXPLODE_RESULT',
    wolfSeat: message.wolfSeat,
    targetSeat: message.targetSeat,
    forceNight: true,
  });

  broadcastRoomState(client.roomCode);
}

function handleJudgeSkipSpeech(client: ClientContext, message: ClientMessage & { type: 'JUDGE_SKIP_SPEECH' }): void {
  if (!client.roomCode || !client.isJudge) return;
  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.skipPlayerSpeech(client.playerId, message.seatNumber);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'SKIP_FAILED', message: result.error! });
    return;
  }

  broadcastRoomState(client.roomCode);
}

// ============================================================================
// 狼人聊天与投票处理器
// ============================================================================

function handleWolfChat(client: ClientContext, message: ClientMessage & { type: 'WOLF_CHAT' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const result = engine.submitWolfChat(client.playerId, message.content);
  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'WOLF_CHAT_FAILED', message: result.error! });
    return;
  }

  // 从引擎状态中读取最新的聊天消息（与存储的消息 ID 保持一致）
  const state = engine.getState();
  const storedMessages = state.wolfChatMessages;
  const lastMessage = storedMessages[storedMessages.length - 1];
  if (!lastMessage) return;

  const sharedRoles = state.config.sharedWolfRoles;
  const wolfClients = lobby.getRoomClients(client.roomCode).filter((c) => {
    const player = state.players.find((p) => p.id === c.playerId);
    return player && isSharedWolfRole(player.role, sharedRoles) && player.status === 'alive';
  });

  for (const wolfClient of wolfClients) {
    safeSend(wolfClient.ws, {
      type: 'WOLF_CHAT_HISTORY',
      messages: [lastMessage],
      isHistorical: false,
    });
  }

  // 法官也可以看到狼人聊天
  sendToJudge(client.roomCode, {
    type: 'WOLF_CHAT_HISTORY',
    messages: [lastMessage],
    isHistorical: false,
  });
}

function handleWolfVote(client: ClientContext, message: ClientMessage & { type: 'WOLF_VOTE' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  // 通过 submitNightAction 提交狼人投票
  const result = engine.submitNightAction(
    client.playerId,
    'werewolf',
    message.targetSeat,
    { killTarget: message.targetSeat },
  );

  if (!result.success) {
    safeSend(client.ws, { type: 'ERROR', code: 'WOLF_VOTE_FAILED', message: result.error! });
    return;
  }

  broadcastRoomState(client.roomCode);
}

function handleDeadChat(client: ClientContext, message: ClientMessage & { type: 'DEAD_CHAT' }): void {
  if (!client.roomCode) return;

  const engine = lobby.getRoom(client.roomCode);
  if (!engine) return;

  const state = engine.getState();
  const player = state.players.find((p) => p.id === client.playerId);

  // 只有死亡玩家可以发送死亡聊天
  if (!player || player.status !== 'dead') {
    safeSend(client.ws, { type: 'ERROR', code: 'FORBIDDEN', message: '只有死亡玩家可以在此聊天' });
    return;
  }

  const content = (message as any).content?.toString().trim();
  if (!content || content.length > 500) {
    safeSend(client.ws, { type: 'ERROR', code: 'INVALID_INPUT', message: '消息内容不合法' });
    return;
  }

  // 广播给所有死亡玩家
  const clients = lobby.getRoomClients(client.roomCode);
  const deadChatMessage: DeadChatMessage = {
    type: 'DEAD_CHAT',
    id: `dc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    senderSeat: player.seatNumber,
    senderNickname: player.nickname,
    content,
    timestamp: Date.now(),
  };

  for (const c of clients) {
    const p = state.players.find((pp) => pp.id === c.playerId);
    if (p && p.status === 'dead' && c.ws.readyState === 1) { // WebSocket.OPEN = 1
      safeSend(c.ws, deadChatMessage);
    }
  }

  // 法官也可见
  sendToJudge(client.roomCode, deadChatMessage);
}

// ============================================================================
// 管理员操作处理器
// ============================================================================

async function handleAdminFetchLogs(client: ClientContext, message: ClientMessage & { type: 'ADMIN_FETCH_LOGS' }): Promise<void> {
  // 鉴权
  if (!ADMIN_SECRET) {
    safeSend(client.ws, { type: 'ERROR', code: 'ADMIN_DISABLED', message: '管理员功能未配置' });
    return;
  }

  // 校验消息中携带的管理员密钥
  if (!message.secret || message.secret !== ADMIN_SECRET) {
    safeSend(client.ws, { type: 'ERROR', code: 'UNAUTHORIZED', message: '管理员密钥错误' });
    return;
  }

  if (!isMongoConnected()) {
    safeSend(client.ws, { type: 'ERROR', code: 'DB_NOT_CONNECTED', message: '数据库未连接' });
    return;
  }

  try {
    const filter: any = {};
    if (message.roomCode) filter.roomCode = message.roomCode.toUpperCase();
    if (message.gameId) filter.gameId = message.gameId.toUpperCase();
    if (message.fromTime || message.toTime) {
      filter.timestamp = {};
      if (message.fromTime) filter.timestamp.$gte = message.fromTime;
      if (message.toTime) filter.timestamp.$lte = message.toTime;
    }

    const limit = message.limit || 100;
    const logs = await GameLogModel.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const total = await GameLogModel.countDocuments(filter);

    const logDTOs: ActionLogDTO[] = logs.map((doc) => ({
      id: doc._id.toString(),
      roomCode: doc.roomCode,
      gameId: doc.gameId,
      timestamp: doc.timestamp,
      actorSeat: doc.actorSeat,
      actorNickname: doc.actorNickname,
      actionType: doc.actionType,
      targetSeat: doc.targetSeat,
      targetNickname: doc.targetNickname,
      phase: doc.phase,
      round: doc.round,
      detail: Object.fromEntries(doc.detail instanceof Map ? doc.detail : Object.entries(doc.detail || {})),
      overridden: doc.overridden,
      overrideReason: doc.overrideReason,
      nightActionOrderSnapshot: doc.nightActionOrderSnapshot,
    }));

    safeSend(client.ws, {
      type: 'ADMIN_LOGS_RESULT',
      logs: logDTOs,
      total,
    });
  } catch (error) {
    safeSend(client.ws, { type: 'ERROR', code: 'DB_ERROR', message: `数据库查询失败: ${(error as Error).message}` });
  }
}

function handleAdminCleanupConfig(client: ClientContext, message: ClientMessage & { type: 'ADMIN_CLEANUP_CONFIG' }): void {
  // 规则12：清除旧配置中的废弃字段
  if (!ADMIN_SECRET) {
    safeSend(client.ws, { type: 'ERROR', code: 'ADMIN_DISABLED', message: '管理员功能未配置' });
    return;
  }

  if (!message.secret || message.secret !== ADMIN_SECRET) {
    safeSend(client.ws, { type: 'ERROR', code: 'FORBIDDEN', message: '管理员密钥错误' });
    return;
  }

  // 扫描并清理废弃字段
  const deprecatedFields = ['nightmareBlockMode', 'nightmareBlockSpeech', 'nightmareBlockSkill'];

  // 通过 MongoDB 直接更新
  const RoomModel = mongoose.models.Room;
  if (!RoomModel) {
    safeSend(client.ws, { type: 'ERROR', code: 'CLEANUP_FAILED', message: 'Room model not available' });
    return;
  }

  const unsetObj: Record<string, string> = {};
  for (const field of deprecatedFields) {
    unsetObj[`config.${field}`] = '';
  }

  RoomModel.updateMany(
    {},
    { $unset: unsetObj }
  ).then((result) => {
    safeSend(client.ws, {
      type: 'ERROR',
      code: 'CLEANUP_SUCCESS',
      message: `已清理 ${result.modifiedCount} 个房间的旧配置`,
    });
  }).catch((err) => {
    safeSend(client.ws, {
      type: 'ERROR',
      code: 'CLEANUP_FAILED',
      message: `清理失败: ${err.message}`,
    });
  });
}

// ============================================================================
// 日志持久化
// ============================================================================

/**
 * 将 ActionLog 写入 MongoDB
 * 异步执行，不阻塞主流程
 */
async function persistLog(log: ActionLog): Promise<void> {
  if (!isMongoConnected()) {
    console.warn('[MongoDB] 日志写入跳过：数据库未连接');
    return;
  }

  try {
    await GameLogModel.create({
      roomCode: log.roomCode,
      gameId: log.gameId,
      timestamp: log.timestamp,
      actorSeat: log.actorSeat,
      actorNickname: log.actorNickname,
      actionType: log.actionType,
      targetSeat: log.targetSeat,
      targetNickname: log.targetNickname,
      phase: log.phase,
      round: log.round,
      detail: log.detail,
      overridden: log.overridden,
      overrideReason: log.overrideReason,
      nightActionOrderSnapshot: log.nightActionOrderSnapshot,
    });
  } catch (error) {
    console.error('[MongoDB] 日志写入失败:', (error as Error).message, '| actionType:', log.actionType, '| roomCode:', log.roomCode);
  }
}

// ============================================================================
// 注入回调
// ============================================================================

lobby.setLogCallback((log: ActionLog) => {
  persistLog(log);
});

lobby.setJudgeWarningCallback((roomCode: string, type: JudgeWarningType, msg: string, data: Record<string, unknown>) => {
  sendToJudge(roomCode, {
    type: 'JUDGE_WARNING',
    warningType: type,
    message: msg,
    data,
  });
});

lobby.setPhaseChangeCallback((roomCode: string, phase: GamePhase, subPhase: NightSubPhase | null, round: number) => {
  broadcastToRoom(roomCode, {
    type: 'PHASE_CHANGE',
    phase,
    nightSubPhase: subPhase,
    round,
  });
});

// 狼人聊天消息回调
lobby.setWolfChatCallback((roomCode: string, message: WolfChatMessageType) => {
  // 消息已在 handleWolfChat 中直接转发，此处仅做持久化等额外处理
});

// 阶段提醒回调
lobby.setPhaseReminderCallback((roomCode: string, roleId: RoleId, round: number, actorSeats: number[], timeout: number) => {
  const engine = lobby.getRoom(roomCode);
  if (!engine) return;

  const clients = lobby.getRoomClients(roomCode);
  for (const client of clients) {
    const player = engine.getState().players.find((p) => p.id === client.playerId);
    if (player && actorSeats.includes(player.seatNumber)) {
      safeSend(client.ws, {
        type: 'PHASE_REMINDER',
        roleId,
        round,
        actorSeats,
        timeout,
      });
    }
  }

  // 法官端也收到提醒
  sendToJudge(roomCode, {
    type: 'PHASE_REMINDER',
    roleId,
    round,
    actorSeats,
    timeout,
  });
});

// 狼人投票更新回调
lobby.setWolfVoteUpdateCallback((roomCode: string, votes: Record<number, number>, consensus: boolean, lockedTarget: number | null) => {
  const engine = lobby.getRoom(roomCode);
  if (!engine) return;

  const state = engine.getState();
  const sharedRoles = state.config.sharedWolfRoles;

  // 仅推送给共同睁眼的狼人
  const clients = lobby.getRoomClients(roomCode);
  for (const client of clients) {
    const player = state.players.find((p) => p.id === client.playerId);
    if (player && isSharedWolfRole(player.role, sharedRoles) && player.status === 'alive') {
      safeSend(client.ws, {
        type: 'WOLF_VOTE_UPDATE',
        votes,
        consensus,
        lockedTarget,
      });
    }
  }

  // 法官也可见
  sendToJudge(roomCode, {
    type: 'WOLF_VOTE_UPDATE',
    votes,
    consensus,
    lockedTarget,
  });
});

lobby.setGameEventCallback((roomCode: string, eventType: string, data: Record<string, unknown>) => {
  // 根据事件类型广播对应的服务端消息
  switch (eventType) {
    case 'IDIOT_REVEAL':
      broadcastToRoom(roomCode, {
        type: 'IDIOT_REVEAL',
        seatNumber: data.seatNumber as number,
        nickname: data.nickname as string,
      });
      break;
    case 'SHERIFF_ELECTED':
      broadcastToRoom(roomCode, {
        type: 'SHERIFF_ELECTED',
        seatNumber: data.seatNumber as number,
        nickname: data.nickname as string,
        votes: data.votes as Record<number, number>,
      });
      break;
    case 'SHERIFF_ELECTION_TIE':
      broadcastToRoom(roomCode, {
        type: 'SHERIFF_ELECTION_TIE',
        tieCandidates: data.tieCandidates as number[],
        votes: data.votes as Record<number, number>,
      });
      break;
    case 'SHERIFF_TRANSFER_REQUEST':
      broadcastToRoom(roomCode, {
        type: 'SHERIFF_TRANSFER_REQUEST',
        deadSheriffSeat: data.deadSheriffSeat as number,
        deadSheriffNickname: data.deadSheriffNickname as string,
        availableTargets: data.availableTargets as number[],
        timeout: data.timeout as number,
      });
      break;
    case 'SHERIFF_TRANSFER_RESULT':
      broadcastToRoom(roomCode, {
        type: 'SHERIFF_TRANSFER_RESULT',
        fromSeat: data.fromSeat as number,
        toSeat: data.toSeat as number,
        toNickname: data.toNickname as string,
        isTimeout: data.isTimeout as boolean,
      });
      break;
  }
});

// 夜间子阶段推进回调 — 广播 ROOM_STATE 确保前端感知阶段切换
lobby.setNightSubPhaseAdvanceCallback((roomCode: string) => {
  broadcastRoomState(roomCode);
});

// 夜间倒计时广播回调 — 每秒向所有客户端推送当前夜间子阶段剩余时间
lobby.setNightCountdownCallback((roomCode: string, roleId: import('@langrensha/shared').RoleId, remaining: number) => {
  broadcastToRoom(roomCode, {
    type: 'NIGHT_COUNTDOWN',
    roleId,
    remaining,
  });
});

// 发言倒计时广播回调 — 每秒向所有客户端推送当前发言者剩余时间
lobby.setSpeechCountdownCallback((roomCode: string, seatNumber: number, remaining: number) => {
  broadcastToRoom(roomCode, {
    type: 'SPEECH_COUNTDOWN',
    seatNumber,
    remaining,
  });
});

// 天亮公告回调 — 向所有客户端广播死亡/禁言信息
lobby.setDayAnnounceCallback((roomCode: string, deaths, mutedSeats) => {
  broadcastToRoom(roomCode, {
    type: 'DAY_ANNOUNCE',
    deaths: deaths as Array<{ seatNumber: number; nickname: string; cause: import('@langrensha/shared').DeathCause }>,
    mutedSeats,
  });
});

// 投票结果回调 — 广播投票结果给所有客户端
lobby.setVoteResultCallback((roomCode: string, votes: Record<number, number | null>, eliminated: number | null, isPK: boolean, pkCandidates: number[]) => {
  broadcastToRoom(roomCode, {
    type: 'VOTE_RESULT',
    votes,
    eliminated,
    isPK,
    pkCandidates,
  } as any);
});

// 游戏结束回调 — 广播游戏结束消息给所有客户端
lobby.setGameOverCallback((roomCode: string, winner: 'good' | 'evil', round: number, players: Player[]) => {
  const finalStats = players.map((p) => ({
    seatNumber: p.seatNumber,
    nickname: p.nickname,
    role: p.role,
    faction: (isEvilRole(p.role) ? 'evil' : 'good') as 'evil' | 'good',
    status: p.status,
    deathCause: p.deathCause,
    deathRound: p.deathRound,
  }));

  broadcastToRoom(roomCode, {
    type: 'GAME_OVER',
    winner,
    round,
    finalStats,
  } as any);
});

// 身份揭示回调 — 广播被票出者身份信息
lobby.setIdentityRevealCallback((roomCode: string, seatNumber: number, nickname: string, revealType: 'FACTION' | 'ROLE', revealInfo: string) => {
  broadcastToRoom(roomCode, {
    type: 'DAY_VOTE_REVEAL',
    seatNumber,
    nickname,
    revealedFaction: revealType === 'FACTION' ? (revealInfo as 'good' | 'evil') : undefined,
    revealedRole: revealType === 'ROLE' ? revealInfo : undefined,
  } as any);
});

// ============================================================================
// HTTP 服务器 & WebSocket 服务器启动
// ============================================================================

const server = http.createServer((_req, res) => {
  // 健康检查端点
  if (_req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: lobby.getRoomCount(),
      online: lobby.getOnlineCount(),
      mongodb: isMongoConnected(),
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });

// ============================================================================
// LOBBY 阶段掉线检查定时器
// 每 1.5 秒检查所有 LOBBY 阶段房间中的玩家，若已断连则立即移除
// ============================================================================
const LOBBY_DISCONNECT_CHECK_INTERVAL = 1500; // 1.5 秒

setInterval(() => {
  const removedPlayers = lobby.checkLobbyDisconnectedPlayers();
  for (const { roomCode, seatNumber, nickname } of removedPlayers) {
    // 广播玩家离开消息
    broadcastToRoom(roomCode, {
      type: 'PLAYER_LEFT',
      seatNumber,
      nickname,
    });
    // 广播更新后的房间状态
    broadcastRoomState(roomCode);
  }
}, LOBBY_DISCONNECT_CHECK_INTERVAL);

wss.on('connection', (ws) => {
  console.log('[WS] 新连接');

  // 注册连接
  lobby.registerConnection(ws);

  ws.on('message', (raw) => {
    handleMessage(ws, raw.toString());
  });

  ws.on('close', () => {
    console.log('[WS] 连接断开');
    const result = lobby.unregisterConnection(ws);
    if (result.roomCode) {
      broadcastRoomState(result.roomCode);
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] 连接错误:', error.message);
  });
});

// ============================================================================
// 启动服务
// ============================================================================

async function startServer(): Promise<void> {
  // 连接 MongoDB
  if (MONGODB_URI) {
    console.log('[MongoDB] 正在连接...');
    await connectMongoDB(MONGODB_URI);
  } else {
    console.warn('[MongoDB] 未配置 MONGODB_URI，日志持久化功能不可用');
  }

  // 启动 HTTP + WebSocket 服务器
  server.listen(PORT, () => {
    const localUrl = `ws://localhost:${PORT}`;
    const publicUrl = PUBLIC_URL || localUrl;

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║       🐺 狼人杀联机游戏 — 服务已启动        ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  本地: ${localUrl.padEnd(35)}║`);
    console.log(`║  公网: ${publicUrl.padEnd(35)}║`);
    console.log(`║  MongoDB: ${(isMongoConnected() ? '已连接' : '未连接').padEnd(33)}║`);
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
  });
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n[Server] 正在关闭...');
  lobby.destroyAll();
  await disconnectMongoDB();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Server] 收到终止信号...');
  lobby.destroyAll();
  await disconnectMongoDB();
  server.close();
  process.exit(0);
});

startServer().catch((error) => {
  console.error('[Server] 启动失败:', error);
  process.exit(1);
});
