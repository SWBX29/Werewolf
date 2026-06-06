import React, { useState } from 'react';
import { useGameStore } from '../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import type { Faction } from '@langrensha/shared';

const GameOver: React.FC = () => {
  const gameOverData = useGameStore((s) => s.gameOverData);
  const leaveRoom = useGameStore((s) => s.leaveRoom);

  const [showAllIdentities, setShowAllIdentities] = useState(false);

  if (!gameOverData) return null;

  const { winner, finalStats } = gameOverData;
  const isGoodWin = winner === 'good';
  const winnerText = isGoodWin ? '好人阵营' : '狼人阵营';

  const survivingWolves = finalStats.filter(
    (s) => s.status === 'alive' && ROLE_META[s.role].faction === 'evil'
  );
  const survivingGood = finalStats.filter(
    (s) => s.status === 'alive' && ROLE_META[s.role].faction === 'good'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-fade-in-up">
      <div className="card max-w-lg w-full mx-4 space-y-6 text-center">
        {/* 奖杯图标 */}
        <div className="text-6xl">🏆</div>

        <h2 className="text-3xl font-bold">游戏结束</h2>

        {/* 获胜阵营 */}
        <p
          className={`text-2xl font-bold ${
            isGoodWin ? 'text-blue-400' : 'text-red-400'
          }`}
        >
          【{winnerText}】获胜！
        </p>

        {/* 存活玩家 */}
        <div className="space-y-2 text-left">
          {survivingWolves.length > 0 && (
            <div>
              <p className="text-sm text-red-400 font-semibold">存活狼人：</p>
              <p className="text-sm text-gray-300">
                {survivingWolves.map((s) => `${s.seatNumber}号 ${s.nickname}`).join('、')}
              </p>
            </div>
          )}
          {survivingGood.length > 0 && (
            <div>
              <p className="text-sm text-blue-400 font-semibold">存活好人：</p>
              <p className="text-sm text-gray-300">
                {survivingGood.map((s) => `${s.seatNumber}号 ${s.nickname}`).join('、')}
              </p>
            </div>
          )}
        </div>

        {/* 查看全场身份 */}
        {!showAllIdentities ? (
          <button
            className="btn-secondary w-full"
            onClick={() => setShowAllIdentities(true)}
          >
            查看全场身份
          </button>
        ) : (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-amber-300">全场身份</h4>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {finalStats
                .sort((a, b) => a.seatNumber - b.seatNumber)
                .map((s) => (
                  <div
                    key={s.seatNumber}
                    className="flex items-center gap-2 px-3 py-1 rounded text-sm bg-night-800"
                  >
                    <span className="font-mono w-8">{s.seatNumber}号</span>
                    <span className="flex-1 truncate">{s.nickname}</span>
                    <span
                      className={`tag ${
                        ROLE_META[s.role].faction === 'evil' ? 'tag-evil' : 'tag-good'
                      }`}
                    >
                      {ROLE_META[s.role].name}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 返回大厅 */}
        <button className="btn-primary w-full" onClick={leaveRoom}>
          返回大厅
        </button>
      </div>
    </div>
  );
};

export default GameOver;
