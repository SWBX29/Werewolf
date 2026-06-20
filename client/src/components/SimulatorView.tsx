/**
 * ============================================================================
 * SimulatorView — 狼人杀游戏模拟器主视图
 * ============================================================================
 *
 * 架构说明：
 *   1. 管理 Setup / Lobby / Playing / GameOver 四个模拟器阶段
 *   2. 左侧面板：房间信息 + 座位图 + 大厅控制（可拖拽调整宽度）
 *   3. 右侧面板：玩家操作 / 法官控制 Tab 切换 + 自动策略折叠面板
 *   4. 底部：可折叠事件日志
 *
 * 设计原则：
 *   - 通过 storeInjector 将模拟器状态注入 useGameStore，复用现有游戏组件
 *   - 组件卸载时自动断开所有模拟器连接
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSimulatorStore } from './simulator/useSimulatorStore';
import { injectStateToGameStore } from './simulator/storeInjector';
import { useGameStore } from '../useGameStore';
import { PHASE_NAMES } from '@langrensha/shared';
import RoomSetupPanel from './simulator/RoomSetupPanel';
import SeatMap from './simulator/SeatMap';
import EventLog from './simulator/EventLog';
import AutoStrategyPanel from './simulator/AutoStrategyPanel';
import GamePanelWrapper from './simulator/GamePanelWrapper';
import JudgeConsole from './JudgeConsole';

// ============================================================================
// 常量
// ============================================================================

const AUTO_MODE_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'suggest', label: '仅建议' },
  { value: 'auto', label: '自动执行' },
] as const;

/** 狼人杀游戏模拟器主视图，集成座位图、玩家操作、法官控制和事件日志 */

const SimulatorView: React.FC = () => {
  // ---- Simulator store ----
  const simulatorPhase = useSimulatorStore((s) => s.simulatorPhase);
  const serverUrl = useSimulatorStore((s) => s.serverUrl);
  const setServerUrl = useSimulatorStore((s) => s.setServerUrl);
  const connections = useSimulatorStore((s) => s.connections);
  const roomCode = useSimulatorStore((s) => s.roomCode);
  const currentPhase = useSimulatorStore((s) => s.currentPhase);
  const currentRound = useSimulatorStore((s) => s.currentRound);
  const autoMode = useSimulatorStore((s) => s.autoMode);
  const setAutoMode = useSimulatorStore((s) => s.setAutoMode);
  const disconnectAll = useSimulatorStore((s) => s.disconnectAll);
  const selectPlayer = useSimulatorStore((s) => s.selectPlayer);
  const selectedPlayerId = useSimulatorStore((s) => s.selectedPlayerId);
  const error = useSimulatorStore((s) => s.error);
  const clearError = useSimulatorStore((s) => s.clearError);

  // ---- Game store ----
  const setView = useGameStore((s) => s.setView);

  // ---- Local state ----
  const [activeTab, setActiveTab] = useState<'player' | 'judge'>('player');
  const [strategyCollapsed, setStrategyCollapsed] = useState(false);
  const prevSelectedPlayerRef = useRef<string | null>(null);

  // ---- 可拉伸面板状态 ----
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const leftDragRef = useRef(false);
  const leftStartX = useRef(0);
  const leftStartWidth = useRef(0);

  // ---- 连接数统计 ----
  const connectedCount = Array.from(connections.values()).filter(
    (c) => c.isConnected && !c.isJudge,
  ).length;
  const totalCount = Array.from(connections.values()).filter((c) => !c.isJudge).length;
  const judgeConnected = useSimulatorStore((s) => s.judgeConnection?.isConnected ?? false);

  // ---- Tab 切换逻辑 ----
  const handleTabChange = useCallback(
    (tab: 'player' | 'judge') => {
      if (tab === activeTab) return;

      if (tab === 'judge') {
        // 切换到法官控制台：记住当前选中的玩家，注入法官状态
        prevSelectedPlayerRef.current = selectedPlayerId;
        selectPlayer(null);
      } else {
        // 切换到玩家操作：恢复之前选中的玩家
        selectPlayer(prevSelectedPlayerRef.current);
      }

      setActiveTab(tab);
    },
    [activeTab, selectedPlayerId, selectPlayer],
  );

  // ---- 返回主页 ----
  const handleBack = useCallback(() => {
    disconnectAll();
    setView('home');
  }, [disconnectAll, setView]);

  // ---- 左侧面板拖拽调整宽度 ----
  const handleLeftDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      leftDragRef.current = true;
      leftStartX.current = e.clientX;
      leftStartWidth.current = leftPanelWidth;

      const handleMove = (ev: MouseEvent) => {
        if (!leftDragRef.current) return;
        const delta = ev.clientX - leftStartX.current;
        const next = Math.max(200, Math.min(600, leftStartWidth.current + delta));
        setLeftPanelWidth(next);
      };

      const handleUp = () => {
        leftDragRef.current = false;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [leftPanelWidth],
  );

  // ---- 组件卸载时清理 ----
  useEffect(() => {
    return () => {
      disconnectAll();
    };
  }, [disconnectAll]);

  // ---- 同步模拟器状态到 useGameStore ----
  const playerStates = useSimulatorStore((s) => s.playerStates);
  const judgeState = useSimulatorStore((s) => s.judgeState);

  // 追踪 selectedPlayerId 变化，用于区分"切换玩家"和"状态更新"
  const prevSelectedPlayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    const isPlayerSwitch = prevSelectedPlayerIdRef.current !== selectedPlayerId;
    prevSelectedPlayerIdRef.current = selectedPlayerId;

    if (selectedPlayerId) {
      const playerState = playerStates.get(selectedPlayerId);
      const conn = connections.get(selectedPlayerId);
      if (playerState && conn) {
        // 切换玩家时完全重置，状态更新时只更新数据
        injectStateToGameStore(playerState, conn, isPlayerSwitch);
      }
    } else if (judgeState && useSimulatorStore.getState().judgeConnection) {
      injectStateToGameStore(judgeState, useSimulatorStore.getState().judgeConnection!, true);
    }
  }, [selectedPlayerId, playerStates, judgeState, connections]);

  // ---- Setup 阶段：显示房间配置面板 ----
  if (simulatorPhase === 'setup') {
    return (
      <div className="flex h-full flex-col bg-gray-900 text-white">
        {/* 工具栏 */}
        <div className="flex items-center gap-3 border-b border-gray-700 bg-gray-800 px-4 py-2">
          <button
            onClick={handleBack}
            className="rounded px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            ← 返回
          </button>
          <h1 className="text-sm font-semibold text-gray-200">狼人杀模拟器</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">服务器:</span>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="h-7 w-56 rounded border border-gray-600 bg-gray-900 px-2 text-xs text-gray-200 outline-none focus:border-blue-500"
              placeholder="ws://localhost:3001"
            />
          </div>
        </div>

        {/* 配置面板 */}
        <div className="flex flex-1 items-start justify-center overflow-auto p-6">
          <RoomSetupPanel />
        </div>
      </div>
    );
  }

  // ---- 游戏/大厅阶段 ----
  return (
    <div className="flex h-full flex-col bg-gray-900 text-white">
      {/* ===== 工具栏 ===== */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-700 bg-gray-800 px-4 py-2">
        <button
          onClick={handleBack}
          className="rounded px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          ← 返回
        </button>
        <h1 className="text-sm font-semibold text-gray-200">狼人杀模拟器</h1>

        <div className="mx-2 h-4 w-px bg-gray-600" />

        {/* 服务器地址 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">服务器:</span>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="h-7 w-48 rounded border border-gray-600 bg-gray-900 px-2 text-xs text-gray-200 outline-none focus:border-blue-500"
            placeholder="ws://localhost:3001"
          />
        </div>

        {/* 连接数 */}
        <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
          连接: {connectedCount}/{totalCount}
        </span>

        <div className="mx-2 h-4 w-px bg-gray-600" />

        {/* 自动模式 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">自动模式:</span>
          <select
            value={autoMode}
            onChange={(e) => setAutoMode(e.target.value as typeof autoMode)}
            className="h-7 rounded border border-gray-600 bg-gray-900 px-2 text-xs text-gray-200 outline-none focus:border-blue-500"
          >
            {AUTO_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 断开全部 */}
        <button
          onClick={handleBack}
          className="ml-auto rounded bg-red-800 px-3 py-1 text-xs text-red-200 hover:bg-red-700"
        >
          断开全部
        </button>
      </div>

      {/* ===== 错误提示条 ===== */}
      {error && (
        <div className="flex items-center gap-2 bg-red-900/60 px-4 py-1.5 text-xs text-red-200">
          <span className="flex-1">{error}</span>
          <button
            onClick={clearError}
            className="rounded px-2 py-0.5 text-red-300 hover:bg-red-800"
          >
            关闭
          </button>
        </div>
      )}

      {/* ===== 主内容区 ===== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ---- 左侧面板（可调整宽度） ---- */}
        <div
          className="flex shrink-0 flex-col border-r border-gray-700 bg-gray-850 overflow-y-auto"
          style={{ width: leftPanelWidth }}
        >
          {/* 房间信息卡片 */}
          <div className="border-b border-gray-700 p-3">
            <h3 className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              房间信息
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">房间号</span>
                <span className="font-mono text-yellow-300">{roomCode ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">阶段</span>
                <span className="text-blue-300">
                  {PHASE_NAMES[currentPhase] ?? currentPhase}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">轮次</span>
                <span>{currentRound > 0 ? `第 ${currentRound} 轮` : '—'}</span>
              </div>
            </div>
          </div>

          {/* 座位图 */}
          <div className="flex-1 overflow-y-auto p-2">
            <SeatMap />
          </div>

          {/* 大厅控制按钮 */}
          {simulatorPhase === 'lobby' && (
            <div className="border-t border-gray-700 p-3 space-y-2">
              <button
                onClick={() => useSimulatorStore.getState().readyAllPlayers()}
                className="w-full rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
              >
                全部准备
              </button>
              <button
                onClick={() => useSimulatorStore.getState().startGame()}
                disabled={!judgeConnected}
                className="w-full rounded bg-green-700 px-3 py-2 text-sm text-white hover:bg-green-600 disabled:opacity-50"
              >
                开始游戏
              </button>
            </div>
          )}
        </div>

        {/* 左侧面板拖拽调整宽度手柄 */}
        <div
          className="w-1.5 cursor-ew-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors shrink-0"
          onMouseDown={handleLeftDragStart}
        />

        {/* ---- 右侧面板（自适应宽度） ---- */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* 标签栏 */}
          <div className="flex border-b border-gray-700 bg-gray-800">
            <button
              onClick={() => handleTabChange('player')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'player'
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              玩家操作
            </button>
            <button
              onClick={() => handleTabChange('judge')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'judge'
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              法官控制
            </button>
          </div>

          {/* 标签内容 */}
          <div className="flex flex-1 flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-hidden min-h-0">
              {activeTab === 'player' ? <GamePanelWrapper /> : <JudgeConsole />}
            </div>

            {/* 自动策略面板 - 可折叠 */}
            <div className="border-t border-gray-700">
              <button
                onClick={() => setStrategyCollapsed((v) => !v)}
                className="flex w-full items-center gap-1.5 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-750"
              >
                <span className={`transition-transform ${strategyCollapsed ? '' : 'rotate-90'}`}>
                  ▶
                </span>
                <span>🤖 自动策略</span>
                <span
                  className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${
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
              {!strategyCollapsed && <AutoStrategyPanel />}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 事件日志（底部，可折叠） ===== */}
      <EventLog />
    </div>
  );
};

export default SimulatorView;
