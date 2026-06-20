/**
 * ============================================================================
 * WolfVotePanel — 狼人投票面板
 * ============================================================================
 *
 * 架构说明：
 *   1. 共同睁眼的狼人选择击杀目标
 *   2. 投票可修改：倒计时结束前可随时更改选择
 *
 * 设计原则：
 *   - 集成狼人聊天区域
 *   - 显示投票进度和共识状态
 *   - 重连时同步服务端投票状态
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import WolfChat from './WolfChat';
import ConfirmDialog from '../ConfirmDialog';
import { MyActionInfo } from './NightWaiting';

/** 狼人投票面板，共同睁眼的狼人选择击杀目标 */
export default function WolfVotePanel() {
  const playerState = useGameStore((s) => s.playerState);
  const sendWolfVote = useGameStore((s) => s.sendWolfVote);

  const nightActionRequest = playerState?.nightActionRequest;
  const players = playerState?.players ?? [];
  const myPlayer = players.find((p) => p.id === playerState?.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;
  const wolfVotes = playerState?.wolfVotes ?? {};
  const wolfVoteConsensus = playerState?.wolfVoteConsensus ?? false;
  // 自己已提交的夜间行动（如噩梦之影在噩梦阶段已提交的恐惧）
  const myNightAction = playerState?.myNightAction ?? null;

  // 已投票时初始化为当前投票目标，方便修改
  const myCurrentVote = wolfVotes[mySeat] ?? null;
  const [selected, setSelected] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 使用 useEffect 同步投票状态，处理重连场景
  useEffect(() => {
    // 同步服务端的投票状态到本地
    setSelected(myCurrentVote);
    setHasVoted(myCurrentVote !== null);
  }, [myCurrentVote]);

  if (!nightActionRequest) return null;

  // 统计投票进度
  const totalWolves = Object.keys(wolfVotes || {}).length || 1;
  const votedCount = Object.values(wolfVotes || {}).filter((v) => v !== undefined).length;

  const handleConfirmClick = () => {
    if (selected === null) return;
    setConfirmOpen(true);
  };

  const handleConfirmAction = () => {
    if (selected === null) return;
    sendWolfVote(selected);
    setHasVoted(true);
    setConfirmOpen(false);
  };

  const handleChangeVote = () => {
    setHasVoted(false);
  };

  return (
    <div className="wolf-panel">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-red-400">
          🐺 狼人 · 投票击杀
        </h2>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        与同伴商议后选择今晚的击杀目标。可选择自刀。倒计时结束前可修改投票。
      </p>

      {/* 同伴列表 */}
      {nightActionRequest.wolfAllies && nightActionRequest.wolfAllies.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-red-950/20 border border-red-900/30">
          <h3 className="text-xs font-semibold text-red-400 mb-2">🐺 你的同伴</h3>
          <div className="flex flex-wrap gap-2">
            {nightActionRequest.wolfAllies.map((ally) => (
              <span
                key={ally.seatNumber}
                className={`text-xs px-2 py-1 rounded ${
                  ally.seatNumber === mySeat
                    ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/50'
                    : 'bg-red-900/30 text-red-300 border border-red-700/50'
                }`}
              >
                {ally.seatNumber}号 {ally.nickname}
                {ally.seatNumber === mySeat && '（你）'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 目标选择 — 已投票但想修改时也可操作 */}
      <TargetSelector
        targets={nightActionRequest.availableTargets}
        players={players}
        mySeat={mySeat}
        selected={selected}
        onSelect={setSelected}
        disabledTargets={nightActionRequest.disabledTargets}
        disabledReasons={nightActionRequest.disabledReasons}
        allowSelf={true}
        selfLabel="自刀"
        disabled={false}
      />

      {/* 投票进度 */}
      <div className="mt-4 card border-red-900/30 bg-night-900/50">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">投票进度</h3>

        {/* 各狼人投票状态 */}
        <div className="space-y-1 mb-2">
          {Object.entries(wolfVotes || {}).map(([voterSeat, targetSeat]) => (
            <div key={voterSeat} className="text-sm">
              <span className={`font-mono ${Number(voterSeat) === mySeat ? 'text-yellow-400' : 'text-red-400'}`}>
                {Number(voterSeat) === mySeat ? '🐺你' : `🐺${voterSeat}号`}
              </span>
              <span className="text-gray-500"> → </span>
              <span className="text-white font-mono">{targetSeat}号</span>
            </div>
          ))}
          {Object.keys(wolfVotes || {}).length === 0 && (
            <p className="text-xs text-gray-600">暂无投票</p>
          )}
        </div>

        {/* 共识状态 */}
        <div className="flex items-center gap-2">
          {wolfVoteConsensus ? (
            <span className="text-green-400 text-sm font-semibold">✓ 已达成共识</span>
          ) : (
            <span className="text-yellow-400 text-sm">
              {votedCount}人已选择 / 共{totalWolves}人
            </span>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="mt-4 flex justify-end gap-2">
        {hasVoted && !wolfVoteConsensus && (
          <button
            className="btn-secondary text-sm"
            onClick={handleChangeVote}
          >
            修改投票
          </button>
        )}
        <button
          className="btn-primary"
          disabled={selected === null || wolfVoteConsensus}
          onClick={handleConfirmClick}
        >
          {hasVoted ? '重新投票' : '确认投票'}
        </button>
      </div>

      {/* 狼人聊天 */}
      <WolfChat />

      {/* 已行动的噩梦恐惧信息（噩梦之影在狼人投票阶段可见自己之前的恐惧选择） */}
      {myNightAction && myNightAction.roleId !== 'werewolf' && (
        <MyActionInfo action={myNightAction} />
      )}

      {/* 二次确认弹窗 */}
      <ConfirmDialog
        open={confirmOpen}
        title="确认投票"
        message={`确定要投票击杀 ${selected}号 玩家吗？`}
        confirmLabel="确认投票"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
