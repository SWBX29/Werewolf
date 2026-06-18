import React from 'react';
import { useGameStore } from '../../useGameStore';
import type { GamePhase } from '@langrensha/shared';
import { ROLE_META, PHASE_NAMES } from '@langrensha/shared';
import CountdownTimer from './CountdownTimer';

/**
 * 顶部状态栏组件
 * 显示：当前阶段、倒计时、行动提示、网络状态
 */
function StatusBar() {
  const playerState = useGameStore((s) => s.playerState);
  const phaseTimeRemaining = useGameStore((s) => s.phaseTimeRemaining);
  const isConnected = useGameStore((s) => s.isConnected);
  const isReconnecting = useGameStore((s) => s.isReconnecting);
  const reconnectAttempts = useGameStore((s) => s.reconnectAttempts);
  const manualReconnect = useGameStore((s) => s.manualReconnect);
  const judgeState = useGameStore((s) => s.judgeState);
  const isJudge = useGameStore((s) => s.isJudge);

  if (!playerState && !judgeState) return null;

  const phase = isJudge ? judgeState!.phase : playerState!.phase;
  const round = isJudge ? judgeState!.round : playerState!.round;
  const isPaused = isJudge ? judgeState!.isPaused : playerState!.isPaused;
  const nightActionRequest = !isJudge ? playerState!.nightActionRequest : null;

  // 构建阶段显示文本
  let phaseText = PHASE_NAMES[phase] || phase;

  // 夜间阶段显示子阶段信息
  // Bug 64 修复：添加 nightSubPhase 存在性检查，避免 undefined 访问
  if (phase === 'NIGHT' && isJudge && judgeState?.nightSubPhase) {
    const sub = judgeState.nightSubPhase;
    const roleName = ROLE_META[sub.currentRole]?.name || sub.currentRole;
    phaseText = `第${round}夜·${roleName}行动`;
  } else if (phase === 'NIGHT' && !isJudge && nightActionRequest?.roleId) {
    // 普通玩家从 nightActionRequest 推断当前行动角色
    // Bug 64 修复：添加 roleId 存在性检查
    const roleName = ROLE_META[nightActionRequest.roleId]?.name || nightActionRequest.roleId;
    phaseText = `第${round}夜·${roleName}行动`;
  } else if (phase === 'NIGHT') {
    phaseText = `第${round}夜`;
  } else if (phase === 'DAY_SPEECH' || phase === 'PRE_VOTE_WAIT' || phase === 'DAY_VOTE' || phase === 'DAY_ANNOUNCE') {
    phaseText = `第${round}天·${PHASE_NAMES[phase]}`;
  }

  // 判断当前玩家是否需要行动
  const needsAction = nightActionRequest !== null;

  // 行动提示文本
  let actionHint = '';
  if (needsAction && nightActionRequest) {
    const roleName = ROLE_META[nightActionRequest.roleId]?.name || nightActionRequest.roleId;
    actionHint = nightActionRequest.hint || `轮到你行动（${roleName}）`;
  }

  // 网络状态指示灯
  const networkDot = isReconnecting
    ? 'bg-yellow-400 animate-pulse'
    : isConnected
      ? 'bg-green-400'
      : 'bg-red-500';

  const networkTitle = isReconnecting
    ? `重连中(${reconnectAttempts})...`
    : isConnected
      ? '已连接'
      : '已断开';

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-night-900/80 border-b border-night-700 backdrop-blur-sm">
      {/* 暂停指示 */}
      {isPaused && (
        <div className="flex-shrink-0 animate-pulse">
          <span className="text-xs font-bold text-yellow-300 bg-yellow-900/40 px-2 py-1 rounded">
            ⏸ 已暂停
          </span>
        </div>
      )}

      {/* 阶段名称 */}
      <div className="flex-shrink-0">
        <span className="text-sm font-semibold text-gray-200">{phaseText}</span>
      </div>

      {/* 倒计时 — 大厅和夜晚阶段不在顶部显示 */}
      {phase !== 'LOBBY' && phase !== 'NIGHT' && phase !== 'NIGHT_SETTLEMENT' && (
        <div className="flex-1 max-w-xs">
          <CountdownTimer seconds={phaseTimeRemaining} />
        </div>
      )}

      {/* 行动提示 */}
      {needsAction && actionHint && (
        <div className="flex-shrink-0 animate-pulse">
          <span className="text-xs font-bold text-wolf-400 bg-wolf-900/40 px-2 py-1 rounded">
            ⚡ {actionHint}
          </span>
        </div>
      )}

      {/* 网络状态 */}
      <div className="flex-shrink-0 flex items-center gap-1.5" title={networkTitle}>
        <span className={`w-2 h-2 rounded-full ${networkDot}`} />
        <span className="text-xs text-gray-500">{networkTitle}</span>
        {!isConnected && !isReconnecting && (
          <button
            onClick={manualReconnect}
            className="text-xs text-blue-400 hover:text-blue-300 underline ml-1"
          >
            重连
          </button>
        )}
      </div>
    </div>
  );
}

export default React.memo(StatusBar);
