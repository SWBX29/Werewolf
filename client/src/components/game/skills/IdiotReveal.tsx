/**
 * ============================================================================
 * IdiotReveal — 白痴翻牌技能组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 白痴被投票出局时触发的翻牌免死动画，展示身份并提示失去投票权
 *   2. 通过翻牌动画（翻转卡片效果）增强视觉体验
 *   3. 翻牌完成后可手动关闭，之后不再显示
 *
 * 设计原则：
 *   - 翻牌状态由服务端通过 playerState.idiotRevealed 控制
 *   - 动画分三阶段：idle → flipping → revealed，翻牌后 700ms 显示结果
 *   - 翻牌后失去投票权但可继续参与讨论
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useGameStore } from '../../../useGameStore';
import { ROLE_META } from '@langrensha/shared';

/** 白痴翻牌技能组件 */
const IdiotReveal: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);

  const [showReveal, setShowReveal] = useState(false);
  const [animPhase, setAnimPhase] = useState<'idle' | 'flipping' | 'revealed'>('idle');

  // 触发翻牌动画
  useEffect(() => {
    if (!playerState) return;
    const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
    if (!myPlayer || myPlayer.role !== 'idiot') return;
    const isRevealed = myPlayer.idiotRevealed === true;
    if (isRevealed && animPhase === 'idle') {
      setShowReveal(true);
      setAnimPhase('flipping');

      const flipTimer = setTimeout(() => {
        setAnimPhase('revealed');
      }, 700);

      return () => clearTimeout(flipTimer);
    }
  }, [playerState, animPhase]);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.role !== 'idiot') return null;

  // 白痴翻牌状态：idiotRevealed 为 true 时表示已翻牌
  const isRevealed = myPlayer.idiotRevealed === true;

  // 只在翻牌时显示动画，翻牌完成后不再显示此组件
  // 如果还没翻牌，不显示
  if (!isRevealed) return null;

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
