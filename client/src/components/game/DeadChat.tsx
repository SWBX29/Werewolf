/**
 * ============================================================================
 * DeadChat — 亡灵聊天组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 仅亡灵玩家可见的私密聊天区域
 *   2. 支持实时发送和接收消息
 *
 * 设计原则：
 *   - 只有死亡状态才渲染
 *   - 消息自动滚动到底部
 *   - 区分自己和他人的消息样式
 * ============================================================================
 */

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../useGameStore';

/** 亡灵聊天组件，仅亡灵玩家可见的私密聊天区域 */
const DeadChat: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const deadChatMessages = useGameStore((s) => s.deadChatMessages);
  const sendDeadChat = useGameStore((s) => s.sendDeadChat);

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // React Hooks 必须在所有条件返回之前调用
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deadChatMessages]);

  // 只有在观战模式（死亡状态）下才显示
  if (!playerState) return null;
  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.status === 'alive') return null;

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    sendDeadChat(trimmed);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="card p-3 border-purple-900/50 bg-gradient-to-br from-night-900 to-purple-950/30">
      {/* 标题 */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs">👻</span>
        <h4 className="text-sm font-semibold text-purple-400">亡灵低语</h4>
        <span className="text-xs text-gray-600 ml-auto">
          仅亡灵可见 · {deadChatMessages.length} 条
        </span>
      </div>

      {/* 消息列表 */}
      <div className="h-36 overflow-y-auto space-y-1 pr-1 bg-black/30 rounded-lg p-2 mb-2 border border-purple-900/20">
        {deadChatMessages.length === 0 && (
          <p className="text-xs text-purple-700/50 text-center py-4 italic">
            暂无亡灵低语...
          </p>
        )}
        {deadChatMessages.map((msg) => {
          const isSelf = msg.senderSeat === myPlayer.seatNumber;
          return (
            <div
              key={msg.id}
              className={`flex text-sm ${isSelf ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-2.5 py-1.5 rounded-lg ${
                  isSelf
                    ? 'bg-purple-900/30 text-purple-200 border border-purple-800/30'
                    : 'bg-night-800/80 text-gray-400 border border-night-700/50'
                }`}
              >
                {!isSelf && (
                  <div className="flex items-baseline gap-1 mb-0.5">
                    <span className="text-xs text-purple-400/70 font-semibold">
                      {msg.senderSeat}号 {msg.senderNickname}
                    </span>
                    <span className="text-[10px] text-gray-600">{formatTime(msg.timestamp)}</span>
                  </div>
                )}
                <p className={`text-sm break-words ${isSelf ? 'text-right' : ''}`}>
                  {isSelf && <span className="text-[10px] text-gray-600 mr-1">{formatTime(msg.timestamp)}</span>}
                  {msg.content}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="flex gap-2">
        <input
          type="text"
          className="input-field flex-1 text-sm bg-night-900/50 border-purple-800/30
                     placeholder-purple-700/50 focus:border-purple-600/50"
          placeholder="亡灵在此低语..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={200}
        />
        <button
          className="px-3 py-2 rounded-lg text-sm font-medium
                     bg-purple-800/40 hover:bg-purple-700/50 text-purple-300
                     border border-purple-700/30 transition-colors duration-200
                     disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleSend}
          disabled={!inputValue.trim()}
        >
          低语
        </button>
      </div>
    </div>
  );
};

export default DeadChat;
