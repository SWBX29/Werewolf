/**
 * ============================================================================
 * 狼人杀联机游戏 — 前端入口组件
 * ============================================================================
 *
 * 功能：
 *   1. 根据路由状态渲染不同的视图组件
 *   2. 初始化 WebSocket 连接
 *   3. 全局错误提示和连接状态指示
 *   4. 骨架屏管理 — 首屏加载完成后隐藏
 *   5. 组件预加载 — 首页加载后自动预加载游戏组件
 * ============================================================================
 */

import React, { useEffect, useRef, lazy, Suspense, useState } from 'react';
import { useGameStore, getWsUrl } from './useGameStore';
import { useVoiceStore } from './store/useVoiceStore';

// 路由级代码分割：仅首屏 HomeView 同步导入，其余视图按需懒加载
const HomeView = lazy(() => import('./components/HomeView'));
const JudgeConsole = lazy(() => import('./components/JudgeConsole'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const GameView = lazy(() => import('./components/game/GameView'));

// ============================================================================
// 组件预加载策略 — 首页加载后自动预加载游戏组件
// ============================================================================

interface PreloadProgress {
  gameView: boolean;
  nightPanels: boolean;
  skillComponents: boolean;
  zegoSdk: boolean;
}

/**
 * 预加载游戏组件 — 按优先级预加载
 * 优先级：GameView → 夜间面板 → 技能组件 → ZEGO SDK
 */
async function preloadGameComponents(
  onProgress?: (progress: PreloadProgress) => void
): Promise<void> {
  const progress: PreloadProgress = {
    gameView: false,
    nightPanels: false,
    skillComponents: false,
    zegoSdk: false,
  };

  try {
    // 1. 预加载 GameView（最高优先级）
    await import('./components/game/GameView');
    progress.gameView = true;
    onProgress?.({ ...progress });

    // 2. 预加载夜间面板（并行加载）
    await Promise.all([
      import('./components/game/night/NightPhase'),
      import('./components/game/night/NightWaiting'),
      import('./components/game/night/NightmarePanel'),
      import('./components/game/night/WolfVotePanel'),
      import('./components/game/night/WitchPanel'),
      import('./components/game/night/SeerPanel'),
      import('./components/game/night/GuardPanel'),
      import('./components/game/night/MechanicalWolfPanel'),
    ]);
    progress.nightPanels = true;
    onProgress?.({ ...progress });

    // 3. 预加载技能组件（并行加载）
    await Promise.all([
      import('./components/game/skills/HunterGun'),
      import('./components/game/skills/IdiotReveal'),
      import('./components/game/skills/KnightDuel'),
      import('./components/game/skills/WhiteWolfExplode'),
      import('./components/game/skills/WolfKingGun'),
    ]);
    progress.skillComponents = true;
    onProgress?.({ ...progress });

    // 4. 预加载 ZEGO SDK（最低优先级，体积最大）
    // 通过 fetch 触发 ZEGO SDK 的动态 import
    try {
      const response = await fetch('/api/zego/token?userId=preload');
      if (response.ok) {
        // ZEGO SDK 会在 useVoiceStore.initVoice 中动态加载
        progress.zegoSdk = true;
        onProgress?.({ ...progress });
      }
    } catch (e) {
      console.warn('[Preload] ZEGO SDK 预加载失败，将在需要时加载', e);
    }

    console.log('[Preload] 游戏组件预加载完成', progress);
  } catch (e) {
    console.error('[Preload] 预加载失败', e);
  }
}

/**
 * 预加载非首屏 chunk — 首页渲染完成后利用浏览器空闲时间后台拉取
 * React.lazy 底层就是动态 import()，提前调用 import() 会让浏览器缓存 chunk，
 * 后续 lazy() 渲染时直接命中缓存，实现"秒切"体验。
 */
let _prefetchScheduled = false;

function prefetchChunks(): void {
  if (_prefetchScheduled) return;
  _prefetchScheduled = true;

  const prefetch = async () => {
    // 1. 预加载非游戏视图（AdminDashboard、JudgeConsole）
    import('./components/AdminDashboard');
    import('./components/JudgeConsole');

    // 2. 预加载游戏组件（按优先级）
    await preloadGameComponents();
  };

  // requestIdleCallback 优先，不可用时降级为 setTimeout
  if (typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(prefetch, { timeout: 5000 });
  } else {
    setTimeout(prefetch, 2000);
  }
}

// 视图切换加载占位
const ViewLoading: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex items-center gap-3 text-gray-400">
      <div className="w-5 h-5 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin" />
      <span className="text-sm">加载中...</span>
    </div>
  </div>
);

// ============================================================================
// App 根组件
// ============================================================================

const App: React.FC = () => {
  const currentView = useGameStore((s) => s.currentView);
  const isConnected = useGameStore((s) => s.isConnected);
  const isReconnecting = useGameStore((s) => s.isReconnecting);
  const reconnectAttempts = useGameStore((s) => s.reconnectAttempts);
  const isJudge = useGameStore((s) => s.isJudge);
  const error = useGameStore((s) => s.error);
  const dismissError = useGameStore((s) => s.dismissError);
  const manualReconnect = useGameStore((s) => s.manualReconnect);

  // 语音房间监听所需的状态
  const roomCode = useGameStore((s) => s.roomCode);
  const playerId = useGameStore((s) => s.playerId);
  const nickname = useGameStore((s) => s.nickname);
  const roomDissolvedData = useGameStore((s) => s.roomDissolvedData);

  // 追踪上一次加入语音房间的 roomCode，防止重复加入
  const voiceRoomRef = useRef<string | null>(null);

  // 骨架屏状态 — 首屏加载完成后隐藏
  const [skeletonVisible, setSkeletonVisible] = useState(true);

  // 初始化 WebSocket 连接
  useEffect(() => {
    if (!isConnected && !isReconnecting) {
      useGameStore.getState().connect(getWsUrl());
    }
  }, []);

  // 首屏渲染完成后，隐藏骨架屏并预加载剩余 chunk
  useEffect(() => {
    // 延迟隐藏骨架屏，确保首屏内容已渲染
    const hideSkeleton = () => {
      const skeleton = document.getElementById('skeleton');
      if (skeleton) {
        skeleton.classList.add('skeleton-hidden');
        // 等待过渡动画完成后移除骨架屏
        setTimeout(() => {
          setSkeletonVisible(false);
        }, 300);
      }
    };

    // 首屏渲染完成后隐藏骨架屏
    const timer = setTimeout(hideSkeleton, 100);

    // 触发预加载
    prefetchChunks();

    return () => clearTimeout(timer);
  }, []);

  // Zego 语音服务：延迟到进入游戏时才初始化，避免首屏加载 1.9MB SDK
  const zegoAppID = useRef<number | null>(null);
  const zegoInitPromise = useRef<Promise<void> | null>(null);
  const zegoInitialized = useRef<boolean>(false); // 标记是否已成功初始化

  useEffect(() => {
    // 仅当切换到游戏视图时才初始化 Zego SDK
    if (currentView === 'game' && !zegoInitPromise.current && !zegoInitialized.current) {
      zegoInitPromise.current = (async () => {
        const timestamp = new Date().toISOString().substring(11, 23);
        console.log(`[${timestamp}][App] 开始初始化 Zego 语音服务`);

        try {
          const response = await fetch('/api/zego/token?userId=init');
          if (!response.ok) {
            throw new Error(`获取 Zego Token 失败: ${response.status}`);
          }
          const data = await response.json();

          // 检查是否已有 appID（防止重复初始化）
          if (zegoAppID.current && zegoAppID.current === data.appID) {
            console.log(`[${timestamp}][App] Zego 已初始化，appID=${data.appID}，跳过重复初始化`);
            zegoInitialized.current = true;
            return;
          }

          zegoAppID.current = data.appID;
          await useVoiceStore.getState().initVoice(data.appID);
          zegoInitialized.current = true;
          console.log(`[${timestamp}][App] Zego 语音服务初始化成功，appID=${data.appID}`);
        } catch (e) {
          console.warn(`[${timestamp}][App] Zego 语音服务初始化失败，语音功能不可用`, e);
          // 初始化失败时清除 Promise，允许重新初始化
          zegoInitPromise.current = null;
          zegoInitialized.current = false;
        }
      })();
    }

    // 离开游戏视图（回首页）时不销毁，保持语音连接
    // 仅在组件卸载（页面关闭）时销毁
    return () => {
      // 仅组件卸载时销毁，currentView 变化不触发销毁
    };
  }, [currentView]);

  // 页面卸载时销毁语音服务
  useEffect(() => {
    // beforeunload 事件处理：尝试退出语音房间
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const timestamp = new Date().toISOString().substring(11, 23);
      console.log(`[${timestamp}][App] beforeunload 事件触发，尝试退出语音房间`);
      
      // 尝试退出语音房间（注意：浏览器可能限制异步操作完成）
      useVoiceStore.getState().leaveVoiceRoom();
      
      // 可选：显示确认对话框（如果需要）
      // event.preventDefault();
      // event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      useVoiceStore.getState().destroyVoice();
    };
  }, []);

  // 监听房间状态变化，自动加入/退出语音房间
  useEffect(() => {
    const timestamp = new Date().toISOString().substring(11, 23);

    // 进入游戏视图且有房间信息时，加入语音房间
    if (currentView === 'game' && roomCode && playerId && nickname) {
      // 避免重复加入同一房间
      if (voiceRoomRef.current !== roomCode) {
        console.log(`[${timestamp}][App] 加入语音房间: roomCode=${roomCode}, playerId=${playerId}`);
        voiceRoomRef.current = roomCode;
        useVoiceStore.getState().joinVoiceRoom(roomCode, playerId, nickname);
      }
    }

    // 房间解散或离开游戏视图时，退出语音房间
    if (currentView !== 'game' || roomDissolvedData || !roomCode) {
      if (voiceRoomRef.current) {
        console.log(`[${timestamp}][App] 退出语音房间: voiceRoomRef=${voiceRoomRef.current}, reason=${roomDissolvedData ? 'roomDissolved' : currentView !== 'game' ? 'viewChanged' : 'noRoomCode'}`);
        voiceRoomRef.current = null;
        useVoiceStore.getState().leaveVoiceRoom();
      }
    }
  }, [currentView, roomCode, playerId, nickname, roomDissolvedData]);

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

      {/* 视图路由 — Suspense 包裹懒加载组件 */}
      <Suspense fallback={<ViewLoading />}>
        {currentView === 'home' && <HomeView />}
        {currentView === 'game' && (
          isJudge ? <JudgeConsole /> : <GameView />
        )}
        {currentView === 'admin' && <AdminDashboard />}
      </Suspense>
    </div>
  );
};

export default App;
