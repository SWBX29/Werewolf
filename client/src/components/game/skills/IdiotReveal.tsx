import React, { useState, useEffect } from 'react';
import { useGameStore } from '../../../useGameStore';
import { ROLE_META } from '@langrensha/shared';

const IdiotReveal: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);

  const [showReveal, setShowReveal] = useState(false);
  const [animPhase, setAnimPhase] = useState<'idle' | 'flipping' | 'revealed'>('idle');

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.role !== 'idiot') return null;

  // 白痴翻牌状态：idiotRevealed 为 true 时表示已翻牌
  const isRevealed = myPlayer.idiotRevealed === true;

  // 只在翻牌时显示动画，翻牌完成后不再显示此组件
  // 如果还没翻牌，不显示
  if (!isRevealed) return null;

  // 触发翻牌动画
  useEffect(() => {
    if (isRevealed && animPhase === 'idle') {
      setShowReveal(true);
      setAnimPhase('flipping');

      const flipTimer = setTimeout(() => {
        setAnimPhase('revealed');
      }, 700);

      return () => clearTimeout(flipTimer);
    }
  }, [isRevealed, animPhase]);

  const handleClose = () => {
    setShowReveal(false);
  };

  if (!showReveal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div
        className="card max-w-md w-full mx-4 space-y-4 text-center animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 翻牌动画 */}
        <div className="flex justify-center">
          <div className={`reveal-card ${animPhase === 'revealed' ? 'reveal-card-flipped' : ''}`}>
            <div className="reveal-card-inner">
              {/* 正面（未翻牌） */}
              <div className={`w-32 h-44 rounded-xl flex items-center justify-center text-6xl
                               bg-night-800 border-2 border-night-600
                               ${animPhase === 'flipping' ? 'opacity-0' : ''}`}
                style={{ backfaceVisibility: 'hidden' }}
              >
                ❓
              </div>
              {/* 背面（翻牌后） */}
              <div className={`w-32 h-44 rounded-xl flex flex-col items-center justify-center
                               bg-amber-900/30 border-2 border-amber-500
                               ${animPhase === 'revealed' ? '' : 'opacity-0'}`}
                style={{ backfaceVisibility: 'hidden' }}
              >
                <span className="text-4xl">🃏</span>
                <span className="text-sm font-bold text-amber-300 mt-1">白痴</span>
              </div>
            </div>
          </div>
        </div>

        <h3 className="text-2xl font-bold text-amber-400">翻牌免死！</h3>

        <div className="p-3 bg-amber-900/20 rounded-lg border border-amber-700">
          <p className="text-lg text-amber-300 font-semibold">
            {myPlayer.seatNumber}号 {myPlayer.nickname} 翻牌白痴
          </p>
          <p className="text-sm text-amber-200/70 mt-1">
            身份：{ROLE_META.idiot.name} — {ROLE_META.idiot.description}
          </p>
        </div>

        {/* 失去投票权提示 */}
        <div className="p-2 bg-red-900/20 rounded-lg border border-red-800">
          <p className="text-sm text-red-300">
            ⚠️ 翻牌后你将失去投票权，但可继续参与讨论
          </p>
        </div>

        <button className="btn-primary" onClick={handleClose}>
          知道了
        </button>
      </div>
    </div>
  );
};

export default IdiotReveal;
