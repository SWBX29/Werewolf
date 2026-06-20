/**
 * ============================================================================
 * EventLog — 模拟器事件日志面板
 * ============================================================================
 *
 * 架构说明：
 *   1. 按时间轴展示模拟器产生的系统/行动/结果/法官/错误事件
 *   2. 支持按分类筛选
 *   3. 面板可折叠，高度可拖拽调整
 *   4. 新事件自动滚动到底部
 *
 * 设计原则：
 *   - 纯展示组件，从 useSimulatorStore 读取事件数据
 *   - 使用等宽字体便于阅读时间戳和阶段标签
 * ============================================================================
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSimulatorStore } from './useSimulatorStore';
import { PHASE_NAMES } from '@langrensha/shared';
import type { SimEvent } from './types';

type CategoryFilter = 'all' | SimEvent['category'];

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: '全部',
  system: '系统',
  action: '行动',
  result: '结果',
  judge: '法官',
  error: '错误',
};

const CATEGORY_COLORS: Record<SimEvent['category'], string> = {
  system: 'bg-blue-500/20 text-blue-300',
  action: 'bg-yellow-500/20 text-yellow-300',
  result: 'bg-green-500/20 text-green-300',
  judge: 'bg-purple-500/20 text-purple-300',
  error: 'bg-red-500/20 text-red-300',
};

/** 模拟器事件日志面板，按时间轴展示并支持分类筛选 */
export default function EventLog() {
  const eventLog = useSimulatorStore((s) => s.eventLog);

  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [height, setHeight] = useState(280);
  const listRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const filteredEvents =
    filter === 'all' ? eventLog : eventLog.filter((e) => e.category === filter);

  // 新事件自动滚动到底部
  useEffect(() => {
    if (!collapsed && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filteredEvents.length, collapsed]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startHeight.current = height;

      const handleMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = startY.current - ev.clientY;
        const next = Math.max(80, Math.min(600, startHeight.current + delta));
        setHeight(next);
      };

      const handleUp = () => {
        dragging.current = false;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [height],
  );

  return (
    <div
      className="flex flex-col border-t border-gray-700 bg-gray-900/95 select-none shrink-0"
      style={{ height: collapsed ? undefined : height, minHeight: collapsed ? undefined : 80 }}
    >
      {/* 拖拽调整高度手柄 — 非折叠时始终可见 */}
      {!collapsed && (
        <div
          className="h-1.5 cursor-ns-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors shrink-0"
          onMouseDown={handleDragStart}
        />
      )}

      {/* 头部 */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/80 border-b border-gray-700 cursor-pointer shrink-0"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="text-xs font-medium text-gray-300">
          事件日志 ({eventLog.length})
        </span>
        <span className="ml-auto text-gray-500 text-xs">
          {collapsed ? '▶' : '▼'}
        </span>
      </div>

      {/* 分类筛选按钮 */}
      {!collapsed && (
        <div className="flex gap-1 px-3 py-1.5 border-b border-gray-700/50 shrink-0">
          {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((cat) => (
            <button
              key={cat}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                filter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setFilter(cat);
              }}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}

      {/* 事件列表 */}
      {!collapsed && (
        <div
          ref={listRef}
          className="overflow-y-auto flex-1 px-2 py-1 font-mono text-xs leading-5"
        >
          {filteredEvents.length === 0 ? (
            <div className="text-gray-600 text-center py-4">暂无事件</div>
          ) : (
            filteredEvents.map((event, i) => (
              <div key={i} className="flex gap-1.5 hover:bg-gray-800/50 rounded px-1">
                <span>{event.icon}</span>
                <span className="text-gray-500 shrink-0">
                  {new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                </span>
                <span className="text-gray-600">|</span>
                <span className={`shrink-0 px-1 rounded text-[10px] leading-4 self-center ${CATEGORY_COLORS[event.category]}`}>
                  {PHASE_NAMES[event.phase] ?? event.phase}
                </span>
                <span className="text-gray-600">|</span>
                <span className="text-gray-300 break-all">{event.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
