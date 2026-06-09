import React, { useState, useMemo } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import CountdownTimer from '../CountdownTimer';

/** 警徽移交界面组件 — 警长死亡时选择移交警徽的目标玩家 */
const SheriffTransfer: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const setActionLocked = useGameStore((s) => s.setActionLocked);
  const submitSheriffTransfer = useGameStore((s) => s.submitSheriffTransfer);
  const sheriffTransferRequest = useGameStore((s) => s.sheriffTransferRequest);
  const sheriffTransferResult = useGameStore((s) => s.sheriffTransferResult);
  const dismissSheriffTransferResult = useGameStore((s) => s.dismissSheriffTransferResult);

  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Bug 57 说明：可移交目标仅包含存活玩家，死亡警长已自动排除（status !== 'alive'）
  // 无需额外排除死亡警长，因为死亡玩家已不在存活列表中
  const availableTargets = useMemo(
    () =>
      playerState?.players.filter(
        (p) => p.status === 'alive' && !p.isJudge,
      ) ?? [],
    [playerState?.players],
  );

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;

  const availableSeats = availableTargets.map((p) => p.seatNumber);

  const getPlayerName = (seat: number) => {
    const p = playerState!.players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  // 提交移交
  const handleTransfer = () => {
    if (isActionLocked || selectedSeat === null) return;
    setShowConfirm(true);
  };

  // 确认移交
  const confirmTransfer = () => {
    if (selectedSeat !== null) {
      // Bug 50 修复：先锁定状态再提交，防止快速双击重复提交
      setActionLocked(true);
      submitSheriffTransfer(selectedSeat);
    }
    setShowConfirm(false);
  };

  // 取消确认
  const cancelConfirm = () => {
    setShowConfirm(false);
  };

  // 移交结果展示
  const renderTransferResult = () => {
    if (!sheriffTransferResult) return null;

    return (
      <div className="space-y-4 mt-4 animate-fade-in-up">
        <div className={`p-4 rounded-lg border-2 ${
          sheriffTransferResult.isTimeout
            ? 'bg-orange-900/30 border-orange-500'
            : 'bg-amber-900/30 border-amber-500'
        } animate-fade-in-up`}>
          <p className="text-amber-300 font-bold text-lg text-center">
            警徽移交给 {sheriffTransferResult.toSeat}号 {sheriffTransferResult.toNickname}
          </p>
          {sheriffTransferResult.isTimeout && (
            <p className="text-orange-400 text-sm text-center mt-1">
              超时未移交，自动移交给最小序号玩家
            </p>
          )}
          <div className="mt-3 text-center">
            <button
              className="btn-secondary text-sm"
              onClick={dismissSheriffTransferResult}
            >
              确认
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="vote-panel p-4 space-y-4">
      {/* 顶部标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-amber-300">警徽移交</h3>
        {!sheriffTransferResult && !isActionLocked && sheriffTransferRequest && (
          <CountdownTimer
            seconds={sheriffTransferRequest.timeout}
            urgentThreshold={10}
          />
        )}
      </div>

      {/* 死亡警长信息 */}
      {sheriffTransferRequest && (
        <div className="p-3 bg-red-900/20 rounded-lg border border-red-800/50">
          <p className="text-red-300 font-semibold text-sm">
            警长 {sheriffTransferRequest.deadSheriffNickname}（{sheriffTransferRequest.deadSheriffSeat}号）已死亡
          </p>
          <p className="text-gray-400 text-xs mt-1">
            请选择移交警徽的目标玩家，超时将自动移交给最小序号存活玩家
          </p>
        </div>
      )}

      {/* 目标选择（未锁定且无结果时显示） */}
      {!sheriffTransferResult && !isActionLocked && (
        <>
          <TargetSelector
            targets={availableSeats}
            players={playerState.players}
            mySeat={mySeat}
            selected={selectedSeat}
            onSelect={setSelectedSeat}
            allowSelf={true}
            selfLabel="自己"
          />
          <button
            className="btn-primary w-full"
            onClick={handleTransfer}
            disabled={selectedSeat === null}
          >
            移交警徽
          </button>
        </>
      )}

      {/* 已提交等待 */}
      {isActionLocked && !sheriffTransferResult && (
        <p className="text-center text-gray-400">已提交移交选择，等待确认...</p>
      )}

      {/* 移交结果 */}
      {renderTransferResult()}

      {/* 确认对话框 */}
      {showConfirm && selectedSeat !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card max-w-sm w-full mx-4 space-y-4 animate-fade-in-up">
            <p className="text-center text-lg font-semibold">
              确定将警徽移交给 {selectedSeat}号 {getPlayerName(selectedSeat)} 吗？
            </p>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={confirmTransfer}>
                确定
              </button>
              <button className="btn-secondary flex-1" onClick={cancelConfirm}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SheriffTransfer;
