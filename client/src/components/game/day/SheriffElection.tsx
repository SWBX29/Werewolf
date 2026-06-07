import React, { useState, useMemo } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import CountdownTimer from '../CountdownTimer';

/** 选举警长界面组件 */
const SheriffElection: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const submitSheriffElectionVote = useGameStore((s) => s.submitSheriffElectionVote);
  const phaseAnnouncement = useGameStore((s) => s.phaseAnnouncement);

  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<number | null>(null);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;

  // 候选人：所有存活且非警长的玩家
  const candidates = useMemo(
    () =>
      playerState.players.filter(
        (p) => p.status === 'alive' && !p.isSheriff,
      ),
    [playerState.players],
  );

  const candidateSeats = candidates.map((p) => p.seatNumber);

  const getPlayerName = (seat: number) => {
    const p = playerState!.players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  // 投票
  const handleVote = () => {
    if (isActionLocked) return;
    setConfirmTarget(selectedSeat);
    setShowConfirm(true);
  };

  // 弃权
  const handleAbstain = () => {
    if (isActionLocked) return;
    setConfirmTarget(null);
    setShowConfirm(true);
  };

  // 确认投票
  const confirmVote = () => {
    submitSheriffElectionVote(confirmTarget);
    setShowConfirm(false);
  };

  // 取消确认
  const cancelConfirm = () => {
    setShowConfirm(false);
    setConfirmTarget(null);
  };

  // 选举结果由 GameView 顶部横幅统一展示，此处仅控制投票 UI 显隐

  return (
    <div className="vote-panel p-4 space-y-4">
      {/* 顶部标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-amber-300">选举警长</h3>
        {!phaseAnnouncement && !isActionLocked && (
          <CountdownTimer
            seconds={ruleConfig.voteTimeout}
            urgentThreshold={10}
          />
        )}
      </div>

      {/* 警长特权说明 */}
      <div className="text-xs text-amber-400/60 bg-amber-900/10 rounded px-3 py-1.5 border border-amber-800/30">
        当选警长后，发言顺序可由警长决定，投票时拥有 {ruleConfig.sheriffVoteWeight} 票权重
      </div>

      {/* 候选人选择（未锁定且无结果时显示） */}
      {!phaseAnnouncement && !isActionLocked && (
        <>
          <TargetSelector
            targets={candidateSeats}
            players={playerState.players}
            mySeat={mySeat}
            selected={selectedSeat}
            onSelect={setSelectedSeat}
            allowSelf={true}
            selfLabel="竞选"
          />
          <div className="flex gap-3">
            <button
              className="btn-primary flex-1"
              onClick={handleVote}
              disabled={selectedSeat === null}
            >
              投票
            </button>
            <button className="btn-secondary" onClick={handleAbstain}>
              弃权
            </button>
          </div>
        </>
      )}

      {/* 已提交等待 */}
      {isActionLocked && !phaseAnnouncement && (
        <p className="text-center text-gray-400">已提交投票，等待其他玩家...</p>
      )}

      {/* 选举结果已出，等待下一阶段 */}
      {phaseAnnouncement && (
        <p className="text-center text-gray-400 text-sm">等待下一阶段...</p>
      )}

      {/* 确认对话框 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card max-w-sm w-full mx-4 space-y-4 animate-fade-in-up">
            <p className="text-center text-lg font-semibold">
              {confirmTarget !== null
                ? `确定投票给 ${confirmTarget}号 ${getPlayerName(confirmTarget)} 当选警长吗？`
                : '确定弃权吗？'}
            </p>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={confirmVote}>
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

export default SheriffElection;
