import React, { useEffect } from 'react';
import { useGameStore } from '../../../useGameStore';

const DayAnnounce: React.FC = () => {
  const dayAnnouncement = useGameStore((s) => s.dayAnnouncement);
  const dismissDayAnnouncement = useGameStore((s) => s.dismissDayAnnouncement);

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
