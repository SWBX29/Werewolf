import { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import ConfirmDialog from '../ConfirmDialog';

/**
 * 噩梦之影行动面板 — 恐惧目标选择
 */
export default function NightmarePanel() {
  const playerState = useGameStore((s) => s.playerState);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const submitNightAction = useGameStore((s) => s.submitNightAction);
  const setActionLocked = useGameStore((s) => s.setActionLocked);

  const nightActionRequest = playerState?.nightActionRequest;
  const players = playerState?.players ?? [];
  const myPlayer = players.find((p) => p.id === playerState?.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;

  const [selected, setSelected] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!nightActionRequest) return null;

  const handleConfirmClick = () => {
    if (selected === null || isActionLocked) return;
    setConfirmOpen(true);
  };

  const handleConfirmAction = () => {
    if (selected === null || isActionLocked || isSubmitting) return;
    setIsSubmitting(true);
    submitNightAction('nightmare_shadow', selected, { nightmareTarget: selected });
    setActionLocked(true);
    setConfirmOpen(false);
  };

  return (
    <div className="card border-purple-800 bg-gradient-to-br from-night-900 to-purple-950">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-purple-300">
          😨 噩梦之影 · 恐惧
        </h2>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        选择一名玩家施以恐惧，使其当夜所有技能失效。不可恐惧自己，不可重复恐惧同一人。可恐惧狼人阵营角色。
      </p>

      {/* 目标选择 */}
      <TargetSelector
        targets={nightActionRequest.availableTargets}
        players={players}
        mySeat={mySeat}
        selected={selected}
        onSelect={setSelected}
        disabledTargets={nightActionRequest.disabledTargets}
        disabledReasons={nightActionRequest.disabledReasons}
        allowSelf={false}
        disabled={isActionLocked}
      />

      {/* 确认按钮 */}
      <div className="mt-4 flex justify-end">
        <button
          className="btn-primary"
          disabled={selected === null || isActionLocked}
          onClick={handleConfirmClick}
        >
          {isActionLocked ? '已确认' : '确认恐惧'}
        </button>
      </div>

      {/* 二次确认弹窗 */}
      <ConfirmDialog
        open={confirmOpen}
        title="确认恐惧"
        message={`确定要对 ${selected}号 玩家施以恐惧吗？`}
        confirmLabel="确认恐惧"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
