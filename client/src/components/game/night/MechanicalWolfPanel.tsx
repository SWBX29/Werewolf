import { useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import type { RoleId } from '@langrensha/shared';
import TargetSelector from '../TargetSelector';
import ConfirmDialog from '../ConfirmDialog';

/**
 * 机械狼行动面板 — 模仿选择 / 模仿技能使用
 */
export default function MechanicalWolfPanel() {
  const playerState = useGameStore((s) => s.playerState);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const submitNightAction = useGameStore((s) => s.submitNightAction);
  const setActionLocked = useGameStore((s) => s.setActionLocked);

  const nightActionRequest = playerState?.nightActionRequest;
  const players = playerState?.players ?? [];
  const myPlayer = players.find((p) => p.id === playerState?.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;

  const mechPhase = myPlayer?.mechanicalWolfPhase;
  const imitatedRole = myPlayer?.mechanicalWolfImitatedRole;
  const skillDeferred = myPlayer?.mechanicalWolfSkillDeferred ?? false;

  const [selected, setSelected] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  if (!nightActionRequest) return null;

  // 技能被封印
  if (skillDeferred) {
    return (
      <div className="mech-panel text-center py-8">
        <div className="text-4xl mb-4">🔒</div>
        <p className="text-cyan-400 text-lg">你的技能被黑暗力量封印</p>
        <p className="text-sm text-gray-500 mt-2">本夜无法使用任何技能</p>
      </div>
    );
  }

  // ---- 模仿失败 ----
  if (mechPhase === 'failed') {
    return (
      <div className="mech-panel text-center py-8">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-gray-400 text-lg">模仿失败，你没有获得任何技能</p>
      </div>
    );
  }

  // ---- 静默状态 ----
  if (mechPhase === 'silent') {
    return (
      <div className="mech-panel text-center py-8">
        <div className="text-4xl mb-4">🔇</div>
        <p className="text-gray-400 text-lg">静默状态</p>
      </div>
    );
  }

  // ---- 选择模仿目标（首夜） ----
  if (mechPhase === 'selecting') {
    const handleConfirmClick = () => {
      if (selected === null || isActionLocked) return;
      setConfirmAction(() => () => {
        submitNightAction('mechanical_wolf', selected, { imitateTarget: selected });
        setActionLocked(true);
      });
      setConfirmOpen(true);
    };

    return (
      <div className="mech-panel">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-cyan-300">
            ⚙️ 机械狼 · 模仿
          </h2>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          选择一名玩家作为模仿目标。今晚仅锁定目标，明晚得知模仿结果。
        </p>

        <TargetSelector
          targets={nightActionRequest.availableTargets}
          players={players}
          mySeat={mySeat}
          selected={selected}
          onSelect={setSelected}
          disabledTargets={nightActionRequest.disabledTargets}
          disabledReasons={nightActionRequest.disabledReasons}
          allowSelf={false}
          disabled={isActionLocked}
        />

        <div className="mt-4 flex justify-end">
          <button
            className="btn-primary bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50"
            disabled={selected === null || isActionLocked}
            onClick={handleConfirmClick}
          >
            {isActionLocked ? '已确认' : '确认模仿'}
          </button>
        </div>

        {/* 二次确认弹窗 */}
        <ConfirmDialog
          open={confirmOpen}
          title="确认操作"
          message={`确定要对 ${selected}号 玩家执行此操作吗？`}
          confirmLabel="确认"
          onConfirm={() => {
            confirmAction?.();
            setConfirmOpen(false);
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    );
  }

  // ---- 已获得模仿技能（active） ----
  if (mechPhase === 'active' && imitatedRole) {
    const imitatedRoleName = ROLE_META[imitatedRole as RoleId]?.name ?? imitatedRole;

    // 模仿猎人/狼王：仅展示提示
    if (imitatedRole === 'hunter' || imitatedRole === 'wolf_king') {
      return (
        <div className="mech-panel text-center py-8">
          <div className="text-4xl mb-4">⚙️</div>
          <p className="text-cyan-300 text-lg mb-2">
            你模仿了 <span className="font-bold">{imitatedRoleName}</span>
          </p>
          <p className="text-sm text-gray-400">
            模仿成功，死亡时将触发开枪效果
          </p>
        </div>
      );
    }

    // 模仿预言家/女巫/守卫：展示对应技能面板
    const handleSkillConfirmClick = () => {
      if (selected === null || isActionLocked) return;
      setConfirmAction(() => () => {
        submitNightAction('mechanical_wolf', selected, { imitateSkillTarget: selected });
        setActionLocked(true);
      });
      setConfirmOpen(true);
    };

    // 根据模仿角色显示不同的面板样式和提示
    const panelConfig: Record<string, { icon: string; action: string; color: string; hint: string }> = {
      seer: {
        icon: '👁️',
        action: '查验',
        color: 'text-blue-300',
        hint: '选择一名玩家查验其阵营',
      },
      witch: {
        icon: '🧪',
        action: '使用药剂',
        color: 'text-purple-300',
        hint: '选择毒药目标',
      },
      guard: {
        icon: '🛡️',
        action: '守护',
        color: 'text-green-300',
        hint: '选择今晚守护的玩家',
      },
    };

    const config = panelConfig[imitatedRole] ?? {
      icon: '⚙️',
      action: '使用技能',
      color: 'text-cyan-300',
      hint: '选择技能目标',
    };

    return (
      <div className="mech-panel">
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-bold ${config.color}`}>
            ⚙️ 机械狼 · {imitatedRoleName}
          </h2>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          你模仿了 <span className="font-bold text-cyan-300">{imitatedRoleName}</span> 的技能。{config.hint}。
        </p>

        <TargetSelector
          targets={nightActionRequest.availableTargets}
          players={players}
          mySeat={mySeat}
          selected={selected}
          onSelect={setSelected}
          disabledTargets={nightActionRequest.disabledTargets}
          disabledReasons={nightActionRequest.disabledReasons}
          allowSelf={imitatedRole === 'guard'}
          disabled={isActionLocked}
        />

        <div className="mt-4 flex justify-end">
          <button
            className="btn-primary bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50"
            disabled={selected === null || isActionLocked}
            onClick={handleSkillConfirmClick}
          >
            {isActionLocked ? '已确认' : `确认${config.action}`}
          </button>
        </div>

        {/* 二次确认弹窗 */}
        <ConfirmDialog
          open={confirmOpen}
          title="确认操作"
          message={`确定要对 ${selected}号 玩家执行此操作吗？`}
          confirmLabel="确认"
          onConfirm={() => {
            confirmAction?.();
            setConfirmOpen(false);
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    );
  }

  // ---- learning 阶段（得知模仿结果） ----
  if (mechPhase === 'learning') {
    const imitatedRoleName = imitatedRole
      ? ROLE_META[imitatedRole as RoleId]?.name ?? imitatedRole
      : '未知';

    return (
      <div className="mech-panel text-center py-8">
        <div className="text-4xl mb-4 animate-fade-in-up">⚙️</div>
        <p className="text-cyan-300 text-lg mb-2">
          你模仿了 <span className="font-bold">{imitatedRoleName}</span>
        </p>
        <p className="text-sm text-gray-400">下一夜可以使用模仿技能</p>
      </div>
    );
  }

  // 兜底
  return null;
}
