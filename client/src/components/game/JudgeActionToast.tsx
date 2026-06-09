/**
 * JudgeActionToast — 法官操作通知 Toast
 *
 * 在玩家视角实时展示法官介入操作（暂停、改判、跳过发言等），
 * 每条通知 5 秒后自动消失，也可手动关闭。
 */

import React from 'react';
import { useGameStore } from '../../useGameStore';
import type { JudgeActionType } from '@langrensha/shared';

/** 操作类型 → 图标映射 */
const ACTION_ICONS: Record<JudgeActionType, string> = {
  PAUSE: '⏸',
  RESUME: '▶',
  FORCE_NEXT_PHASE: '⏭',
  OVERRIDE_SETTLEMENT: '⚖',
  SKIP_SPEECH: '⏩',
  MODIFY_SPEECH_ORDER: '🔀',
  MODIFY_NIGHT_ORDER: '🌙',
  TRIGGER_KNIGHT_DUEL: '⚔',
  TRIGGER_WHITE_WOLF: '🐺',
};

/** 操作类型 → 背景色映射 */
const ACTION_COLORS: Record<JudgeActionType, string> = {
  PAUSE: 'bg-yellow-900/80 border-yellow-700',
  RESUME: 'bg-green-900/80 border-green-700',
  FORCE_NEXT_PHASE: 'bg-blue-900/80 border-blue-700',
  OVERRIDE_SETTLEMENT: 'bg-red-900/80 border-red-700',
  SKIP_SPEECH: 'bg-purple-900/80 border-purple-700',
  MODIFY_SPEECH_ORDER: 'bg-indigo-900/80 border-indigo-700',
  MODIFY_NIGHT_ORDER: 'bg-indigo-900/80 border-indigo-700',
  TRIGGER_KNIGHT_DUEL: 'bg-orange-900/80 border-orange-700',
  TRIGGER_WHITE_WOLF: 'bg-orange-900/80 border-orange-700',
};

function JudgeActionToast() {
  const judgeActions = useGameStore((s) => s.judgeActions);
  const dismissJudgeAction = useGameStore((s) => s.dismissJudgeAction);
  const isJudge = useGameStore((s) => s.isJudge);

  // 法官自己不需要看到操作通知（法官在 JudgeConsole 里有反馈）
  if (isJudge || judgeActions.length === 0) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {judgeActions.map((action) => (
        <div
          key={action.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-lg border shadow-lg animate-fade-in-up ${ACTION_COLORS[action.action] ?? 'bg-gray-900/80 border-gray-700'}`}
        >
          <span className="text-lg">{ACTION_ICONS[action.action] ?? '📢'}</span>
          <span className="text-sm text-gray-100 font-medium">{action.message}</span>
          <button
            onClick={() => dismissJudgeAction(action.id)}
            className="ml-2 text-gray-500 hover:text-gray-300 text-xs"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default React.memo(JudgeActionToast);
