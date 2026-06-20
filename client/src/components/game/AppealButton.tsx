/**
 * ============================================================================
 * AppealButton — 申诉与仲裁投票组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 提供申诉入口按钮，玩家可对争议事件发起仲裁请求
 *   2. 展开申诉面板，显示事件描述与自动附加材料
 *   3. 仲裁投票面板，允许其他玩家对法官裁决进行支持或驳回
 *
 * 设计原则：
 *   - 申诉与仲裁互斥显示，同一时刻仅展示一个面板
 *   - 仲裁投票仅可操作一次，投票后锁定
 *   - 面板浮动定位在右下角，不遮挡主界面
 * ============================================================================
 */

import React, { useState } from 'react';
import { useGameStore } from '../../useGameStore';

/** 申诉与仲裁投票组件，提供争议事件的申诉提交和仲裁投票功能 */
const AppealButton: React.FC = () => {
  const appealEvent = useGameStore((s) => s.appealEvent);
  const showArbitration = useGameStore((s) => s.showArbitration);
  const arbitrationEvent = useGameStore((s) => s.arbitrationEvent);
  const sendMessage = useGameStore((s) => s.sendMessage);

  const [isExpanded, setIsExpanded] = useState(false);
  const [arbitrationVoted, setArbitrationVoted] = useState(false);

  // 无申诉事件且无仲裁面板时，不渲染
  if (!appealEvent && !showArbitration) return null;

  /** 提交申诉请求 */
  const handleSubmitAppeal = () => {
    if (!appealEvent) return;
    sendMessage({
      type: 'APPEAL',
      eventId: appealEvent.eventId,
    });
    setIsExpanded(false);
  };

  /** 提交仲裁投票（支持或驳回法官裁决） */
  const handleArbitrationVote = (support: boolean) => {
    if (!arbitrationEvent || arbitrationVoted) return;
    sendMessage({
      type: 'ARBITRATION_VOTE',
      eventId: arbitrationEvent.eventId,
      support,
    });
    setArbitrationVoted(true);
  };

  return (
    <>
      {/* 申诉按钮 */}
      {appealEvent && !isExpanded && (
        <button className="appeal-btn" onClick={() => setIsExpanded(true)}>
          <span className="text-xl">!</span>
        </button>
      )}

      {/* 申诉面板 */}
      {isExpanded && appealEvent && (
        <div className="fixed bottom-6 right-6 z-40 w-80 card space-y-3 animate-slide-in-right">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-red-400">申诉仲裁</h4>
            <button
              className="text-gray-500 hover:text-gray-300 text-lg"
              onClick={() => setIsExpanded(false)}
            >
              ✕
            </button>
          </div>

          <p className="text-sm text-gray-300">{appealEvent.description}</p>

          {/* 自动附加的日志材料 */}
          {appealEvent.logs.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500">自动附加材料：</p>
              <div className="max-h-24 overflow-y-auto bg-night-900 rounded p-2">
                {appealEvent.logs.map((log, idx) => (
                  <p key={idx} className="text-xs text-gray-600 font-mono">
                    {log}
                  </p>
                ))}
              </div>
            </div>
          )}

          <button className="btn-danger w-full" onClick={handleSubmitAppeal}>提交仲裁</button>
        </div>
      )}

      {/* 仲裁投票面板 */}
      {showArbitration && arbitrationEvent && (
        <div className="fixed bottom-6 right-6 z-40 w-80 card space-y-3 animate-slide-in-right">
          <h4 className="text-sm font-bold text-amber-400">仲裁投票</h4>
          <p className="text-sm text-gray-300">{arbitrationEvent.description}</p>
          {arbitrationVoted ? (
            <p className="text-sm text-green-400 text-center py-2">✓ 已投票，等待结果</p>
          ) : (
            <div className="flex gap-2">
              <button className="btn-secondary flex-1 text-sm" onClick={() => handleArbitrationVote(true)}>支持法官</button>
              <button className="btn-danger flex-1 text-sm" onClick={() => handleArbitrationVote(false)}>驳回法官</button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default React.memo(AppealButton);
