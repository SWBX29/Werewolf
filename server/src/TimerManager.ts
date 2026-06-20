/**
 * ============================================================================
 * 定时器管理器 — 游戏阶段超时控制
 * ============================================================================
 *
 * 架构说明：
 *   1. 提供独立的定时器管理功能，用于游戏各阶段的超时控制
 *   2. 支持暂停/恢复机制，配合法官暂停游戏功能
 *   3. 可被 GameEngine 和其他模块复用
 *
 * 设计原则：
 *   - 低优先级：定时器管理是辅助功能，不影响核心逻辑
 *   - 可复用：可被 GameEngine 和其他模块调用
 *   - 支持暂停/恢复：配合法官暂停功能
 * ============================================================================
 */

/**
 * 定时器配置接口
 *
 * @property name - 定时器名称，用于唯一标识
 * @property duration - 超时时间（秒）
 * @property onTimeout - 超时回调函数
 * @property onTick - 每秒回调函数（可选，用于倒计时广播）
 */
export interface TimerConfig {
  /** 定时器名称 */
  name: string;
  /** 超时时间（秒） */
  duration: number;
  /** 超时回调 */
  onTimeout: () => void;
  /** 每秒回调（可选，用于倒计时广播） */
  onTick?: (remaining: number) => void;
}

/**
 * 定时器状态接口
 *
 * @property running - 是否运行中
 * @property remaining - 剩余时间（秒）
 * @property startTime - 开始时间戳
 * @property deadline - 截止时间戳
 */
export interface TimerState {
  /** 是否运行中 */
  running: boolean;
  /** 剩余时间（秒） */
  remaining: number;
  /** 开始时间戳 */
  startTime: number;
  /** 截止时间戳 */
  deadline: number;
}

/**
 * 定时器管理器
 *
 * 提供定时器的创建、清除、暂停、恢复等生命周期管理，
 * 支持每秒回调用于倒计时广播场景。
 */
export class TimerManager {
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private tickTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private deadlines: Map<string, number> = new Map();
  private callbacks: Map<string, () => void> = new Map();

  /**
   * 设置定时器
   *
   * 如果同名定时器已存在，会先清除再重新创建。
   * 当配置了 onTick 回调时，会额外启动每秒触发的间隔定时器。
   *
   * @param config - 定时器配置对象
   */
  setTimer(config: TimerConfig): void {
    // 清除已存在的同名定时器
    this.clearTimer(config.name);

    const now = Date.now();
    const deadline = now + config.duration * 1000;

    this.deadlines.set(config.name, deadline);
    this.callbacks.set(config.name, config.onTimeout);

    // 设置超时定时器
    const timer = setTimeout(() => {
      this.executeTimeout(config.name);
    }, config.duration * 1000);
    this.timers.set(config.name, timer);

    // 设置每秒回调（如果有）
    if (config.onTick) {
      let remaining = config.duration;
      const tickTimer = setInterval(() => {
        remaining--;
        if (remaining >= 0) {
          config.onTick!(remaining);
        }
      }, 1000);
      this.tickTimers.set(config.name, tickTimer);
    }
  }

  /**
   * 清除指定名称的定时器
   *
   * 同时清除超时定时器、每秒回调定时器，以及关联的截止时间和回调引用。
   *
   * @param name - 定时器名称
   */
  clearTimer(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
    }

    const tickTimer = this.tickTimers.get(name);
    if (tickTimer) {
      clearInterval(tickTimer);
      this.tickTimers.delete(name);
    }

    this.deadlines.delete(name);
    this.callbacks.delete(name);
  }

  /**
   * 清除所有定时器
   *
   * 遍历并清除所有已注册的定时器，包括超时定时器和每秒回调定时器。
   */
  clearAllTimers(): void {
    for (const name of this.timers.keys()) {
      this.clearTimer(name);
    }
  }

  /**
   * 获取指定定时器的剩余时间
   *
   * @param name - 定时器名称
   * @returns 剩余秒数，若定时器不存在则返回 null
   */
  getRemainingTime(name: string): number | null {
    const deadline = this.deadlines.get(name);
    if (!deadline) return null;

    const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    return remaining;
  }

  /**
   * 获取指定定时器的完整状态
   *
   * @param name - 定时器名称
   * @returns 定时器状态对象，若定时器不存在则返回 null
   */
  getTimerState(name: string): TimerState | null {
    const deadline = this.deadlines.get(name);
    const timer = this.timers.get(name);

    if (!deadline || !timer) return null;

    const remaining = this.getRemainingTime(name)!;
    const startTime = deadline - remaining * 1000;

    return {
      running: true,
      remaining,
      startTime,
      deadline,
    };
  }

  /**
   * 暂停指定定时器，清除定时器并返回剩余时间
   *
   * @param name - 定时器名称
   * @returns 暂停时的剩余秒数，若定时器不存在则返回 null
   */
  pauseTimer(name: string): number | null {
    const remaining = this.getRemainingTime(name);
    if (remaining === null) return null;

    this.clearTimer(name);
    return remaining;
  }

  /**
   * 恢复指定定时器，使用之前暂停时的剩余时间重新创建
   *
   * @param name - 定时器名称
   * @param remaining - 剩余时间（秒）
   * @param onTimeout - 超时回调函数
   * @param onTick - 每秒回调函数（可选）
   */
  resumeTimer(name: string, remaining: number, onTimeout: () => void, onTick?: (remaining: number) => void): void {
    this.setTimer({
      name,
      duration: remaining,
      onTimeout,
      onTick,
    });
  }

  /**
   * 执行超时回调并清除定时器
   *
   * @param name - 定时器名称
   */
  private executeTimeout(name: string): void {
    const callback = this.callbacks.get(name);
    if (callback) {
      callback();
    }
    this.clearTimer(name);
  }

  /**
   * 检查指定名称的定时器是否正在运行
   *
   * @param name - 定时器名称
   * @returns 是否存在运行中的定时器
   */
  hasRunningTimer(name: string): boolean {
    return this.timers.has(name);
  }

  /**
   * 获取所有运行中的定时器名称列表
   *
   * @returns 定时器名称数组
   */
  getRunningTimerNames(): string[] {
    return Array.from(this.timers.keys());
  }
}

/**
 * 定时器名称常量集合
 *
 * 统一管理所有定时器名称，避免硬编码字符串导致拼写错误。
 */
export const TIMER_NAMES = {
  /** 夜间行动定时器 */
  NIGHT_ACTION: 'night_action',
  /** 狼人投票定时器 */
  WOLF_VOTE: 'wolf_vote',
  /** 发言定时器 */
  SPEECH: 'speech',
  /** 投票定时器 */
  VOTE: 'vote',
  /** 警长选举定时器 */
  SHERIFF_ELECTION: 'sheriff_election',
  /** 警徽移交定时器 */
  SHERIFF_TRANSFER: 'sheriff_transfer',
  /** 骑士决斗定时器 */
  KNIGHT_DUEL: 'knight_duel',
  /** 猎人开枪定时器 */
  HUNTER_GUN: 'hunter_gun',
  /** 白狼王自爆定时器 */
  WHITE_WOLF_EXPLODE: 'white_wolf_explode',
} as const;

export type TimerName = typeof TIMER_NAMES[keyof typeof TIMER_NAMES];