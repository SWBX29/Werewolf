import React, { useState, useMemo } from 'react';
import { useGameStore } from '../../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import type { RoleId } from '@langrensha/shared';
import TargetSelector from '../TargetSelector';
import CountdownTimer from '../CountdownTimer';

const VotePhase: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const voteResult = useGameStore((s) => s.voteResult);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const submitVote = useGameStore((s) => s.submitVote);
  const whiteWolfExplode = useGameStore((s) => s.whiteWolfExplode);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const dayAnnouncement = useGameStore((s) => s.dayAnnouncement);

  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<number | null>(null);
  const [showWhiteWolfPanel, setShowWhiteWolfPanel] = useState(false);
  const [whiteWolfTarget, setWhiteWolfTarget] = useState<number | null>(null);
  const [showWhiteWolfConfirm, setShowWhiteWolfConfirm] = useState(false);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;
  const myRole = myPlayer?.role;

  const isPK = playerState.phase === 'PK_VOTE';

  // 可投票目标：所有存活玩家（排除自己）
  const voteTargets = playerState.players
    .filter((p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== mySeat)
    .map((p) => p.seatNumber);

  // PK阶段仅限PK候选人为投票目标
  const pkCandidatesFromState = playerState.pkCandidates ?? [];
  const effectiveTargets = isPK && pkCandidatesFromState.length
    ? voteTargets.filter((s) => pkCandidatesFromState.includes(s))
    : isPK && voteResult?.pkCandidates?.length
    ? voteTargets.filter((s) => voteResult.pkCandidates.includes(s))
    : voteTargets;

  // 白狼王判断
  const isWhiteWolfKing = myRole === 'white_wolf_king' && myPlayer?.status === 'alive';

  // 白痴翻牌后失去投票权
  const isIdiotRevealed = myPlayer?.idiotRevealed === true;

  // 白狼王自爆目标：所有存活玩家（排除自己）
  const whiteWolfTargets = playerState.players
    .filter((p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== mySeat)
    .map((p) => p.seatNumber);

  const getPlayerName = (seat: number) => {
    const p = playerState!.players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  const handleVote = () => {
    if (isActionLocked) return;
    setConfirmTarget(selectedSeat);
    setShowConfirm(true);
  };

  const handleAbstain = () => {
    if (isActionLocked) return;
    setConfirmTarget(null);
    setShowConfirm(true);
  };

  const confirmVote = () => {
    submitVote(confirmTarget);
    setShowConfirm(false);
  };

  const cancelConfirm = () => {
    setShowConfirm(false);
    setConfirmTarget(null);
  };

  const handleWhiteWolfExplode = () => {
    if (whiteWolfTarget === null) return;
    setShowWhiteWolfConfirm(true);
  };

  const confirmWhiteWolfExplode = () => {
    if (whiteWolfTarget !== null) {
      whiteWolfExplode(whiteWolfTarget);
    }
    setShowWhiteWolfConfirm(false);
    setShowWhiteWolfPanel(false);
    setWhiteWolfTarget(null);
  };

  const cancelWhiteWolfConfirm = () => {
    setShowWhiteWolfConfirm(false);
  };

  // ---- 投票结果数据计算 ----
  const voteData = useMemo(() => {
    if (!voteResult) return null;

    const { votes, eliminated, isPK: isPKResult, pkCandidates } = voteResult;

    // 所有投票条目
    const voteEntries = Object.entries(votes)
      .map(([voter, target]) => ({
        voter: Number(voter),
        target: target as number | null,
      }));

    // 有效投票（非弃权）
    const validVotes = voteEntries.filter((e) => e.target !== null && e.target !== undefined);

    // 弃权
    const abstainVoters = voteEntries.filter((e) => e.target === null || e.target === undefined);
    const abstainCount = abstainVoters.length;

    // 按目标分组统计票数
    const targetVoteMap: Record<number, number[]> = {};
    for (const { voter, target } of validVotes) {
      if (target !== null) {
        if (!targetVoteMap[target]) targetVoteMap[target] = [];
        targetVoteMap[target].push(voter);
      }
    }

    // 按票数降序排列
    const sortedTargets = Object.entries(targetVoteMap)
      .map(([target, voters]) => ({
        target: Number(target),
        voters,
        count: voters.length,
      }))
      .sort((a, b) => b.count - a.count);

    const maxVotes = sortedTargets.length > 0 ? sortedTargets[0].count : 0;

    return {
      voteEntries,
      validVotes,
      abstainCount,
      abstainVoters,
      targetVoteMap,
      sortedTargets,
      maxVotes,
      eliminated,
      isPKResult,
      pkCandidates,
    };
  }, [voteResult]);

  // ---- 身份揭示信息 ----
  // 从 dayAnnouncement 的 phaseAnnouncement 中提取（DAY_VOTE_REVEAL 消息会设置 phaseAnnouncement）
  // 由于 DAY_VOTE_REVEAL 是独立消息，我们直接基于 ruleConfig.revealIdentityOnDayVote 和 eliminated 来推断
  // 实际的揭示信息由服务端通过 DAY_VOTE_REVEAL 消息推送到 phaseAnnouncement
  // 这里我们仅根据配置决定是否显示揭示区域
  const revealMode = ruleConfig.revealIdentityOnDayVote;

  // ---- 渲染投票结果 ----
  const renderVoteResult = () => {
    if (!voteData) return null;

    const { sortedTargets, maxVotes, abstainCount, abstainVoters, eliminated, isPKResult, pkCandidates, targetVoteMap } = voteData;

    return (
      <div className="space-y-4 mt-4">
        <h4 className="text-lg font-bold text-amber-300">
          {isPK ? 'PK投票结果' : '投票结果'}
        </h4>

        {/* 票数柱状图 */}
        {sortedTargets.length > 0 && (
          <div className="space-y-2">
            {sortedTargets.map(({ target, voters, count }) => {
              const isEliminated = target === eliminated;
              const barWidth = maxVotes > 0 ? (count / maxVotes) * 100 : 0;
              const barColor = isEliminated
                ? 'bg-red-500'
                : 'bg-amber-500/70';

              return (
                <div key={target} className="space-y-0.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className={`font-semibold ${isEliminated ? 'text-red-400' : 'text-gray-200'}`}>
                      {target}号 {getPlayerName(target)}
                    </span>
                    <span className={`font-mono ${isEliminated ? 'text-red-400' : 'text-amber-300'}`}>
                      {count}票
                    </span>
                  </div>
                  <div className="w-full h-5 bg-gray-800 rounded overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded transition-all duration-500`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  {/* 投票者列表 */}
                  <div className="flex flex-wrap gap-1 ml-1">
                    {voters.map((voterSeat) => (
                      <span
                        key={voterSeat}
                        className="text-xs text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded"
                      >
                        {voterSeat}号
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 弃权信息 */}
        {abstainCount > 0 && (
          <div className="text-sm text-gray-500">
            {abstainCount}人弃权
            {abstainVoters.length <= 5 && (
              <span className="ml-1">
                （{abstainVoters.map((v) => `${v.voter}号`).join('、')}）
              </span>
            )}
          </div>
        )}

        {/* 出局结果 */}
        {eliminated ? (
          <div className="text-center p-3 bg-red-900/30 rounded-lg border border-red-700 animate-pulse">
            <p className="text-red-400 font-bold text-lg">
              {eliminated}号玩家 {getPlayerName(eliminated)} 被放逐出局
            </p>
            {/* 身份揭示 */}
            {revealMode !== 'NONE' && (
              <IdentityReveal seat={eliminated} revealMode={revealMode} />
            )}
          </div>
        ) : (
          <div className="text-center p-3 bg-green-900/30 rounded-lg border border-green-700">
            <p className="text-green-400 font-bold text-lg">平安日，无人出局</p>
          </div>
        )}

        {/* PK 信息 */}
        {isPKResult && pkCandidates.length > 0 && (
          <div className="p-3 bg-yellow-900/30 rounded-lg border border-yellow-700">
            <p className="text-yellow-400 font-semibold">⚠ 平票！进入PK投票</p>
            <p className="text-sm text-yellow-300 mt-1">
              PK候选人：{pkCandidates.map((s) => `${s}号 ${getPlayerName(s)}`).join('、')}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="vote-panel p-4 space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-amber-300">
          {isPK ? 'PK放逐投票' : '放逐投票'}
        </h3>
        {/* 白狼王自爆按钮 */}
        {isWhiteWolfKing && !voteResult && (
          <button
            className="btn-danger text-sm"
            onClick={() => setShowWhiteWolfPanel(true)}
          >
            🐺 自爆
          </button>
        )}
      </div>

      {/* PK候选人提示 */}
      {isPK && (pkCandidatesFromState.length || voteResult?.pkCandidates?.length) && !voteData && (
        <div className="p-2 bg-yellow-900/20 rounded border border-yellow-700/50 text-sm text-yellow-300">
          PK候选人：{(pkCandidatesFromState.length ? pkCandidatesFromState : voteResult?.pkCandidates ?? []).map((s) => `${s}号 ${getPlayerName(s)}`).join('、')}
        </div>
      )}

      {/* 投票操作区 */}
      {!voteResult && !isActionLocked && !isIdiotRevealed && (
        <>
          <CountdownTimer seconds={ruleConfig.voteTimeout} urgentThreshold={5} />
          <TargetSelector
            targets={effectiveTargets}
            players={playerState.players}
            mySeat={mySeat}
            selected={selectedSeat}
            onSelect={setSelectedSeat}
            disabled={isActionLocked}
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

      {!voteResult && isIdiotRevealed && (
        <div className="text-center py-4 text-sm text-gray-500">
          你已翻牌白痴，无法参与投票
        </div>
      )}

      {/* 已提交等待状态 */}
      {isActionLocked && !voteResult && (
        <div className="text-center py-4 space-y-2">
          <div className="text-gray-400 animate-pulse">✓ 已提交投票，等待其他玩家...</div>
        </div>
      )}

      {/* 投票结果 */}
      {renderVoteResult()}

      {/* 投票确认对话框 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card max-w-sm w-full mx-4 space-y-4 animate-fade-in-up">
            <p className="text-center text-lg font-semibold">
              {confirmTarget !== null
                ? `确定投票给 ${confirmTarget}号 ${getPlayerName(confirmTarget)} 吗？`
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

      {/* 白狼王自爆面板 */}
      {showWhiteWolfPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card max-w-sm w-full mx-4 space-y-4 animate-fade-in-up">
            <h4 className="text-center text-lg font-bold text-red-400">🐺 白狼王自爆</h4>
            <p className="text-center text-sm text-gray-400">
              自爆后将带走一名玩家并强制入夜，此操作不可撤销
            </p>
            <TargetSelector
              targets={whiteWolfTargets}
              players={playerState.players}
              mySeat={mySeat}
              selected={whiteWolfTarget}
              onSelect={setWhiteWolfTarget}
            />
            <div className="flex gap-3">
              <button
                className="btn-danger flex-1"
                onClick={handleWhiteWolfExplode}
                disabled={whiteWolfTarget === null}
              >
                确认自爆
              </button>
              <button
                className="btn-secondary flex-1"
                onClick={() => {
                  setShowWhiteWolfPanel(false);
                  setWhiteWolfTarget(null);
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 白狼王自爆确认对话框 */}
      {showWhiteWolfConfirm && whiteWolfTarget !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="card max-w-sm w-full mx-4 space-y-4 animate-fade-in-up">
            <p className="text-center text-lg font-semibold text-red-400">
              ⚠ 确定自爆并带走 {whiteWolfTarget}号 {getPlayerName(whiteWolfTarget)} 吗？
            </p>
            <p className="text-center text-sm text-gray-500">此操作不可撤销</p>
            <div className="flex gap-3">
              <button className="btn-danger flex-1" onClick={confirmWhiteWolfExplode}>
                确认自爆
              </button>
              <button className="btn-secondary flex-1" onClick={cancelWhiteWolfConfirm}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** 身份揭示子组件 */
const IdentityReveal: React.FC<{ seat: number; revealMode: 'NONE' | 'FACTION' | 'ROLE' }> = ({ seat, revealMode }) => {
  const playerState = useGameStore((s) => s.playerState);
  const dayAnnouncement = useGameStore((s) => s.dayAnnouncement);

  if (!playerState || revealMode === 'NONE') return null;

  // 尝试从自己的角色信息中获取被票出者的信息
  // 注意：普通玩家看不到别人的角色，身份揭示信息由服务端通过 DAY_VOTE_REVEAL 消息推送
  // 这里我们只能展示服务端推送的信息，通过 phaseAnnouncement 已经展示了
  // 因此此组件仅作为占位，实际揭示信息由 phaseAnnouncement 展示
  // 但如果当前玩家是法官（judgeState），可以看到完整信息

  // 对于普通玩家，我们无法直接获取被票出者的阵营/角色
  // 身份揭示由服务端 DAY_VOTE_REVEAL 消息处理，已通过 phaseAnnouncement 展示
  // 这里返回一个提示，告知玩家查看公告
  return (
    <p className="text-sm text-gray-400 mt-1">
      {revealMode === 'FACTION' && '查看上方公告了解阵营信息'}
      {revealMode === 'ROLE' && '查看上方公告了解身份信息'}
    </p>
  );
};

export default VotePhase;
