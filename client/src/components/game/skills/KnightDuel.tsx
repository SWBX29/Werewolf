/**
 * ============================================================================
 * KnightDuel — 骑士决斗技能组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 骑士在白天发言或投票前等待阶段发动的决斗技能，选择一名玩家进行决斗
 *   2. 根据村规配置判断决斗失败时骑士是否自尽
 *   3. 提供目标选择、确认弹窗和决斗结果展示
 *
 * 设计原则：
 *   - 决斗时机：发言阶段仅当前发言者可发动，投票前等待阶段任何存活骑士可发动
 *   - 操作锁定：确认决斗时先锁定状态再提交，防止重复操作
 *   - 决斗结果由服务端判定，包含目标是否为狼人、骑士是否死亡等信息
 * ============================================================================
 */

import React, { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import type { KnightDuelSuicideRule } from '@langrensha/shared';
import TargetSelector from '../TargetSelector';
import ConfirmDialog from '../ConfirmDialog';

/** 骑士决斗技能组件 */
const KnightDuel: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const knightDuelResult = useGameStore((s) => s.knightDuelResult);
  const knightDuel = useGameStore((s) => s.knightDuel);
  const dismissKnightDuelResult = useGameStore((s) => s.dismissKnightDuelResult);
  // 检查是否已锁定操作，防止重复决斗
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const setActionLocked = useGameStore((s) => s.setActionLocked);

  const [showTargetSelect, setShowTargetSelect] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.role !== 'knight') return null;

  // 在白天发言阶段（DAY_SPEECH）或投票前等待阶段（PRE_VOTE_WAIT）都可以发动决斗
  if (playerState.phase !== 'DAY_SPEECH' && playerState.phase !== 'PRE_VOTE_WAIT') return null;

  const { speechOrder, currentSpeakerIndex, players } = playerState;
  const currentSpeakerSeat = speechOrder[currentSpeakerIndex] ?? null;
  // 在 PRE_VOTE_WAIT 阶段，任何存活的骑士都可以发动决斗
  // 在 DAY_SPEECH 阶段，只有当前发言者（骑士）才能发动决斗
  const isMyTurn = playerState.phase === 'PRE_VOTE_WAIT'
    ? (myPlayer.status === 'alive')
    : (currentSpeakerSeat === myPlayer.seatNumber);

  if (!isMyTurn) return null;

  const suicideRule: KnightDuelSuicideRule = ruleConfig.knightDuelSuicide;

  // 决斗目标：所有存活玩家（排除自己）
  const duelTargets = players
    .filter((p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== myPlayer.seatNumber)
    .map((p) => p.seatNumber);

  const getPlayerName = (seat: number) => {
    const p = players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  const handleStartDuel = () => {
    // 检查是否已锁定操作
    if (isActionLocked) return;
    setShowTargetSelect(true);
  };

  const handleTargetConfirm = () => {
    // 检查是否已锁定和目标有效性
    if (selectedSeat === null || isActionLocked) return;
    setShowConfirm(true);
  };

  const handleConfirmDuel = () => {
    // 检查目标有效性并先锁定状态
    if (selectedSeat === null || isActionLocked) return;
    setActionLocked(true);
    knightDuel(selectedSeat);
    setShowConfirm(false);
    setShowTargetSelect(false);
    setSelectedSeat(null);
  };

  const cancelAll = () => {
    setShowConfirm(false);
    setShowTargetSelect(false);
    setSelectedSeat(null);
  };

  // 决斗规则说明文本
  const getRuleDescription = () => {
    if (suicideRule === 'SUICIDE') {
      return '若对方是狼人则狼人死亡并强制入夜；若对方是好人则骑士自尽';
    }
    return '若对方是狼人则狼人死亡并强制入夜；若对方是好人则仅暴露骑士身份，不死亡';
  };

  return (
    <>
      {/* 决斗按钮 */}
      {!showTargetSelect && !knightDuelResult && (
        <div className="space-y-2">
          <button
            className="w-full py-2 px-4 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold
                       border-2 border-red-500 transition-colors duration-200 flex items-center justify-center gap-2"
            onClick={handleStartDuel}
          >
            <span className="text-xl">⚔️</span>
            发动决斗
          </button>
          <p className="text-xs text-gray-500 text-center">{getRuleDescription()}</p>
          <p className="text-xs text-amber-500/70 text-center">
            💡 决斗隐狼时骑士获胜
          </p>
        </div>
      )}

      {/* 目标选择 */}
      {showTargetSelect && !knightDuelResult && (
        <div className="space-y-3 p-3 bg-red-950/30 rounded-lg border border-red-800 animate-fade-in-up">
          <p className="text-sm text-red-300 font-semibold">选择决斗目标</p>
          <TargetSelector
            targets={duelTargets}
            players={players}
            mySeat={myPlayer.seatNumber}
            selected={selectedSeat}
            onSelect={setSelectedSeat}
          />
          <div className="flex gap-2">
            <button
              className="btn-danger flex-1"
              onClick={handleTargetConfirm}
              disabled={selectedSeat === null}
            >
              确认目标
            </button>
            <button className="btn-secondary" onClick={cancelAll}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      <ConfirmDialog
        open={showConfirm && selectedSeat !== null}
        icon="⚔️"
        title="骑士决斗"
        message={`确定要与 ${selectedSeat}号 ${getPlayerName(selectedSeat!)} 决斗吗？`}
        confirmLabel="发动决斗"
        confirmVariant="danger"
        hints={[
          { text: getRuleDescription(), type: 'info' },
          { text: '💡 决斗隐狼时骑士获胜', type: 'warning' },
        ]}
        zIndex={50}
        onConfirm={handleConfirmDuel}
        onCancel={cancelAll}
      />

      {/* 决斗结果覆盖层 */}
      {knightDuelResult && (
        <div className="duel-overlay" onClick={dismissKnightDuelResult}>
          <div
            className="card max-w-md w-full mx-4 space-y-4 text-center animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 剑交叉动画 */}
            <div className="text-7xl animate-sword-clash">⚔️</div>

            <h3 className="text-2xl font-bold">决斗结果</h3>

            {/* 决斗双方信息 */}
            <div className="flex items-center justify-center gap-4 text-lg">
              <div className="text-center">
                <p className="text-amber-300 font-bold">{knightDuelResult.knightSeat}号</p>
                <p className="text-xs text-gray-400">骑士</p>
              </div>
              <span className="text-2xl text-red-500">⚔️</span>
              <div className="text-center">
                <p className="text-amber-300 font-bold">{knightDuelResult.targetSeat}号</p>
                <p className="text-xs text-gray-400">决斗目标</p>
              </div>
            </div>

            {/* 结果 */}
            {knightDuelResult.targetIsWolf ? (
              <div className="p-3 bg-green-900/30 rounded-lg border border-green-700">
                <p className="text-xl text-green-400 font-bold">
                  🎉 决斗胜利！
                </p>
                <p className="text-sm text-green-300 mt-1">
                  {knightDuelResult.targetSeat}号玩家是狼人，狼人死亡
                </p>
              </div>
            ) : (
              <div className="p-3 bg-red-900/30 rounded-lg border border-red-700">
                <p className="text-xl text-red-400 font-bold">
                  💀 决斗失败！
                </p>
                <p className="text-sm text-red-300 mt-1">
                  {knightDuelResult.targetSeat}号玩家是好人
                  {knightDuelResult.knightDied ? '，骑士自尽' : '，骑士身份暴露'}
                </p>
              </div>
            )}

            {/* 揭示身份 */}
            {knightDuelResult.revealedRole && (
              <p className="text-sm text-amber-300">
                揭示身份：{ROLE_META[knightDuelResult.revealedRole].name}
              </p>
            )}

            {/* 强制入夜提示 */}
            {knightDuelResult.forceNight && (
              <p className="text-xs text-gray-400">
                🌙 决斗成功，强制入夜
              </p>
            )}

            <button className="btn-primary" onClick={dismissKnightDuelResult}>
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default KnightDuel;
