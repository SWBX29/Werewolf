/**
 * ============================================================================
 * simulator/storeInjector — 模拟器状态桥接器
 * ============================================================================
 *
 * 架构说明：
 *   1. 将模拟器连接状态注入 useGameStore，复用现有游戏组件
 *   2. 安装消息拦截器，将游戏组件的消息路由到模拟器 WebSocket
 *   3. 根据服务端消息更新 useGameStore 中的特定字段
 *
 * 设计原则：
 *   - 单向数据流：模拟器 store → useGameStore
 *   - 切换玩家时完全重置，状态更新时只更新数据
 * ============================================================================
 */

import { useGameStore } from '../../useGameStore';
import type { PlayerRoomStateDTO, JudgeRoomStateDTO } from '@langrensha/shared';
import type { SimConnection } from './types';
import { sendMessage } from './websocket';
import { useSimulatorStore } from './useSimulatorStore';

/**
 * 将玩家/法官状态注入 useGameStore，使现有游戏组件可直接使用
 * @param fullReset - 为 true 时重置所有游戏相关字段（切换玩家时使用），
 *                    为 false 时仅更新状态数据，保留结果数据
 */
export function injectStateToGameStore(
  state: PlayerRoomStateDTO | JudgeRoomStateDTO,
  connection: SimConnection,
  fullReset: boolean = true,
): void {
  const isPlayerState = 'myPlayerId' in state;
  const playerState = isPlayerState ? state as PlayerRoomStateDTO : null;

  if (playerState) {
    // 非 LOBBY/ROLE_REVEAL 阶段且有角色时，自动确认角色
    const myRole = playerState.players.find((p) => p.id === playerState.myPlayerId)?.role;
    const shouldAutoConfirm = myRole &&
      playerState.phase !== 'LOBBY' &&
      playerState.phase !== 'ROLE_REVEAL';

    // 检测阶段变化，阶段变化时重置 isActionLocked
    const prevPhase = useGameStore.getState().playerState?.phase;
    const prevNightRole = useGameStore.getState().playerState?.currentNightRole;
    const phaseChanged = prevPhase !== playerState.phase;
    const nightRoleChanged = prevNightRole !== playerState.currentNightRole;

    const baseUpdate: Record<string, unknown> = {
      playerState,
      judgeState: useSimulatorStore.getState().judgeState,
      isJudge: false,
      roomCode: playerState.roomCode,
      gameMode: playerState.gameMode,
      playerId: playerState.myPlayerId,
      nickname: connection.nickname,
      enableVoice: false,
      roleConfirmed: shouldAutoConfirm ? true : (fullReset ? false : undefined),
      // 阶段或夜间角色变化时重置操作锁定
      isActionLocked: (phaseChanged || nightRoleChanged) ? false : undefined,
    };

    // 只在切换玩家时重置游戏状态，状态更新时保留结果数据
    if (fullReset) {
      Object.assign(baseUpdate, {
        roleConfirmed: shouldAutoConfirm ? true : false,
        nightActionResult: null,
        knightDuelResult: null,
        gameOverData: null,
        dayAnnouncement: null,
        voteResult: null,
        sheriffTransferRequest: null,
        sheriffTransferResult: null,
        isActionLocked: false,
        spectatorIdentities: null,
        deadNightsElapsed: 0,
      });
    }

    // 移除 undefined 值（避免覆盖现有状态）
    const cleanUpdate = Object.fromEntries(
      Object.entries(baseUpdate).filter(([_, v]) => v !== undefined)
    );

    useGameStore.setState(cleanUpdate as any);
  } else {
    const jState = state as JudgeRoomStateDTO;
    useGameStore.setState({
      playerState: null,
      judgeState: jState,
      isJudge: true,
      roomCode: jState.roomCode,
      gameMode: jState.gameMode,
      playerId: null,
      nickname: connection.nickname,
      enableVoice: false,
      // 切换到法官时重置玩家相关状态
      roleConfirmed: false,
      nightActionResult: null,
      knightDuelResult: null,
      gameOverData: null,
      dayAnnouncement: null,
      voteResult: null,
      sheriffTransferRequest: null,
      sheriffTransferResult: null,
      isActionLocked: false,
      spectatorIdentities: null,
      deadNightsElapsed: 0,
    });
  }

  // 安装消息拦截器
  installMessageInterceptor();
}

/**
 * 安装消息拦截器，将游戏组件的消息路由到模拟器 WebSocket 连接
 * 而非默认的主客户端连接
 */
function installMessageInterceptor(): void {
  useGameStore.setState({
    sendMessageInterceptor: (message: any): boolean => {
      const simState = useSimulatorStore.getState();
      const msgType = message.type as string;

      const judgeMessageTypes = [
        'JUDGE_OVERRIDE_SETTLEMENT', 'JUDGE_FORCE_NEXT_PHASE', 'JUDGE_PAUSE',
        'JUDGE_RESUME', 'JUDGE_MODIFY_SPEECH_ORDER', 'JUDGE_TRIGGER_KNIGHT_DUEL',
        'JUDGE_TRIGGER_WHITE_WOLF', 'JUDGE_SKIP_SPEECH', 'UPDATE_NIGHT_ORDER',
        'DISSOLVE_ROOM', 'START_GAME',
      ];

      if (judgeMessageTypes.includes(msgType)) {
        const judgeConn = simState.judgeConnection;
        if (judgeConn?.ws && judgeConn.isConnected) {
          sendMessage(judgeConn.ws, message);
          return true;
        }
      }

      // 玩家消息通过选中玩家的连接发送
      const selectedId = simState.selectedPlayerId;
      if (selectedId) {
        const conn = simState.connections.get(selectedId);
        if (conn?.ws && conn.isConnected) {
          sendMessage(conn.ws, message);
          return true;
        }
      }

      // 兜底：尝试法官连接
      const judgeConn = simState.judgeConnection;
      if (judgeConn?.ws && judgeConn.isConnected) {
        sendMessage(judgeConn.ws, message);
        return true;
      }

      return false; // 交由原始 sendMessage 处理
    },
  });
}

/** 清除所有注入状态并移除消息拦截器 */
export function clearInjectedState(): void {
  useGameStore.setState({
    sendMessageInterceptor: null,
    playerState: null,
    judgeState: null,
    isJudge: false,
    roomCode: null,
    gameMode: null,
    playerId: null,
    nickname: null,
    enableVoice: true,
    nightActionResult: null,
    knightDuelResult: null,
    gameOverData: null,
    dayAnnouncement: null,
    voteResult: null,
    sheriffTransferRequest: null,
    sheriffTransferResult: null,
  });
}

/** 根据模拟器收到的服务端消息更新 useGameStore 中的特定字段 */
export function updateGameStoreFromMessage(msg: any): void {
  switch (msg.type) {
    case 'PHASE_CHANGE': {
      const phaseNames: Record<string, string> = {
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
      const suppressAnnouncement = ['NIGHT', 'DAY_ANNOUNCE'].includes(msg.phase);
      const updates: Record<string, unknown> = {
        phaseAnnouncement: suppressAnnouncement ? null : (phaseNames[msg.phase] || msg.phase),
      };
      if (msg.phase !== 'NIGHT') {
        updates.phaseTimeRemaining = 0;
      }
      if (msg.phase !== 'DAY_SPEECH') {
        updates.speechTimeRemaining = 0;
      }
      if (msg.phase === 'PRE_NIGHT') {
        const skillTimeout = useGameStore.getState().ruleConfig?.skillActivationTimeout || 15;
        updates.phaseTimeRemaining = skillTimeout;
      }
      // 非 LOBBY / ROLE_REVEAL 阶段自动确认角色
      if (msg.phase !== 'ROLE_REVEAL' && msg.phase !== 'LOBBY') {
        const hasRole = !!useGameStore.getState().playerState?.players.find(
          (p: any) => p.id === useGameStore.getState().playerState?.myPlayerId
        )?.role;
        if (hasRole) {
          updates.roleConfirmed = true;
        }
      }
      // 从白天进入夜晚时递增 deadNightsElapsed
      const prevPhase = useGameStore.getState().playerState?.phase;
      if (prevPhase && prevPhase !== 'NIGHT' && msg.phase === 'NIGHT') {
        const deadNightsElapsed = useGameStore.getState().deadNightsElapsed;
        updates.deadNightsElapsed = deadNightsElapsed + 1;
      }
      useGameStore.setState(updates as any);
      break;
    }
    case 'NIGHT_COUNTDOWN':
      useGameStore.setState({ phaseTimeRemaining: msg.remaining });
      break;
    case 'SPEECH_COUNTDOWN':
      useGameStore.setState({ speechTimeRemaining: msg.remaining });
      break;
    case 'SPEECH_CONTENT':
      useGameStore.setState({
        speechMessages: [...useGameStore.getState().speechMessages, {
          seatNumber: msg.seatNumber,
          nickname: msg.nickname,
          content: msg.content,
          timestamp: Date.now(),
        }],
      });
      break;
    case 'DEAD_CHAT':
      useGameStore.setState({
        deadChatMessages: [...useGameStore.getState().deadChatMessages, {
          id: msg.id,
          senderSeat: msg.senderSeat,
          senderNickname: msg.senderNickname,
          content: msg.content,
          timestamp: msg.timestamp,
        }],
      });
      break;
    case 'JUDGE_ACTION': {
      const actionId = `ja_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      useGameStore.setState({
        judgeActions: [...useGameStore.getState().judgeActions, {
          id: actionId,
          action: msg.action,
          message: msg.message,
          timestamp: Date.now(),
        }],
      });
      // 5秒后自动移除通知
      setTimeout(() => {
        useGameStore.setState({
          judgeActions: useGameStore.getState().judgeActions.filter((a) => a.id !== actionId),
        });
      }, 5000);
      break;
    }
    case 'ROOM_DISSOLVED':
      useGameStore.setState({ roomDissolvedData: msg });
      break;
    case 'APPEAL_EVENT':
      useGameStore.setState({
        appealEvent: {
          eventId: msg.eventId,
          description: msg.description,
          logs: msg.logs,
        },
      });
      break;
    case 'ARBITRATION_VOTE':
      useGameStore.setState({
        showArbitration: true,
        arbitrationEvent: {
          eventId: msg.eventId,
          description: msg.description,
        },
      });
      break;
    case 'SHERIFF_ELECTED':
      useGameStore.setState({ phaseAnnouncement: `⭐ ${msg.seatNumber}号 ${msg.nickname} 当选警长！` });
      break;
    case 'SHERIFF_ELECTION_TIE':
      useGameStore.setState({ phaseAnnouncement: `警长选举平票，无人当选` });
      break;
    case 'HUNTER_GUN_RESULT':
      useGameStore.setState({ phaseAnnouncement: `猎人开枪！带走了${msg.targetSeat}号 ${msg.targetNickname}` });
      break;
    case 'WOLF_KING_GUN_RESULT':
      useGameStore.setState({ phaseAnnouncement: `狼王开枪！带走了${msg.targetSeat}号 ${msg.targetNickname}` });
      break;
    case 'HUNTER_CAN_SHOOT':
      useGameStore.setState({ phaseAnnouncement: `${msg.seatNumber}号 ${msg.nickname}（猎人）可以开枪！` });
      break;
    case 'WOLF_KING_CAN_SHOOT':
      useGameStore.setState({ phaseAnnouncement: `${msg.seatNumber}号 ${msg.nickname}（狼王）可以开枪！` });
      break;
    case 'PLAYER_KILLED_BY_GUN': {
      const causeText = msg.cause === 'hunter_gun' ? '猎人开枪' : '狼王开枪';
      useGameStore.setState({ phaseAnnouncement: `${msg.killedBy}号 ${msg.killedByNickname}${causeText}带走了${msg.seatNumber}号 ${msg.nickname}！` });
      break;
    }
    case 'IDIOT_REVEAL':
      useGameStore.setState({ phaseAnnouncement: `${msg.seatNumber}号 ${msg.nickname} 翻牌白痴，免死！` });
      break;
    case 'DAY_VOTE_REVEAL': {
      const faction = msg.revealedFaction;
      const role = msg.revealedRole;
      let revealText = `${msg.seatNumber}号玩家被票出`;
      if (role) {
        revealText += `，身份为${role}`;
      } else if (faction) {
        revealText += `，${faction === 'good' ? '好人' : '狼人'}阵营`;
      }
      useGameStore.setState({ phaseAnnouncement: revealText });
      break;
    }
    case 'WOLF_CHAT_HISTORY': {
      const state = useGameStore.getState();
      if (state.isJudge && state.judgeState) {
        useGameStore.setState({
          judgeState: {
            ...state.judgeState,
            wolfChatMessages: [
              ...(state.judgeState.wolfChatMessages || []),
              ...msg.messages,
            ],
          },
        });
      } else if (state.playerState) {
        useGameStore.setState({
          playerState: {
            ...state.playerState,
            wolfChatMessages: [
              ...(state.playerState.wolfChatMessages || []),
              ...msg.messages,
            ],
          },
        });
      }
      break;
    }
    case 'NIGHT_ACTION_RESULT': {
      const updates: Record<string, unknown> = { nightActionResult: msg };
      if (msg.seerResult) {
        const factionName = msg.seerResult === 'good' ? '好人' : '狼人';
        updates.phaseAnnouncement = `查验结果：${factionName}阵营`;
      }
      useGameStore.setState(updates as any);
      break;
    }
    case 'KNIGHT_DUEL_RESULT': {
      const result = msg.targetIsWolf
        ? `骑士决斗成功！${msg.targetSeat}号是狼人，狼人死亡`
        : `骑士决斗失败！${msg.targetSeat}号是好人${msg.knightDied ? '，骑士自尽' : ''}`;
      const revealText = msg.revealedRole ? `（真实身份：${msg.revealedRole}）` : '';
      useGameStore.setState({ phaseAnnouncement: result + revealText, knightDuelResult: msg });
      break;
    }
    case 'WHITE_WOLF_EXPLODE_RESULT':
      useGameStore.setState({ phaseAnnouncement: `白狼王自爆！带走${msg.targetSeat}号玩家` });
      break;
    case 'GAME_OVER': {
      const winnerName = msg.winner === 'good' ? '好人阵营' : '狼人阵营';
      useGameStore.setState({ phaseAnnouncement: `游戏结束！${winnerName}获胜`, gameOverData: msg });
      break;
    }
    case 'DAY_ANNOUNCE': {
      const deathNames = msg.deaths.map((d: any) => `${d.seatNumber}号`).join('、');
      const mutedNames = msg.mutedSeats.map((s: number) => `${s}号`).join('、');
      let announcement = deathNames ? `昨晚 ${deathNames} 死亡` : '昨晚是平安夜';
      if (mutedNames) announcement += ` | ${mutedNames} 被禁言`;
      useGameStore.setState({ phaseAnnouncement: announcement, dayAnnouncement: msg });
      break;
    }
    case 'VOTE_RESULT': {
      const eliminated = msg.eliminated;
      const announcement = eliminated ? `${eliminated}号玩家被投票出局` : '无人出局';
      useGameStore.setState({ phaseAnnouncement: announcement, voteResult: msg });
      break;
    }
    case 'SHERIFF_TRANSFER_REQUEST':
      useGameStore.setState({
        phaseAnnouncement: `警长 ${msg.deadSheriffNickname}（${msg.deadSheriffSeat}号）死亡，需要移交警徽`,
        sheriffTransferRequest: {
          deadSheriffSeat: msg.deadSheriffSeat,
          deadSheriffNickname: msg.deadSheriffNickname,
          availableTargets: msg.availableTargets,
          timeout: msg.timeout,
        },
      });
      break;
    case 'SHERIFF_TRANSFER_RESULT': {
      const timeoutText = msg.isTimeout ? '（超时自动移交）' : '';
      useGameStore.setState({
        phaseAnnouncement: `警徽移交给 ${msg.toSeat}号 ${msg.toNickname}${timeoutText}`,
        sheriffTransferRequest: null,
        sheriffTransferResult: {
          fromSeat: msg.fromSeat,
          toSeat: msg.toSeat,
          toNickname: msg.toNickname,
          isTimeout: msg.isTimeout,
        },
      });
      break;
    }
    case 'WOLF_PHASE_SKIPPED':
      useGameStore.setState({ phaseAnnouncement: msg.publicMessage });
      break;
  }
}
