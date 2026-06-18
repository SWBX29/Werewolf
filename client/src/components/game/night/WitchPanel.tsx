import { useState, useEffect } from 'react';
import { useGameStore } from '../../../useGameStore';
import TargetSelector from '../TargetSelector';
import ConfirmDialog from '../ConfirmDialog';
import NightPanelLayout from '../NightPanelLayout';

type WitchStep = 'antidote' | 'poison' | 'done';

export default function WitchPanel() {
  const playerState = useGameStore((s) => s.playerState);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const submitNightAction = useGameStore((s) => s.submitNightAction);
  const setActionLocked = useGameStore((s) => s.setActionLocked);

  const nightActionRequest = playerState?.nightActionRequest;
  const players = playerState?.players ?? [];
  const myPlayer = players.find((p) => p.id === playerState?.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;

  const antidoteUsed = myPlayer?.witchAntidoteUsed ?? false;
  const poisonUsed = myPlayer?.witchPoisonUsed ?? false;

  // 读取配置：女巫同一晚能否同时使用解药和毒药
  const canUseBothPotions = playerState?.witchCanUseBothPotions ?? false;

  const [poisonTarget, setPoisonTarget] = useState<number | null>(null);
  const [useAntidote, setUseAntidote] = useState(false);
  const [step, setStep] = useState<WitchStep>('antidote');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Bug 2 修复：使用 useEffect 同步 step 状态，处理重连场景
  useEffect(() => {
    // 根据药水使用状态和当前步骤确定正确的步骤
    if (antidoteUsed && poisonUsed) {
      setStep('done');
    } else if (antidoteUsed && step === 'antidote') {
      setStep('poison');
    } else if (!antidoteUsed && step === 'done' && !poisonUsed) {
      // 重连时如果解药未用但步骤是 done，重置为 antidote
      setStep('antidote');
    }
  }, [antidoteUsed, poisonUsed]);

  if (!nightActionRequest) return null;

  const werewolfKillTarget = nightActionRequest.werewolfKillTarget;
  const guardProtectTarget = nightActionRequest.guardProtectTarget;

  // Bug 1 修复：正确判断女巫能否自救
  // 基于 ruleConfig.witchSaveSelf 规则和当前轮次判断
  const canSaveSelf = (() => {
    // 如果女巫不是被杀目标，自救问题不适用，返回 true（可以救别人）
    if (werewolfKillTarget !== mySeat) return true;
    // 女巫是被杀目标，检查自救规则
    const witchSaveSelfRule = nightActionRequest.witchSaveSelfRule ?? 'FIRST_NIGHT';
    const currentRound = playerState?.round ?? 1;
    switch (witchSaveSelfRule) {
      case 'NEVER':
        return false; // 永不允许自救
      case 'FIRST_NIGHT':
        return currentRound === 1; // 仅第一夜可自救
      case 'ALWAYS':
        return true; // 始终可自救
      default:
        return true;
    }
  })();

  const selfSaveDisabled = werewolfKillTarget === mySeat && !canSaveSelf;

  // 统一提交操作
  const handleSubmit = (antidote: boolean, poison: boolean, target: number | null) => {
    if (isActionLocked) return;
    submitNightAction('witch', null, {
      useAntidote: antidote,
      usePoison: poison,
      poisonTarget: target,
    });
    setActionLocked(true);
    setStep('done');
  };

  const handleUseAntidote = () => {
    if (werewolfKillTarget === null || isActionLocked) return;
    setUseAntidote(true);
    if (poisonUsed || !canUseBothPotions) {
      // 毒药已用 或 不允许同时用药，直接提交
      handleSubmit(true, false, null);
    } else {
      setStep('poison');
    }
  };

  const handleSkipAntidote = () => {
    if (isActionLocked) return;
    setUseAntidote(false);
    if (poisonUsed) {
      handleSubmit(false, false, null);
    } else {
      setStep('poison');
    }
  };

  const handleUsePoisonClick = () => {
    if (poisonTarget === null || isActionLocked) return;
    setConfirmOpen(true);
  };

  const handleUsePoisonConfirm = () => {
    if (poisonTarget === null || isActionLocked) return;
    if (!canUseBothPotions) {
      // 不允许同时用药，使用毒药则放弃解药
      handleSubmit(false, true, poisonTarget);
    } else {
      handleSubmit(useAntidote, true, poisonTarget);
    }
    setConfirmOpen(false);
  };

  const handleSkipPoison = () => {
    if (isActionLocked) return;
    handleSubmit(useAntidote, false, null);
  };

  return (
    <NightPanelLayout
      title="女巫 · 药剂"
      icon="🧪"
      theme="purple"
    >
      {/* 配置提示 */}
      {!canUseBothPotions && (
        <div className="text-xs text-gray-500 mb-2">本局不可同晚双药</div>
      )}

      <div className="mb-4 text-sm">
        {guardProtectTarget !== null ? (
          <span className="text-green-400">🛡️ 守卫守护了 {guardProtectTarget}号</span>
        ) : (
          <span className="text-gray-500">🛡️ 守护目标：未知</span>
        )}
      </div>

      {/* 解药区域 */}
      {!antidoteUsed && step === 'antidote' && (
        <div className="mb-4 p-3 rounded-lg bg-green-950/30 border border-green-800/40">
          <h3 className="text-sm font-semibold text-green-400 mb-2">💚 解药</h3>
          {werewolfKillTarget !== null ? (
            <>
              <p className="text-sm text-gray-300 mb-3">
                今晚被杀的是 <span className="text-white font-bold font-mono">{werewolfKillTarget}号</span> 玩家
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-primary bg-green-700 hover:bg-green-600 disabled:opacity-50"
                  disabled={isActionLocked || selfSaveDisabled}
                  onClick={handleUseAntidote}
                  title={selfSaveDisabled ? '当前规则不允许自救' : undefined}
                >
                  使用解药
                </button>
                <button
                  className="btn-secondary"
                  disabled={isActionLocked}
                  onClick={handleSkipAntidote}
                >
                  放弃解药
                </button>
              </div>
              {selfSaveDisabled && (
                <p className="text-xs text-red-400 mt-2">当前规则不允许自救</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-gray-300 mb-3">今晚无人被杀</p>
              <button
                className="btn-secondary"
                disabled={isActionLocked}
                onClick={handleSkipAntidote}
              >
                继续下一步
              </button>
            </>
          )}
        </div>
      )}

      {antidoteUsed && step === 'antidote' && (
        <div className="mb-4 text-sm text-gray-500">
          💚 解药已使用
        </div>
      )}

      {/* 已选择解药的提示 */}
      {useAntidote && step === 'poison' && (
        <div className="mb-4 text-sm text-green-400">
          ✓ 已选择使用解药
        </div>
      )}

      {/* 毒药区域 */}
      {!poisonUsed && step === 'poison' && (
        <div className="mb-4 p-3 rounded-lg bg-red-950/30 border border-red-800/40">
          <h3 className="text-sm font-semibold text-red-400 mb-2">☠️ 毒药</h3>
          {!canUseBothPotions && useAntidote && (
            <p className="text-xs text-yellow-400 mb-2">本局不可同晚双药，使用毒药将放弃解药</p>
          )}
          <p className="text-sm text-gray-300 mb-3">选择毒药目标：</p>
          <TargetSelector
            targets={nightActionRequest.availableTargets}
            players={players}
            mySeat={mySeat}
            selected={poisonTarget}
            onSelect={setPoisonTarget}
            disabledTargets={nightActionRequest.disabledTargets}
            disabledReasons={nightActionRequest.disabledReasons}
            allowSelf={false}
            disabled={isActionLocked}
          />
          <div className="flex gap-2 mt-3">
            <button
              className="btn-primary bg-red-700 hover:bg-red-600 disabled:opacity-50"
              disabled={poisonTarget === null || isActionLocked}
              onClick={handleUsePoisonClick}
            >
              使用毒药
            </button>
            <button
              className="btn-secondary"
              disabled={isActionLocked}
              onClick={handleSkipPoison}
            >
              放弃毒药
            </button>
          </div>
        </div>
      )}

      {antidoteUsed && poisonUsed && (
        <div className="text-sm text-gray-500">
          💚 解药已使用 · ☠️ 毒药已使用
        </div>
      )}

      {isActionLocked && (
        <div className="mt-3 text-sm text-indigo-400">✓ 操作已提交</div>
      )}

      {/* 毒药二次确认弹窗 */}
      <ConfirmDialog
        open={confirmOpen}
        title="确认使用毒药"
        message={`确定要对 ${poisonTarget}号 玩家使用毒药吗？此操作不可撤销。`}
        confirmLabel="使用毒药"
        confirmVariant="danger"
        onConfirm={handleUsePoisonConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </NightPanelLayout>
  );
}
