/**
 * ============================================================================
 * 狼人杀联机游戏 — 全局共享类型定义
 * ============================================================================
 *
 * 架构说明：
 *   本文件是整个游戏系统的类型基石，被服务端和前端共同引用。
 *   所有枚举、接口、DTO 均在此定义，确保前后端类型契约严格一致。
 *
 * 核心设计原则：
 *   1. 零硬编码 — 所有配置均通过 RuleConfig 动态注入，类型系统强制约束
 *   2. 防作弊 DTO — PlayerDTO 仅暴露当前玩家可见信息，服务端脱敏层依赖此结构
 *   3. 动态夜间顺序 — nightActionOrder 为 string[] 数组，状态机按序遍历
 *   4. 白天中断协议 — KnightDuel / WhiteWolfExplode 可随时中断白天流程
 * ============================================================================
 */

// ============================================================================
// 第一部分：角色系统 (Role System)
// ============================================================================

/**
 * 角色唯一标识符
 * 命名规范：小写蛇形命名，与 RuleConfig.roleDistribution 的 key 对应
 */
export type RoleId =
  | 'villager'          // 普通村民
  | 'seer'              // 预言家
  | 'witch'             // 女巫
  | 'hunter'            // 猎人
  | 'guard'             // 守卫
  | 'idiot'             // 白痴
  | 'knight'            // 骑士
  | 'werewolf'          // 普通狼人
  | 'white_wolf_king'   // 白狼王
  | 'wolf_king'         // 狼王
  | 'nightmare_shadow'  // 噩梦之影
  | 'hidden_wolf'       // 隐狼
  | 'mechanical_wolf';  // 机械狼

/**
 * 阵营枚举
 */
export type Faction = 'good' | 'evil';

/**
 * 角色元数据（只读参考，不参与运行时逻辑）
 */
export interface RoleMeta {
  id: RoleId;
  name: string;       // 中文显示名
  faction: Faction;
  description: string; // 技能描述
}

/**
 * 全角色元数据表（运行时只读引用，非硬编码配置）
 * 服务端和前端均可 import 此表做 UI 渲染或逻辑判断
 */
export const ROLE_META: Record<RoleId, RoleMeta> = {
  villager: {
    id: 'villager',
    name: '村民',
    faction: 'good',
    description: '没有特殊技能，依靠逻辑推理和投票消灭狼人',
  },
  seer: {
    id: 'seer',
    name: '预言家',
    faction: 'good',
    description: '每晚可查验一名玩家的阵营',
  },
  witch: {
    id: 'witch',
    name: '女巫',
    faction: 'good',
    description: '拥有一瓶解药和一瓶毒药，各限用一次',
  },
  hunter: {
    id: 'hunter',
    name: '猎人',
    faction: 'good',
    description: '死亡时可开枪带走一名玩家（被毒死时视村规而定）',
  },
  guard: {
    id: 'guard',
    name: '守卫',
    faction: 'good',
    description: '每晚可守护一名玩家（不可重复守护同一人）',
  },
  idiot: {
    id: 'idiot',
    name: '白痴',
    faction: 'good',
    description: '被投票出局时可翻牌免死，此后失去投票权',
  },
  knight: {
    id: 'knight',
    name: '骑士',
    faction: 'good',
    description: '白天发言阶段可发动决斗：若目标为狼则狼死入夜，若为好人则骑士自尽（视村规）',
  },
  werewolf: {
    id: 'werewolf',
    name: '狼人',
    faction: 'evil',
    description: '每晚与同伴商议击杀一名玩家',
  },
  white_wolf_king: {
    id: 'white_wolf_king',
    name: '白狼王',
    faction: 'evil',
    description: '白天发言阶段可自爆带走一人并强制入夜',
  },
  wolf_king: {
    id: 'wolf_king',
    name: '狼王',
    faction: 'evil',
    description: '被票出或被杀出局时可开枪带走一人（非自爆）',
  },
  nightmare_shadow: {
    id: 'nightmare_shadow',
    name: '噩梦之影',
    faction: 'evil',
    description: '每晚恐惧一人，使其当夜所有技能失效。不能恐惧自己，不可重复恐惧同一人',
  },
  hidden_wolf: {
    id: 'hidden_wolf',
    name: '隐狼',
    faction: 'evil',
    description: '夜晚不睁眼、不参与刀人投票。未以狼人身份行动时被查验为好人，行动后显示为狼人。骑士决斗隐狼时骑士获胜',
  },
  mechanical_wolf: {
    id: 'mechanical_wolf',
    name: '机械狼',
    faction: 'evil',
    description: '第一晚选择模仿目标，第二晚释放模仿技能后进入静默。模仿平民/骑士/白痴则失败。所有其他狼人阵营死亡后可参与刀人投票',
  },
};

/**
 * 判断角色是否属于狼人阵营
 */
export function isEvilRole(roleId: RoleId): boolean {
  return ROLE_META[roleId].faction === 'evil';
}

/**
 * 判断角色是否为隐狼（被查验时显示为好人）
 */
export function isHiddenWolf(roleId: RoleId): boolean {
  return roleId === 'hidden_wolf';
}

/**
 * 判断角色是否属于"共同睁眼的狼人"（参与刀人投票）
 * 默认成员：普通狼人、狼王、噩梦之影
 * 隐狼不属于共同睁眼的狼人
 */
export function isSharedWolfRole(roleId: RoleId, sharedWolfRoles?: string[]): boolean {
  if (sharedWolfRoles && sharedWolfRoles.length > 0) {
    return sharedWolfRoles.includes(roleId);
  }
  // 默认：普通狼人、狼王、噩梦之影
  return roleId === 'werewolf' || roleId === 'wolf_king' || roleId === 'nightmare_shadow';
}

/**
 * 判断角色是否拥有夜间行动能力（需要进入子阶段）
 * 普通村民和白痴没有夜间行动
 */
export function hasNightAction(roleId: RoleId): boolean {
  return roleId !== 'villager' && roleId !== 'idiot' && roleId !== 'hidden_wolf';
}

/**
 * 判断角色是否为模仿失败角色（平民/骑士/白痴）
 * 机械狼模仿这些角色时模仿失败
 */
export function isImitationFailRole(roleId: RoleId): boolean {
  return roleId === 'villager' || roleId === 'knight' || roleId === 'idiot';
}

/**
 * 判断角色是否为神职角色
 * 神职角色：预言家、女巫、猎人、守卫、白痴、骑士
 */
export function isGodRole(roleId: RoleId): boolean {
  const godRoles: RoleId[] = ['seer', 'witch', 'hunter', 'guard', 'idiot', 'knight'];
  return godRoles.includes(roleId);
}

/**
 * 判断角色是否为平民角色
 * 平民角色：仅村民
 */
export function isVillagerRole(roleId: RoleId): boolean {
  return roleId === 'villager';
}

// ============================================================================
// 第二部分：动态规则配置 (RuleConfig)
// ============================================================================

/**
 * 夜间行动顺序预置模板
 * - classic: 经典顺序
 * - seer_first: 预言家优先
 * - witch_first: 女巫优先
 * - chaos: 混沌（法官手动拖拽排序）
 */
export type NightActionOrderPreset = 'classic' | 'seer_first' | 'witch_first' | 'chaos';

/**
 * 预置模板对应的角色顺序映射
 * 注意：噩梦之影始终排在首位（恐惧需先于其他行动生效）
 * 但当 nightmareBlockMode 为 NEXT_NIGHT 时，顺序不影响当夜
 */
export const NIGHT_ACTION_ORDER_PRESETS: Record<
  Exclude<NightActionOrderPreset, 'chaos'>,
  RoleId[]
> = {
  classic: ['nightmare_shadow', 'werewolf', 'witch', 'seer', 'guard', 'mechanical_wolf'],
  seer_first: ['nightmare_shadow', 'seer', 'werewolf', 'witch', 'guard', 'mechanical_wolf'],
  witch_first: ['nightmare_shadow', 'werewolf', 'witch', 'seer', 'guard', 'mechanical_wolf'],
};

/**
 * 女巫自救规则
 * - NEVER: 不可自救
 * - FIRST_NIGHT: 仅首夜可自救
 * - ALWAYS: 始终可自救
 */
export type WitchSaveSelfRule = 'NEVER' | 'FIRST_NIGHT' | 'ALWAYS';

/**
 * 同守同救冲突结算
 * - DEATH: 守卫和女巫同时作用于同一目标，目标死亡（双药冲突）
 * - ALIVE: 算作救活
 */
export type GuardWitchConflictRule = 'DEATH' | 'ALIVE';

/**
 * 骑士决斗狼王冲突结算
 * - CAN_SHOOT: 骑士决斗出狼王，狼王出局时可以开枪
 * - SILENCED: 决斗出局绝对封印，狼王不可开枪
 */
export type KnightDuelWolfKingRule = 'CAN_SHOOT' | 'SILENCED';

/**
 * 骑士决斗好人翻车规则
 * - SUICIDE: 骑士决斗好人时自尽
 * - REVEAL_ONLY: 仅暴露身份不死亡，继续白天流程
 */
export type KnightDuelSuicideRule = 'SUICIDE' | 'REVEAL_ONLY';

/**
 * 白天票出身份显示方式（规则20）
 * - NONE: 不显示身份
 * - FACTION: 显示阵营（好人/狼人）
 * - ROLE: 显示具体角色名称
 */
export type RevealIdentityOnDayVote = 'NONE' | 'FACTION' | 'ROLE';

/**
 * 平票处理策略
 * - SKIP: 无人出局
 * - PK_VOTE: 进入PK发言重新投票
 * - RANDOM: 随机处决
 */
export type TieVoteResolution = 'SKIP' | 'PK_VOTE' | 'RANDOM';

/**
 * 获胜条件
 * - SLAUGHTER_SIDE: 屠边（消灭某一阵营全部成员）
 * - SLAUGHTER_ALL: 屠城（消灭所有好人）
 */
export type WinCondition = 'SLAUGHTER_SIDE' | 'SLAUGHTER_ALL';

/**
 * 白天死亡连锁结算策略
 * - TRIGGER_ALL: 白狼王自爆/骑士决斗触发的所有亡语（如狼王开枪）均立刻结算
 * - TRIGGER_DEFERRED: 延期至进入黑夜前统一结算
 */
export type DaytimeKillSequence = 'TRIGGER_ALL' | 'TRIGGER_DEFERRED';

/**
 * 狼人共群规则
 * - ALL_SHARE: 所有狼人互相知晓身份并共群
 * - LEADER_ONLY: 仅狼王/白狼王知道普通狼人，噩梦之影单独行动
 * - NONE: 各自独立行动
 */
export type WerewolfSharedVision = 'ALL_SHARE' | 'LEADER_ONLY' | 'NONE';

/**
 * 动态村规配置 — 游戏的完整规则引擎配置对象
 *
 * 设计理念：
 *   坚决摒弃硬编码规则。游戏结算必须依赖此对象的每一项字段。
 *   法官/房主在建房时可精细化设置所有参数。
 *   状态机在运行时从 room.config 读取此对象驱动流程。
 */
export interface RuleConfig {
  /** 游戏总人数 */
  playerCount: number;

  /**
   * 角色分配表：key 为 RoleId，value 为该角色数量
   * 总数必须等于 playerCount
   * 示例：{ werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 3 }
   */
  roleDistribution: Partial<Record<RoleId, number>>;

  // ---- 夜间行动顺序 ----

  /**
   * 夜间行动顺序数组
   * 按数组中的角色ID顺序依次进入夜间子阶段
   * 不存在于本局游戏中的角色会被自动跳过
   */
  nightActionOrder: RoleId[];

  /** 当前使用的预置模板标识（chaos 表示手动排序） */
  nightActionOrderPreset: NightActionOrderPreset;

  // ---- 村规配置 ----

  /** 女巫能否自救 */
  witchSaveSelf: WitchSaveSelfRule;

  /** 女巫同一晚能否同时使用解药和毒药 */
  witchCanUseBothPotions: boolean;

  /** 同守同救结算规则 */
  guardWitchConflict: GuardWitchConflictRule;

  /** 吃毒是否封印技能（同时作用于猎人和狼王） */
  poisonBlockGun: boolean;

  /** 骑士决斗狼王冲突结算 */
  knightDuelWolfKing: KnightDuelWolfKingRule;

  /** 骑士决斗好人时是否翻车自尽 */
  knightDuelSuicide: KnightDuelSuicideRule;

  /** 平票处理策略 */
  tieVoteResolution: TieVoteResolution;

  /** 获胜条件 */
  winCondition: WinCondition;

  /** 白天死亡连锁结算策略 */
  daytimeKillSequence: DaytimeKillSequence;

  /** 狼人共群规则 */
  werewolfSharedVision: WerewolfSharedVision;

  /**
   * 共同睁眼的狼人角色列表
   * 这些角色在夜晚狼人子阶段中参与刀人投票
   * 默认：['werewolf', 'wolf_king', 'nightmare_shadow']
   * 隐狼不应出现在此列表中
   * 法官可自由增删
   */
  sharedWolfRoles: RoleId[];

  // ---- 发言顺序 ----

  /** 发言顺序策略 */
  speechOrderStrategy: SpeechOrderStrategy;

  /** 夜间行动超时时间（秒），0 表示无限等待 */
  nightActionTimeout: number;

  /** 白天发言每人超时时间（秒），0 表示无限等待 */
  speechTimeout: number;

  /** 投票超时时间（秒），0 表示无限等待 */
  voteTimeout: number;

  /** 发言结束到投票开始之间的等待时间（秒），用于骑士发动技能等，默认 10 */
  preVoteWaitTime: number;

  /** 投票出局后技能发动等待时间（秒），用于猎人/狼王等角色发动技能，默认 15 */
  skillActivationTimeout: number;

  /** 白天票出身份显示方式（规则20） */
  revealIdentityOnDayVote: RevealIdentityOnDayVote;

  /** 是否启用警长选举 */
  sheriffElectionEnabled: boolean;

  /** 警长投票权重（1 / 1.5 / 2），默认 1.5 */
  sheriffVoteWeight: 1 | 1.5 | 2;

  /** 是否启用语音功能，默认 true */
  enableVoice: boolean;

  /** 首日是否进行两轮发言，默认 false */
  firstDayDoubleSpeech: boolean;
}

/**
 * 发言顺序策略
 * - DEATH_LEFT: 从上一个死亡者的左手边开始
 * - DEATH_RIGHT: 从上一个死亡者的右手边开始
 * - SHERIFF_LEFT: 从警长左手边开始
 * - SHERIFF_RIGHT: 从警长右手边开始
 * - JUDGE_CUSTOM: 法官手动指定
 */
export type SpeechOrderStrategy = 'DEATH_LEFT' | 'DEATH_RIGHT' | 'SHERIFF_LEFT' | 'SHERIFF_RIGHT' | 'JUDGE_CUSTOM';

/**
 * 创建默认 RuleConfig（所有字段均有合理默认值）
 * 注意：这不是硬编码游戏数据，而是创建房间的初始模板
 * 法官在 UI 上修改后覆盖这些默认值
 */
export function createDefaultRuleConfig(playerCount: number = 12): RuleConfig {
  return {
    playerCount,
    roleDistribution: {
      villager: 1,
      seer: 1,
      witch: 1,
      hunter: 1,
      guard: 1,
      idiot: 1,
      knight: 1,
      werewolf: 1,
      white_wolf_king: 0,
      wolf_king: 1,
      nightmare_shadow: 1,
      hidden_wolf: 1,
      mechanical_wolf: 1,
    },
    nightActionOrder: [...NIGHT_ACTION_ORDER_PRESETS.classic],
    nightActionOrderPreset: 'classic',
    witchSaveSelf: 'ALWAYS',
    witchCanUseBothPotions: true,
    guardWitchConflict: 'DEATH',
    poisonBlockGun: false,
    knightDuelWolfKing: 'CAN_SHOOT',
    knightDuelSuicide: 'SUICIDE',
    tieVoteResolution: 'PK_VOTE',
    winCondition: 'SLAUGHTER_SIDE',
    daytimeKillSequence: 'TRIGGER_ALL',
    werewolfSharedVision: 'ALL_SHARE',
    sharedWolfRoles: ['werewolf', 'wolf_king', 'nightmare_shadow'],
    speechOrderStrategy: 'DEATH_LEFT',
    nightActionTimeout: 30,
    speechTimeout: 60,
    voteTimeout: 20,
    preVoteWaitTime: 10,
    skillActivationTimeout: 15,
    revealIdentityOnDayVote: 'NONE',
    sheriffElectionEnabled: false,
    sheriffVoteWeight: 1.5,
    enableVoice: true,
    firstDayDoubleSpeech: false,
  };
}

// ============================================================================
// 第三部分：游戏状态机 (Game State Machine)
// ============================================================================

/**
 * 游戏主阶段
 *
 * 状态流转：
 *   LOBBY → NIGHT → NIGHT_SETTLEMENT → DAY_ANNOUNCE → DAY_SPEECH → DAY_VOTE → DAY_SETTLEMENT → NIGHT → ...
 *                                                                                                  → GAME_OVER
 *
 * 中断机制：
 *   DAY_SPEECH / DAY_VOTE 阶段可被 KnightDuel / WhiteWolfExplode 中断
 *   中断后进入 DAY_INTERRUPT 子阶段处理连锁事件
 */
export type GamePhase =
  | 'LOBBY'             // 大厅等待
  | 'ROLE_REVEAL'      // 角色展示环节
  | 'PRE_NIGHT'         // 入夜前等待
  | 'NIGHT'             // 夜间行动（含子阶段）
  | 'NIGHT_SETTLEMENT'  // 夜间结算
  | 'DAY_ANNOUNCE'      // 白天公布死讯
  | 'SHERIFF_ELECTION'   // 警长选举
  | 'SHERIFF_TRANSFER'   // 警徽移交（警长死亡时）
  | 'DAY_SPEECH'        // 白天发言
  | 'PRE_VOTE_WAIT'     // 发言结束→投票前等待（骑士可发动技能）
  | 'DAY_VOTE'          // 白天投票
  | 'DAY_SETTLEMENT'    // 白天结算
  | 'DAY_INTERRUPT'     // 白天中断（骑士决斗/白狼王自爆触发）
  | 'PK_VOTE'           // 平票PK投票
  | 'GAME_OVER';        // 游戏结束

/**
 * 游戏阶段中文名称映射（共享常量，供客户端各组件统一引用）
 */
export const PHASE_NAMES: Record<GamePhase, string> = {
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

/**
 * 夜间子阶段信息
 * 记录当前正在行动的角色及该角色的行动轮次
 */
export interface NightSubPhase {
  /** 当前行动角色ID */
  currentRole: RoleId;
  /** 当前角色在 nightActionOrder 中的索引 */
  currentRoleIndex: number;
  /** 是否已被噩梦之影恐惧封印 */
  isBlockedByNightmare: boolean;
}

/**
 * 游戏运行模式
 * - HUMAN: 上帝法官模式，法官手动控制流程
 * - SYSTEM: 系统跑团模式，依据 RuleConfig 自动推进
 */
export type GameMode = 'HUMAN' | 'SYSTEM';

/**
 * 玩家存活状态
 */
export type PlayerStatus = 'alive' | 'dead' | 'poisoned' | 'voted_out';

/**
 * 完整玩家数据（服务端内部使用，包含所有敏感信息）
 */
export interface Player {
  /** 玩家唯一ID（WebSocket 连接分配） */
  id: string;
  /** 玩家昵称 */
  nickname: string;
  /** 座位号（1-based） */
  seatNumber: number;
  /** 底牌角色 */
  role: RoleId;
  /** 存活状态 */
  status: PlayerStatus;
  /** 是否为法官（上帝/房主） */
  isJudge: boolean;
  /** 是否为警长（选举产生的玩家角色） */
  isSheriff: boolean;
  /** 是否为房主 */
  isHost: boolean;
  /** 是否已准备 */
  isReady: boolean;
  /** 是否被噩梦之影恐惧（当夜） */
  isNightmared: boolean;
  /** 是否被禁言（次日） */
  isMuted: boolean;
  /** 女巫解药是否已使用 */
  witchAntidoteUsed: boolean;
  /** 女巫毒药是否已使用 */
  witchPoisonUsed: boolean;
  /** 守卫上一晚守护的座位号（不可连续守同一人） */
  guardLastProtected: number | null;
  /** 守卫历史守护过的所有座位号（不可重复守护同一人） */
  guardProtectedHistory: number[];
  /** 噩梦之影历史恐惧过的所有座位号（整个游戏不可重复恐惧同一人，规则2） */
  nightmareTargetHistory: number[];
  /** 白痴是否已翻牌免死 */
  idiotRevealed: boolean;
  /** 猎人是否已开枪 */
  hunterGunFired: boolean;
  /** 狼王是否已开枪 */
  wolfKingGunFired: boolean;
  /** 隐狼是否已以狼人身份行动过（参与过狼人刀人投票） */
  hiddenWolfHasActed: boolean;
  /** 机械狼：模仿目标座位号 */
  mechanicalWolfImitateTarget: number | null;
  /** 机械狼：模仿阶段（'selecting' 选目标 / 'learning' 得知技能 / 'active' 可使用 / 'failed' 模仿失败 / 'silent' 静默状态） */
  mechanicalWolfPhase: 'selecting' | 'learning' | 'active' | 'failed' | 'silent' | null;
  /** 机械狼：模仿的角色ID */
  mechanicalWolfImitatedRole: RoleId | null;
  /** 机械狼：模仿技能是否被恐惧延迟（规则13） */
  mechanicalWolfSkillDeferred: boolean;
  /** 死亡原因 */
  deathCause: DeathCause | null;
  /** 死亡轮次（第几夜/第几天） */
  deathRound: number | null;
}

/**
 * 死亡原因
 */
export type DeathCause =
  | 'werewolf_kill'       // 被狼人击杀
  | 'witch_poison'        // 被女巫毒杀
  | 'vote_out'            // 被投票出局
  | 'hunter_gun'          // 被猎人开枪带走
  | 'wolf_king_gun'       // 被狼王开枪带走
  | 'white_wolf_explode'  // 被白狼王自爆带走
  | 'knight_duel'         // 被骑士决斗带走（狼人）
  | 'knight_suicide'      // 骑士决斗好人翻车自尽
  | 'guard_witch_conflict' // 同守同救冲突死亡
  | 'judge_override';     // 法官强制改判

/**
 * 死亡原因中文名称映射
 */
export const DEATH_CAUSE_NAMES: Record<DeathCause, string> = {
  werewolf_kill: '狼杀',
  witch_poison: '毒杀',
  vote_out: '票出',
  hunter_gun: '猎人开枪',
  wolf_king_gun: '狼王开枪',
  white_wolf_explode: '白狼王自爆',
  knight_duel: '骑士决斗',
  knight_suicide: '骑士自尽',
  guard_witch_conflict: '同守同救',
  judge_override: '法官改判',
};

/**
 * 房间完整状态（服务端内部使用）
 */
export interface RoomState {
  /** 房间码（6位大写字母+数字） */
  roomCode: string;
  /** 游戏模式 */
  gameMode: GameMode;
  /** 当前主阶段 */
  phase: GamePhase;
  /** 夜间子阶段（仅在 NIGHT 阶段有值） */
  nightSubPhase: NightSubPhase | null;
  /** 当前轮次（第几夜/第几天，从1开始） */
  round: number;
  /** 游戏规则配置 */
  config: RuleConfig;
  /** 玩家列表（含完整信息） */
  players: Player[];
  /** 当前发言顺序（座位号数组） */
  speechOrder: number[];
  /** 当前发言者索引 */
  currentSpeakerIndex: number;
  /** 当前发言轮次（1 或 2，仅首日双轮发言时为 2） */
  currentSpeechRound: number;
  /** 投票记录：key 为投票者座位号，value 为目标座位号 */
  votes: Record<number, number>;
  /** 警长选举投票记录：key 为投票者座位号，value 为目标座位号 */
  sheriffElectionVotes: Record<number, number>;
  /** PK投票候选人座位号列表（仅 PK_VOTE 阶段有值） */
  pkCandidates: number[];
  /** 夜间行动记录：key 为角色ID，value 为该角色当晚的行动数据 */
  nightActions: Record<string, NightActionData>;
  /** 当晚被狼人击杀的座位号 */
  werewolfTarget: number | null;
  /** 当晚女巫解药使用的座位号 */
  witchSaveTarget: number | null;
  /** 当晚女巫毒药使用的座位号 */
  witchPoisonTarget: number | null;
  /** 当晚守卫守护的座位号 */
  guardProtectTarget: number | null;
  /** 当晚噩梦之影恐惧的座位号 */
  nightmareTarget: number | null;
  /** 狼人子阶段投票记录：key为投票者座位号，value为目标座位号 */
  wolfVotes: Record<number, number>;
  /** 狼人子阶段投票是否已达成一致 */
  wolfVoteConsensus: boolean;
  /** 狼人聊天消息列表（当夜） */
  wolfChatMessages: WolfChatMessage[];
  /** 当晚结算死亡列表 */
  nightDeaths: NightDeathRecord[];
  /** 白天死亡列表 */
  dayDeaths: DayDeathRecord[];
  /** 游戏是否暂停 */
  isPaused: boolean;
  /** 获胜阵营 */
  winner: Faction | null;
  /** 房间创建时间 */
  createdAt: number;
  /** 游戏开始时间 */
  startedAt: number | null;
  /** 游戏结束时间 */
  endedAt: number | null;
  /** 配置版本号（规则21），用于追踪配置结构变更 */
  configVersion: number;
}

/**
 * 夜间行动数据（各角色通用）
 */
export interface NightActionData {
  /** 行动角色 */
  roleId: RoleId;
  /** 行动者座位号 */
  actorSeat: number;
  /** 行动目标座位号（部分角色可能有多个目标） */
  targetSeat: number | null;
  /** 附加数据（如女巫的 save/poison 标记） */
  extra: Record<string, unknown>;
  /** 是否已提交行动 */
  submitted: boolean;
  /** 是否被噩梦封印 */
  blockedByNightmare: boolean;
}

/**
 * 狼人专属聊天消息
 * 存储到 MongoDB，带有 visibility: 'wolf_only' 标签
 */
export interface WolfChatMessage {
  /** 消息唯一ID */
  id: string;
  /** 房间码 */
  roomCode: string;
  /** 轮次 */
  round: number;
  /** 发送者座位号 */
  senderSeat: number;
  /** 发送者昵称 */
  senderNickname: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 可见性标签 */
  visibility: 'wolf_only';
}

/**
 * 夜间死亡记录
 */
export interface NightDeathRecord {
  seatNumber: number;
  cause: DeathCause;
  /** 是否被守卫/女巫救活 */
  saved: boolean;
  /** 是否被法官改判 */
  overridden: boolean;
  /** 改判原因 */
  overrideReason: string | null;
}

/**
 * 白天死亡记录
 */
export interface DayDeathRecord {
  seatNumber: number;
  cause: DeathCause;
  /** 触发者座位号（如猎人开枪的猎人、白狼王自爆的白狼王） */
  triggeredBy: number | null;
  /** 是否触发亡语连锁 */
  triggersChain: boolean;
  /** 是否被法官改判 */
  overridden: boolean;
  overrideReason: string | null;
}

// ============================================================================
// 第四部分：防作弊 DTO 层 (Anti-Cheat Data Transfer Objects)
// ============================================================================

/**
 * 玩家脱敏视图 — 下发给普通玩家的数据结构
 *
 * 核心安全准则：
 *   1. 绝对禁止包含其他玩家的 RoleId
 *   2. 绝对禁止包含夜间操作目标
 *   3. 只允许包含：座位号、存活状态、当前阶段、自己的底牌
 *   4. 法官视角使用 JudgeRoomStateDTO，包含明文全量数据
 */
export interface PlayerDTO {
  id: string;
  nickname: string;
  seatNumber: number;
  status: PlayerStatus;
  isJudge: boolean;
  isSheriff: boolean;
  isHost: boolean;
  isReady: boolean;
  isMuted: boolean;
  /** 仅当此 PlayerDTO 属于当前玩家自身时才有值，否则为 null */
  role: RoleId | null;
  /** 女巫专属：解药是否已用（仅自己可见） */
  witchAntidoteUsed: boolean | null;
  /** 女巫专属：毒药是否已用（仅自己可见） */
  witchPoisonUsed: boolean | null;
  /** 守卫专属：上一晚守护目标（仅自己可见，显示座位号或 null） */
  guardLastProtected: number | null;
  /** 白痴专属：是否已翻牌（仅自己可见） */
  idiotRevealed: boolean | null;
  /** 隐狼专属：是否可回溯查看狼人聊天历史（仅当唯一存活狼人时为 true） */
  canViewWolfChatHistory: boolean | null;
  /** 守卫专属：历史守护过的座位号列表（仅自己可见） */
  guardProtectedHistory: number[] | null;
  /** 噩梦之影专属：历史恐惧过的座位号列表（仅自己可见） */
  nightmareTargetHistory: number[] | null;
  /** 机械狼专属：模仿阶段（仅自己可见） */
  mechanicalWolfPhase: 'selecting' | 'learning' | 'active' | 'failed' | 'silent' | null;
  /** 机械狼专属：模仿的角色ID（仅自己可见，learning/active阶段有值） */
  mechanicalWolfImitatedRole: RoleId | null;
  /** 机械狼专属：模仿技能是否被恐惧延迟（仅自己可见，规则13） */
  mechanicalWolfSkillDeferred: boolean | null;
  /** 死亡原因（仅自己可见，用于技能组件判断如猎人/狼王被毒死时封印开枪） */
  deathCause: DeathCause | null;
}

/**
 * 普通玩家视角的房间状态 DTO
 * 所有敏感信息已被脱敏
 */
export interface PlayerRoomStateDTO {
  roomCode: string;
  gameMode: GameMode;
  phase: GamePhase;
  round: number;
  /** 游戏配置人数（用于大厅阶段判断是否达到开赛人数） */
  playerCount: number;
  /** 自己的玩家 ID，用于在玩家列表中定位自己 */
  myPlayerId: string;
  /** 脱敏后的玩家列表 */
  players: PlayerDTO[];
  /** 当前发言顺序（座位号数组） */
  speechOrder: number[];
  /** 当前发言者索引 */
  currentSpeakerIndex: number;
  /** 当前发言轮次（1 或 2，仅首日双轮发言时为 2） */
  currentSpeechRound: number;
  /** 自己是否被恐惧 */
  isNightmared: boolean;
  /** 自己是否被禁言 */
  isMuted: boolean;
  /** 夜间行动请求（仅当轮到自己行动时有值） */
  nightActionRequest: NightActionRequestDTO | null;
  /** 当前夜间行动角色（所有玩家可见，用于显示"xx角色正在行动"） */
  currentNightRole: RoleId | null;
  /** 是否暂停 */
  isPaused: boolean;
  /** 狼人聊天消息（仅狼人阵营可见，非狼人阵营为空数组） */
  wolfChatMessages: WolfChatMessage[];
  /** 狼人投票状态（仅狼人子阶段可见） */
  wolfVotes: Record<number, number> | null;
  /** 狼人投票是否达成一致 */
  wolfVoteConsensus: boolean | null;
  /** 获胜阵营（仅 GAME_OVER 阶段有值） */
  winner: Faction | null;
  /** 女巫同一晚能否同时使用解药和毒药 */
  witchCanUseBothPotions: boolean;
  /** PK投票候选人座位号列表（仅 PK_VOTE 阶段有值） */
  pkCandidates: number[];
  /** 警长投票权重 */
  sheriffVoteWeight: 1 | 1.5 | 2;
  /** 是否启用语音功能 */
  enableVoice: boolean;
  /** 入夜前提示：是否有隐狼/机械狼代替原有狼人行动 */
  preNightHint: string | null;
  /** 自己当夜已提交的夜间行动（等待他人行动时可见） */
  myNightAction: NightActionData | null;
}

/**
 * 法官视角的房间状态 DTO — 包含明文全量数据
 * 仅下发给 isJudge === true 的客户端
 */
export interface JudgeRoomStateDTO {
  roomCode: string;
  gameMode: GameMode;
  phase: GamePhase;
  nightSubPhase: NightSubPhase | null;
  round: number;
  config: RuleConfig;
  /** 完整玩家数据（含底牌） */
  players: Player[];
  speechOrder: number[];
  currentSpeakerIndex: number;
  /** 当前发言轮次（1 或 2，仅首日双轮发言时为 2） */
  currentSpeechRound: number;
  votes: Record<number, number>;
  /** 所有夜间行动数据 */
  nightActions: Record<string, NightActionData>;
  werewolfTarget: number | null;
  witchSaveTarget: number | null;
  witchPoisonTarget: number | null;
  guardProtectTarget: number | null;
  nightmareTarget: number | null;
  nightDeaths: NightDeathRecord[];
  dayDeaths: DayDeathRecord[];
  isPaused: boolean;
  winner: Faction | null;
  /** 狼人子阶段投票记录（法官可见全量） */
  wolfVotes: Record<number, number>;
  /** 狼人投票是否达成一致 */
  wolfVoteConsensus: boolean;
  /** 狼人聊天消息（法官可见全量） */
  wolfChatMessages: WolfChatMessage[];
  /** 警长选举投票记录（法官可见全量） */
  sheriffElectionVotes: Record<number, number>;
}

/**
 * 夜间行动请求 DTO — 通知玩家该行动了
 */
export interface NightActionRequestDTO {
  /** 需要行动的角色 */
  roleId: RoleId;
  /** 可选目标列表（座位号数组） */
  availableTargets: number[];
  /** 超时时间（秒），0 表示无限 */
  timeout: number;
  /** 附加提示信息 */
  hint: string;
  /**
   * 是否因被噩梦之影恐惧而封印
   * 为 true 时客户端应显示被恐惧提示，禁止操作，等待倒计时结束
   */
  isBlockedByNightmare: boolean;
  /**
   * 女巫专属：今晚被杀者座位号（如果女巫在守卫之后行动且能看到死讯）
   * 如果女巫在守卫之前行动，此值为 null（盲救）
   */
  werewolfKillTarget: number | null;
  /**
   * 女巫专属：守卫守护目标
   * 仅当女巫在守卫之后行动时可见，否则为 null（显示"守护目标：未知"）
   */
  guardProtectTarget: number | null;
  /**
   * 狼人子阶段专属：当前各狼人的投票状态
   * 仅在狼人子阶段对共同睁眼的狼人可见
   */
  wolfVotes: Record<number, number> | null;
  /**
   * 狼人子阶段专属：是否已达成一致
   */
  wolfVoteConsensus: boolean | null;
  /**
   * 狼人子阶段专属：共同睁眼的狼人同伴列表
   * 每项包含座位号和昵称，让狼人知道彼此身份
   */
  wolfAllies: Array<{ seatNumber: number; nickname: string }> | null;
  /**
   * 被禁用的目标座位号列表（如已被守护过、已被恐惧过、不能自保等）
   */
  disabledTargets: number[];
  /**
   * 被禁用目标的原因映射：key为座位号，value为禁用原因
   */
  disabledReasons: Record<number, string>;
  /**
   * 女巫专属：女巫自救规则（从服务端配置下发，确保客户端使用权威值）
   */
  witchSaveSelfRule?: 'NEVER' | 'FIRST_NIGHT' | 'ALWAYS';
}

// ============================================================================
// 第五部分：WebSocket 消息协议 (WebSocket Message Protocol)
// ============================================================================

/**
 * 客户端 → 服务端 消息类型枚举
 */
export type ClientMessageType =
  | 'CREATE_ROOM'
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'READY'
  | 'START_GAME'
  | 'NIGHT_ACTION'
  | 'DAY_VOTE'
  | 'KNIGHT_DUEL'
  | 'WHITE_WOLF_EXPLODE'
  | 'HUNTER_GUN'
  | 'WOLF_KING_GUN'
  | 'SPEECH'
  | 'FINISH_SPEECH'
  | 'UPDATE_NIGHT_ORDER'
  | 'JUDGE_OVERRIDE_SETTLEMENT'
  | 'JUDGE_FORCE_NEXT_PHASE'
  | 'JUDGE_PAUSE'
  | 'JUDGE_RESUME'
  | 'JUDGE_MODIFY_SPEECH_ORDER'
  | 'JUDGE_TRIGGER_KNIGHT_DUEL'
  | 'JUDGE_TRIGGER_WHITE_WOLF'
  | 'JUDGE_SKIP_SPEECH'
  | 'WOLF_CHAT'
  | 'WOLF_VOTE'
  | 'DEAD_CHAT'
  | 'APPEAL'
  | 'ARBITRATION_VOTE'
  | 'DISSOLVE_ROOM'
  | 'RECONNECT'
  | 'ADMIN_FETCH_LOGS'
  | 'ADMIN_CLEANUP_CONFIG'
  | 'SHERIFF_ELECTION_VOTE'
  | 'SHERIFF_TRANSFER'
  | 'PING';

/**
 * 服务端 → 客户端 消息类型枚举
 */
export type ServerMessageType =
  | 'ROOM_CREATED'
  | 'ROOM_STATE'
  | 'PHASE_CHANGE'
  | 'NIGHT_ACTION_REQUEST'
  | 'NIGHT_ACTION_RESULT'
  | 'DAY_ANNOUNCE'
  | 'VOTE_RESULT'
  | 'KNIGHT_DUEL_RESULT'
  | 'WHITE_WOLF_EXPLODE_RESULT'
  | 'HUNTER_GUN_RESULT'
  | 'WOLF_KING_GUN_RESULT'
  | 'IDIOT_REVEAL'
  | 'SHERIFF_ELECTED'
  | 'SHERIFF_ELECTION_TIE'
  | 'SHERIFF_TRANSFER_REQUEST'
  | 'SHERIFF_TRANSFER_RESULT'
  | 'GAME_OVER'
  | 'ERROR'
  | 'JUDGE_WARNING'
  | 'SPEECH_ORDER_UPDATE'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'PLAYER_READY'
  | 'PHASE_REMINDER'
  | 'WOLF_VOTE_UPDATE'
  | 'WOLF_CHAT_HISTORY'
  | 'ADMIN_LOGS_RESULT'
  | 'ADMIN_CLEANUP_RESULT'
  | 'WOLF_PHASE_SKIPPED'
  | 'DEAD_CHAT'
  | 'DAY_VOTE_REVEAL'
  | 'SPEECH_CONTENT'
  | 'APPEAL_EVENT'
  | 'ARBITRATION_VOTE'
  | 'ROOM_DISSOLVED'
  | 'RECONNECT_SUCCESS'
  | 'JUDGE_ACTION'
  | 'NIGHT_COUNTDOWN'
  | 'SPEECH_COUNTDOWN'
  | 'PONG';

// ---- 客户端消息定义 ----

export interface CreateRoomMessage {
  type: 'CREATE_ROOM';
  nickname: string;
  gameMode: GameMode;
  config: RuleConfig;
}

export interface JoinRoomMessage {
  type: 'JOIN_ROOM';
  nickname: string;
  roomCode: string;
}

export interface LeaveRoomMessage {
  type: 'LEAVE_ROOM';
}

export interface ReadyMessage {
  type: 'READY';
  ready: boolean;
}

export interface StartGameMessage {
  type: 'START_GAME';
}

/**
 * 夜间行动提交
 * 各角色通过此消息提交自己的夜间操作
 */
export interface NightActionMessage {
  type: 'NIGHT_ACTION';
  roleId: RoleId;
  /** 行动目标座位号 */
  targetSeat: number | null;
  /** 附加数据 */
  extra: NightActionExtra;
}

/**
 * 夜间行动附加数据（按角色区分）
 */
export interface NightActionExtra {
  /** 女巫：是否使用解药 */
  useAntidote?: boolean;
  /** 女巫：是否使用毒药 */
  usePoison?: boolean;
  /** 女巫：毒药目标座位号 */
  poisonTarget?: number | null;
  /** 守卫：守护目标座位号 */
  protectTarget?: number | null;
  /** 预言家：查验目标座位号 */
  checkTarget?: number | null;
  /** 狼人：击杀目标座位号（所有狼人投票，服务端取多数） */
  killTarget?: number | null;
  /** 噩梦之影：恐惧目标座位号 */
  nightmareTarget?: number | null;
  /** 狼人投票：各狼人选择的击杀目标（key为投票者座位号，value为目标座位号） */
  wolfVotes?: Record<number, number>;
  /** 机械狼：模仿目标座位号 */
  imitateTarget?: number | null;
  /** 机械狼：模仿技能的目标座位号 */
  imitateSkillTarget?: number | null;
}

/**
 * 白天投票
 */
export interface DayVoteMessage {
  type: 'DAY_VOTE';
  targetSeat: number | null; // null 表示弃票
}

/**
 * 骑士决斗 — 白天发言阶段由骑士主动发起
 * 可中断当前白天流程
 */
export interface KnightDuelMessage {
  type: 'KNIGHT_DUEL';
  targetSeat: number;
}

/**
 * 白狼王自爆 — 白天发言阶段由白狼王主动发起
 * 可中断当前白天流程，强制入夜
 */
export interface WhiteWolfExplodeMessage {
  type: 'WHITE_WOLF_EXPLODE';
  targetSeat: number;
}

/**
 * 猎人开枪 — 死亡后带走一名玩家
 */
export interface HunterGunMessage {
  type: 'HUNTER_GUN';
  targetSeat: number;
}

/**
 * 狼王开枪 — 死亡后带走一名玩家
 */
export interface WolfKingGunMessage {
  type: 'WOLF_KING_GUN';
  targetSeat: number;
}

/**
 * 发言消息
 */
export interface SpeechMessage {
  type: 'SPEECH';
  content: string;
}

/**
 * 结束发言 — 当前发言者主动结束自己的发言回合
 */
export interface FinishSpeechMessage {
  type: 'FINISH_SPEECH';
}

/**
 * 法官修改夜间行动顺序 — 下一晚生效
 */
export interface UpdateNightOrderMessage {
  type: 'UPDATE_NIGHT_ORDER';
  newOrder: RoleId[];
}

/**
 * 法官强制修改结算结果
 */
export interface JudgeOverrideSettlementMessage {
  type: 'JUDGE_OVERRIDE_SETTLEMENT';
  targetSeat: number;
  newStatus: PlayerStatus;
  reason: string;
}

/**
 * 法官强制进入下一阶段
 */
export interface JudgeForceNextPhaseMessage {
  type: 'JUDGE_FORCE_NEXT_PHASE';
}

/**
 * 法官暂停游戏
 */
export interface JudgePauseMessage {
  type: 'JUDGE_PAUSE';
}

/**
 * 法官恢复游戏
 */
export interface JudgeResumeMessage {
  type: 'JUDGE_RESUME';
}

/**
 * 法官修改发言顺序
 */
export interface JudgeModifySpeechOrderMessage {
  type: 'JUDGE_MODIFY_SPEECH_ORDER';
  order: number[]; // 座位号数组
}

/**
 * 法官代操作：触发骑士决斗
 */
export interface JudgeTriggerKnightDuelMessage {
  type: 'JUDGE_TRIGGER_KNIGHT_DUEL';
  knightSeat: number;
  targetSeat: number;
}

/**
 * 法官代操作：触发白狼王自爆
 */
export interface JudgeTriggerWhiteWolfMessage {
  type: 'JUDGE_TRIGGER_WHITE_WOLF';
  wolfSeat: number;
  targetSeat: number;
}

/**
 * 法官跳过某玩家发言
 */
export interface JudgeSkipSpeechMessage {
  type: 'JUDGE_SKIP_SPEECH';
  seatNumber: number;
}

/**
 * 狼人聊天消息 — 狼人子阶段专属聊天
 */
export interface WolfChatClientMessage {
  type: 'WOLF_CHAT';
  content: string;
}

/**
 * 狼人投票 — 狼人子阶段选择击杀目标
 */
export interface WolfVoteClientMessage {
  type: 'WOLF_VOTE';
  targetSeat: number;
}

/**
 * 规则26：死亡玩家聊天消息（客户端→服务端）
 */
export interface DeadChatClientMessage {
  type: 'DEAD_CHAT';
  content: string;
}

/**
 * 申诉仲裁 — 玩家对法官操作提出申诉
 */
export interface AppealClientMessage {
  type: 'APPEAL';
  eventId: string;
}

/**
 * 仲裁投票 — 其他玩家对申诉进行投票
 */
export interface ArbitrationVoteClientMessage {
  type: 'ARBITRATION_VOTE';
  eventId: string;
  support: boolean;
}

/**
 * 法官解散房间 — 仅法官可发送
 * 解散后房间销毁，所有玩家收到 ROOM_DISSOLVED 消息
 */
export interface DissolveRoomClientMessage {
  type: 'DISSOLVE_ROOM';
}

/**
 * 管理员拉取日志
 */
export interface AdminFetchLogsMessage {
  type: 'ADMIN_FETCH_LOGS';
  /** 管理员密钥（用于鉴权） */
  secret: string;
  /** 按房间码筛选 */
  roomCode?: string;
  /** 按游戏局ID筛选（精确匹配某局游戏的所有日志） */
  gameId?: string;
  fromTime?: number;
  toTime?: number;
  /** 按动作类型筛选（可多选） */
  actionTypes?: ActionType[];
  /** 按游戏阶段筛选（可多选） */
  phases?: GamePhase[];
  /** 按操作人座位号筛选（0=系统, 1-N=玩家座位号） */
  actorSeat?: number;
  limit?: number;
  page?: number;
  pageSize?: number;
}

/**
 * 管理员清除旧配置
 */
export interface AdminCleanupConfigMessage {
  type: 'ADMIN_CLEANUP_CONFIG';
  /** 管理员密钥（用于鉴权） */
  secret: string;
}

/**
 * 警长选举投票 — 玩家投票选举警长
 */
export interface SheriffElectionVoteMessage {
  type: 'SHERIFF_ELECTION_VOTE';
  /** 投票目标座位号，null 表示弃权 */
  targetSeat: number | null;
}

/**
 * 警徽移交 — 警长死亡时选择移交警徽的目标玩家
 */
export interface SheriffTransferClientMessage {
  type: 'SHERIFF_TRANSFER';
  /** 移交目标座位号 */
  targetSeat: number;
}

/**
 * 重连消息 — 断连后使用之前的 playerId 恢复会话
 */
export interface ReconnectMessage {
  type: 'RECONNECT';
  /** 之前的玩家 ID */
  playerId: string;
  /** 之前所在的房间码 */
  roomCode: string;
}

/**
 * 心跳消息 — 客户端定期发送 PING 以检测连接存活
 */
export interface PingMessage {
  type: 'PING';
}

/**
 * 客户端消息联合类型
 */
export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | ReadyMessage
  | StartGameMessage
  | NightActionMessage
  | DayVoteMessage
  | KnightDuelMessage
  | WhiteWolfExplodeMessage
  | HunterGunMessage
  | WolfKingGunMessage
  | SpeechMessage
  | FinishSpeechMessage
  | UpdateNightOrderMessage
  | JudgeOverrideSettlementMessage
  | JudgeForceNextPhaseMessage
  | JudgePauseMessage
  | JudgeResumeMessage
  | JudgeModifySpeechOrderMessage
  | JudgeTriggerKnightDuelMessage
  | JudgeTriggerWhiteWolfMessage
  | JudgeSkipSpeechMessage
  | WolfChatClientMessage
  | WolfVoteClientMessage
  | DeadChatClientMessage
  | AppealClientMessage
  | ArbitrationVoteClientMessage
  | DissolveRoomClientMessage
  | AdminFetchLogsMessage
  | AdminCleanupConfigMessage
  | SheriffElectionVoteMessage
  | SheriffTransferClientMessage
  | ReconnectMessage
  | PingMessage;

// ---- 服务端消息定义 ----

export interface RoomCreatedMessage {
  type: 'ROOM_CREATED';
  roomCode: string;
  inviteLink: string;
  qrCodeDataUrl: string;
}

/**
 * 房间状态推送 — 根据接收者身份自动脱敏
 * 普通玩家收到 PlayerRoomStateDTO，法官收到 JudgeRoomStateDTO
 */
export interface RoomStateMessage {
  type: 'ROOM_STATE';
  state: PlayerRoomStateDTO | JudgeRoomStateDTO;
}

export interface PhaseChangeMessage {
  type: 'PHASE_CHANGE';
  phase: GamePhase;
  nightSubPhase: NightSubPhase | null;
  round: number;
}

export interface NightActionRequestMessage {
  type: 'NIGHT_ACTION_REQUEST';
  request: NightActionRequestDTO;
}

export interface NightActionResultMessage {
  type: 'NIGHT_ACTION_RESULT';
  roleId: RoleId;
  /** 预言家查验结果：目标阵营 */
  seerResult: Faction | null;
  /** 行动是否成功 */
  success: boolean;
  /** 失败原因（如被噩梦封印） */
  failReason: string | null;
}

export interface DayAnnounceMessage {
  type: 'DAY_ANNOUNCE';
  deaths: Array<{
    seatNumber: number;
    nickname: string;
    cause: DeathCause;
  }>;
  /** 被禁言的玩家座位号列表 */
  mutedSeats: number[];
}

export interface VoteResultMessage {
  type: 'VOTE_RESULT';
  votes: Record<number, number>;
  /** 出局者座位号，null 表示无人出局 */
  eliminated: number | null;
  /** 是否进入PK */
  isPK: boolean;
  /** PK候选人座位号列表 */
  pkCandidates: number[];
}

/**
 * 骑士决斗结果
 */
export interface KnightDuelResultMessage {
  type: 'KNIGHT_DUEL_RESULT';
  knightSeat: number;
  targetSeat: number;
  /** 目标是否为狼人 */
  targetIsWolf: boolean;
  /** 骑士是否自尽 */
  knightDied: boolean;
  /** 决斗后是否强制入夜（目标为狼时入夜） */
  forceNight: boolean;
  /** 规则3：被决斗揭示的角色（翻牌效果，如隐狼） */
  revealedRole?: RoleId;
}

/**
 * 白狼王自爆结果
 */
export interface WhiteWolfExplodeResultMessage {
  type: 'WHITE_WOLF_EXPLODE_RESULT';
  wolfSeat: number;
  targetSeat: number;
  /** 是否强制入夜 */
  forceNight: boolean;
}

/** 猎人开枪结果 */
export interface HunterGunResultMessage {
  type: 'HUNTER_GUN_RESULT';
  hunterSeat: number;
  targetSeat: number;
  targetNickname: string;
}

/** 狼王开枪结果 */
export interface WolfKingGunResultMessage {
  type: 'WOLF_KING_GUN_RESULT';
  wolfKingSeat: number;
  targetSeat: number;
  targetNickname: string;
}

/** 白痴翻牌免死 */
export interface IdiotRevealMessage {
  type: 'IDIOT_REVEAL';
  seatNumber: number;
  nickname: string;
}

/** 警长选举结果 */
export interface SheriffElectedMessage {
  type: 'SHERIFF_ELECTED';
  seatNumber: number;
  nickname: string;
  votes: Record<number, number>;
}

/** 警长选举平票 */
export interface SheriffElectionTieMessage {
  type: 'SHERIFF_ELECTION_TIE';
  tieCandidates: number[];
  votes: Record<number, number>;
}

/** 警徽移交请求 — 通知警长玩家选择移交目标 */
export interface SheriffTransferRequestMessage {
  type: 'SHERIFF_TRANSFER_REQUEST';
  /** 死亡警长的座位号 */
  deadSheriffSeat: number;
  /** 死亡警长的昵称 */
  deadSheriffNickname: string;
  /** 可移交的存活玩家座位号列表 */
  availableTargets: number[];
  /** 超时时间（秒） */
  timeout: number;
}

/** 警徽移交结果 */
export interface SheriffTransferResultMessage {
  type: 'SHERIFF_TRANSFER_RESULT';
  /** 原警长座位号 */
  fromSeat: number;
  /** 新警长座位号 */
  toSeat: number;
  /** 新警长昵称 */
  toNickname: string;
  /** 是否超时自动移交 */
  isTimeout: boolean;
}

export interface GameOverMessage {
  type: 'GAME_OVER';
  winner: Faction;
  /** 各玩家最终信息 */
  finalStats: Array<{
    seatNumber: number;
    nickname: string;
    role: RoleId;
    status: PlayerStatus;
    deathCause: DeathCause | null;
    deathRound: number | null;
  }>;
}

export interface ErrorMessage {
  type: 'ERROR';
  code: string;
  message: string;
}

/**
 * 法官警告 — 用于推送逻辑冲突提示
 * 如：噩梦之影排在最后，恐惧效果将在下一晚生效
 */
export interface JudgeWarningMessage {
  type: 'JUDGE_WARNING';
  warningType: JudgeWarningType;
  message: string;
  /** 相关数据 */
  data: Record<string, unknown>;
}

export type JudgeWarningType =
  | 'NIGHTMARE_DEFERRED'           // 噩梦之影恐惧延期
  | 'NIGHTMARE_BLOCK_MODE_DOWNGRADE' // 恐惧封印模式自动降级
  | 'CONFLICT_ORDER_CHANGE'        // 顺序修改冲突
  | 'OVERRIDE_APPLIED'             // 法官改判已生效
  | 'NIGHT_ORDER_CHANGED';         // 夜间行动顺序已修改

export interface SpeechOrderUpdateMessage {
  type: 'SPEECH_ORDER_UPDATE';
  order: number[];
  /** 被禁言的座位号列表 */
  mutedSeats: number[];
}

export interface PlayerJoinedMessage {
  type: 'PLAYER_JOINED';
  player: PlayerDTO;
}

export interface PlayerLeftMessage {
  type: 'PLAYER_LEFT';
  seatNumber: number;
  nickname: string;
}

export interface PlayerReadyMessage {
  type: 'PLAYER_READY';
  seatNumber: number;
  ready: boolean;
}

/**
 * 夜间倒计时广播 — 每秒向所有玩家推送当前夜间子阶段剩余时间
 */
export interface NightCountdownMessage {
  type: 'NIGHT_COUNTDOWN';
  /** 当前行动角色ID */
  roleId: RoleId;
  /** 剩余时间（秒） */
  remaining: number;
}

/**
 * 发言倒计时广播 — 每秒向所有玩家推送当前发言者剩余时间
 */
export interface SpeechCountdownMessage {
  type: 'SPEECH_COUNTDOWN';
  /** 当前发言者座位号 */
  seatNumber: number;
  /** 剩余时间（秒） */
  remaining: number;
}

/**
 * 阶段提醒 — 通知当前应行动的角色
 */
export interface PhaseReminderMessage {
  type: 'PHASE_REMINDER';
  /** 当前行动角色ID */
  roleId: RoleId;
  /** 当前轮次 */
  round: number;
  /** 可行动的玩家座位号列表 */
  actorSeats: number[];
  /** 超时时间（秒） */
  timeout: number;
}

/**
 * 狼人投票更新 — 实时推送各狼人的投票选择
 * 仅对共同睁眼的狼人可见
 */
export interface WolfVoteUpdateMessage {
  type: 'WOLF_VOTE_UPDATE';
  /** 各狼人当前投票：key为投票者座位号，value为目标座位号 */
  votes: Record<number, number>;
  /** 是否已达成一致 */
  consensus: boolean;
  /** 最终锁定目标（仅当 consensus 为 true 时有值） */
  lockedTarget: number | null;
}

/**
 * 狼人聊天历史 — 推送狼人聊天区的消息
 * 噩梦之影可查看全部历史；隐狼仅当唯一存活狼人时可回溯查看
 */
export interface WolfChatHistoryMessage {
  type: 'WOLF_CHAT_HISTORY';
  /** 聊天消息列表 */
  messages: WolfChatMessage[];
  /** 是否为历史回溯（隐狼特殊权限） */
  isHistorical: boolean;
}

export interface AdminLogsResultMessage {
  type: 'ADMIN_LOGS_RESULT';
  logs: ActionLogDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 管理员清理配置结果 */
export interface AdminCleanupResultMessage {
  type: 'ADMIN_CLEANUP_RESULT';
  /** 清理的房间数量 */
  modifiedCount: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（失败时） */
  error?: string;
}

/** 规则24：狼人阶段被跳过（隐狼唯一存活且被恐惧等） */
export interface WolfPhaseSkippedMessage {
  type: 'WOLF_PHASE_SKIPPED';
  /** 对普通玩家的模糊提示 */
  publicMessage: string;
  /** 对法官的详细原因 */
  judgeReason: string;
}

/** 规则26：死亡玩家聊天消息 */
export interface DeadChatMessage {
  type: 'DEAD_CHAT';
  id: string;
  senderSeat: number;
  senderNickname: string;
  content: string;
  timestamp: number;
}

/** 规则20：白天票出身份揭示 */
export interface DayVoteRevealMessage {
  type: 'DAY_VOTE_REVEAL';
  seatNumber: number;
  /** 根据配置显示：NONE时不发送此消息 */
  revealedFaction?: Faction;
  revealedRole?: RoleId;
}

/** 白天发言内容广播 */
export interface SpeechContentMessage {
  type: 'SPEECH_CONTENT';
  seatNumber: number;
  nickname: string;
  content: string;
}

/** 申诉事件通知 */
export interface AppealEventMessage {
  type: 'APPEAL_EVENT';
  eventId: string;
  description: string;
  logs: string[];
}

/** 仲裁投票通知 */
export interface ArbitrationVoteMessage {
  type: 'ARBITRATION_VOTE';
  eventId: string;
  description: string;
}

/**
 * 房间解散通知 — 法官解散房间后广播给所有玩家
 * 包含该局游戏中所有玩家已知的信息（角色、存活状态等）
 */
export interface RoomDissolvedMessage {
  type: 'ROOM_DISSOLVED';
  /** 解散原因 */
  reason: string;
  /** 房间中所有玩家的已知信息 */
  players: Array<{
    seatNumber: number;
    nickname: string;
    role: RoleId | null;
    status: PlayerStatus | null;
  }>;
}

/** 重连成功消息 */
export interface ReconnectSuccessMessage {
  type: 'RECONNECT_SUCCESS';
  playerId: string;
  roomCode: string;
}

/** 法官操作类型枚举 */
export type JudgeActionType =
  | 'PAUSE'
  | 'RESUME'
  | 'FORCE_NEXT_PHASE'
  | 'OVERRIDE_SETTLEMENT'
  | 'SKIP_SPEECH'
  | 'MODIFY_SPEECH_ORDER'
  | 'MODIFY_NIGHT_ORDER'
  | 'TRIGGER_KNIGHT_DUEL'
  | 'TRIGGER_WHITE_WOLF';

/** 法官操作通知消息 */
export interface JudgeActionMessage {
  type: 'JUDGE_ACTION';
  action: JudgeActionType;
  message: string;
  data: Record<string, unknown>;
}

/** 心跳响应消息 — 服务端响应客户端 PING */
export interface PongMessage {
  type: 'PONG';
}

/**
 * 服务端消息联合类型
 */
export type ServerMessage =
  | RoomCreatedMessage
  | RoomStateMessage
  | PhaseChangeMessage
  | NightActionRequestMessage
  | NightActionResultMessage
  | DayAnnounceMessage
  | VoteResultMessage
  | KnightDuelResultMessage
  | WhiteWolfExplodeResultMessage
  | HunterGunResultMessage
  | WolfKingGunResultMessage
  | IdiotRevealMessage
  | SheriffElectedMessage
  | SheriffElectionTieMessage
  | SheriffTransferRequestMessage
  | SheriffTransferResultMessage
  | GameOverMessage
  | ErrorMessage
  | JudgeWarningMessage
  | SpeechOrderUpdateMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerReadyMessage
  | PhaseReminderMessage
  | WolfVoteUpdateMessage
  | WolfChatHistoryMessage
  | AdminLogsResultMessage
  | AdminCleanupResultMessage
  | WolfPhaseSkippedMessage
  | DeadChatMessage
  | DayVoteRevealMessage
  | SpeechContentMessage
  | AppealEventMessage
  | ArbitrationVoteMessage
  | RoomDissolvedMessage
  | NightCountdownMessage
  | SpeechCountdownMessage
  | ReconnectSuccessMessage
  | JudgeActionMessage
  | PongMessage;

// ============================================================================
// 第六部分：全局日志与复盘 (Action Logger)
// ============================================================================

/**
 * 动作类型枚举 — 覆盖游戏中所有可能的操作
 */
export type ActionType =
  // 大厅操作
  | 'PLAYER_JOIN'
  | 'PLAYER_LEAVE'
  | 'PLAYER_READY'
  | 'GAME_START'
  // 夜间操作
  | 'NIGHT_PHASE_START'
  | 'NIGHT_ACTION_SUBMIT'
  | 'NIGHT_ACTION_BLOCKED'
  | 'NIGHT_SETTLEMENT'
  | 'NIGHTMARE_DEFER'
  | 'NIGHTMARE_BLOCK_MODE_DOWNGRADE'
  | 'WOLF_CHAT_MESSAGE'
  | 'WOLF_VOTE_CAST'
  | 'WOLF_VOTE_CONSENSUS'
  | 'WOLF_VOTE_TIMEOUT_RANDOM'
  // 白天操作
  | 'DAY_ANNOUNCE'
  | 'SPEECH_START'
  | 'SECOND_SPEECH_ROUND_START'
  | 'SPEECH_CONTENT'
  | 'SPEECH_SKIP'
  | 'SPEECH_FINISH'
  | 'VOTE_CAST'
  | 'VOTE_RESULT'
  | 'PK_VOTE_START'
  // 特殊技能
  | 'KNIGHT_DUEL'
  | 'WHITE_WOLF_EXPLODE'
  | 'HUNTER_GUN'
  | 'WOLF_KING_GUN'
  | 'IDIOT_REVEAL'
  // 警长选举
  | 'SHERIFF_ELECTION_START'
  | 'SHERIFF_ELECTION_VOTE'
  | 'SHERIFF_ELECTED'
  | 'SHERIFF_ELECTION_TIE'
  | 'SHERIFF_TRANSFER'
  // 法官操作
  | 'JUDGE_OVERRIDE_SETTLEMENT'
  | 'JUDGE_FORCE_NEXT_PHASE'
  | 'JUDGE_PAUSE'
  | 'JUDGE_RESUME'
  | 'JUDGE_MODIFY_SPEECH_ORDER'
  | 'JUDGE_MODIFY_NIGHT_ORDER'
  | 'JUDGE_TRIGGER_KNIGHT_DUEL'
  | 'JUDGE_TRIGGER_WHITE_WOLF'
  | 'JUDGE_SKIP_SPEECH'
  // 系统
  | 'GAME_OVER'
  | 'PHASE_CHANGE'
  | 'TIMER_EXPIRED'
  // V10 新增
  | 'WOLF_PHASE_SKIPPED'
  | 'GUARD_NO_VALID_TARGET'
  | 'MECHANICAL_WOLF_SKILL_DEFERRED'
  | 'DEAD_CHAT_MESSAGE'
  | 'DAY_VOTE_IDENTITY_REVEAL';

/**
 * 动作日志 — 记录游戏中每一项微小操作
 * 持久化到 MongoDB 的 GameLog 集合
 */
export interface ActionLog {
  /** 所属房间码 */
  roomCode: string;
  /** 所属游戏局ID（格式: ${roomCode}_${gameStartTimestamp}），同房间不同局可通过此字段分离 */
  gameId: string;
  /** 时间戳 */
  timestamp: number;
  /** 操作人座位号（系统操作为 0） */
  actorSeat: number;
  /** 操作人昵称 */
  actorNickname: string;
  /** 动作类型 */
  actionType: ActionType;
  /** 目标座位号（无目标为 null） */
  targetSeat: number | null;
  /** 目标昵称 */
  targetNickname: string | null;
  /** 当前游戏阶段 */
  phase: GamePhase;
  /** 当前轮次 */
  round: number;
  /** 动作详细数据 */
  detail: Record<string, unknown>;
  /** 是否被法官改判 */
  overridden: boolean;
  /** 改判原因 */
  overrideReason: string | null;
  /**
   * 当时的夜间行动顺序快照
   * 用于复盘时追溯顺序对结果的影响
   */
  nightActionOrderSnapshot: RoleId[];
}

/**
 * 狼人聊天日志 — 持久化到 MongoDB 的 wolf_chat_logs 集合
 */
export interface WolfChatLog {
  /** 所属房间码 */
  roomCode: string;
  /** 所属游戏局ID */
  gameId: string;
  /** 轮次 */
  round: number;
  /** 发送者座位号 */
  senderSeat: number;
  /** 发送者昵称 */
  senderNickname: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 可见性标签 */
  visibility: 'wolf_only';
}

/**
 * 动作日志 DTO — 用于 Admin 后台展示
 */
export interface ActionLogDTO {
  id: string;
  roomCode: string;
  gameId: string;
  timestamp: number;
  actorSeat: number;
  actorNickname: string;
  actionType: ActionType;
  targetSeat: number | null;
  targetNickname: string | null;
  phase: GamePhase;
  round: number;
  detail: Record<string, unknown>;
  overridden: boolean;
  overrideReason: string | null;
  nightActionOrderSnapshot: RoleId[];
}

// ============================================================================
// 第七部分：环境与配置类型 (Environment & Config)
// ============================================================================

/**
 * 服务端环境变量结构
 */
export interface EnvConfig {
  /** 服务端口 */
  PORT: number;
  /** MongoDB 连接字符串 */
  MONGODB_URI: string;
  /** ME Frp 启动参数 */
  MEFRP_ARGS: string;
  /** 管理员密钥（用于 Admin API 鉴权） */
  ADMIN_SECRET: string;
}

/**
 * 房间码格式：6位大写字母+数字
 * 正则校验用
 */
export const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

/**
 * 房间码字符池：大写字母 + 数字（排除易混淆的 0/O, 1/I/L）
 */
export const ROOM_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * 房间码长度
 */
export const ROOM_CODE_LENGTH = 6;
