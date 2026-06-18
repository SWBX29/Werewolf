import type {
  GamePhase,
  RoleId,
  ClientMessage,
  PlayerRoomStateDTO,
  JudgeRoomStateDTO,
} from '@langrensha/shared';

export interface SimConnection {
  playerId: string;
  nickname: string;
  seatNumber: number | null;
  role: RoleId | null;
  ws: WebSocket | null;
  isConnected: boolean;
  isJudge: boolean;
  isReady: boolean;
  state: PlayerRoomStateDTO | JudgeRoomStateDTO | null;
  suggestedAction: ClientMessage | null;
  connectedAt: number;
}

export interface SimEvent {
  timestamp: number;
  phase: GamePhase;
  round: number;
  category: 'system' | 'action' | 'result' | 'judge' | 'error';
  icon: string;
  message: string;
  detail?: Record<string, unknown>;
}

export type AutoMode = 'off' | 'suggest' | 'auto';

export type SimulatorPhase = 'setup' | 'lobby' | 'playing' | 'gameover';

export interface SeerStrategy {
  strategy: 'random' | 'suspicious_first' | 'custom_list';
  customTargets?: number[];
}

export interface WitchStrategy {
  autoSave: boolean;
  autoPoison: boolean;
  poisonPriority: 'random' | 'evil_first' | 'custom';
  customPoisonTargets?: number[];
}

export interface GuardStrategy {
  strategy: 'random' | 'protect_gods' | 'custom_list';
  customTargets?: number[];
}

export interface WerewolfStrategy {
  killStrategy: 'random' | 'kill_gods_first' | 'custom';
  customTarget?: number;
}

export interface NightmareStrategy {
  strategy: 'random' | 'block_gods' | 'custom_list';
  customTargets?: number[];
}

export interface MechanicalWolfStrategy {
  imitateStrategy: 'random' | 'custom';
  customTarget?: number;
}

export interface VoteStrategy {
  strategy: 'random' | 'follow_majority' | 'custom';
  customTarget?: number;
}

export interface HunterGunStrategy {
  strategy: 'random' | 'shoot_evil' | 'custom';
  customTarget?: number;
}

export interface WolfKingGunStrategy {
  strategy: 'random' | 'shoot_good' | 'custom';
  customTarget?: number;
}

export interface WhiteWolfExplodeStrategy {
  enabled: boolean;
  targetStrategy: 'random' | 'custom';
  customTarget?: number;
}

export interface KnightDuelStrategy {
  enabled: boolean;
  targetStrategy: 'random' | 'suspicious' | 'custom';
  customTarget?: number;
}

export interface AutoStrategies {
  mode: AutoMode;
  seer: SeerStrategy;
  witch: WitchStrategy;
  guard: GuardStrategy;
  werewolf: WerewolfStrategy;
  nightmare: NightmareStrategy;
  mechanicalWolf: MechanicalWolfStrategy;
  vote: VoteStrategy;
  hunterGun: HunterGunStrategy;
  wolfKingGun: WolfKingGunStrategy;
  whiteWolfExplode: WhiteWolfExplodeStrategy;
  knightDuel: KnightDuelStrategy;
}
