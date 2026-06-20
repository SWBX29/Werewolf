/**
 * ============================================================================
 * WhiteWolfExplode — 白狼王自爆技能组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 白狼王在白天发言或投票阶段触发的自爆技能，选择带走一名玩家并强制入夜
 *   2. 通过服务端确认状态跟踪，确保自爆操作在服务端确认后才更新本地状态
 *   3. 提供目标选择、确认弹窗和等待服务端确认的交互流程
 *
 * 设计原则：
 *   - 服务端确认状态跟踪：先设置 pending 状态，等服务端确认后再设置 exploded
 *   - 仅在白天发言/投票阶段可自爆
 *   - 自爆操作不可撤回，需二次确认
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import ConfirmDialog from '../ConfirmDialog';

/** 白狼王自爆技能组件 */
const WhiteWolfExplode: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const whiteWolfExplode = useGameStore((s) => s.whiteWolfExplode);
  const isActionLocked = useGameStore((s) => s.isActionLocked);

  const [showTargetSelect, setShowTargetSelect] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [exploded, setExploded] = useState(false);
  // 服务端确认状态跟踪
  const [pendingExplode, setPendingExplode] = useState(false);

  // 当服务端确认后（玩家状态变为非存活），才设置 exploded
  useEffect(() => {
    if (!playerState) return;
    const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
    if (!myPlayer || myPlayer.role !== 'white_wolf_king') return;
    if (pendingExplode && myPlayer.status !== 'alive') {
      setExploded(true);
      setPendingExplode(false);
    }
  }, [playerState, pendingExplode]);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.role !== 'white_wolf_king') return null;

  // 白狼王已死亡或已自爆则不再显示
  // 但如果正在等待服务端确认，显示等待指示
  if (myPlayer.status !== 'alive') {
    if (pendingExplode) {
      return (
        <div className="p-4 text-center space-y-2">
          <p className="text-red-400 font-semibold animate-pulse">🐺 自爆确认中...</p>
          <p className="text-xs text-gray-500">等待服务端处理</p>
        </div>
      );
    }
    return null;
  }

  // 只在白天发言/投票阶段可自爆
  const canExplode =
    (playerState.phase === 'DAY_SPEECH' || playerState.phase === 'PRE_VOTE_WAIT' || playerState.phase === 'DAY_VOTE') &&
    !isActionLocked &&
    !exploded &&
    !pendingExplode;

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
    // 先设置 pending 状态，等服务端确认后再设置 exploded
    setPendingExplode(true);
    whiteWolfExplode(selectedSeat);
    setShowConfirm(false);
    setShowTargetSelect(false);
    setSelectedSeat(null);
  };

  const cancelAll = () => {
    setShowConfirm(false);
    setShowTargetSelect(false);
    setSelectedSeat(null);
  };

  return (
    <>
      {/* 等待服务端确认 */}
      {pendingExplode && (
        <div className="p-3 text-center bg-red-950/20 rounded-lg border border-red-800/30 animate-pulse">
          <p className="text-sm text-red-300">🐺 自爆确认中，等待服务端处理...</p>
        </div>
      )}

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
      <ConfirmDialog
        open={showConfirm && selectedSeat !== null}
        icon="🐺"
        title="白狼王自爆"
        message={`确定自爆带走 ${selectedSeat}号 ${getPlayerName(selectedSeat!)} 吗？`}
        confirmLabel="确认自爆"
        confirmVariant="danger"
        hints={[
          { text: '⚠️ 自爆后你将死亡，并带走目标玩家', type: 'warning' },
          { text: '⚠️ 自爆后强制入夜，此操作不可撤回！', type: 'danger' },
        ]}
        zIndex={50}
        onConfirm={handleConfirmExplode}
        onCancel={cancelAll}
      />
    </>
  );
};

export default WhiteWolfExplode;
