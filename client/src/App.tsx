/**
 * ============================================================================
 * 狼人杀联机游戏 — 前端入口组件
 * ============================================================================
 *
 * 功能：
 *   1. 根据路由状态渲染不同的视图组件
 *   2. 初始化 WebSocket 连接
 *   3. 全局错误提示和连接状态指示
 * ============================================================================
 */

import React, { useEffect } from 'react';
import { useGameStore, getWsUrl } from './useGameStore';
import HomeView from './components/HomeView';
import JudgeConsole from './components/JudgeConsole';
import AdminDashboard from './components/AdminDashboard';
import GameView from './components/game/GameView';

// ============================================================================
// App 根组件
// ============================================================================

const App: React.FC = () => {
  const { currentView, isConnected, isReconnecting, reconnectAttempts, isJudge, error, dismissError, manualReconnect } = useGameStore();

  // 初始化 WebSocket 连接
  useEffect(() => {
    if (!isConnected && !isReconnecting) {
      useGameStore.getState().connect(getWsUrl());
    }
  }, []);

  // 错误弹窗自动关闭（5秒后）
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        dismissError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, dismissError]);

  return (
    <div className="min-h-screen bg-night-950">
      {/* 连接状态指示器 — 仅在非游戏视图显示（游戏视图由 StatusBar 负责） */}
      {currentView !== 'game' && (
        <div className="fixed top-2 right-2 z-50 flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected
                ? 'bg-green-500'
                : isReconnecting
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-gray-500">
            {isConnected ? '已连接' : isReconnecting ? `重连中(${reconnectAttempts})` : '未连接'}
          </span>
          {!isConnected && !isReconnecting && (
            <button
              onClick={manualReconnect}
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              重新连接
            </button>
          )}
        </div>
      )}

      {/* 游戏中断连重连弹窗 */}
      {currentView === 'game' && !isConnected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="card max-w-sm w-full mx-4 text-center space-y-4 animate-fade-in-up">
            <div className="text-4xl">🔌</div>
            <h2 className="text-xl font-bold text-gray-100">连接已断开</h2>
            {isReconnecting ? (
              <>
                <p className="text-sm text-gray-400">正在自动重连，请稍候...</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                {reconnectAttempts > 0 && (
                  <p className="text-xs text-gray-500">已尝试 {reconnectAttempts} 次</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400">自动重连未成功</p>
                <button
                  onClick={manualReconnect}
                  className="btn-primary w-full"
                >
                  重新连接
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 全局错误提示 */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 card border-red-700 flex items-center gap-3 px-6">
          <span className="text-red-400">{error}</span>
          <button onClick={dismissError} className="text-gray-500 hover:text-gray-300">
            关闭
          </button>
        </div>
      )}

      {/* 视图路由 */}
      {currentView === 'home' && <HomeView />}
      {currentView === 'game' && (
        isJudge ? <JudgeConsole /> : <GameView />
      )}
      {currentView === 'admin' && <AdminDashboard />}
    </div>
  );
};

export default App;
