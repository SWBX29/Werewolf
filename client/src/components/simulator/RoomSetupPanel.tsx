/**
 * ============================================================================
 * RoomSetupPanel — 模拟器房间配置面板
 * ============================================================================
 *
 * 架构说明：
 *   1. 法官昵称输入
 *   2. 游戏模式选择（上帝法官 / 系统跑团）
 *   3. 村规配置（复用 RoomConfigPanel）
 *   4. 模拟玩家名称列表（增删改，数量需匹配角色总人数）
 *   5. 创建房间并批量添加玩家
 *
 * 设计原则：
 *   - 复用主程序的 RoomConfigPanel，确保与真实界面完全一致
 *   - 强制 enableVoice = false（模拟器不需要语音）
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useSimulatorStore } from './useSimulatorStore';
import { DEFAULT_PLAYER_NAMES } from './constants';
import RoomConfigPanel, { ROLE_ITEMS } from '../RoomConfigPanel';
import type { RoleId, RuleConfig, GameMode, NightActionOrderPreset } from '@langrensha/shared';
import { NIGHT_ACTION_ORDER_PRESETS, createDefaultRuleConfig } from '@langrensha/shared';

/** 模拟器房间配置面板，配置法官、村规和模拟玩家后创建房间 */

const RoomSetupPanel: React.FC = () => {
  // ---- 本地状态 ----
  const [judgeNickname, setJudgeNickname] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('HUMAN');
  const [ruleConfig, setRuleConfig] = useState<RuleConfig>(() => {
    const cfg = createDefaultRuleConfig();
    cfg.enableVoice = false; // 模拟器强制关闭语音
    return cfg;
  });
  const [playerNames, setPlayerNames] = useState<string[]>(() =>
    DEFAULT_PLAYER_NAMES.slice(0, 12),
  );

  // ---- Zustand store ----
  const { createRoom, addPlayer, error } = useSimulatorStore();

  // ---- 同步玩家数量与角色总人数 ----
  useEffect(() => {
    const targetCount = ruleConfig.playerCount;
    setPlayerNames((prev) => {
      if (prev.length === targetCount) return prev;
      if (prev.length < targetCount) {
        // 补充默认名称
        const extra: string[] = [];
        for (let i = prev.length; i < targetCount; i++) {
          extra.push(DEFAULT_PLAYER_NAMES[i] ?? `模拟${i + 1}号`);
        }
        return [...prev, ...extra];
      }
      // 裁剪多余
      return prev.slice(0, targetCount);
    });
  }, [ruleConfig.playerCount]);

  // ---- 阵营人数统计 ----
  const getFactionCounts = () => {
    const evilRoles = ROLE_ITEMS.filter((r) => r.faction === 'evil');
    const goodRoles = ROLE_ITEMS.filter((r) => r.faction === 'good');
    const evilCount = evilRoles.reduce(
      (sum, r) => sum + (ruleConfig.roleDistribution[r.id] || 0),
      0,
    );
    const goodCount = goodRoles.reduce(
      (sum, r) => sum + (ruleConfig.roleDistribution[r.id] || 0),
      0,
    );
    return { evilCount, goodCount };
  };

  // ---- 角色数量调整 ----
  const adjustRole = (roleId: RoleId, delta: number) => {
    const current = ruleConfig.roleDistribution[roleId] || 0;
    const newVal = Math.max(0, current + delta);
    const newDistribution = { ...ruleConfig.roleDistribution, [roleId]: newVal };

    // 计算总人数，限制在6-18之间
    const total = Object.values(newDistribution).reduce(
      (sum, c) => sum + (c || 0),
      0,
    );
    if (total > 18 || total < 6) return;

    // 阵营最低人数限制：至少1个狼人、3个好人
    const roleItem = ROLE_ITEMS.find((r) => r.id === roleId);
    if (roleItem) {
      const evilRoles = ROLE_ITEMS.filter((r) => r.faction === 'evil');
      const goodRoles = ROLE_ITEMS.filter((r) => r.faction === 'good');
      const evilCount = evilRoles.reduce(
        (sum, r) => sum + (newDistribution[r.id] || 0),
        0,
      );
      const goodCount = goodRoles.reduce(
        (sum, r) => sum + (newDistribution[r.id] || 0),
        0,
      );
      if (evilCount < 1 || goodCount < 3) return;
    }

    setRuleConfig({ ...ruleConfig, roleDistribution: newDistribution, playerCount: total });
  };

  // ---- 夜间行动顺序移动 ----
  const moveNightAction = (fromIndex: number, toIndex: number) => {
    const order = [...ruleConfig.nightActionOrder];
    const [moved] = order.splice(fromIndex, 1);
    // 噩梦之影不能排在最后
    if (moved === 'nightmare_shadow' && toIndex >= order.length) {
      return;
    }
    order.splice(toIndex, 0, moved);
    setRuleConfig({ ...ruleConfig, nightActionOrder: order, nightActionOrderPreset: 'chaos' });
  };

  // ---- 夜间行动顺序预置 ----
  const setNightActionOrderPreset = (preset: NightActionOrderPreset) => {
    if (preset === 'chaos') {
      setRuleConfig({ ...ruleConfig, nightActionOrderPreset: 'chaos' });
    } else {
      setRuleConfig({
        ...ruleConfig,
        nightActionOrder: [...NIGHT_ACTION_ORDER_PRESETS[preset]],
        nightActionOrderPreset: preset,
      });
    }
  };

  // ---- 更新 ruleConfig 的辅助函数 ----
  const updateRuleConfig = (partial: Partial<RuleConfig>) => {
    setRuleConfig((prev) => ({ ...prev, ...partial, enableVoice: false }));
  };

  // ---- 玩家名称操作 ----
  const updatePlayerName = (index: number, name: string) => {
    setPlayerNames((prev) => {
      const next = [...prev];
      next[index] = name;
      return next;
    });
  };

  const removePlayerName = (index: number) => {
    setPlayerNames((prev) => prev.filter((_, i) => i !== index));
  };

  const addPlayerName = () => {
    const nextIndex = playerNames.length;
    setPlayerNames((prev) => [
      ...prev,
      DEFAULT_PLAYER_NAMES[nextIndex] ?? `模拟${nextIndex + 1}号`,
    ]);
  };

  // ---- 创建房间 ----
  const handleCreate = () => {
    if (!judgeNickname.trim()) return;
    const { evilCount, goodCount } = getFactionCounts();
    if (ruleConfig.playerCount < 6 || ruleConfig.playerCount > 18) return;
    if (evilCount < 1 || goodCount < 3) return;
    if (playerNames.length !== ruleConfig.playerCount) return;

    // 强制 enableVoice = false
    const finalConfig = { ...ruleConfig, enableVoice: false };

    createRoom(judgeNickname.trim(), gameMode, finalConfig);

    // 逐个添加玩家
    for (const name of playerNames) {
      addPlayer(name.trim());
    }
  };

  // ---- 校验状态 ----
  const { evilCount, goodCount } = getFactionCounts();
  const isValid =
    judgeNickname.trim() !== '' &&
    ruleConfig.playerCount >= 6 &&
    ruleConfig.playerCount <= 18 &&
    evilCount >= 1 &&
    goodCount >= 3 &&
    playerNames.length === ruleConfig.playerCount &&
    playerNames.every((n) => n.trim() !== '');

  // ---- 自定义头部内容 ----
  const headerContent = (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">模拟器 — 房间配置</h2>

      {/* 基本信息 */}
      <input
        type="text"
        placeholder="法官昵称"
        value={judgeNickname}
        onChange={(e) => setJudgeNickname(e.target.value)}
        maxLength={20}
        className="input-field w-full"
      />
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="simGameMode"
            checked={gameMode === 'HUMAN'}
            onChange={() => setGameMode('HUMAN')}
            className="accent-wolf-500"
          />
          <span>上帝法官模式</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="simGameMode"
            checked={gameMode === 'SYSTEM'}
            onChange={() => setGameMode('SYSTEM')}
            className="accent-wolf-500"
          />
          <span>系统跑团模式</span>
        </label>
      </div>
    </div>
  );

  // ---- 自定义底部内容 ----
  const footerContent = (
    <>
      {/* 模拟玩家名称列表 */}
      <div className="space-y-2 pt-4 border-t border-night-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">模拟玩家</h3>
          <span
            className={`text-sm ${
              playerNames.length === ruleConfig.playerCount ? 'text-gray-400' : 'text-red-400'
            }`}
          >
            {playerNames.length} / {ruleConfig.playerCount} 人
          </span>
        </div>
        {playerNames.length !== ruleConfig.playerCount && (
          <p className="text-xs text-red-400">
            玩家数量（{playerNames.length}）需与角色总人数（{ruleConfig.playerCount}）一致
          </p>
        )}
        <div className="space-y-1.5">
          {playerNames.map((name, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-6 text-right shrink-0">
                {index + 1}
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => updatePlayerName(index, e.target.value)}
                maxLength={20}
                className="input-field flex-1 text-sm"
                placeholder={`玩家${index + 1}昵称`}
              />
              <button
                onClick={() => removePlayerName(index)}
                disabled={playerNames.length <= ruleConfig.playerCount}
                className="w-7 h-7 rounded bg-night-700 hover:bg-red-900/50 disabled:opacity-30 text-sm text-gray-400 hover:text-red-400 shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {playerNames.length < ruleConfig.playerCount && (
          <button
            onClick={addPlayerName}
            className="w-full py-2 rounded-lg border border-dashed border-night-600 text-sm text-gray-400 hover:text-gray-300 hover:border-night-500"
          >
            + 添加玩家
          </button>
        )}
      </div>

      {/* 创建按钮 */}
      <button
        onClick={handleCreate}
        disabled={!isValid}
        className="btn-primary w-full text-lg mt-4"
      >
        创建房间（{ruleConfig.playerCount}人局）
      </button>
    </>
  );

  return (
    <div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto">
      <RoomConfigPanel
        ruleConfig={ruleConfig}
        updateRuleConfig={updateRuleConfig}
        setNightActionOrderPreset={setNightActionOrderPreset}
        moveNightAction={moveNightAction}
        adjustRole={adjustRole}
        voiceDisabled={true}
        headerContent={headerContent}
        footerContent={footerContent}
        error={error}
      />
    </div>
  );
};

export default RoomSetupPanel;