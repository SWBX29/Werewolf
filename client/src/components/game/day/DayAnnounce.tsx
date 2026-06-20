/**
 * ============================================================================
 * DayAnnounce — 天亮公告组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 展示夜晚阶段的结算结果（死亡玩家、禁言玩家）
 *   2. 全屏覆盖层形式，5秒后自动关闭或点击任意处关闭
 *
 * 设计原则：
 *   - 公告信息来源于全局状态 dayAnnouncement
 *   - 自动关闭通过 useEffect + setTimeout 实现，组件卸载时清理定时器
 * ============================================================================
 */

import React, { useEffect } from 'react';
import { useGameStore } from '../../../useGameStore';

/** 天亮公告组件 */
const DayAnnounce: React.FC = () => {
  const dayAnnouncement = useGameStore((s) => s.dayAnnouncement);
  const dismissDayAnnouncement = useGameStore((s) => s.dismissDayAnnouncement);

  // 公告到达后启动5秒自动关闭定时器
  useEffect(() => {
    if (!dayAnnouncement) return;
    const timer = setTimeout(() => {
      dismissDayAnnouncement();
    }, 5000);
    return () => clearTimeout(timer);
  }, [dayAnnouncement, dismissDayAnnouncement]);

  if (!dayAnnouncement) return null;

  const { deaths, mutedSeats } = dayAnnouncement;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-day-phase animate-fade-in-up"
      onClick={dismissDayAnnouncement}
    >
      <div className="card max-w-md w-full mx-4 text-center space-y-4">
        <h2 className="text-2xl font-bold text-amber-300">天亮了</h2>

        {/* 死亡结果 */}
        <div className="space-y-2">
          {deaths.length > 0 ? (
            <p className="text-lg text-red-400">
              昨晚出局的是——
              {deaths.map((d) => `${d.seatNumber}号玩家`).join('、')}
            </p>
          ) : (
            <p className="text-lg text-green-400">昨晚是平安夜</p>
          )}
        </div>

        {/* 禁言信息 */}
        {mutedSeats.length > 0 && (
          <p className="text-sm text-yellow-400">
            {mutedSeats.map((s) => `${s}号`).join('、')} 被禁言
          </p>
        )}

        <p className="text-xs text-gray-500 mt-4">点击任意处或等待5秒自动关闭</p>
      </div>
    </div>
  );
};

export default DayAnnounce;
