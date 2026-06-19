/**
 * ============================================================================
 * AdminDashboard — 管理员日志复盘面板
 * ============================================================================
 *
 * 功能：
 *   1. 从后端拉取 MongoDB 数据
 *   2. 渲染全局日志的时间轴复盘
 *   3. 每条日志高亮显示当时的 nightActionOrderSnapshot
 *   4. 支持按房间码、时间范围、动作类型、阶段、操作人筛选
 *   5. 支持分页浏览
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useGameStore, getWsUrl } from '../useGameStore';
import type { ActionLogDTO, GamePhase, ActionType } from '@langrensha/shared';
import { ROLE_META, PHASE_NAMES } from '@langrensha/shared';

// ============================================================================
// 动作类型中文名映射
// ============================================================================

const ACTION_TYPE_NAMES: Record<ActionType, string> = {
  PLAYER_JOIN: '玩家加入',
  PLAYER_LEAVE: '玩家离开',
  PLAYER_READY: '玩家准备',
  GAME_START: '游戏开始',
  NIGHT_PHASE_START: '夜间开始',
  NIGHT_ACTION_SUBMIT: '夜间行动',
  NIGHT_ACTION_BLOCKED: '技能被封印',
  NIGHT_SETTLEMENT: '夜间结算',
  NIGHTMARE_DEFER: '恐惧延期',
  NIGHTMARE_BLOCK_MODE_DOWNGRADE: '恐惧模式降级',
  DAY_ANNOUNCE: '公布死讯',
  SPEECH_START: '发言开始',
  SPEECH_CONTENT: '发言内容',
  SPEECH_SKIP: '跳过发言',
  SPEECH_FINISH: '主动结束发言',
  VOTE_CAST: '投票',
  VOTE_RESULT: '投票结果',
  PK_VOTE_START: 'PK投票',
  KNIGHT_DUEL: '骑士决斗',
  WHITE_WOLF_EXPLODE: '白狼王自爆',
  HUNTER_GUN: '猎人开枪',
  WOLF_KING_GUN: '狼王开枪',
  IDIOT_REVEAL: '白痴翻牌',
  DEATH_SKILL_SKIP: '跳过死亡技能',
  JUDGE_OVERRIDE_SETTLEMENT: '法官改判',
  JUDGE_FORCE_NEXT_PHASE: '法官强制下一阶段',
  JUDGE_PAUSE: '法官暂停',
  JUDGE_RESUME: '法官恢复',
  JUDGE_MODIFY_SPEECH_ORDER: '法官修改发言顺序',
  JUDGE_MODIFY_NIGHT_ORDER: '法官修改夜间顺序',
  JUDGE_TRIGGER_KNIGHT_DUEL: '法官触发决斗',
  JUDGE_TRIGGER_WHITE_WOLF: '法官触发自爆',
  JUDGE_SKIP_SPEECH: '法官跳过发言',
  GAME_OVER: '游戏结束',
  PHASE_CHANGE: '阶段变更',
  TIMER_EXPIRED: '超时',
  WOLF_CHAT_MESSAGE: '狼人聊天',
  WOLF_VOTE_CAST: '狼人投票',
  WOLF_VOTE_CONSENSUS: '狼人投票一致',
  WOLF_VOTE_TIMEOUT_RANDOM: '狼人投票超时随机',
  WOLF_PHASE_SKIPPED: '狼人阶段跳过',
  GUARD_NO_VALID_TARGET: '守卫无合法目标',
  MECHANICAL_WOLF_SKILL_DEFERRED: '机械狼技能延迟',
  DEAD_CHAT_MESSAGE: '死亡玩家聊天',
  DAY_VOTE_IDENTITY_REVEAL: '白天票出身份揭示',
  SHERIFF_ELECTION_START: '警长选举开始',
  SHERIFF_ELECTION_VOTE: '警长选举投票',
  SHERIFF_ELECTED: '警长当选',
  SHERIFF_ELECTION_TIE: '警长选举平票',
  SHERIFF_TRANSFER: '警徽移交',
  SECOND_SPEECH_ROUND_START: '第二轮发言开始',
};

// ============================================================================
// 动作类型分类（用于分组显示）
// ============================================================================

const ACTION_TYPE_CATEGORIES: Array<{
  label: string;
  types: ActionType[];
}> = [
  {
    label: '大厅操作',
    types: ['PLAYER_JOIN', 'PLAYER_LEAVE', 'PLAYER_READY', 'GAME_START'],
  },
  {
    label: '夜间操作',
    types: [
      'NIGHT_PHASE_START', 'NIGHT_ACTION_SUBMIT', 'NIGHT_ACTION_BLOCKED',
      'NIGHT_SETTLEMENT', 'NIGHTMARE_DEFER', 'NIGHTMARE_BLOCK_MODE_DOWNGRADE',
      'WOLF_CHAT_MESSAGE', 'WOLF_VOTE_CAST', 'WOLF_VOTE_CONSENSUS',
      'WOLF_VOTE_TIMEOUT_RANDOM',
    ],
  },
  {
    label: '白天操作',
    types: [
      'DAY_ANNOUNCE', 'SPEECH_START', 'SPEECH_CONTENT', 'SPEECH_SKIP',
      'SPEECH_FINISH', 'VOTE_CAST', 'VOTE_RESULT', 'PK_VOTE_START',
    ],
  },
  {
    label: '特殊技能',
    types: ['KNIGHT_DUEL', 'WHITE_WOLF_EXPLODE', 'HUNTER_GUN', 'WOLF_KING_GUN', 'IDIOT_REVEAL'],
  },
  {
    label: '警长选举',
    types: [
      'SHERIFF_ELECTION_START', 'SHERIFF_ELECTION_VOTE', 'SHERIFF_ELECTED',
      'SHERIFF_ELECTION_TIE', 'SHERIFF_TRANSFER',
    ],
  },
  {
    label: '法官操作',
    types: [
      'JUDGE_OVERRIDE_SETTLEMENT', 'JUDGE_FORCE_NEXT_PHASE', 'JUDGE_PAUSE',
      'JUDGE_RESUME', 'JUDGE_MODIFY_SPEECH_ORDER', 'JUDGE_MODIFY_NIGHT_ORDER',
      'JUDGE_TRIGGER_KNIGHT_DUEL', 'JUDGE_TRIGGER_WHITE_WOLF', 'JUDGE_SKIP_SPEECH',
    ],
  },
  {
    label: '系统',
    types: ['GAME_OVER', 'PHASE_CHANGE', 'TIMER_EXPIRED'],
  },
  {
    label: 'V10',
    types: [
      'WOLF_PHASE_SKIPPED', 'GUARD_NO_VALID_TARGET', 'MECHANICAL_WOLF_SKILL_DEFERRED',
      'DEAD_CHAT_MESSAGE', 'DAY_VOTE_IDENTITY_REVEAL',
    ],
  },
];

// ============================================================================
// 筛选用的阶段列表（按任务要求排序）
// ============================================================================

const FILTER_PHASES: GamePhase[] = [
  'LOBBY', 'NIGHT', 'NIGHT_SETTLEMENT', 'DAY_ANNOUNCE',
  'SHERIFF_ELECTION', 'SHERIFF_TRANSFER', 'DAY_SPEECH',
  'PRE_VOTE_WAIT', 'DAY_VOTE', 'DAY_SETTLEMENT',
  'DAY_INTERRUPT', 'PK_VOTE', 'GAME_OVER',
];

// ============================================================================
// AdminDashboard 组件
// ============================================================================

const AdminDashboard: React.FC = () => {
  const {
    adminLogs,
    adminLogsTotal,
    adminLogsPage,
    adminLogsPageSize,
    adminLogsTotalPages,
    adminSecret,
    adminAuthSuccess,
    fetchAdminLogs,
    setAdminSecret,
    setView,
    connect,
    isConnected,
  } = useGameStore();

  // 筛选条件
  const [filterRoomCode, setFilterRoomCode] = useState('');
  const [filterActionTypes, setFilterActionTypes] = useState<ActionType[]>([]);
  const [filterPhases, setFilterPhases] = useState<GamePhase[]>([]);
  const [filterActorSeat, setFilterActorSeat] = useState<number | undefined>(undefined);
  const [filterFromTime, setFilterFromTime] = useState<number | undefined>(undefined);
  const [filterToTime, setFilterToTime] = useState<number | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // 密钥输入（本地状态，避免输入时组件消失）
  const [secretInput, setSecretInput] = useState(adminSecret);

  // 确保已连接
  useEffect(() => {
    if (!isConnected) {
      connect(getWsUrl());
    }
  }, [isConnected, connect]);

  // 同步服务端分页状态
  useEffect(() => {
    setCurrentPage(adminLogsPage);
    setPageSize(adminLogsPageSize);
  }, [adminLogsPage, adminLogsPageSize]);

  const handleFetch = useCallback((page?: number) => {
    if (!secretInput.trim()) return;
    setAdminSecret(secretInput.trim());
    fetchAdminLogs({
      roomCode: filterRoomCode.trim() || undefined,
      fromTime: filterFromTime,
      toTime: filterToTime,
      actionTypes: filterActionTypes.length > 0 ? filterActionTypes : undefined,
      phases: filterPhases.length > 0 ? filterPhases : undefined,
      actorSeat: filterActorSeat,
      page: page ?? currentPage,
      pageSize,
    });
  }, [secretInput, filterRoomCode, filterFromTime, filterToTime, filterActionTypes, filterPhases, filterActorSeat, currentPage, pageSize]);

  /** 切换动作类型选中状态 */
  const toggleActionType = (type: ActionType) => {
    setFilterActionTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  /** 选中/取消整个分类 */
  const toggleCategory = (types: ActionType[], selected: boolean) => {
    setFilterActionTypes((prev) => {
      if (selected) {
        // 添加该分类中尚未选中的
        const newSet = new Set(prev);
        types.forEach((t) => newSet.add(t));
        return Array.from(newSet);
      } else {
        // 移除该分类中所有已选中的
        return prev.filter((t) => !types.includes(t));
      }
    });
  };

  /** 切换阶段选中状态 */
  const togglePhase = (phase: GamePhase) => {
    setFilterPhases((prev) =>
      prev.includes(phase) ? prev.filter((p) => p !== phase) : [...prev, phase]
    );
  };

  /** 格式化时间戳 */
  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  /** 获取动作类型的样式 */
  const getActionStyle = (type: ActionType): string => {
    if (type.startsWith('JUDGE_')) return 'text-yellow-400';
    if (type.includes('DUEL') || type.includes('EXPLODE') || type.includes('GUN'))
      return 'text-red-400';
    if (type.includes('NIGHT')) return 'text-indigo-400';
    if (type.includes('VOTE')) return 'text-amber-400';
    if (type === 'GAME_OVER') return 'text-green-400';
    return 'text-gray-300';
  };

  // 分页操作
  const goToPage = (page: number) => {
    const p = Math.max(1, Math.min(page, adminLogsTotalPages || 1));
    setCurrentPage(p);
    handleFetch(p);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    // 立即查询
    if (secretInput.trim()) {
      setAdminSecret(secretInput.trim());
      fetchAdminLogs({
        roomCode: filterRoomCode.trim() || undefined,
        fromTime: filterFromTime,
        toTime: filterToTime,
        actionTypes: filterActionTypes.length > 0 ? filterActionTypes : undefined,
        phases: filterPhases.length > 0 ? filterPhases : undefined,
        actorSeat: filterActorSeat,
        page: 1,
        pageSize: size,
      });
    }
  };

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">
      {/* 顶部 */}
      <div className="card mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-wolf-400">管理员后台 — 日志复盘</h1>
        <div className="flex items-center gap-2">
          {adminAuthSuccess && (
            <button
              onClick={() => {
                useGameStore.getState().sendMessage({ type: 'ADMIN_CLEANUP_CONFIG', secret: adminSecret });
              }}
              className="btn-danger text-sm"
            >
              清除旧配置
            </button>
          )}
          <button onClick={() => setView('home')} className="btn-secondary text-sm">
            返回首页
          </button>
        </div>
      </div>

      {/* 管理员密钥输入（未鉴权时显示） */}
      {!adminAuthSuccess && (
        <div className="card mb-4">
          <h2 className="text-lg font-semibold mb-3">管理员鉴权</h2>
          <p className="text-sm text-gray-400 mb-3">请输入管理员密钥以访问后台功能</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500">管理员密钥</label>
              <input
                type="password"
                placeholder="输入管理员密钥"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                className="input-field w-full text-sm font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && secretInput.trim()) {
                    handleFetch();
                  }
                }}
              />
            </div>
            <button
              onClick={() => handleFetch()}
              disabled={!secretInput.trim()}
              className="btn-primary text-sm"
            >
              验证并查询
            </button>
          </div>
        </div>
      )}

      {/* 筛选栏 — 仅鉴权后显示 */}
      {adminAuthSuccess && (
      <div className="card mb-4">
        {/* 第一行：房间码 + 操作人 + 时间范围 + 查询 */}
        <div className="flex items-end gap-3 mb-3">
          <div className="w-32">
            <label className="text-xs text-gray-500">房间码</label>
            <input
              type="text"
              placeholder="留空全部"
              value={filterRoomCode}
              onChange={(e) => setFilterRoomCode(e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              className="input-field w-full text-sm font-mono"
            />
          </div>
          <div className="w-28">
            <label className="text-xs text-gray-500">操作人</label>
            <select
              value={filterActorSeat ?? ''}
              onChange={(e) => setFilterActorSeat(e.target.value === '' ? undefined : parseInt(e.target.value))}
              className="select-field w-full text-sm"
            >
              <option value="">全部</option>
              <option value="0">系统</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}号</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500">时间范围</label>
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={filterFromTime ? new Date(filterFromTime).toISOString().slice(0, 16) : ''}
                onChange={(e) => setFilterFromTime(e.target.value ? new Date(e.target.value).getTime() : undefined)}
                className="input-field w-full text-sm"
              />
              <input
                type="datetime-local"
                value={filterToTime ? new Date(filterToTime).toISOString().slice(0, 16) : ''}
                onChange={(e) => setFilterToTime(e.target.value ? new Date(e.target.value).getTime() : undefined)}
                className="input-field w-full text-sm"
              />
            </div>
          </div>
          <button onClick={() => handleFetch(1)} className="btn-primary text-sm whitespace-nowrap">
            查询
          </button>
        </div>

        {/* 第二行：游戏阶段筛选（标签式多选） */}
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">游戏阶段</label>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_PHASES.map((phase) => (
              <button
                key={phase}
                onClick={() => togglePhase(phase)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  filterPhases.includes(phase)
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-night-800 border-night-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {PHASE_NAMES[phase]}
              </button>
            ))}
          </div>
        </div>

        {/* 第三行：动作类型筛选（分组标签式多选） */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">动作类型</label>
          <div className="space-y-2">
            {ACTION_TYPE_CATEGORIES.map((cat) => {
              const allSelected = cat.types.every((t) => filterActionTypes.includes(t));
              const someSelected = cat.types.some((t) => filterActionTypes.includes(t));
              return (
                <div key={cat.label} className="flex items-start gap-2">
                  <button
                    onClick={() => toggleCategory(cat.types, !allSelected)}
                    className={`text-xs px-2 py-1 rounded border whitespace-nowrap mt-0.5 transition-colors ${
                      allSelected
                        ? 'bg-wolf-600 border-wolf-500 text-white'
                        : someSelected
                        ? 'bg-wolf-900 border-wolf-700 text-wolf-300'
                        : 'bg-night-800 border-night-700 text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    {cat.label}
                  </button>
                  <div className="flex flex-wrap gap-1">
                    {cat.types.map((type) => (
                      <button
                        key={type}
                        onClick={() => toggleActionType(type)}
                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                          filterActionTypes.includes(type)
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-night-800 border-night-700 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {ACTION_TYPE_NAMES[type]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          共 {adminLogsTotal} 条记录，第 {adminLogsPage}/{adminLogsTotalPages} 页
        </p>
      </div>
      )}

      {/* 时间轴 — 仅鉴权后显示 */}
      {adminAuthSuccess && (
      <div className="relative">
        {/* 时间轴竖线 */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-night-700" />

        <div className="space-y-0">
          {adminLogs.map((log, index) => (
            <div key={log.id} className="relative pl-10 pb-4">
              {/* 时间轴节点 */}
              <div
                className={`absolute left-3 top-2 w-3 h-3 rounded-full border-2 ${
                  log.overridden
                    ? 'bg-yellow-500 border-yellow-400'
                    : log.actionType === 'GAME_OVER'
                    ? 'bg-green-500 border-green-400'
                    : 'bg-night-600 border-night-500'
                }`}
              />

              {/* 日志卡片 */}
              <div
                className={`card text-sm ${
                  log.overridden ? 'border-yellow-800 bg-yellow-950/10' : ''
                }`}
              >
                {/* 头部：时间 + 阶段 + 动作类型 */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500 font-mono">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className="tag bg-night-700 text-gray-400 text-xs">
                    {PHASE_NAMES[log.phase]} R{log.round}
                  </span>
                  <span className={`font-medium ${getActionStyle(log.actionType)}`}>
                    {ACTION_TYPE_NAMES[log.actionType] || log.actionType}
                  </span>
                  {log.overridden && (
                    <span className="tag bg-yellow-900 text-yellow-300 text-xs">已改判</span>
                  )}
                </div>

                {/* 操作人 → 目标 */}
                <div className="text-gray-300">
                  <span className="text-gray-400">{log.actorSeat}号 {log.actorNickname}</span>
                  {log.targetSeat !== null && (
                    <>
                      <span className="text-gray-600 mx-1">→</span>
                      <span>{log.targetSeat}号 {log.targetNickname || ''}</span>
                    </>
                  )}
                </div>

                {/* 改判原因 */}
                {log.overridden && log.overrideReason && (
                  <p className="text-yellow-400 text-xs mt-1">
                    改判原因：{log.overrideReason}
                  </p>
                )}

                {/* ★ 夜间行动顺序快照（高亮显示） */}
                {log.nightActionOrderSnapshot.length > 0 && (
                  <div className="mt-2 p-2 bg-night-800 rounded border border-night-700">
                    <span className="text-xs text-gray-500">当时夜间顺序：</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {log.nightActionOrderSnapshot.map((roleId, i) => (
                        <span
                          key={`${roleId}-${i}`}
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            roleId === 'nightmare_shadow'
                              ? 'bg-purple-900 text-purple-300'
                              : 'bg-night-700 text-gray-400'
                          }`}
                        >
                          {ROLE_META[roleId].name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 详细数据（可展开） */}
                {log.detail && Object.keys(log.detail).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
                      详细数据
                    </summary>
                    <pre className="text-xs text-gray-500 mt-1 overflow-x-auto">
                      {JSON.stringify(log.detail, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          ))}

          {adminLogs.length === 0 && (
            <div className="text-center text-gray-600 py-8">
              暂无日志数据，请点击查询按钮拉取
            </div>
          )}
        </div>
      </div>
      )}

      {/* 分页控件 — 仅鉴权后且有数据时显示 */}
      {adminAuthSuccess && adminLogsTotalPages > 0 && (
        <div className="card mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">每页</label>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
              className="select-field text-sm w-20"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="btn-secondary text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="text-sm text-gray-400">
              {currentPage} / {adminLogsTotalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= adminLogsTotalPages}
              className="btn-secondary text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
