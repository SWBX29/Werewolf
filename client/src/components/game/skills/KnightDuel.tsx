import React, { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import type { KnightDuelSuicideRule } from '@langrensha/shared';
import TargetSelector from '../TargetSelector';

const KnightDuel: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const knightDuelResult = useGameStore((s) => s.knightDuelResult);
  const knightDuel = useGameStore((s) => s.knightDuel);
  const dismissKnightDuelResult = useGameStore((s) => s.dismissKnightDuelResult);

  const [showTargetSelect, setShowTargetSelect] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.role !== 'knight') return null;

  // 只在白天发言阶段（DAY_SPEECH）且自己发言回合时才显示
  if (playerState.phase !== 'DAY_SPEECH') return null;

  const { speechOrder, currentSpeakerIndex, players } = playerState;
  const currentSpeakerSeat = speechOrder[currentSpeakerIndex] ?? null;
  const isMyTurn = currentSpeakerSeat === myPlayer.seatNumber;

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
    setShowTargetSelect(true);
  };

  const handleTargetConfirm = () => {
    if (selectedSeat === null) return;
    setShowConfirm(true);
  };

  const handleConfirmDuel = () => {
    if (selectedSeat === null) return;
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
      {showConfirm && selectedSeat !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card max-w-sm w-full mx-4 space-y-4 animate-fade-in-up">
            <div className="text-center text-4xl">⚔️</div>
            <p className="text-center text-lg font-semibold text-red-400">
              确定要与 {selectedSeat}号 {getPlayerName(selectedSeat)} 决斗吗？
            </p>
            <div className="text-center space-y-1">
              <p className="text-xs text-gray-500">{getRuleDescription()}</p>
              <p className="text-xs text-amber-500/70">💡 决斗隐狼时骑士获胜</p>
            </div>
            <div className="flex gap-3">
              <button className="btn-danger flex-1" onClick={handleConfirmDuel}>
                发动决斗
              </button>
              <button className="btn-secondary flex-1" onClick={cancelAll}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

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
