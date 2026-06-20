/**
 * ============================================================================
 * WolfKingGun — 狼王开枪技能组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 狼王死亡后触发的开枪技能面板，允许狼王选择带走一名玩家或放弃开枪
 *   2. 根据村规配置判断狼王是否可在被毒死或被骑士决斗时开枪
 *   3. 提供目标选择、确认弹窗和倒计时功能
 *
 * 设计原则：
 *   - 被毒死封枪：通过 ruleConfig.poisonBlockGun 控制是否封印
 *   - 骑士决斗规则：通过 ruleConfig.knightDuelWolfKing 控制决斗出局后是否可开枪
 *   - 一次性操作：开枪后设置 gunFired 标记，防止重复操作
 * ============================================================================
 */

import React, { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import type { KnightDuelWolfKingRule } from '@langrensha/shared';
import TargetSelector from '../TargetSelector';
import CountdownTimer from '../CountdownTimer';
import ConfirmDialog from '../ConfirmDialog';

/** 狼王开枪技能组件 */
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

  // 被毒死且规则封印枪 → 显示无法开枪提示
  const isPoisoned = myPlayer.deathCause === 'witch_poison';
  const poisonBlockGun = ruleConfig.poisonBlockGun;

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

  // 从 pendingDeathSkill 获取超时时间
  const pendingSkill = playerState.pendingDeathSkill;
  const skillTimeout = pendingSkill?.type === 'wolf_king_gun' ? pendingSkill.timeout : 0;

  const { players } = playerState;

  // 可开枪目标：所有存活玩家（排除自己）
  const gunTargets = players
    .filter((p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== myPlayer.seatNumber)
    .map((p) => p.seatNumber);

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
  const knightDuelWolfKing: KnightDuelWolfKingRule = ruleConfig.knightDuelWolfKing;
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

      {/* 倒计时 */}
      {skillTimeout > 0 && (
        <CountdownTimer seconds={skillTimeout} />
      )}

      <TargetSelector
        targets={gunTargets}
        players={players}
        mySeat={myPlayer.seatNumber}
        selected={selectedSeat}
        onSelect={setSelectedSeat}
        disabledTargets={[]}
        disabledReasons={{}}
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
