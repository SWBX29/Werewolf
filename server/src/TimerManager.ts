/**
 * ============================================================================
 * 狼人杀游戏定时器管理器 (Timer Manager)
 * ============================================================================
 *
 * 提供独立的定时器管理功能，用于游戏阶段超时控制
 *
 * 设计原则：
 * - 低优先级：定时器管理是辅助功能，不影响核心逻辑
 * - 可复用：可被 GameEngine 和其他模块调用
 * - 支持暂停/恢复：配合法官暂停功能
 */

/**
 * 定时器配置
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
 * 定时器状态
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
 */
export class TimerManager {
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private tickTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private deadlines: Map<string, number> = new Map();
  private callbacks: Map<string, () => void> = new Map();
  private onTickCallbacks: Map<string, (remaining: number) => void> = new Map();
  /** 状态锁：防止 reset/pause 期间的竞态条件 */
  private resetting: Set<string> = new Set();
  /** 暂停时保存的剩余时间 */
  private pausedRemaining: Map<string, number> = new Map();
  /** 暂停时保存的 onTick 回调 */
  private pausedOnTick: Map<string, (remaining: number) => void> = new Map();
  /** 操作锁：防止并发 pause/resume 操作 */
  private operationLocks: Set<string> = new Set();

  /**
   * 设置定时器
   */
  setTimer(config: TimerConfig): void {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('定时器名称不能为空');
    }
    if (typeof config.duration !== 'number' || config.duration <= 0) {
      throw new Error(`定时器 "${config.name}" 的 duration 必须为正数，收到: ${config.duration}`);
    }
    if (typeof config.onTimeout !== 'function') {
      throw new Error(`定时器 "${config.name}" 的 onTimeout 必须为函数`);
    }

    this.clearTimer(config.name);

    const now = Date.now();
    const durationMs = config.duration * 1000;
    const deadline = now + durationMs;

    this.deadlines.set(config.name, deadline);
    this.callbacks.set(config.name, config.onTimeout);
    if (config.onTick) {
      this.onTickCallbacks.set(config.name, config.onTick);
    }

    const timer = setTimeout(() => {
      this.executeTimeout(config.name);
    }, durationMs);
    this.timers.set(config.name, timer);

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

    this.pausedRemaining.delete(config.name);
    this.pausedOnTick.delete(config.name);
  }

  /**
   * 清除定时器
   */
  clearTimer(name: string): void {
    this.resetting.add(name);

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
    this.onTickCallbacks.delete(name);

    this.resetting.delete(name);
  }

  /**
   * 清除所有定时器
   */
  clearAllTimers(): void {
    for (const name of this.timers.keys()) {
      this.clearTimer(name);
    }
  }

  /**
   * 获取定时器剩余时间
   */
  getRemainingTime(name: string): number | null {
    const deadline = this.deadlines.get(name);
    if (!deadline) return null;

    const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    return remaining;
  }

  /**
   * 获取定时器状态
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
   * 暂停定时器（返回剩余时间，并同步保存回调以便恢复）
   */
  pauseTimer(name: string): number | null {
    if (this.resetting.has(name) || this.operationLocks.has(name)) return null;

    this.operationLocks.add(name);
    try {
      const remaining = this.getRemainingTime(name);
      if (remaining === null) return null;

      const savedCallback = this.callbacks.get(name);
      const savedOnTick = this.onTickCallbacks.get(name);

      this.clearTimer(name);

      if (savedCallback) {
        this.callbacks.set(name, savedCallback);
      }
      if (savedOnTick) {
        this.pausedOnTick.set(name, savedOnTick);
      }
      this.pausedRemaining.set(name, remaining);
      this.deadlines.set(name, Date.now() + remaining * 1000);

      return remaining;
    } finally {
      this.operationLocks.delete(name);
    }
  }

  /**
   * 恢复定时器
   */
  resumeTimer(name: string, remaining?: number, onTimeout?: () => void, onTick?: (remaining: number) => void): void {
    if (this.resetting.has(name) || this.operationLocks.has(name)) return;

    const savedRemaining = remaining ?? this.pausedRemaining.get(name);
    const savedOnTimeout = onTimeout ?? this.callbacks.get(name);
    const savedOnTick = onTick ?? this.pausedOnTick.get(name);

    if (savedRemaining === undefined || !savedOnTimeout) return;

    this.pausedRemaining.delete(name);
    this.pausedOnTick.delete(name);

    this.setTimer({
      name,
      duration: savedRemaining,
      onTimeout: savedOnTimeout,
      onTick: savedOnTick,
    });
  }

  /**
   * 执行超时回调
   */
  private executeTimeout(name: string): void {
    const callback = this.callbacks.get(name);
    if (callback) {
      callback();
    }
    this.clearTimer(name);
  }

  /**
   * 检查是否有运行中的定时器
   */
  hasRunningTimer(name: string): boolean {
    return this.timers.has(name);
  }

  /**
   * 获取所有运行中的定时器名称
   */
  getRunningTimerNames(): string[] {
    return Array.from(this.timers.keys());
  }
}

/**
 * 定时器名称常量
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