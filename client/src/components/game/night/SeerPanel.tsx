import { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import ConfirmDialog from '../ConfirmDialog';

/**
 * 预言家行动面板 — 查验目标阵营
 */
export default function SeerPanel() {
  const playerState = useGameStore((s) => s.playerState);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const nightActionResult = useGameStore((s) => s.nightActionResult);
  const submitNightAction = useGameStore((s) => s.submitNightAction);
  const setActionLocked = useGameStore((s) => s.setActionLocked);
  const dismissNightActionResult = useGameStore((s) => s.dismissNightActionResult);

  const nightActionRequest = playerState?.nightActionRequest;
  const players = playerState?.players ?? [];
  const myPlayer = players.find((p) => p.id === playerState?.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;

  const [selected, setSelected] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!nightActionRequest) return null;

  const handleConfirmClick = () => {
    if (selected === null || isActionLocked) return;
    setConfirmOpen(true);
  };

  const handleConfirmAction = () => {
    if (selected === null || isActionLocked) return;
    submitNightAction('seer', selected, { checkTarget: selected });
    setActionLocked(true);
    setConfirmOpen(false);
  };

  // 查验结果到达时显示
  const seerResult = nightActionResult?.seerResult;
  const isSeerResult = nightActionResult?.roleId === 'seer';

  const handleDismissResult = () => {
    dismissNightActionResult();
  };

  return (
    <div className="seer-panel">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-blue-300">
          👁️ 预言家 · 查验
        </h2>
      </div>

      {/* 查验结果展示 */}
      {isActionLocked && seerResult && isSeerResult && (
        <div className="mb-4 animate-fade-in-up">
          <div className="p-4 rounded-lg border-2 text-center"
            style={{
              borderColor: seerResult === 'good' ? '#3b82f6' : '#ef4444',
              background: seerResult === 'good'
                ? 'linear-gradient(135deg, rgba(30,58,138,0.5), rgba(59,130,246,0.1))'
                : 'linear-gradient(135deg, rgba(127,29,29,0.5), rgba(239,68,68,0.1))',
            }}
          >
            <p className="text-sm text-gray-400 mb-2">
              查验结果——
            </p>
            <p className={`text-3xl font-bold ${
              seerResult === 'good' ? 'text-blue-400' : 'text-red-400'
            }`}>
              【{seerResult === 'good' ? '好人' : '狼人'}】
            </p>
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn-secondary text-sm" onClick={handleDismissResult}>
              知道了
            </button>
          </div>
        </div>
      )}

      {/* 目标选择（未锁定时显示） */}
      {!isActionLocked && (
        <>
          <p className="text-sm text-gray-400 mb-4">
            选择一名玩家查验其阵营。
          </p>

          <TargetSelector
            targets={nightActionRequest.availableTargets}
            players={players}
            mySeat={mySeat}
            selected={selected}
            onSelect={setSelected}
            disabledTargets={nightActionRequest.disabledTargets}
            disabledReasons={nightActionRequest.disabledReasons}
            allowSelf={false}
          />

          <div className="mt-4 flex justify-end">
            <button
              className="btn-primary"
              disabled={selected === null || isActionLocked}
              onClick={handleConfirmClick}
            >
              确认查验
            </button>
          </div>
        </>
      )}

      {/* 已提交但未收到结果 */}
      {isActionLocked && !seerResult && (
        <div className="text-center text-gray-400 animate-pulse">
          等待查验结果……
        </div>
      )}

      {/* 二次确认弹窗 */}
      <ConfirmDialog
        open={confirmOpen}
        title="确认查验"
        message={`确定要查验 ${selected}号 玩家的阵营吗？`}
        confirmLabel="确认查验"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
