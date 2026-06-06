import React, { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import CountdownTimer from '../CountdownTimer';

const HunterGun: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const hunterGun = useGameStore((s) => s.hunterGun);

  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [gunFired, setGunFired] = useState(false);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.role !== 'hunter') return null;

  // 猎人必须已死亡才能开枪
  const isDead = myPlayer.status !== 'alive';
  if (!isDead) return null;

  // 已开枪则不再显示
  if (gunFired) return null;

  // 判断是否被毒死
  const isPoisoned = myPlayer.status === 'poisoned';
  const poisonBlockGun = ruleConfig.poisonBlockGun;

  // 被毒死且规则封印枪 → 显示无法开枪提示
  if (isPoisoned && poisonBlockGun) {
    return (
      <div className="skill-panel p-4 space-y-3">
        <h3 className="text-lg font-bold text-red-400">🔫 猎人开枪</h3>
        <div className="text-center space-y-2">
          <p className="text-red-300">你被毒死，无法开枪</p>
          <p className="text-xs text-gray-500">当前村规：被毒死时封印开枪技能</p>
        </div>
      </div>
    );
  }

  // 夜间行动请求（如果有）
  const nightActionRequest = playerState.nightActionRequest;

  const { players } = playerState;

  // 可开枪目标：所有存活玩家（排除自己）
  // 如果有 nightActionRequest 则使用其可用目标列表
  const gunTargets = nightActionRequest?.roleId === 'hunter'
    ? nightActionRequest.availableTargets
    : players
        .filter((p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== myPlayer.seatNumber)
        .map((p) => p.seatNumber);

  // 被禁用的目标（如果有 nightActionRequest）
  const disabledTargets = nightActionRequest?.roleId === 'hunter'
    ? nightActionRequest.disabledTargets
    : [];

  const disabledReasons = nightActionRequest?.roleId === 'hunter'
    ? nightActionRequest.disabledReasons
    : {};

  const getPlayerName = (seat: number) => {
    const p = players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  const handleConfirm = () => {
    if (selectedSeat === null) return;
    hunterGun(selectedSeat);
    setShowConfirm(false);
    setGunFired(true);
  };

  const handleSkipGun = () => {
    hunterGun(-1); // -1 表示不开枪
    setGunFired(true);
  };

  return (
    <div className="skill-panel p-4 space-y-3">
      <h3 className="text-lg font-bold text-red-400">🔫 猎人开枪</h3>
      <p className="text-sm text-gray-400">你已死亡，可以选择开枪带走一名玩家</p>

      {/* 倒计时（仅在有 nightActionRequest 时显示） */}
      {nightActionRequest?.roleId === 'hunter' && nightActionRequest.timeout > 0 && (
        <CountdownTimer seconds={nightActionRequest.timeout} />
      )}

      <TargetSelector
        targets={gunTargets}
        players={players}
        mySeat={myPlayer.seatNumber}
        selected={selectedSeat}
        onSelect={setSelectedSeat}
        disabledTargets={disabledTargets}
        disabledReasons={disabledReasons}
      />

      <div className="flex gap-2">
        <button
          className="btn-danger flex-1"
          onClick={() => setShowConfirm(true)}
          disabled={selectedSeat === null}
        >
          🔫 开枪
        </button>
        <button
          className="btn-secondary flex-1"
          onClick={handleSkipGun}
        >
          不开枪
        </button>
      </div>

      {/* 确认对话框 */}
      {showConfirm && selectedSeat !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card max-w-sm w-full mx-4 space-y-4 animate-fade-in-up">
            <div className="text-center text-4xl">🔫</div>
            <p className="text-center text-lg font-semibold text-red-400">
              确定要开枪带走 {selectedSeat}号 {getPlayerName(selectedSeat)} 吗？
            </p>
            <p className="text-center text-xs text-gray-500">
              开枪后不可撤回
            </p>
            <div className="flex gap-3">
              <button className="btn-danger flex-1" onClick={handleConfirm}>
                确认开枪
              </button>
              <button
                className="btn-secondary flex-1"
                onClick={() => setShowConfirm(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HunterGun;
