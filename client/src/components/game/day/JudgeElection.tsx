import React, { useState, useMemo } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import CountdownTimer from '../CountdownTimer';

/** 选举法官（警长）界面组件 */
const JudgeElection: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const ruleConfig = useGameStore((s) => s.ruleConfig);

  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<number | null>(null);

  // 选举结果（预留：后续由服务端推送，暂用本地模拟数据结构）
  const [electionResult, setElectionResult] = useState<{
    votes: Record<number, number>; // seatNumber -> 票数
    winner: number | null; // 当选者座位号，null 表示平票或无结果
    isTie: boolean; // 是否平票
    tieCandidates: number[]; // 平票候选人
  } | null>(null);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;

  // 候选人：所有存活且非法官的玩家
  const candidates = useMemo(
    () =>
      playerState.players.filter(
        (p) => p.status === 'alive' && !p.isJudge,
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
    // TODO: 后续替换为 store 中的 submitJudgeElectionVote 方法
    // submitJudgeElectionVote(confirmTarget);
    setShowConfirm(false);
  };

  // 取消确认
  const cancelConfirm = () => {
    setShowConfirm(false);
    setConfirmTarget(null);
  };

  // 选举结果展示
  const renderElectionResult = () => {
    if (!electionResult) return null;

    const { votes, winner, isTie, tieCandidates } = electionResult;

    // 按票数降序排列
    const sortedEntries = Object.entries(votes)
      .map(([seat, count]) => ({ seat: Number(seat), count }))
      .sort((a, b) => b.count - a.count);

    const maxVotes = sortedEntries.length > 0 ? sortedEntries[0].count : 0;

    return (
      <div className="space-y-4 mt-4 animate-fade-in-up">
        <h4 className="text-lg font-bold text-amber-300">选举结果</h4>

        {/* 票数统计 */}
        <div className="space-y-2">
          {sortedEntries.map(({ seat, count }) => {
            const isWinner = seat === winner;
            const isTieCandidate = tieCandidates.includes(seat);
            const barWidth = maxVotes > 0 ? (count / maxVotes) * 100 : 0;

            return (
              <div
                key={seat}
                className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${
                  isWinner
                    ? 'border-2 border-yellow-500 bg-yellow-900/20 animate-pulse'
                    : isTieCandidate
                      ? 'border-2 border-amber-500 bg-amber-900/20'
                      : 'border border-night-700 bg-night-800/50'
                }`}
              >
                <span className="font-mono font-bold text-lg min-w-[3rem]">
                  {seat}号
                </span>
                <span className="text-sm text-gray-400 min-w-[4rem] truncate">
                  {getPlayerName(seat)}
                </span>
                <div className="flex-1 h-5 bg-night-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      isWinner
                        ? 'bg-yellow-500'
                        : isTieCandidate
                          ? 'bg-amber-500'
                          : 'bg-wolf-600'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="font-mono font-bold min-w-[2rem] text-right">
                  {count}票
                </span>
                {isWinner && (
                  <span className="text-yellow-400 text-sm font-semibold">👑 当选</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 当选者高亮 */}
        {winner && !isTie && (
          <div className="p-3 bg-yellow-900/30 rounded-lg border-2 border-yellow-500 animate-fade-in-up">
            <p className="text-yellow-300 font-bold text-lg text-center">
              👑 {winner}号 {getPlayerName(winner)} 当选法官！
            </p>
            <p className="text-yellow-400/70 text-sm text-center mt-1">
              法官特权：发言顺序可由法官决定
            </p>
          </div>
        )}

        {/* 平票提示 */}
        {isTie && (
          <div className="p-3 bg-amber-900/30 rounded-lg border border-amber-600">
            <p className="text-amber-400 font-semibold text-center">
              平票！{tieCandidates.map((s) => `${s}号`).join('、')} 票数相同
            </p>
            <p className="text-amber-400/60 text-sm text-center mt-1">
              等待法官裁定或进入下一轮投票
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="vote-panel p-4 space-y-4">
      {/* 顶部标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-amber-300">选举法官</h3>
        {!electionResult && !isActionLocked && (
          <CountdownTimer
            seconds={ruleConfig.voteTimeout}
            urgentThreshold={10}
          />
        )}
      </div>

      {/* 法官特权说明 */}
      <div className="text-xs text-amber-400/60 bg-amber-900/10 rounded px-3 py-1.5 border border-amber-800/30">
        当选法官后，发言顺序可由法官决定
      </div>

      {/* 候选人选择（未锁定且无结果时显示） */}
      {!electionResult && !isActionLocked && (
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
      {isActionLocked && !electionResult && (
        <p className="text-center text-gray-400">已提交投票，等待其他玩家...</p>
      )}

      {/* 选举结果 */}
      {renderElectionResult()}

      {/* 确认对话框 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card max-w-sm w-full mx-4 space-y-4 animate-fade-in-up">
            <p className="text-center text-lg font-semibold">
              {confirmTarget !== null
                ? `确定投票给 ${confirmTarget}号 ${getPlayerName(confirmTarget)} 当选法官吗？`
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

export default JudgeElection;
