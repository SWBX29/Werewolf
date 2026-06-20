/**
 * ============================================================================
 * GuardPanel — 守卫行动面板
 * ============================================================================
 *
 * 架构说明：
 *   1. 守卫选择守护目标或空守
 *   2. 首夜允许守护自己，后续夜晚不可
 *
 * 设计原则：
 *   - 不可重复守护同一人
 *   - 守护需二次确认
 *   - 所有目标被禁用时可跳过守护
 * ============================================================================
 */

import { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import ConfirmDialog from '../ConfirmDialog';

/** 守卫行动面板，选择守护目标 */
export default function GuardPanel() {
  const playerState = useGameStore((s) => s.playerState);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const submitNightAction = useGameStore((s) => s.submitNightAction);
  const setActionLocked = useGameStore((s) => s.setActionLocked);

  const nightActionRequest = playerState?.nightActionRequest;
  const players = playerState?.players ?? [];
  const myPlayer = players.find((p) => p.id === playerState?.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;
  const round = playerState?.round ?? 1;

  const [selected, setSelected] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!nightActionRequest) return null;

  // 首夜允许守护自己
  const allowSelf = round === 1;

  // 检查是否所有目标都被禁用
  const allDisabled = nightActionRequest.availableTargets.every((seat) => {
    if (nightActionRequest.disabledTargets.includes(seat)) return true;
    if (seat === mySeat && !allowSelf) return true;
    return false;
  });

  const handleConfirmClick = () => {
    if (selected === null || isActionLocked) return;
    setConfirmOpen(true);
  };

  const handleConfirmAction = () => {
    if (selected === null || isActionLocked) return;
    submitNightAction('guard', selected, { protectTarget: selected });
    setActionLocked(true);
    setConfirmOpen(false);
  };

  const handleSkip = () => {
    if (isActionLocked) return;
    submitNightAction('guard', null, {});
    setActionLocked(true);
  };

  return (
    <div className="guard-panel">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-green-300">
          🛡️ 守卫 · 守护
        </h2>
      </div>

      {allDisabled ? (
        <div className="text-center py-6">
          <p className="text-gray-400 text-lg mb-3">今晚无合法守护目标</p>
          <button
            className="btn-secondary"
            disabled={isActionLocked}
            onClick={handleSkip}
          >
            跳过守护
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-400 mb-4">
            选择今晚守护的玩家。{allowSelf ? '首夜可守护自己。' : '不可守护自己。'}不可重复守护同一人。
          </p>

          <TargetSelector
            targets={nightActionRequest.availableTargets}
            players={players}
            mySeat={mySeat}
            selected={selected}
            onSelect={setSelected}
            disabledTargets={nightActionRequest.disabledTargets}
            disabledReasons={nightActionRequest.disabledReasons}
            allowSelf={allowSelf}
            disabled={isActionLocked}
          />

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="btn-secondary"
              disabled={isActionLocked}
              onClick={handleSkip}
            >
              空守
            </button>
            <button
              className="btn-primary bg-green-700 hover:bg-green-600 disabled:opacity-50"
              disabled={selected === null || isActionLocked}
              onClick={handleConfirmClick}
            >
              {isActionLocked ? '已确认' : '确认守护'}
            </button>
          </div>
        </>
      )}

      {/* 二次确认弹窗 */}
      <ConfirmDialog
        open={confirmOpen}
        title="确认守护"
        message={`确定要守护 ${selected}号 玩家吗？`}
        confirmLabel="确认守护"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
