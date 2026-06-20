/**
 * ============================================================================
 * HomeView — 纯净版开始界面
 * ============================================================================
 *
 * 架构说明：
 *   1. 「加入房间」入口：输入昵称 + 6位房间码
 *   2. 「创建房间」入口：唤起动态村规配置面板
 *   3. 创建成功后显示房间码和邀请链接/二维码
 *
 * 设计原则：
 *   - 零硬编码：所有输入均为空，无默认房间号/昵称
 *   - 复用 RoomConfigPanel 组件，确保配置界面一致性
 * ============================================================================
 */

import React, { useState, useRef } from 'react';
import { useGameStore, getWsUrl } from '../useGameStore';
import RoomConfigPanel, { ROLE_ITEMS } from './RoomConfigPanel';
import type { RoleId, RuleConfig, GameMode, NightActionOrderPreset } from '@langrensha/shared';
import { NIGHT_ACTION_ORDER_PRESETS } from '@langrensha/shared';

/** 纯净版开始界面，提供加入/创建房间入口 */

const HomeView: React.FC = () => {
  const [showCreatePanel, setShowCreatePanel] = useState(false);

  // 加入房间表单
  const [joinNickname, setJoinNickname] = useState('');
  const [joinRoomCode, setJoinRoomCode] = useState('');

  // 创建房间表单
  const [createNickname, setCreateNickname] = useState('');
  const [createGameMode, setCreateGameMode] = useState<GameMode>('HUMAN');

  // 使用 ref 防止重复点击和追踪连接等待状态
  const isConnectingRef = useRef(false);

  // Zustand 状态仓库
  const {
    createRoom,
    joinRoom,
    ruleConfig,
    updateRuleConfig,
    setNightActionOrderPreset,
    roomCode,
    inviteLink,
    qrCodeDataUrl,
    setError,
    connect,
  } = useGameStore();

  // 等待 WebSocket 连接建立的辅助函数
  const waitForConnection = (): Promise<void> => {
    return new Promise((resolve) => {
      if (useGameStore.getState().isConnected) {
        resolve();
        return;
      }

      // 防止重复连接
      if (!isConnectingRef.current) {
        isConnectingRef.current = true;
        connect(getWsUrl());
      }

      // 轮询检查连接状态（最多等待 10 秒）
      let attempts = 0;
      const maxAttempts = 100; // 100 * 100ms = 10s
      const checkInterval = setInterval(() => {
        attempts++;
        if (useGameStore.getState().isConnected) {
          clearInterval(checkInterval);
          isConnectingRef.current = false;
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          isConnectingRef.current = false;
          setError('连接服务器超时，请检查网络后重试');
          resolve(); // 仍然 resolve，但会显示错误
        }
      }, 100);
    });
  };

  // ---- 加入房间 ----
  const handleJoin = async () => {
    if (!joinNickname.trim()) return;
    if (!joinRoomCode.trim()) return;

    // 等待连接建立后再发送消息
    await waitForConnection();
    if (useGameStore.getState().isConnected) {
      joinRoom(joinNickname.trim(), joinRoomCode.trim().toUpperCase());
    }
  };

  // ---- 创建房间 ----
  const handleCreate = async () => {
    if (!createNickname.trim()) return;

    // 等待连接建立后再发送消息
    await waitForConnection();
    if (useGameStore.getState().isConnected) {
      createRoom(createNickname.trim(), createGameMode, ruleConfig);
    }
  };

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
    const total = Object.values(newDistribution).reduce((sum, c) => sum + (c || 0), 0);
    if (total > 18 || total < 6) return;

    // 阵营最低人数限制：至少1个狼人、3个好人
    const roleItem = ROLE_ITEMS.find((r) => r.id === roleId);
    if (roleItem) {
      const evilRoles = ROLE_ITEMS.filter((r) => r.faction === 'evil');
      const goodRoles = ROLE_ITEMS.filter((r) => r.faction === 'good');
      const evilCount = evilRoles.reduce((sum, r) => sum + (newDistribution[r.id] || 0), 0);
      const goodCount = goodRoles.reduce((sum, r) => sum + (newDistribution[r.id] || 0), 0);
      if (evilCount < 1 || goodCount < 3) return;
    }

    // 自动同步 sharedWolfRoles
    const wolfRoles = ['werewolf', 'wolf_king', 'white_wolf_king', 'nightmare_shadow', 'mechanical_wolf'] as const;
    const newCount = newDistribution[roleId] ?? 0;
    const wasInShared = (ruleConfig.sharedWolfRoles || []).includes(roleId);
    let sharedWolfRoles = ruleConfig.sharedWolfRoles;
    if (newCount > 0 && !wasInShared && wolfRoles.includes(roleId as any)) {
      sharedWolfRoles = [...(ruleConfig.sharedWolfRoles || []), roleId];
    } else if (newCount === 0 && wasInShared) {
      sharedWolfRoles = (ruleConfig.sharedWolfRoles || []).filter(r => r !== roleId);
    }

    updateRuleConfig({ roleDistribution: newDistribution, playerCount: total, sharedWolfRoles });
  };

  // ---- 夜间行动顺序拖拽排序 ----
  const moveNightAction = (fromIndex: number, toIndex: number) => {
    const order = [...ruleConfig.nightActionOrder];
    const [moved] = order.splice(fromIndex, 1);
    // 规则1：噩梦之影不能排在最后
    if (moved === 'nightmare_shadow' && toIndex >= order.length) {
      setError('噩梦之影不能被排到最后一个位置');
      return;
    }
    order.splice(toIndex, 0, moved);
    updateRuleConfig({ nightActionOrder: order, nightActionOrderPreset: 'chaos' });
  };

  // ---- 夜间行动顺序预置 ----
  const handleSetNightActionOrderPreset = (preset: NightActionOrderPreset) => {
    if (preset === 'chaos') {
      updateRuleConfig({ nightActionOrderPreset: 'chaos' });
    } else {
      updateRuleConfig({
        nightActionOrder: [...NIGHT_ACTION_ORDER_PRESETS[preset]],
        nightActionOrderPreset: preset,
      });
    }
  };

  // ---- 校验状态 ----
  const { evilCount, goodCount } = getFactionCounts();
  const canCreate =
    createNickname.trim() !== '' &&
    ruleConfig.playerCount >= 6 &&
    ruleConfig.playerCount <= 18 &&
    evilCount >= 1 &&
    goodCount >= 3;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* 标题 */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-wolf-400 mb-2">狼人杀</h1>
        <p className="text-gray-400">联机版 · 动态村规引擎</p>
      </div>

      {/* 房间已创建提示（仅创建房间时显示，加入房间不会设置 inviteLink） */}
      {roomCode && inviteLink && (
        <div className="card border-green-700 mb-4 max-w-md w-full text-center">
          <h3 className="text-lg font-semibold text-green-400 mb-2">房间已创建</h3>
          <p className="text-3xl font-mono tracking-widest text-white mb-3">{roomCode}</p>
          {inviteLink && (
            <p className="text-sm text-gray-400 mb-3 break-all">邀请链接：{inviteLink}</p>
          )}
          {qrCodeDataUrl && (
            <img src={qrCodeDataUrl} alt="邀请二维码" className="mx-auto w-48 h-48" />
          )}
        </div>
      )}

      {!showCreatePanel ? (
        /* ====== 主界面：加入/创建 ====== */
        <div className="card max-w-md w-full space-y-6">
          {/* 加入房间 */}
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">加入房间</h2>
            <input
              type="text"
              placeholder="输入昵称"
              value={joinNickname}
              onChange={(e) => setJoinNickname(e.target.value)}
              maxLength={20}
              className="input-field w-full"
            />
            <input
              type="text"
              placeholder="输入6位房间码"
              value={joinRoomCode}
              onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              className="input-field w-full font-mono tracking-widest text-center text-lg"
            />
            <button
              onClick={handleJoin}
              disabled={!joinNickname.trim() || joinRoomCode.length !== 6}
              className="btn-primary w-full"
            >
              加入房间
            </button>
          </div>

          <div className="border-t border-night-700" />

          {/* 创建房间 */}
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">创建房间</h2>
            <button
              onClick={() => setShowCreatePanel(true)}
              className="btn-secondary w-full"
            >
              配置村规并创建
            </button>
          </div>

          {/* 管理员入口 & 模拟器入口 */}
          <div className="border-t border-night-700 pt-3 text-center flex items-center justify-center gap-4">
            <button
              onClick={() => useGameStore.getState().setView('admin')}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              管理员后台
            </button>
            <span className="text-gray-700">|</span>
            <button
              onClick={() => useGameStore.getState().setView('simulator')}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              游戏模拟器
            </button>
          </div>
        </div>
      ) : (
        /* ====== 创建房间配置面板 ====== */
        <div className="card max-w-2xl w-full max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">创建房间 — 村规配置</h2>
            <button
              onClick={() => setShowCreatePanel(false)}
              className="text-gray-500 hover:text-gray-300"
            >
              返回
            </button>
          </div>

          <RoomConfigPanel
            ruleConfig={ruleConfig}
            updateRuleConfig={updateRuleConfig}
            setNightActionOrderPreset={handleSetNightActionOrderPreset}
            moveNightAction={moveNightAction}
            adjustRole={adjustRole}
            voiceDisabled={false}
            headerContent={
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="输入昵称"
                  value={createNickname}
                  onChange={(e) => setCreateNickname(e.target.value)}
                  maxLength={20}
                  className="input-field w-full"
                />
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gameMode"
                      checked={createGameMode === 'HUMAN'}
                      onChange={() => setCreateGameMode('HUMAN')}
                      className="accent-wolf-500"
                    />
                    <span>上帝法官模式</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gameMode"
                      checked={createGameMode === 'SYSTEM'}
                      onChange={() => setCreateGameMode('SYSTEM')}
                      className="accent-wolf-500"
                    />
                    <span>系统跑团模式</span>
                  </label>
                </div>
              </div>
            }
            footerContent={
              <button
                onClick={handleCreate}
                disabled={!canCreate}
                className="btn-primary w-full text-lg mt-4"
              >
                创建房间（{ruleConfig.playerCount}人局）
              </button>
            }
          />
        </div>
      )}
    </div>
  );
};

export default HomeView;