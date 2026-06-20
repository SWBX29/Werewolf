/**
 * ============================================================================
 * HunterGun — 猎人开枪技能组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 猎人死亡后触发的开枪技能面板，允许猎人选择带走一名玩家或放弃开枪
 *   2. 根据村规配置判断猎人是否可在特定死因下开枪
 *   3. 提供目标选择、确认弹窗和倒计时功能
 *
 * 设计原则：
 *   - 死因可配置：通过 ruleConfig.hunterDeathShootCauses 控制允许开枪的死因
 *   - 一次性操作：开枪后设置 gunFired 标记，防止重复操作
 *   - 安全确认：开枪前弹出确认对话框，避免误操作
 * ============================================================================
 */

import React, { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import type { DeathCause, HunterDeathShootCause } from '@langrensha/shared';
import { HUNTER_DEATH_SHOOT_CAUSE_NAMES } from '@langrensha/shared';
import TargetSelector from '../TargetSelector';
import CountdownTimer from '../CountdownTimer';
import ConfirmDialog from '../ConfirmDialog';

/**
 * 猎人开枪技能组件
 *
 * 当猎人玩家死亡时渲染开枪操作面板，支持选择目标玩家开枪或放弃开枪。
 * 根据村规配置判断当前死因是否允许开枪，不允许时显示提示信息。
 */
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

  // ============ 死因开枪权限检查 ============

  // 根据村规配置判断当前死因是否允许开枪
  const deathCause = myPlayer.deathCause;
  const configurableCauses: DeathCause[] = ['witch_poison', 'werewolf_kill', 'vote_out'];
  const isConfigurable = deathCause ? configurableCauses.includes(deathCause) : false;
  const canShoot = !isConfigurable || (deathCause !== null && ruleConfig.hunterDeathShootCauses.includes(deathCause as HunterDeathShootCause));

  if (!canShoot) {
    const blockedCauseName = deathCause ? HUNTER_DEATH_SHOOT_CAUSE_NAMES[deathCause as HunterDeathShootCause] ?? '当前死因' : '当前死因';
    return (
      <div className="skill-panel p-4 space-y-3">
        <h3 className="text-lg font-bold text-red-400">🔫 猎人开枪</h3>
        <div className="text-center space-y-2">
          <p className="text-red-300">你无法开枪</p>
          <p className="text-xs text-gray-500">当前村规：被{blockedCauseName}时不可开枪</p>
        </div>
      </div>
    );
  }

  // ============ 超时与目标计算 ============

  // 从 pendingDeathSkill 获取技能操作超时时间
  const pendingSkill = playerState.pendingDeathSkill;
  const skillTimeout = pendingSkill?.type === 'hunter_gun' ? pendingSkill.timeout : 0;

  const { players } = playerState;

  // 可开枪目标：所有存活玩家（排除自己）
  const gunTargets = players
    .filter((p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== myPlayer.seatNumber)
    .map((p) => p.seatNumber);

  /** 根据座位号获取玩家昵称 */
  const getPlayerName = (seat: number) => {
    const p = players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  // ============ 操作处理 ============

  /** 确认开枪：向服务端发送开枪请求并更新本地状态 */
  const handleConfirm = () => {
    if (selectedSeat === null || gunFired) return;
    hunterGun(selectedSeat);
    setShowConfirm(false);
    setGunFired(true);
  };

  /** 放弃开枪：传入 -1 表示不开枪 */
  const handleSkipGun = () => {
    if (gunFired) return;
    hunterGun(-1);
    setGunFired(true);
  };

  // ============ 渲染 ============

  return (
    <div className="skill-panel p-4 space-y-3">
      <h3 className="text-lg font-bold text-red-400">🔫 猎人开枪</h3>
      <p className="text-sm text-gray-400">你已死亡，可以选择开枪带走一名玩家</p>

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
      <ConfirmDialog
        open={showConfirm && selectedSeat !== null}
        icon="🔫"
        title="猎人开枪"
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

export default HunterGun;
