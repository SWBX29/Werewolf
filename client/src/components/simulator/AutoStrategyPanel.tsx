import { useState, useCallback } from 'react';
import { useSimulatorStore } from './useSimulatorStore';
import type { AutoStrategies } from './types';

// ============================================================================
// 角色策略配置标签映射
// ============================================================================

const ROLE_LABELS: Record<string, string> = {
  seer: '预言家',
  witch: '女巫',
  guard: '守卫',
  werewolf: '狼人',
  nightmare: '噩梦之影',
  mechanicalWolf: '机械狼',
  vote: '投票',
  hunterGun: '猎人开枪',
  wolfKingGun: '狼王开枪',
  whiteWolfExplode: '白狼王自爆',
  knightDuel: '骑士决斗',
};

const ROLE_ICONS: Record<string, string> = {
  seer: '🔮',
  witch: '🧪',
  guard: '🛡️',
  werewolf: '🐺',
  nightmare: '👻',
  mechanicalWolf: '🤖',
  vote: '🗳️',
  hunterGun: '🔫',
  wolfKingGun: '💀',
  whiteWolfExplode: '💥',
  knightDuel: '⚔️',
};

const AUTO_MODE_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'suggest', label: '仅建议' },
  { value: 'auto', label: '自动执行' },
] as const;

const SEER_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'suspicious_first', label: '可疑优先' },
  { value: 'custom_list', label: '自定义列表' },
] as const;

const WITCH_POISON_PRIORITY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'evil_first', label: '邪恶优先' },
  { value: 'custom', label: '自定义' },
] as const;

const GUARD_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'protect_gods', label: '守神优先' },
  { value: 'custom_list', label: '自定义列表' },
] as const;

const WEREWOLF_KILL_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'kill_gods_first', label: '杀神优先' },
  { value: 'custom', label: '自定义' },
] as const;

const NIGHTMARE_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'block_gods', label: '封神优先' },
  { value: 'custom_list', label: '自定义列表' },
] as const;

const MECHANICAL_WOLF_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'custom', label: '自定义' },
] as const;

const VOTE_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'follow_majority', label: '跟随多数' },
  { value: 'custom', label: '自定义' },
] as const;

const HUNTER_GUN_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'shoot_evil', label: '射邪恶' },
  { value: 'custom', label: '自定义' },
] as const;

const WOLF_KING_GUN_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'shoot_good', label: '射好人' },
  { value: 'custom', label: '自定义' },
] as const;

const WHITE_WOLF_TARGET_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'custom', label: '自定义' },
] as const;

const KNIGHT_TARGET_STRATEGY_OPTIONS = [
  { value: 'random', label: '随机' },
  { value: 'suspicious', label: '可疑优先' },
  { value: 'custom', label: '自定义' },
] as const;

// ============================================================================
// 辅助组件
// ============================================================================

function SmallSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-6 rounded border border-gray-600 bg-gray-800 px-1 text-xs text-gray-200 outline-none focus:border-blue-500"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SmallToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1 text-xs text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0"
      />
      {label}
    </label>
  );
}

function SmallInput({
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className="h-6 w-full rounded border border-gray-600 bg-gray-800 px-1.5 text-xs text-gray-200 outline-none placeholder:text-gray-500 focus:border-blue-500"
    />
  );
}

function parseNumbers(text: string): number[] {
  return text
    .split(/[,，\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

function numbersToString(nums: number[] | undefined): string {
  if (!nums || nums.length === 0) return '';
  return nums.join(', ');
}

// ============================================================================
// 可折叠区块
// ============================================================================

function CollapsibleSection({
  id,
  title,
  icon,
  openSections,
  toggleSection,
  children,
}: {
  id: string;
  title: string;
  icon: string;
  openSections: Set<string>;
  toggleSection: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = openSections.has(id);
  return (
    <div className="border-t border-gray-700">
      <button
        onClick={() => toggleSection(id)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium text-gray-300 hover:bg-gray-750"
      >
        <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
        <span>{icon}</span>
        <span>{title}</span>
      </button>
      {isOpen && <div className="space-y-1.5 px-3 pb-2">{children}</div>}
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function AutoStrategyPanel() {
  const autoMode = useSimulatorStore((s) => s.autoMode);
  const autoStrategies = useSimulatorStore((s) => s.autoStrategies);
  const setAutoMode = useSimulatorStore((s) => s.setAutoMode);
  const setAutoStrategy = useSimulatorStore((s) => s.setAutoStrategy);
  const executeAllSuggested = useSimulatorStore((s) => s.executeAllSuggested);

  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(true);

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateStrategy = useCallback(
    (roleId: string, partial: Record<string, unknown>) => {
      setAutoStrategy(roleId, partial);
    },
    [setAutoStrategy],
  );

  // ---- 自定义目标输入的本地状态（受控 + onBlur 同步到 store）----
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const getCustomInput = (key: string, nums?: number[]): string => {
    if (customInputs[key] !== undefined) return customInputs[key];
    return numbersToString(nums);
  };

  const handleCustomBlur = useCallback(
    (key: string, roleId: string, field: string, text: string) => {
      const nums = parseNumbers(text);
      updateStrategy(roleId, { [field]: nums.length > 0 ? nums : undefined });
      setCustomInputs((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [updateStrategy],
  );

  const handleCustomChange = useCallback((key: string, value: string) => {
    setCustomInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 text-xs">
      {/* ---- 面板头部 ---- */}
      <button
        onClick={() => setPanelOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
      >
        <span className="flex items-center gap-1.5">
          <span className={`transition-transform ${panelOpen ? 'rotate-90' : ''}`}>▶</span>
          🤖 自动策略
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            autoMode === 'auto'
              ? 'bg-green-900 text-green-300'
              : autoMode === 'suggest'
                ? 'bg-yellow-900 text-yellow-300'
                : 'bg-gray-700 text-gray-400'
          }`}
        >
          {autoMode === 'auto' ? '自动' : autoMode === 'suggest' ? '建议' : '关闭'}
        </span>
      </button>

      {panelOpen && (
        <div className="border-t border-gray-700">
          {/* ---- 全局控制 ---- */}
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="shrink-0 text-gray-400">模式:</span>
            <SmallSelect
              value={autoMode}
              options={AUTO_MODE_OPTIONS}
              onChange={(v) => setAutoMode(v as AutoStrategies['mode'])}
            />
            <button
              onClick={executeAllSuggested}
              className="ml-auto shrink-0 rounded bg-blue-700 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-600 disabled:opacity-40"
              disabled={autoMode === 'off'}
            >
              执行所有建议
            </button>
          </div>

          {/* ---- 角色策略区块 ---- */}
          <div className="max-h-80 overflow-y-auto">
            {/* 预言家 */}
            <CollapsibleSection
              id="seer"
              title={ROLE_LABELS.seer}
              icon={ROLE_ICONS.seer}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-gray-400">策略:</span>
                <SmallSelect
                  value={autoStrategies.seer.strategy}
                  options={SEER_STRATEGY_OPTIONS}
                  onChange={(v) => updateStrategy('seer', { strategy: v })}
                />
              </div>
              {autoStrategies.seer.strategy === 'custom_list' && (
                <SmallInput
                  value={getCustomInput('seer_custom', autoStrategies.seer.customTargets)}
                  onChange={(v) => handleCustomChange('seer_custom', v)}
                  onBlur={() =>
                    handleCustomBlur(
                      'seer_custom',
                      'seer',
                      'customTargets',
                      getCustomInput('seer_custom', autoStrategies.seer.customTargets),
                    )
                  }
                  placeholder="座位号, 如: 1, 3, 5"
                />
              )}
            </CollapsibleSection>

            {/* 女巫 */}
            <CollapsibleSection
              id="witch"
              title={ROLE_LABELS.witch}
              icon={ROLE_ICONS.witch}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <div className="flex items-center gap-3">
                <SmallToggle
                  checked={autoStrategies.witch.autoSave}
                  onChange={(v) => updateStrategy('witch', { autoSave: v })}
                  label="自动救人"
                />
                <SmallToggle
                  checked={autoStrategies.witch.autoPoison}
                  onChange={(v) => updateStrategy('witch', { autoPoison: v })}
                  label="自动毒人"
                />
              </div>
              {autoStrategies.witch.autoPoison && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-gray-400">毒人优先:</span>
                    <SmallSelect
                      value={autoStrategies.witch.poisonPriority}
                      options={WITCH_POISON_PRIORITY_OPTIONS}
                      onChange={(v) => updateStrategy('witch', { poisonPriority: v })}
                    />
                  </div>
                  {autoStrategies.witch.poisonPriority === 'custom' && (
                    <SmallInput
                      value={getCustomInput('witch_custom', autoStrategies.witch.customPoisonTargets)}
                      onChange={(v) => handleCustomChange('witch_custom', v)}
                      onBlur={() =>
                        handleCustomBlur(
                          'witch_custom',
                          'witch',
                          'customPoisonTargets',
                          getCustomInput('witch_custom', autoStrategies.witch.customPoisonTargets),
                        )
                      }
                      placeholder="座位号, 如: 2, 4"
                    />
                  )}
                </>
              )}
            </CollapsibleSection>

            {/* 守卫 */}
            <CollapsibleSection
              id="guard"
              title={ROLE_LABELS.guard}
              icon={ROLE_ICONS.guard}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-gray-400">策略:</span>
                <SmallSelect
                  value={autoStrategies.guard.strategy}
                  options={GUARD_STRATEGY_OPTIONS}
                  onChange={(v) => updateStrategy('guard', { strategy: v })}
                />
              </div>
              {autoStrategies.guard.strategy === 'custom_list' && (
                <SmallInput
                  value={getCustomInput('guard_custom', autoStrategies.guard.customTargets)}
                  onChange={(v) => handleCustomChange('guard_custom', v)}
                  onBlur={() =>
                    handleCustomBlur(
                      'guard_custom',
                      'guard',
                      'customTargets',
                      getCustomInput('guard_custom', autoStrategies.guard.customTargets),
                    )
                  }
                  placeholder="座位号, 如: 1, 6"
                />
              )}
            </CollapsibleSection>

            {/* 狼人 */}
            <CollapsibleSection
              id="werewolf"
              title={ROLE_LABELS.werewolf}
              icon={ROLE_ICONS.werewolf}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-gray-400">击杀:</span>
                <SmallSelect
                  value={autoStrategies.werewolf.killStrategy}
                  options={WEREWOLF_KILL_STRATEGY_OPTIONS}
                  onChange={(v) => updateStrategy('werewolf', { killStrategy: v })}
                />
              </div>
              {autoStrategies.werewolf.killStrategy === 'custom' && (
                <SmallInput
                  value={getCustomInput('werewolf_custom', autoStrategies.werewolf.customTarget ? [autoStrategies.werewolf.customTarget] : undefined)}
                  onChange={(v) => handleCustomChange('werewolf_custom', v)}
                  onBlur={() => {
                    const nums = parseNumbers(
                      getCustomInput('werewolf_custom', autoStrategies.werewolf.customTarget ? [autoStrategies.werewolf.customTarget] : undefined),
                    );
                    updateStrategy('werewolf', { customTarget: nums[0] });
                    setCustomInputs((prev) => {
                      const next = { ...prev };
                      delete next['werewolf_custom'];
                      return next;
                    });
                  }}
                  placeholder="座位号, 如: 3"
                />
              )}
            </CollapsibleSection>

            {/* 噩梦之影 */}
            <CollapsibleSection
              id="nightmare"
              title={ROLE_LABELS.nightmare}
              icon={ROLE_ICONS.nightmare}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-gray-400">策略:</span>
                <SmallSelect
                  value={autoStrategies.nightmare.strategy}
                  options={NIGHTMARE_STRATEGY_OPTIONS}
                  onChange={(v) => updateStrategy('nightmare', { strategy: v })}
                />
              </div>
              {autoStrategies.nightmare.strategy === 'custom_list' && (
                <SmallInput
                  value={getCustomInput('nightmare_custom', autoStrategies.nightmare.customTargets)}
                  onChange={(v) => handleCustomChange('nightmare_custom', v)}
                  onBlur={() =>
                    handleCustomBlur(
                      'nightmare_custom',
                      'nightmare',
                      'customTargets',
                      getCustomInput('nightmare_custom', autoStrategies.nightmare.customTargets),
                    )
                  }
                  placeholder="座位号, 如: 1, 5"
                />
              )}
            </CollapsibleSection>

            {/* 机械狼 */}
            <CollapsibleSection
              id="mechanicalWolf"
              title={ROLE_LABELS.mechanicalWolf}
              icon={ROLE_ICONS.mechanicalWolf}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-gray-400">模仿:</span>
                <SmallSelect
                  value={autoStrategies.mechanicalWolf.imitateStrategy}
                  options={MECHANICAL_WOLF_STRATEGY_OPTIONS}
                  onChange={(v) => updateStrategy('mechanicalWolf', { imitateStrategy: v })}
                />
              </div>
              {autoStrategies.mechanicalWolf.imitateStrategy === 'custom' && (
                <SmallInput
                  value={getCustomInput('mewolf_custom', autoStrategies.mechanicalWolf.customTarget ? [autoStrategies.mechanicalWolf.customTarget] : undefined)}
                  onChange={(v) => handleCustomChange('mewolf_custom', v)}
                  onBlur={() => {
                    const nums = parseNumbers(
                      getCustomInput('mewolf_custom', autoStrategies.mechanicalWolf.customTarget ? [autoStrategies.mechanicalWolf.customTarget] : undefined),
                    );
                    updateStrategy('mechanicalWolf', { customTarget: nums[0] });
                    setCustomInputs((prev) => {
                      const next = { ...prev };
                      delete next['mewolf_custom'];
                      return next;
                    });
                  }}
                  placeholder="座位号, 如: 7"
                />
              )}
            </CollapsibleSection>

            {/* 投票 */}
            <CollapsibleSection
              id="vote"
              title={ROLE_LABELS.vote}
              icon={ROLE_ICONS.vote}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-gray-400">策略:</span>
                <SmallSelect
                  value={autoStrategies.vote.strategy}
                  options={VOTE_STRATEGY_OPTIONS}
                  onChange={(v) => updateStrategy('vote', { strategy: v })}
                />
              </div>
              {autoStrategies.vote.strategy === 'custom' && (
                <SmallInput
                  value={getCustomInput('vote_custom', autoStrategies.vote.customTarget ? [autoStrategies.vote.customTarget] : undefined)}
                  onChange={(v) => handleCustomChange('vote_custom', v)}
                  onBlur={() => {
                    const nums = parseNumbers(
                      getCustomInput('vote_custom', autoStrategies.vote.customTarget ? [autoStrategies.vote.customTarget] : undefined),
                    );
                    updateStrategy('vote', { customTarget: nums[0] });
                    setCustomInputs((prev) => {
                      const next = { ...prev };
                      delete next['vote_custom'];
                      return next;
                    });
                  }}
                  placeholder="座位号, 如: 4"
                />
              )}
            </CollapsibleSection>

            {/* 猎人开枪 */}
            <CollapsibleSection
              id="hunterGun"
              title={ROLE_LABELS.hunterGun}
              icon={ROLE_ICONS.hunterGun}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-gray-400">策略:</span>
                <SmallSelect
                  value={autoStrategies.hunterGun.strategy}
                  options={HUNTER_GUN_STRATEGY_OPTIONS}
                  onChange={(v) => updateStrategy('hunterGun', { strategy: v })}
                />
              </div>
              {autoStrategies.hunterGun.strategy === 'custom' && (
                <SmallInput
                  value={getCustomInput('hunter_custom', autoStrategies.hunterGun.customTarget ? [autoStrategies.hunterGun.customTarget] : undefined)}
                  onChange={(v) => handleCustomChange('hunter_custom', v)}
                  onBlur={() => {
                    const nums = parseNumbers(
                      getCustomInput('hunter_custom', autoStrategies.hunterGun.customTarget ? [autoStrategies.hunterGun.customTarget] : undefined),
                    );
                    updateStrategy('hunterGun', { customTarget: nums[0] });
                    setCustomInputs((prev) => {
                      const next = { ...prev };
                      delete next['hunter_custom'];
                      return next;
                    });
                  }}
                  placeholder="座位号, 如: 5"
                />
              )}
            </CollapsibleSection>

            {/* 狼王开枪 */}
            <CollapsibleSection
              id="wolfKingGun"
              title={ROLE_LABELS.wolfKingGun}
              icon={ROLE_ICONS.wolfKingGun}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-gray-400">策略:</span>
                <SmallSelect
                  value={autoStrategies.wolfKingGun.strategy}
                  options={WOLF_KING_GUN_STRATEGY_OPTIONS}
                  onChange={(v) => updateStrategy('wolfKingGun', { strategy: v })}
                />
              </div>
              {autoStrategies.wolfKingGun.strategy === 'custom' && (
                <SmallInput
                  value={getCustomInput('wkgun_custom', autoStrategies.wolfKingGun.customTarget ? [autoStrategies.wolfKingGun.customTarget] : undefined)}
                  onChange={(v) => handleCustomChange('wkgun_custom', v)}
                  onBlur={() => {
                    const nums = parseNumbers(
                      getCustomInput('wkgun_custom', autoStrategies.wolfKingGun.customTarget ? [autoStrategies.wolfKingGun.customTarget] : undefined),
                    );
                    updateStrategy('wolfKingGun', { customTarget: nums[0] });
                    setCustomInputs((prev) => {
                      const next = { ...prev };
                      delete next['wkgun_custom'];
                      return next;
                    });
                  }}
                  placeholder="座位号, 如: 2"
                />
              )}
            </CollapsibleSection>

            {/* 白狼王自爆 */}
            <CollapsibleSection
              id="whiteWolfExplode"
              title={ROLE_LABELS.whiteWolfExplode}
              icon={ROLE_ICONS.whiteWolfExplode}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <SmallToggle
                checked={autoStrategies.whiteWolfExplode.enabled}
                onChange={(v) => updateStrategy('whiteWolfExplode', { enabled: v })}
                label="启用自爆"
              />
              {autoStrategies.whiteWolfExplode.enabled && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-gray-400">目标:</span>
                    <SmallSelect
                      value={autoStrategies.whiteWolfExplode.targetStrategy}
                      options={WHITE_WOLF_TARGET_STRATEGY_OPTIONS}
                      onChange={(v) => updateStrategy('whiteWolfExplode', { targetStrategy: v })}
                    />
                  </div>
                  {autoStrategies.whiteWolfExplode.targetStrategy === 'custom' && (
                    <SmallInput
                      value={getCustomInput('wwexp_custom', autoStrategies.whiteWolfExplode.customTarget ? [autoStrategies.whiteWolfExplode.customTarget] : undefined)}
                      onChange={(v) => handleCustomChange('wwexp_custom', v)}
                      onBlur={() => {
                        const nums = parseNumbers(
                          getCustomInput('wwexp_custom', autoStrategies.whiteWolfExplode.customTarget ? [autoStrategies.whiteWolfExplode.customTarget] : undefined),
                        );
                        updateStrategy('whiteWolfExplode', { customTarget: nums[0] });
                        setCustomInputs((prev) => {
                          const next = { ...prev };
                          delete next['wwexp_custom'];
                          return next;
                        });
                      }}
                      placeholder="座位号, 如: 1"
                    />
                  )}
                </>
              )}
            </CollapsibleSection>

            {/* 骑士决斗 */}
            <CollapsibleSection
              id="knightDuel"
              title={ROLE_LABELS.knightDuel}
              icon={ROLE_ICONS.knightDuel}
              openSections={openSections}
              toggleSection={toggleSection}
            >
              <SmallToggle
                checked={autoStrategies.knightDuel.enabled}
                onChange={(v) => updateStrategy('knightDuel', { enabled: v })}
                label="启用决斗"
              />
              {autoStrategies.knightDuel.enabled && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-gray-400">目标:</span>
                    <SmallSelect
                      value={autoStrategies.knightDuel.targetStrategy}
                      options={KNIGHT_TARGET_STRATEGY_OPTIONS}
                      onChange={(v) => updateStrategy('knightDuel', { targetStrategy: v })}
                    />
                  </div>
                  {autoStrategies.knightDuel.targetStrategy === 'custom' && (
                    <SmallInput
                      value={getCustomInput('knight_custom', autoStrategies.knightDuel.customTarget ? [autoStrategies.knightDuel.customTarget] : undefined)}
                      onChange={(v) => handleCustomChange('knight_custom', v)}
                      onBlur={() => {
                        const nums = parseNumbers(
                          getCustomInput('knight_custom', autoStrategies.knightDuel.customTarget ? [autoStrategies.knightDuel.customTarget] : undefined),
                        );
                        updateStrategy('knightDuel', { customTarget: nums[0] });
                        setCustomInputs((prev) => {
                          const next = { ...prev };
                          delete next['knight_custom'];
                          return next;
                        });
                      }}
                      placeholder="座位号, 如: 6"
                    />
                  )}
                </>
              )}
            </CollapsibleSection>
          </div>
        </div>
      )}
    </div>
  );
}
