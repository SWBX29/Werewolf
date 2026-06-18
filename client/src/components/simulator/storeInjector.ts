import { useGameStore } from '../../useGameStore';
import type { PlayerRoomStateDTO, JudgeRoomStateDTO, PlayerDTO, Player, GamePhase, RoleId, Faction, DeathCause } from '@langrensha/shared';
import type { SimConnection } from './types';
import { sendMessage } from './websocket';
import { useSimulatorStore } from './useSimulatorStore';

// Store the original sendMessage so we can restore it
let originalSendMessage: ((message: any) => void) | null = null;
let currentConnections: Map<string, SimConnection> | null = null;
let currentJudgeConnection: SimConnection | null = null;
let currentSelectedPlayerId: string | null = null;

/**
 * Inject a player's state into useGameStore so existing game components work.
 * Overloaded: accepts (PlayerRoomStateDTO, SimConnection) or (JudgeRoomStateDTO, SimConnection)
 */
export function injectStateToGameStore(
  state: PlayerRoomStateDTO | JudgeRoomStateDTO,
  connection: SimConnection,
): void {
  const connections = useSimulatorStore.getState().connections;
  const judgeConnection = useSimulatorStore.getState().judgeConnection;
  const judgeState = useSimulatorStore.getState().judgeState;
  const selectedPlayerId = connection.playerId;

  // Save references for message routing
  currentConnections = connections;
  currentJudgeConnection = judgeConnection;
  currentSelectedPlayerId = selectedPlayerId;

  // Determine if this is a player state or judge state
  const isPlayerState = 'myPlayerId' in state;
  const playerState = isPlayerState ? state as PlayerRoomStateDTO : null;

  // If player state, inject player view + judge view
  if (playerState) {
    useGameStore.setState({
      playerState,
      judgeState,
      isJudge: true,
      roomCode: playerState.roomCode,
      gameMode: playerState.gameMode,
      playerId: playerState.myPlayerId,
      nickname: connection.nickname,
      enableVoice: false,
    });
  } else {
    // Judge state only
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
    });
  }

  // Intercept sendMessage to route through correct WebSocket
  interceptSendMessage(connections, selectedPlayerId, judgeConnection);
}

/**
 * Intercept useGameStore.sendMessage to route messages through simulator's WebSocket connections
 */
function interceptSendMessage(
  connections: Map<string, SimConnection>,
  selectedPlayerId: string | null,
  judgeConnection: SimConnection | null
): void {
  const store = useGameStore.getState();

  // Save original if not already saved
  if (!originalSendMessage) {
    originalSendMessage = store.sendMessage.bind(store);
  }

  // Replace sendMessage with our router
  useGameStore.setState({
    sendMessage: (message: any) => {
      const msgType = message.type as string;

      // Judge messages go through judge connection
      const judgeMessageTypes = [
        'JUDGE_OVERRIDE_SETTLEMENT', 'JUDGE_FORCE_NEXT_PHASE', 'JUDGE_PAUSE',
        'JUDGE_RESUME', 'JUDGE_MODIFY_SPEECH_ORDER', 'JUDGE_TRIGGER_KNIGHT_DUEL',
        'JUDGE_TRIGGER_WHITE_WOLF', 'JUDGE_SKIP_SPEECH', 'UPDATE_NIGHT_ORDER',
        'DISSOLVE_ROOM', 'START_GAME',
      ];

      if (judgeMessageTypes.includes(msgType)) {
        if (judgeConnection?.ws && judgeConnection.isConnected) {
          sendMessage(judgeConnection.ws, message);
        }
        return;
      }

      // Player messages go through selected player's connection
      if (selectedPlayerId) {
        const conn = connections.get(selectedPlayerId);
        if (conn?.ws && conn.isConnected) {
          sendMessage(conn.ws, message);
          return;
        }
      }

      // Fallback: try judge connection
      if (judgeConnection?.ws && judgeConnection.isConnected) {
        sendMessage(judgeConnection.ws, message);
      }
    },
  });
}

/**
 * Clear all injected state and restore original sendMessage
 */
export function clearInjectedState(): void {
  if (originalSendMessage) {
    useGameStore.setState({
      sendMessage: originalSendMessage,
    });
    originalSendMessage = null;
  }

  // Reset simulator-injected fields
  useGameStore.setState({
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

  currentConnections = null;
  currentJudgeConnection = null;
  currentSelectedPlayerId = null;
}

/**
 * Update specific game store fields based on server messages received by the simulator
 */
export function updateGameStoreFromMessage(msg: any): void {
  const store = useGameStore.getState();

  switch (msg.type) {
    case 'NIGHT_ACTION_RESULT':
      useGameStore.setState({ nightActionResult: msg });
      break;
    case 'KNIGHT_DUEL_RESULT':
      useGameStore.setState({ knightDuelResult: msg });
      break;
    case 'GAME_OVER':
      useGameStore.setState({ gameOverData: msg });
      break;
    case 'DAY_ANNOUNCE':
      useGameStore.setState({ dayAnnouncement: msg });
      break;
    case 'VOTE_RESULT':
      useGameStore.setState({ voteResult: msg });
      break;
    case 'SHERIFF_TRANSFER_REQUEST':
      useGameStore.setState({ sheriffTransferRequest: {
        deadSheriffSeat: msg.deadSheriffSeat,
        deadSheriffNickname: msg.deadSheriffNickname,
        availableTargets: msg.availableTargets,
        timeout: msg.timeout,
      }});
      break;
    case 'SHERIFF_TRANSFER_RESULT':
      useGameStore.setState({ sheriffTransferResult: {
        fromSeat: msg.fromSeat,
        toSeat: msg.toSeat,
        toNickname: msg.toNickname,
        isTimeout: msg.isTimeout,
      }});
      break;
    case 'IDIOT_REVEAL':
      // No special store update needed, just event log
      break;
  }
}
