/**
 * ============================================================================
 * AdminDashboard — 管理员日志复盘面板
 * ============================================================================
 *
 * 功能：
 *   1. 从后端拉取 MongoDB 数据
 *   2. 渲染全局日志的时间轴复盘
 *   3. 每条日志高亮显示当时的 nightActionOrderSnapshot
 *   4. 支持按房间码、时间范围筛选
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useGameStore } from '../useGameStore';
import type { ActionLogDTO, GamePhase, ActionType } from '@langrensha/shared';
import { ROLE_META } from '@langrensha/shared';

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
  VOTE_CAST: '投票',
  VOTE_RESULT: '投票结果',
  PK_VOTE_START: 'PK投票',
  KNIGHT_DUEL: '骑士决斗',
  WHITE_WOLF_EXPLODE: '白狼王自爆',
  HUNTER_GUN: '猎人开枪',
  WOLF_KING_GUN: '狼王开枪',
  IDIOT_REVEAL: '白痴翻牌',
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
  JUDGE_ELECTION_START: '法官选举开始',
  JUDGE_ELECTION_VOTE: '法官选举投票',
  JUDGE_ELECTED: '法官当选',
  JUDGE_ELECTION_TIE: '法官选举平票',
};

const PHASE_NAMES: Record<GamePhase, string> = {
  LOBBY: '大厅',
  NIGHT: '夜间',
  NIGHT_SETTLEMENT: '夜间结算',
  DAY_ANNOUNCE: '公布死讯',
  DAY_SPEECH: '发言',
  DAY_VOTE: '投票',
  DAY_SETTLEMENT: '白天结算',
  DAY_INTERRUPT: '中断',
  PK_VOTE: 'PK',
  JUDGE_ELECTION: '法官选举',
  GAME_OVER: '结束',
};

// ============================================================================
// AdminDashboard 组件
// ============================================================================

const AdminDashboard: React.FC = () => {
  const {
    adminLogs,
    adminLogsTotal,
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
  const [filterLimit, setFilterLimit] = useState(50);

  // 密钥输入（本地状态，避免输入时组件消失）
  const [secretInput, setSecretInput] = useState(adminSecret);

  // 确保已连接
  useEffect(() => {
    if (!isConnected) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url =
        window.location.port === '5173' || window.location.hostname === 'localhost'
          ? `${protocol}//localhost:3001`
          : `${protocol}//${window.location.host}`;
      connect(url);
    }
  }, []);

  const handleFetch = () => {
    if (!secretInput.trim()) return;
    setAdminSecret(secretInput.trim());
    fetchAdminLogs(
      filterRoomCode.trim() || undefined,
      undefined,
      undefined,
      filterLimit,
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
              onClick={handleFetch}
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
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500">房间码</label>
            <input
              type="text"
              placeholder="留空查询全部"
              value={filterRoomCode}
              onChange={(e) => setFilterRoomCode(e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              className="input-field w-full text-sm font-mono"
            />
          </div>
          <div className="w-24">
            <label className="text-xs text-gray-500">条数</label>
            <select
              value={filterLimit}
              onChange={(e) => setFilterLimit(parseInt(e.target.value))}
              className="select-field w-full text-sm"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
          <button onClick={handleFetch} className="btn-primary text-sm">
            查询
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          共 {adminLogsTotal} 条记录，当前显示 {adminLogs.length} 条
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
    </div>
  );
};

export default AdminDashboard;
