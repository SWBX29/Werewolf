import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../../useGameStore';
import type { WolfChatMessage } from '@langrensha/shared';

/**
 * 狼人专属聊天区域 — 仅狼人子阶段可见
 */
export default function WolfChat() {
  const playerState = useGameStore((s) => s.playerState);
  const sendWolfChat = useGameStore((s) => s.sendWolfChat);

  const messages: WolfChatMessage[] = playerState?.wolfChatMessages ?? [];
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const content = input.trim();
    if (!content) return;
    sendWolfChat(content);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const content = input.trim();
      if (!content) return;
      handleSend();
    }
  };

  return (
    <div className="card border-red-900/50 bg-night-900/80 mt-3">
      <h3 className="text-sm font-semibold text-red-400 mb-2">🐺 狼群密语</h3>

      {/* 消息列表 */}
      <div
        ref={scrollRef}
        className="max-h-48 overflow-y-auto space-y-1 mb-2"
      >
        {messages.length === 0 && (
          <p className="text-xs text-gray-600">暂无消息</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="chat-msg chat-msg-other">
            <span className="text-red-400 font-mono">🐺{msg.senderSeat}号:</span>{' '}
            <span>{msg.content}</span>
          </div>
        ))}
      </div>

      {/* 输入框 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="发送密语..."
          className="input-field flex-1 text-sm py-1"
          maxLength={200}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="btn-secondary text-sm py-1"
        >
          发送
        </button>
      </div>
    </div>
  );
}
