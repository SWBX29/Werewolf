/**
 * ============================================================================
 * RoomSetupPanel — 模拟器房间配置面板
 * ============================================================================
 *
 * 功能：
 *   1. 法官昵称输入
 *   2. 游戏模式选择（上帝法官 / 系统跑团）
 *   3. 村规配置（复用 HomeView 的 UI 结构）
 *   4. 模拟玩家名称列表（增删改，数量需匹配角色总人数）
 *   5. 创建房间并批量添加玩家
 *
 * 设计原则：
 *   - 配置 UI 与 HomeView 完全一致，降低用户学习成本
 *   - 强制 enableVoice = false（模拟器不需要语音）
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useSimulatorStore } from './useSimulatorStore';
import { DEFAULT_PLAYER_NAMES } from './constants';
import type {
  RoleId,
  RuleConfig,
  GameMode,
  NightActionOrderPreset,
  WitchSaveSelfRule,
  GuardWitchConflictRule,
  KnightDuelWolfKingRule,
  KnightDuelSuicideRule,
  TieVoteResolution,
  WinCondition,
  DaytimeKillSequence,
  WerewolfSharedVision,
  SpeechOrderStrategy,
  RevealIdentityOnDayVote,
} from '@langrensha/shared';
import { ROLE_META, NIGHT_ACTION_ORDER_PRESETS, createDefaultRuleConfig } from '@langrensha/shared';

// ============================================================================
// 角色池配置项（与 HomeView 保持一致）
// ============================================================================

interface RoleConfigItem {
  id: RoleId;
  name: string;
  faction: 'good' | 'evil';
}

const ROLE_ITEMS: RoleConfigItem[] = [
  // 好人阵营
  { id: 'villager', name: '村民', faction: 'good' },
  { id: 'seer', name: '预言家', faction: 'good' },
  { id: 'witch', name: '女巫', faction: 'good' },
  { id: 'hunter', name: '猎人', faction: 'good' },
  { id: 'guard', name: '守卫', faction: 'good' },
  { id: 'idiot', name: '白痴', faction: 'good' },
  { id: 'knight', name: '骑士', faction: 'good' },
  // 狼人阵营
  { id: 'werewolf', name: '狼人', faction: 'evil' },
  { id: 'white_wolf_king', name: '白狼王', faction: 'evil' },
  { id: 'wolf_king', name: '狼王', faction: 'evil' },
  { id: 'nightmare_shadow', name: '噩梦之影', faction: 'evil' },
  { id: 'hidden_wolf', name: '隐狼', faction: 'evil' },
  { id: 'mechanical_wolf', name: '机械狼', faction: 'evil' },
];

// ============================================================================
// RoomSetupPanel 组件
// ============================================================================

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
  const applyNightActionOrderPreset = (preset: NightActionOrderPreset) => {
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

  return (
    <div className="max-w-2xl w-full space-y-6 max-h-[85vh] overflow-y-auto">
      <h2 className="text-xl font-semibold">模拟器 — 房间配置</h2>

      {/* 错误提示 */}
      {error && (
        <div className="p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* 基本信息 */}
      <div className="space-y-3">
        <h3 className="text-lg font-medium">基本信息</h3>
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

      {/* 角色池配置（与 HomeView 一致） */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">角色配置</h3>
        <p
          className={`text-sm ${
            ruleConfig.playerCount < 6 ||
            ruleConfig.playerCount > 18 ||
            evilCount < 1 ||
            goodCount < 3
              ? 'text-red-400'
              : 'text-gray-400'
          }`}
        >
          当前总人数：{ruleConfig.playerCount}（需6-18人）| 狼人：{evilCount}
          （至少1）| 好人：{goodCount}（至少3）
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_ITEMS.map((role) => {
            const count = ruleConfig.roleDistribution[role.id] || 0;
            return (
              <div
                key={role.id}
                className={`flex items-center justify-between p-2 rounded-lg border ${
                  role.faction === 'evil'
                    ? 'border-red-900 bg-red-950/30'
                    : 'border-night-700 bg-night-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={role.faction === 'evil' ? 'tag-evil' : 'tag-good'}>
                    {role.faction === 'evil' ? '狼' : '好'}
                  </span>
                  <span className="text-sm">{role.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => adjustRole(role.id, -1)}
                    disabled={
                      count <= 0 ||
                      ruleConfig.playerCount <= 6 ||
                      (role.faction === 'evil' && evilCount <= 1) ||
                      (role.faction === 'good' && goodCount <= 3)
                    }
                    className="w-7 h-7 rounded bg-night-700 hover:bg-night-600 disabled:opacity-30 text-sm"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-sm font-mono">{count}</span>
                  <button
                    onClick={() => adjustRole(role.id, 1)}
                    disabled={ruleConfig.playerCount >= 18}
                    className="w-7 h-7 rounded bg-night-700 hover:bg-night-600 disabled:opacity-30 text-sm"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 夜间行动顺序配置（与 HomeView 一致） */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">夜间行动顺序</h3>
        <div className="flex gap-2 flex-wrap">
          {(['classic', 'seer_first', 'witch_first', 'chaos'] as NightActionOrderPreset[]).map(
            (preset) => (
              <button
                key={preset}
                onClick={() => applyNightActionOrderPreset(preset)}
                className={`px-3 py-1 rounded-lg text-sm ${
                  ruleConfig.nightActionOrderPreset === preset
                    ? 'bg-wolf-600 text-white'
                    : 'bg-night-700 text-gray-300 hover:bg-night-600'
                }`}
              >
                {preset === 'classic' && '经典顺序'}
                {preset === 'seer_first' && '预言家优先'}
                {preset === 'witch_first' && '女巫优先'}
                {preset === 'chaos' && '混沌（手动排序）'}
              </button>
            ),
          )}
        </div>

        {/* 当前顺序展示 / 拖拽排序 */}
        <div className="flex flex-wrap gap-2 p-3 bg-night-800 rounded-lg">
          {ruleConfig.nightActionOrder.map((roleId, index) => (
            <div
              key={`${roleId}-${index}`}
              className="flex items-center gap-1 bg-night-700 rounded px-3 py-1"
            >
              {ruleConfig.nightActionOrderPreset === 'chaos' && index > 0 && (
                <button
                  onClick={() => moveNightAction(index, index - 1)}
                  className="text-gray-500 hover:text-gray-300 text-xs"
                >
                  ←
                </button>
              )}
              <span className="text-sm">{ROLE_META[roleId].name}</span>
              {ruleConfig.nightActionOrderPreset === 'chaos' &&
                index < ruleConfig.nightActionOrder.length - 1 && (
                  <button
                    onClick={() => moveNightAction(index, index + 1)}
                    className="text-gray-500 hover:text-gray-300 text-xs"
                  >
                    →
                  </button>
                )}
            </div>
          ))}
        </div>
        {ruleConfig.nightActionOrder[ruleConfig.nightActionOrder.length - 1] ===
          'nightmare_shadow' && (
          <p className="text-xs text-red-400 mt-1">⚠ 噩梦之影不能排在最后位置</p>
        )}
      </div>

      {/* 村规配置（与 HomeView 一致） */}
      <div className="space-y-3">
        <h3 className="text-lg font-medium">村规配置</h3>

        {/* 女巫自救 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">女巫自救</span>
          <select
            value={ruleConfig.witchSaveSelf}
            onChange={(e) =>
              updateRuleConfig({ witchSaveSelf: e.target.value as WitchSaveSelfRule })
            }
            className="select-field text-sm"
          >
            <option value="NEVER">不可自救</option>
            <option value="FIRST_NIGHT">仅首夜</option>
            <option value="ALWAYS">始终可自救</option>
          </select>
        </div>

        {/* 同守同救 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">同守同救结算</span>
          <select
            value={ruleConfig.guardWitchConflict}
            onChange={(e) =>
              updateRuleConfig({
                guardWitchConflict: e.target.value as GuardWitchConflictRule,
              })
            }
            className="select-field text-sm"
          >
            <option value="DEATH">双药冲突死亡</option>
            <option value="ALIVE">算作救活</option>
          </select>
        </div>

        {/* 吃毒封印技能 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">吃毒封印技能（猎人/狼王）</span>
          <input
            type="checkbox"
            checked={ruleConfig.poisonBlockGun}
            onChange={(e) => updateRuleConfig({ poisonBlockGun: e.target.checked })}
            className="accent-wolf-500 w-4 h-4"
          />
        </div>

        {/* 女巫同晚双药 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">女巫同晚双药</span>
          <input
            type="checkbox"
            checked={ruleConfig.witchCanUseBothPotions}
            onChange={(e) => updateRuleConfig({ witchCanUseBothPotions: e.target.checked })}
            className="accent-wolf-500 w-4 h-4"
          />
        </div>

        {/* 警长选举 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">启用警长选举</span>
          <input
            type="checkbox"
            checked={ruleConfig.sheriffElectionEnabled}
            onChange={(e) => updateRuleConfig({ sheriffElectionEnabled: e.target.checked })}
            className="accent-wolf-500 w-4 h-4"
          />
        </div>

        {/* 语音功能（强制关闭） */}
        <div className="flex items-center justify-between opacity-50">
          <span className="text-sm">启用语音功能</span>
          <input
            type="checkbox"
            checked={false}
            disabled
            className="accent-wolf-500 w-4 h-4"
          />
        </div>
        <p className="text-xs text-gray-500 -mt-2">模拟器模式下语音功能不可用</p>

        {/* 首日双轮发言 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">首日双轮发言</span>
          <input
            type="checkbox"
            checked={ruleConfig.firstDayDoubleSpeech}
            onChange={(e) => updateRuleConfig({ firstDayDoubleSpeech: e.target.checked })}
            className="accent-wolf-500 w-4 h-4"
          />
        </div>

        {/* 警长投票权重 */}
        {ruleConfig.sheriffElectionEnabled && (
          <div className="flex items-center justify-between">
            <span className="text-sm">警长投票权重</span>
            <select
              value={ruleConfig.sheriffVoteWeight}
              onChange={(e) =>
                updateRuleConfig({ sheriffVoteWeight: Number(e.target.value) as 1 | 1.5 | 2 })
              }
              className="bg-gray-800 text-sm rounded px-2 py-1 border border-gray-600"
            >
              <option value={1}>1票</option>
              <option value={1.5}>1.5票</option>
              <option value={2}>2票</option>
            </select>
          </div>
        )}

        {/* 骑士决斗狼王 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">骑士决斗狼王</span>
          <select
            value={ruleConfig.knightDuelWolfKing}
            onChange={(e) =>
              updateRuleConfig({
                knightDuelWolfKing: e.target.value as KnightDuelWolfKingRule,
              })
            }
            className="select-field text-sm"
          >
            <option value="CAN_SHOOT">狼王可开枪</option>
            <option value="SILENCED">绝对封印</option>
          </select>
        </div>

        {/* 骑士决斗好人翻车 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">骑士决斗好人翻车</span>
          <select
            value={ruleConfig.knightDuelSuicide}
            onChange={(e) =>
              updateRuleConfig({
                knightDuelSuicide: e.target.value as KnightDuelSuicideRule,
              })
            }
            className="select-field text-sm"
          >
            <option value="SUICIDE">翻车自尽</option>
            <option value="REVEAL_ONLY">仅暴露身份</option>
          </select>
        </div>

        {/* 平票处理 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">平票处理</span>
          <select
            value={ruleConfig.tieVoteResolution}
            onChange={(e) =>
              updateRuleConfig({ tieVoteResolution: e.target.value as TieVoteResolution })
            }
            className="select-field text-sm"
          >
            <option value="SKIP">无人出局</option>
            <option value="PK_VOTE">PK发言重投</option>
            <option value="RANDOM">随机处决</option>
          </select>
        </div>

        {/* 获胜条件 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">获胜条件</span>
          <select
            value={ruleConfig.winCondition}
            onChange={(e) =>
              updateRuleConfig({ winCondition: e.target.value as WinCondition })
            }
            className="select-field text-sm"
          >
            <option value="SLAUGHTER_SIDE">屠边</option>
            <option value="SLAUGHTER_ALL">屠城</option>
          </select>
        </div>

        {/* 遗言与身份显示并列 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">白天死亡连锁</label>
            <select
              value={ruleConfig.daytimeKillSequence}
              onChange={(e) =>
                updateRuleConfig({ daytimeKillSequence: e.target.value as DaytimeKillSequence })
              }
              className="w-full bg-night-800 border border-night-600 rounded px-3 py-2 text-sm"
            >
              <option value="TRIGGER_ALL">立即触发所有亡语</option>
              <option value="TRIGGER_DEFERRED">延期至入夜前触发</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">票出身份显示</label>
            <select
              value={ruleConfig.revealIdentityOnDayVote}
              onChange={(e) =>
                updateRuleConfig({
                  revealIdentityOnDayVote: e.target.value as RevealIdentityOnDayVote,
                })
              }
              className="w-full bg-night-800 border border-night-600 rounded px-3 py-2 text-sm"
            >
              <option value="NONE">不显示</option>
              <option value="FACTION">显示阵营</option>
              <option value="ROLE">显示具体身份</option>
            </select>
          </div>
        </div>

        {/* 狼人共群规则 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">狼人共群规则</span>
          <select
            value={ruleConfig.werewolfSharedVision}
            onChange={(e) =>
              updateRuleConfig({
                werewolfSharedVision: e.target.value as WerewolfSharedVision,
              })
            }
            className="select-field text-sm"
          >
            <option value="ALL_SHARE">全员共群</option>
            <option value="LEADER_ONLY">仅首领知情</option>
            <option value="NONE">各自独立</option>
          </select>
        </div>

        {/* 共同睁眼的狼人角色 */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-sm">共同睁眼的狼人角色</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLE_ITEMS.filter((r) => r.faction === 'evil' && r.id !== 'hidden_wolf').map(
              (role) => {
                const isSelected = ruleConfig.sharedWolfRoles.includes(role.id);
                return (
                  <label
                    key={role.id}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${
                      isSelected
                        ? 'bg-red-900/40 border-red-700 text-red-200'
                        : 'bg-night-800 border-night-600 text-gray-400 hover:border-night-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const newList = e.target.checked
                          ? [...ruleConfig.sharedWolfRoles, role.id]
                          : ruleConfig.sharedWolfRoles.filter((id) => id !== role.id);
                        updateRuleConfig({ sharedWolfRoles: newList as RoleId[] });
                      }}
                      className="accent-red-500 w-3 h-3"
                    />
                    {role.name}
                  </label>
                );
              },
            )}
          </div>
          <p className="text-xs text-gray-500">
            选择参与夜间刀人投票及共群聊天的狼人角色，隐狼默认不参与
          </p>
        </div>

        {/* 发言顺序策略 */}
        <div className="flex items-center justify-between">
          <span className="text-sm">发言顺序策略</span>
          <select
            value={ruleConfig.speechOrderStrategy}
            onChange={(e) =>
              updateRuleConfig({
                speechOrderStrategy: e.target.value as SpeechOrderStrategy,
              })
            }
            className="select-field text-sm"
          >
            <option value="DEATH_LEFT">死左开始</option>
            <option value="DEATH_RIGHT">死右开始</option>
            <option value="SHERIFF_LEFT">警长左</option>
            <option value="SHERIFF_RIGHT">警长右</option>
            <option value="JUDGE_CUSTOM">法官指定</option>
          </select>
        </div>

        {/* 超时配置 */}
        <div className="space-y-2 pt-2 border-t border-night-700">
          <h4 className="text-sm font-medium text-gray-400">超时配置（秒，0=无限）</h4>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500">夜间行动</label>
              <input
                type="number"
                value={ruleConfig.nightActionTimeout}
                onChange={(e) =>
                  updateRuleConfig({ nightActionTimeout: parseInt(e.target.value) || 0 })
                }
                min={0}
                className="input-field w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">白天发言</label>
              <input
                type="number"
                value={ruleConfig.speechTimeout}
                onChange={(e) =>
                  updateRuleConfig({ speechTimeout: parseInt(e.target.value) || 0 })
                }
                min={0}
                className="input-field w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">投票</label>
              <input
                type="number"
                value={ruleConfig.voteTimeout}
                onChange={(e) =>
                  updateRuleConfig({ voteTimeout: parseInt(e.target.value) || 0 })
                }
                min={0}
                className="input-field w-full text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 模拟玩家名称列表 */}
      <div className="space-y-2">
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
        className="btn-primary w-full text-lg"
      >
        创建房间（{ruleConfig.playerCount}人局）
      </button>
    </div>
  );
};

export default RoomSetupPanel;
