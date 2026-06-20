/**
 * ============================================================================
 * SheriffElection — 警长选举组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 提供警长选举投票界面，候选人列表自动排除法官和现任警长
 *   2. 支持投票和弃权两种操作，均需二次确认
 *   3. 提交后锁定操作，防止重复投票
 *
 * 设计原则：
 *   - 候选人过滤：仅存活、非法官、非现任警长的玩家可选
 *   - 操作锁定：确认投票时先锁定状态再提交，避免快速双击重复提交
 *   - 选举结果由 GameView 顶部横幅统一展示，本组件仅控制投票 UI
 * ============================================================================
 */

import React, { useState, useMemo } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import CountdownTimer from '../CountdownTimer';

/** 警长选举界面组件 — 展示候选人列表，支持投票、弃权操作及二次确认 */
const SheriffElection: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const submitSheriffElectionVote = useGameStore((s) => s.submitSheriffElectionVote);
  const setActionLocked = useGameStore((s) => s.setActionLocked);
  const phaseAnnouncement = useGameStore((s) => s.phaseAnnouncement);

  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<number | null>(null);

  // 候选人列表：仅存活、非现任警长、非法官的玩家
  const candidates = useMemo(
    () =>
      playerState?.players.filter(
        (p) => p.status === 'alive' && !p.isSheriff && !p.isJudge,
      ) ?? [],
    [playerState?.players],
  );

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;

  const candidateSeats = candidates.map((p) => p.seatNumber);

  /** 根据座位号获取玩家昵称 */
  const getPlayerName = (seat: number) => {
    const p = playerState!.players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  // ============ 投票操作 ============

  /** 点击投票按钮，弹出确认对话框 */
  const handleVote = () => {
    if (isActionLocked) return;
    setConfirmTarget(selectedSeat);
    setShowConfirm(true);
  };

  /** 点击弃权按钮，弹出确认对话框 */
  const handleAbstain = () => {
    if (isActionLocked) return;
    setConfirmTarget(null);
    setShowConfirm(true);
  };

  /** 确认投票：先锁定操作状态再提交，防止重复提交 */
  const confirmVote = () => {
    setActionLocked(true);
    submitSheriffElectionVote(confirmTarget);
    setShowConfirm(false);
  };

  /** 取消确认对话框 */
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
