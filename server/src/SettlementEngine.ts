/**
 * ============================================================================
 * 狼人杀游戏结算引擎 (Settlement Engine)
 * ============================================================================
 *
 * 提供独立的结算逻辑函数，不依赖 GameEngine 实例状态
 * 所有函数接收状态参数，返回结算结果
 *
 * 设计原则：
 * - 纯函数：无副作用，便于测试
 * - 可复用：可被 GameEngine 和其他模块调用
 * - 高优先级：结算逻辑直接影响游戏结果准确性
 */

import type {
  Player,
  Faction,
  DeathCause,
  NightDeathRecord,
  DayDeathRecord,
  RoleId,
  WinCondition,
  HunterDeathShootCause,
} from '@langrensha/shared';
import {
  isEvilRole,
  isGodRole,
  isVillagerRole,
  isImitationFailRole,
  ROLE_META,
} from '@langrensha/shared';

// ============================================================================
// 获胜条件检查
// ============================================================================

/**
 * 检查游戏获胜条件
 * @param players 当前玩家列表
 * @param winCondition 获胜条件配置（屠边/屠城）
 * @returns 获胜阵营，null 表示游戏继续
 */
export function checkWinCondition(
  players: Player[],
  winCondition: WinCondition,
): Faction | null {
  const alivePlayers = players.filter((p) => p.status === 'alive' && !p.isJudge);

  // 全部死亡（极端情况）
  if (alivePlayers.length === 0) {
    return 'good'; // 默认好人获胜
  }

  // 阵营分类：
  // - 隐狼始终属于狼人阵营（被预言家查验为好人只是显示效果）
  // - 机械狼始终属于狼人阵营（无论模仿什么角色）
  const aliveGood: Player[] = [];
  const aliveEvil: Player[] = [];
  for (const p of alivePlayers) {
    if (p.role === 'hidden_wolf' || p.role === 'mechanical_wolf') {
      aliveEvil.push(p);
    } else if (isEvilRole(p.role)) {
      aliveEvil.push(p);
    } else {
      aliveGood.push(p);
    }
  }

  // 1. 狼人全灭 → 好人获胜
  if (aliveEvil.length === 0) {
    return 'good';
  }

  // 2. 狼人数量 > 好人数量 → 狼人获胜（所有模式通用）
  if (aliveEvil.length > aliveGood.length) {
    return 'evil';
  }

  // 3. 根据配置区分屠边和屠城
  if (winCondition === 'SLAUGHTER_SIDE') {
    // 屠边：神职全灭或平民全灭 → 狼人获胜
    const aliveGods = aliveGood.filter((p) => isGodRole(p.role));
    const aliveVillagers = aliveGood.filter((p) => isVillagerRole(p.role));
    if (aliveGods.length === 0 || aliveVillagers.length === 0) {
      return 'evil';
    }
  } else {
    // 屠城：所有好人死亡 → 狼人获胜
    if (aliveGood.length === 0) {
      return 'evil';
    }
  }

  // 游戏继续
  return null;
}

// ============================================================================
// 死亡连锁结算
// ============================================================================

/**
 * 死亡原因类型
 */
export interface DeathChainResult {
  /** 死亡玩家列表 */
  deaths: Array<{
    player: Player;
    cause: DeathCause;
    killerSeat?: number;
  }>;
  /** 是否触发连锁（如猎人开枪） */
  hasChain: boolean;
  /** 连锁触发者（如果有） */
  chainTrigger?: Player;
}

/**
 * 解析死亡连锁
 * 判断死亡是否触发连锁技能（猎人/狼王开枪）
 * @param deadPlayer 死亡玩家
 * @param poisonBlockGun 吃毒是否封印技能（来自 RuleConfig）
 * @param hunterDeathShootCauses 猎人死亡可开枪的死因列表
 * @returns 连锁结算结果
 */
export function resolveDeathChain(
  deadPlayer: Player,
  poisonBlockGun: boolean = false,
  hunterDeathShootCauses?: HunterDeathShootCause[],
): DeathChainResult {
  const result: DeathChainResult = {
    deaths: [],
    hasChain: false,
  };

  // 判断是否被毒杀封印技能
  const isPoisonBlocked = deadPlayer.deathCause === 'witch_poison' && poisonBlockGun;

  // 猎人死亡 → 可开枪（如果尚未开枪，且非被毒杀封印，且死因允许开枪）
  if (deadPlayer.role === 'hunter' && !deadPlayer.hunterGunFired) {
    if (!isPoisonBlocked && isHunterShootCauseAllowed(deadPlayer.deathCause, hunterDeathShootCauses)) {
      result.hasChain = true;
      result.chainTrigger = deadPlayer;
    }
  }

  // 狼王死亡 → 可开枪（如果尚未开枪，且非被毒杀封印）
  if (deadPlayer.role === 'wolf_king' && !deadPlayer.wolfKingGunFired) {
    if (!isPoisonBlocked) {
      result.hasChain = true;
      result.chainTrigger = deadPlayer;
    }
  }

  return result;
}

/**
 * 判断猎人的死因是否允许开枪
 */
function isHunterShootCauseAllowed(
  deathCause: DeathCause | null,
  allowedCauses?: HunterDeathShootCause[],
): boolean {
  if (!allowedCauses || allowedCauses.length === 0) return true;
  if (!deathCause) return false;
  const causeMap: Partial<Record<DeathCause, HunterDeathShootCause>> = {
    witch_poison: 'witch_poison',
    werewolf_kill: 'werewolf_kill',
    vote_out: 'vote_out',
  };
  const mapped = causeMap[deathCause];
  return mapped ? allowedCauses.includes(mapped) : false;
}

// ============================================================================
// 夜间结算辅助
// ============================================================================

/**
 * 夜间死亡结算结果
 */
export interface NightSettlementResult {
  /** 死亡记录列表 */
  deaths: NightDeathRecord[];
  /** 被恐惧的玩家座位号列表 */
  fearedSeats: number[];
  /** 技能被封印的玩家座位号列表 */
  skillBlockedSeats: number[];
}

/**
 * 判断玩家是否可以被噩梦恐惧
 * @param player 目标玩家
 * @returns 是否可以被恐惧
 */
export function canBeNightmareFeared(player: Player): boolean {
  // 噩梦之影不能恐惧自己
  // 不能连续恐惧同一人（需要外部状态判断）
  return player.status === 'alive';
}

/**
 * 判断守卫守护是否有效
 * @param guardSeat 守卫座位号
 * @param targetSeat 守护目标座位号
 * @param lastGuardedSeat 上一次守护的目标
 * @param round 当前轮次
 * @returns 是否有效
 */
export function isGuardProtectionValid(
  guardSeat: number,
  targetSeat: number,
  lastGuardedSeat: number | null,
  round: number,
): { valid: boolean; reason?: string } {
  // 首夜可以守护自己
  if (targetSeat === guardSeat && round !== 1) {
    return { valid: false, reason: '仅首夜可守护自己' };
  }

  // 不能重复守护同一人
  if (lastGuardedSeat !== null && targetSeat === lastGuardedSeat) {
    return { valid: false, reason: '不可重复守护同一人' };
  }

  return { valid: true };
}

// ============================================================================
// 白天结算辅助
// ============================================================================

/**
 * 计算发言顺序
 * @param players 玩家列表
 * @param lastDeadSeat 最后死亡的玩家座位号（用于确定发言起点）
 * @returns 发言顺序（座位号列表）
 */
export function calculateSpeechOrder(
  players: Player[],
  lastDeadSeat: number | null,
): number[] {
  const alivePlayers = players
    .filter((p) => p.status === 'alive')
    .sort((a, b) => a.seatNumber - b.seatNumber);

  if (alivePlayers.length === 0) return [];

  // 无死亡玩家 → 从最小座位号开始
  if (lastDeadSeat === null) {
    return alivePlayers.map((p) => p.seatNumber);
  }

  // 有死亡玩家 → 从死亡玩家下一位开始
  const startIndex = alivePlayers.findIndex((p) => p.seatNumber > lastDeadSeat);
  if (startIndex === -1) {
    // 所有存活玩家座位号都小于死亡玩家 → 从最小座位号开始
    return alivePlayers.map((p) => p.seatNumber);
  }

  // 从 startIndex 开始循环排列
  const order: number[] = [];
  for (let i = 0; i < alivePlayers.length; i++) {
    const idx = (startIndex + i) % alivePlayers.length;
    order.push(alivePlayers[idx].seatNumber);
  }

  return order;
}

/**
 * 投票结果结算
 * @param votes 投票记录（投票者座位号 → 目标座位号）
 * @param sheriffSeat 警长座位号（如果有）
 * @param sheriffVoteWeight 警长投票权重
 * @param votedVoters 已投票的投票者集合（用于防止重复投票）
 * @returns 结算结果
 */
export function resolveVoteResult(
  votes: Record<number, number | null>,
  sheriffSeat: number | null,
  sheriffVoteWeight: number = 1.5,
  votedVoters?: Set<number>,
): {
  /** 各目标得票数 */
  voteCounts: Record<number, number>;
  /** 最高得票座位号 */
  maxVoteSeat: number | null;
  /** 是否进入 PK */
  needPK: boolean;
  /** PK 候选人 */
  pkCandidates: number[];
} {
  const voteCounts: Record<number, number> = {};
  const seenVoters = new Set<number>();

  // 统计票数（防止重复投票）
  for (const [voterSeatStr, targetSeat] of Object.entries(votes)) {
    const voterSeat = parseInt(voterSeatStr);

    // 跳过弃票
    if (targetSeat === null) continue;

    // 跳过重复投票（同一投票者多次投票只计第一次）
    if (seenVoters.has(voterSeat)) continue;
    seenVoters.add(voterSeat);

    // 如果提供了已投票集合，也检查是否已投过
    if (votedVoters && votedVoters.has(voterSeat)) continue;

    const weight = sheriffSeat && voterSeat === sheriffSeat
      ? sheriffVoteWeight
      : 1;

    voteCounts[targetSeat] = (voteCounts[targetSeat] ?? 0) + weight;
  }

  // 找出最高票
  const targets = Object.keys(voteCounts).map(Number);
  if (targets.length === 0) {
    return { voteCounts, maxVoteSeat: null, needPK: false, pkCandidates: [] };
  }

  const maxVotes = Math.max(...targets.map((t) => voteCounts[t]));
  const maxVoteSeats = targets.filter((t) => voteCounts[t] === maxVotes);

  // 多人同票 → 进入 PK
  const needPK = maxVoteSeats.length > 1;

  return {
    voteCounts,
    maxVoteSeat: needPK ? null : maxVoteSeats[0],
    needPK,
    pkCandidates: needPK ? maxVoteSeats : [],
  };
}

// ============================================================================
// 角色技能辅助
// ============================================================================

/**
 * 判断机械狼是否可以作为狼人参与投票
 * @param player 机械狼玩家
 * @returns 是否可以参与狼人投票（默认不可）
 */
export function canMechanicalWolfActAsWolf(player: Player): boolean {
  if (player.role !== 'mechanical_wolf') return false;
  // 机械狼默认不参与狼人投票，除非特殊配置
  // 此函数仅做类型判断，实际配置由 GameEngine 管理
  return false;
}

/**
 * 判断机械狼模仿是否失败
 * @param imitatedRole 模仿的角色
 * @returns 是否模仿失败
 */
export function isMechanicalWolfImitationFailed(imitatedRole: RoleId): boolean {
  return isImitationFailRole(imitatedRole);
}

/**
 * 获取机械狼被预言家查验的结果
 * @param player 机械狼玩家
 * @returns 查验结果阵营
 */
export function getMechanicalWolfSeerResult(player: Player): Faction {
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