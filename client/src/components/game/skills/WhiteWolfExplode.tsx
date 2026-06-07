import React, { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';

const WhiteWolfExplode: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const whiteWolfExplode = useGameStore((s) => s.whiteWolfExplode);
  const isActionLocked = useGameStore((s) => s.isActionLocked);

  const [showTargetSelect, setShowTargetSelect] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [exploded, setExploded] = useState(false);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.role !== 'white_wolf_king') return null;

  // 白狼王已死亡或已自爆则不再显示
  if (myPlayer.status !== 'alive') return null;

  // 只在白天发言/投票阶段可自爆
  const canExplode =
    (playerState.phase === 'DAY_SPEECH' || playerState.phase === 'DAY_VOTE') &&
    !isActionLocked &&
    !exploded;

  if (!canExplode && !showTargetSelect && !showConfirm) return null;

  const { players } = playerState;

  // 自爆带走目标：所有存活玩家（排除自己）
  const explodeTargets = players
    .filter((p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== myPlayer.seatNumber)
    .map((p) => p.seatNumber);

  const getPlayerName = (seat: number) => {
    const p = players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  const handleStartExplode = () => {
    setShowTargetSelect(true);
    setSelectedSeat(null);
  };

  const handleTargetConfirm = () => {
    if (selectedSeat === null) return;
    setShowConfirm(true);
  };

  const handleConfirmExplode = () => {
    if (selectedSeat === null) return;
    whiteWolfExplode(selectedSeat);
    setShowConfirm(false);
    setShowTargetSelect(false);
    setSelectedSeat(null);
    setExploded(true);
  };

  const cancelAll = () => {
    setShowConfirm(false);
    setShowTargetSelect(false);
    setSelectedSeat(null);
  };

  return (
    <>
      {/* 自爆按钮 */}
      {!showTargetSelect && !showConfirm && canExplode && (
        <div className="space-y-2">
          <button
            className="w-full py-2 px-4 rounded-lg bg-red-900 hover:bg-red-800 text-white font-bold
                       border-2 border-red-600 transition-colors duration-200 flex items-center justify-center gap-2"
            onClick={handleStartExplode}
          >
            <span className="text-xl">🐺</span>
            白狼王自爆
          </button>
          <p className="text-xs text-gray-500 text-center">
            自爆后带走一名玩家并强制入夜，不可撤回
          </p>
        </div>
      )}

      {/* 目标选择 */}
      {showTargetSelect && (
        <div className="space-y-3 p-3 bg-red-950/30 rounded-lg border border-red-800 animate-fade-in-up">
          <p className="text-sm text-red-300 font-semibold">选择自爆带走的目标</p>
          <TargetSelector
            targets={explodeTargets}
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
            <div className="text-center text-4xl">🐺</div>
            <p className="text-center text-lg font-semibold text-red-400">
              确定自爆带走 {selectedSeat}号 {getPlayerName(selectedSeat)} 吗？
            </p>
            <div className="text-center space-y-1">
              <p className="text-xs text-red-300">
                ⚠️ 自爆后你将死亡，并带走目标玩家
              </p>
              <p className="text-xs text-red-400 font-semibold">
                ⚠️ 自爆后强制入夜，此操作不可撤回！
              </p>
            </div>
            <div className="flex gap-3">
              <button className="btn-danger flex-1" onClick={handleConfirmExplode}>
                确认自爆
              </button>
              <button className="btn-secondary flex-1" onClick={cancelAll}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WhiteWolfExplode;
