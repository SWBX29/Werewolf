import React, { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import type { KnightDuelWolfKingRule } from '@langrensha/shared';
import TargetSelector from '../TargetSelector';
import CountdownTimer from '../CountdownTimer';
import ConfirmDialog from '../ConfirmDialog';

const WolfKingGun: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const wolfKingGun = useGameStore((s) => s.wolfKingGun);

  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [gunFired, setGunFired] = useState(false);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.role !== 'wolf_king') return null;

  // 狼王必须已死亡才能开枪（被票出/被杀出局，非自爆）
  const isDead = myPlayer.status !== 'alive';
  if (!isDead) return null;

  // 已开枪则不再显示
  if (gunFired) return null;

  // Bug 8 修复：使用 deathCause 判断是否被毒死，而非 status
  // 服务端可能将所有死亡玩家状态设为 'dead'，需要通过 deathCause 区分死因
  const isPoisoned = myPlayer.deathCause === 'witch_poison';
  const poisonBlockGun = ruleConfig.poisonBlockGun;

  // 被毒死且规则封印枪 → 显示无法开枪提示
  if (isPoisoned && poisonBlockGun) {
    return (
      <div className="wolf-panel p-4 space-y-3">
        <h3 className="text-lg font-bold text-red-400">🐺 狼王开枪</h3>
        <div className="text-center space-y-2">
          <p className="text-red-300">你被毒死，无法开枪</p>
          <p className="text-xs text-gray-500">当前村规：被毒死时封印开枪技能</p>
        </div>
      </div>
    );
  }

  // 骑士决斗出狼王时，根据 knightDuelWolfKing 配置决定能否开枪
  const knightDuelWolfKing: KnightDuelWolfKingRule = ruleConfig.knightDuelWolfKing;

  // 判断是否因骑士决斗出局（通过死亡原因判断）
  // 如果是被骑士决斗出局且规则为 SILENCED，则无法开枪
  // 注意：PlayerDTO 中没有 deathCause 字段，所以这里通过 nightActionRequest 或其他方式判断
  // 实际上，服务端会在 nightActionRequest 中处理此逻辑
  // 如果服务端没有发送 nightActionRequest 给狼王，说明被决斗封印了

  const nightActionRequest = playerState.nightActionRequest;

  // 如果因骑士决斗被 SILENCED，服务端不会发送 nightActionRequest
  // 这里我们通过 knightDuelWolfKing 规则和当前状态来推断
  // 但更可靠的方式是：如果服务端认为狼王可以开枪，会发送相应的行动请求
  // 如果没有行动请求且狼王已死亡，可能是被决斗封印或其他原因

  const { players } = playerState;

  // 可开枪目标：所有存活玩家（排除自己）
  // 如果有 nightActionRequest 则使用其可用目标列表
  const gunTargets = nightActionRequest?.roleId === 'wolf_king'
    ? nightActionRequest.availableTargets
    : players
        .filter((p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== myPlayer.seatNumber)
        .map((p) => p.seatNumber);

  // 被禁用的目标
  const disabledTargets = nightActionRequest?.roleId === 'wolf_king'
    ? nightActionRequest.disabledTargets
    : [];

  const disabledReasons = nightActionRequest?.roleId === 'wolf_king'
    ? nightActionRequest.disabledReasons
    : {};

  const getPlayerName = (seat: number) => {
    const p = players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  const handleConfirm = () => {
    if (selectedSeat === null) return;
    wolfKingGun(selectedSeat);
    setShowConfirm(false);
    setGunFired(true);
  };

  const handleSkipGun = () => {
    wolfKingGun(-1); // -1 表示不开枪
    setGunFired(true);
  };

  // 规则说明
  const getRuleHint = () => {
    if (knightDuelWolfKing === 'SILENCED') {
      return '当前村规：被骑士决斗出局时不可开枪';
    }
    return '当前村规：被骑士决斗出局时可以开枪';
  };

  return (
    <div className="wolf-panel p-4 space-y-3">
      <h3 className="text-lg font-bold text-red-400">🐺 狼王开枪</h3>
      <p className="text-sm text-gray-400">你已出局，可以选择开枪带走一名玩家</p>
      <p className="text-xs text-gray-500">{getRuleHint()}</p>

      {/* 倒计时（仅在有 nightActionRequest 时显示） */}
      {nightActionRequest?.roleId === 'wolf_king' && nightActionRequest.timeout > 0 && (
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
          🐺 开枪
        </button>
        <button
          className="btn-secondary flex-1"
          onClick={handleSkipGun}
        >
          不开枪
        </button>
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog
        open={showConfirm && selectedSeat !== null}
        icon="🐺"
        title="狼王开枪"
        message={`确定要开枪带走 ${selectedSeat}号 ${getPlayerName(selectedSeat!)} 吗？`}
        confirmLabel="确认开枪"
        confirmVariant="danger"
        hints={[{ text: '开枪后不可撤回', type: 'info' }]}
        zIndex={50}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
};

export default WolfKingGun;
