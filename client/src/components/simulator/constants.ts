import type { AutoStrategies } from './types';

export const DEFAULT_AUTO_STRATEGIES: AutoStrategies = {
  mode: 'off',
  seer: { strategy: 'random' },
  witch: { autoSave: false, autoPoison: false, poisonPriority: 'random' },
  guard: { strategy: 'random' },
  werewolf: { killStrategy: 'random' },
  nightmare: { strategy: 'random' },
  mechanicalWolf: { imitateStrategy: 'random' },
  vote: { strategy: 'random' },
  hunterGun: { strategy: 'random' },
  wolfKingGun: { strategy: 'random' },
  whiteWolfExplode: { enabled: false, targetStrategy: 'random' },
  knightDuel: { enabled: false, targetStrategy: 'random' },
};

export const EVENT_ICONS: Record<string, string> = {
  system: '🔵',
  action: '🟡',
  result: '🟢',
  judge: '👑',
  error: '❌',
};

export const MAX_EVENT_LOG_SIZE = 500;

export const DEFAULT_PLAYER_NAMES: string[] = Array.from(
  { length: 18 },
  (_, i) => `模拟${i + 1}号`,
);

export const WS_RECONNECT_MAX_ATTEMPTS = 3;

export const HEARTBEAT_INTERVAL = 25000;
