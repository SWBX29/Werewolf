/**
 * ============================================================================
 * JudgeConsole — 法官上帝控制台
 * ============================================================================
 *
 * 功能：
 *   1. 全员明牌面板（显示底牌、存活状态）
 *   2. 夜间行动顺序实时面板（可修改，下一晚生效）
 *   3. 发言顺序拖拽面板（被恐惧的玩家显示禁言图标）
 *   4. 流程控制杆（暂停/强制下一阶段/强改结算结果）
 *   5. 白狼王自爆/骑士决斗手动触发按钮
 *   6. 法官警告提示区
 * ============================================================================
 */

import React, { useState } from 'react';
import { useGameStore } from '../useGameStore';
import type { RoleId, Player, PlayerStatus, GamePhase, NightActionData, WolfChatMessage } from '@langrensha/shared';
import { ROLE_META, isEvilRole, isSharedWolfRole } from '@langrensha/shared';

// ============================================================================
// 阶段中文名映射
// ============================================================================

const PHASE_NAMES: Record<GamePhase, string> = {
  LOBBY: '大厅等待',
  NIGHT: '夜间行动',
  NIGHT_SETTLEMENT: '夜间结算',
  DAY_ANNOUNCE: '公布死讯',
  DAY_SPEECH: '发言阶段',
  DAY_VOTE: '投票阶段',
  DAY_SETTLEMENT: '白天结算',
  DAY_INTERRUPT: '白天中断',
  PK_VOTE: 'PK投票',
  JUDGE_ELECTION: '法官选举',
  GAME_OVER: '游戏结束',
};

// ============================================================================
// JudgeConsole 组件
// ============================================================================

const JudgeConsole: React.FC = () => {
  const {
    judgeState,
    isJudge,
    forceNextPhase,
    togglePause,
    overrideSettlement,
    modifyNightOrder,
    modifySpeechOrder,
    triggerKnightDuel,
    triggerWhiteWolf,
    skipSpeech,
    judgeWarnings,
    dismissWarning,
    leaveRoom,
    phaseAnnouncement,
    dismissAnnouncement,
    startGame,
  } = useGameStore();

  // 法官操作状态
  const [overrideTarget, setOverrideTarget] = useState<number | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<PlayerStatus>('dead');
  const [overrideReason, setOverrideReason] = useState('');
  const [explodeWolfSeat, setExplodeWolfSeat] = useState<number | null>(null);
  const [explodeTargetSeat, setExplodeTargetSeat] = useState<number | null>(null);

  // 编辑中的夜间顺序
  const [editingNightOrder, setEditingNightOrder] = useState<RoleId[] | null>(null);

  if (!isJudge || !judgeState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">非法官视角，无法访问控制台</p>
      </div>
    );
  }

  const state = judgeState;
  const alivePlayers = state.players.filter((p) => !p.isJudge);
  const deadPlayers = alivePlayers.filter((p) => p.status !== 'alive');

  // ---- 夜间顺序编辑 ----
  const currentNightOrder = editingNightOrder ?? state.config.nightActionOrder;

  const moveNightAction = (fromIndex: number, toIndex: number) => {
    const order = [...currentNightOrder];
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    setEditingNightOrder(order);
  };

  const confirmNightOrder = () => {
    if (editingNightOrder) {
      modifyNightOrder(editingNightOrder);
      setEditingNightOrder(null);
    }
  };

  // ---- 发言顺序编辑 ----
  const moveSpeechOrder = (fromIndex: number, toIndex: number) => {
    const order = [...state.speechOrder];
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    modifySpeechOrder(order);
  };

  return (
    <div className="min-h-screen p-4 max-w-6xl mx-auto">
      {/* 顶部状态栏 */}
      <div className="card mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-wolf-400">法官控制台</h1>
          <span className="text-sm text-gray-400">
            房间码：<span className="font-mono text-white">{state.roomCode}</span>
          </span>
          <span className="text-sm text-gray-400">
            第 <span className="text-white">{state.round}</span> 轮
          </span>
          <span className={`tag ${state.phase.includes('NIGHT') ? 'bg-indigo-900 text-indigo-300' : 'bg-amber-900 text-amber-300'}`}>
            {PHASE_NAMES[state.phase]}
          </span>
          {state.isPaused && <span className="tag bg-yellow-900 text-yellow-300">已暂停</span>}
        </div>
        <button onClick={leaveRoom} className="btn-danger text-sm">
          离开房间
        </button>
      </div>

      {/* 阶段公告 */}
      {phaseAnnouncement && (
        <div className="card border-wolf-700 mb-4 flex items-center justify-between animate-pulse">
          <span className="text-wolf-300 font-semibold">{phaseAnnouncement}</span>
          <button onClick={dismissAnnouncement} className="text-gray-500 hover:text-gray-300 text-sm">
            关闭
          </button>
        </div>
      )}

      {/* 法官警告 */}
      {judgeWarnings.length > 0 && (
        <div className="space-y-2 mb-4">
          {judgeWarnings.map((warning, index) => (
            <div
              key={index}
              className="card border-yellow-700 bg-yellow-950/30 flex items-start gap-2"
            >
              <span className="text-yellow-400 text-sm">⚠</span>
              <span className="text-yellow-300 text-sm flex-1">{warning.message}</span>
              <button
                onClick={() => dismissWarning(index)}
                className="text-gray-500 hover:text-gray-300 text-xs"
              >
                关闭
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ====== 大厅等待阶段：玩家准备状态 ====== */}
      {state.phase === 'LOBBY' && (
        <div className="flex items-center justify-center">
          <div className="card max-w-lg w-full text-center space-y-6">
            <div>
              <h2 className="text-xl font-bold text-wolf-400 mb-2">等待玩家加入</h2>
              <p className="text-gray-400">
                房间码：<span className="font-mono text-white text-lg">{state.roomCode}</span>
              </p>
            </div>

            <div className="space-y-1">
              {state.players
                .filter((p) => !p.isJudge)
                .map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                      p.isReady ? 'bg-green-950/20 border border-green-900/50' : 'bg-night-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono">{p.seatNumber}号</span>
                      <span className="text-sm">{p.nickname}</span>
                      {p.isHost && !p.isJudge && (
                        <span className="text-xs text-yellow-500">(房主)</span>
                      )}
                    </div>
                    <span className={`text-xs ${p.isReady ? 'text-green-400' : 'text-gray-500'}`}>
                      {p.isReady ? '已准备 ✅' : '未准备'}
                    </span>
                  </div>
                ))}
            </div>

            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                已准备：{state.players.filter((p) => !p.isJudge && p.isReady).length} / {state.players.filter((p) => !p.isJudge).length} 人
                （最少 {state.config.playerCount} 人）
              </p>
              {(() => {
                const nonJudgePlayers = state.players.filter((p) => !p.isJudge);
                const allReady = nonJudgePlayers.every((p) => p.isReady);
                const enoughPlayers = nonJudgePlayers.length >= state.config.playerCount;
                return (
                  <button
                    onClick={startGame}
                    disabled={!allReady || !enoughPlayers}
                    className={`w-full py-3 rounded-lg font-semibold text-lg transition-all ${
                      allReady && enoughPlayers
                        ? 'bg-wolf-600 hover:bg-wolf-500 text-white cursor-pointer animate-pulse'
                        : 'bg-night-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {!enoughPlayers
                      ? `还需 ${state.config.playerCount - nonJudgePlayers.length} 人`
                      : !allReady
                        ? '等待所有玩家准备'
                        : '开始游戏'}
                  </button>
                );
              })()}
              <p className="text-xs text-gray-600">
                提示：法官为观战者，不参与游戏。请确保人数≥{state.config.playerCount}且所有玩家均已准备。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ====== 游戏进行中：3栏面板 ====== */}
      {state.phase !== 'LOBBY' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ====== 左栏：全员明牌面板 ====== */}
        <div className="card lg:col-span-1">
          <h2 className="text-lg font-semibold mb-3">全员明牌</h2>
          <div className="space-y-1">
            {alivePlayers.map((player) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-2 rounded-lg ${
                  player.status === 'alive'
                    ? state.phase !== 'LOBBY' && isEvilRole(player.role)
                      ? 'bg-red-950/30 border border-red-900'
                      : 'bg-night-800/50 border border-night-700'
                    : 'opacity-50 bg-night-900/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono w-6">{player.seatNumber}号</span>
                  <span className="text-sm">{player.nickname}</span>
                  {player.isMuted && <span className="icon-muted text-xs">🔇</span>}
                  {player.isNightmared && <span className="text-purple-400 text-xs">😨</span>}
                </div>
                <div className="flex items-center gap-2">
                  {state.phase !== 'LOBBY' && (
                    <span className={isEvilRole(player.role) ? 'tag-evil' : 'tag-good'}>
                      {ROLE_META[player.role].name}
                    </span>
                  )}
                  {player.status !== 'alive' && (
                    <span className="text-xs text-gray-500">
                      {player.deathCause?.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ====== 中栏：流程控制 + 夜间顺序 ====== */}
        <div className="space-y-4 lg:col-span-1">
          {/* 流程控制杆 */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">流程控制</h2>
            {/* 夜间阶段禁止法官执行写操作 */}
            {(state.phase === 'NIGHT' || state.phase === 'NIGHT_SETTLEMENT') && (
              <p className="text-xs text-yellow-500 mb-2">夜晚阶段，法官操作已锁定</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={forceNextPhase}
                className="btn-primary text-sm"
                disabled={state.phase === 'NIGHT' || state.phase === 'NIGHT_SETTLEMENT'}
              >
                强制下一阶段
              </button>
              <button
                onClick={togglePause}
                className="btn-secondary text-sm"
                disabled={state.phase === 'NIGHT' || state.phase === 'NIGHT_SETTLEMENT'}
              >
                {state.isPaused ? '恢复游戏' : '暂停游戏'}
              </button>
            </div>
          </div>

          {/* 夜间行动顺序实时面板 */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">夜间行动顺序</h2>
              {editingNightOrder ? (
                <button onClick={confirmNightOrder} className="btn-primary text-xs">
                  确认修改
                </button>
              ) : (
                <button
                  onClick={() => setEditingNightOrder([...state.config.nightActionOrder])}
                  className="btn-secondary text-xs"
                >
                  编辑顺序
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-2">修改后下一晚生效</p>
            <div className="space-y-1">
              {currentNightOrder.map((roleId, index) => {
                const hasRole = state.phase !== 'LOBBY' && alivePlayers.some(
                  (p) => p.role === roleId && p.status === 'alive',
                );
                return (
                  <div
                    key={`${roleId}-${index}`}
                    className={`flex items-center justify-between p-2 rounded ${
                      hasRole ? 'bg-night-800' : 'bg-night-900 opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {editingNightOrder && index > 0 && (
                        <button
                          onClick={() => moveNightAction(index, index - 1)}
                          className="text-gray-500 hover:text-gray-300 text-xs"
                        >
                          ↑
                        </button>
                      )}
                      <span className="text-sm">{ROLE_META[roleId].name}</span>
                      {!hasRole && (
                        <span className="text-xs text-gray-600">（本局无此角色）</span>
                      )}
                      {editingNightOrder && index < currentNightOrder.length - 1 && (
                        <button
                          onClick={() => moveNightAction(index, index + 1)}
                          className="text-gray-500 hover:text-gray-300 text-xs"
                        >
                          ↓
                        </button>
                      )}
                    </div>
                    {/* 噩梦之影恐惧效果始终当夜生效，无需警告 */}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 法官改判面板 */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">强制改判</h2>
            {(state.phase === 'NIGHT' || state.phase === 'NIGHT_SETTLEMENT') && (
              <p className="text-xs text-yellow-500 mb-2">夜晚阶段，改判操作已锁定</p>
            )}
            <div className="space-y-2">
              <select
                value={overrideTarget ?? ''}
                onChange={(e) => setOverrideTarget(parseInt(e.target.value) || null)}
                className="select-field w-full text-sm"
                disabled={state.phase === 'NIGHT' || state.phase === 'NIGHT_SETTLEMENT'}
              >
                <option value="">选择目标玩家</option>
                {alivePlayers.map((p) => (
                  <option key={p.id} value={p.seatNumber}>
                    {p.seatNumber}号 {p.nickname}
                  </option>
                ))}
              </select>
              <select
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value as PlayerStatus)}
                className="select-field w-full text-sm"
                disabled={state.phase === 'NIGHT' || state.phase === 'NIGHT_SETTLEMENT'}
              >
                <option value="dead">死亡</option>
                <option value="alive">复活</option>
              </select>
              <input
                type="text"
                placeholder="改判原因"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="input-field w-full text-sm"
                disabled={state.phase === 'NIGHT' || state.phase === 'NIGHT_SETTLEMENT'}
              />
              <button
                onClick={() => {
                  if (overrideTarget !== null) {
                    overrideSettlement(overrideTarget, overrideStatus, overrideReason || '法官改判');
                    setOverrideTarget(null);
                    setOverrideReason('');
                  }
                }}
                disabled={overrideTarget === null || state.phase === 'NIGHT' || state.phase === 'NIGHT_SETTLEMENT'}
                className="btn-danger w-full text-sm"
              >
                执行改判
              </button>
            </div>
          </div>
        </div>

        {/* ====== 右栏：发言顺序 + 特殊技能触发 ====== */}
        <div className="space-y-4 lg:col-span-1">
          {/* 发言顺序拖拽面板 */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">发言顺序</h2>
            <div className="space-y-1">
              {state.speechOrder.map((seatNumber, index) => {
                const player = alivePlayers.find((p) => p.seatNumber === seatNumber);
                if (!player) return null;
                return (
                  <div
                    key={seatNumber}
                    className={`flex items-center justify-between p-2 rounded ${
                      player.isMuted ? 'bg-yellow-950/30 border border-yellow-900' : 'bg-night-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {index > 0 && (
                        <button
                          onClick={() => moveSpeechOrder(index, index - 1)}
                          className="text-gray-500 hover:text-gray-300 text-xs"
                        >
                          ↑
                        </button>
                      )}
                      <span className="text-sm">
                        {seatNumber}号 {player.nickname}
                      </span>
                      {player.isMuted && <span className="icon-muted text-xs">🔇禁言</span>}
                      {index < state.speechOrder.length - 1 && (
                        <button
                          onClick={() => moveSpeechOrder(index, index + 1)}
                          className="text-gray-500 hover:text-gray-300 text-xs"
                        >
                          ↓
                        </button>
                      )}
                    </div>
                    {state.phase === 'DAY_SPEECH' && (
                      <button
                        onClick={() => skipSpeech(seatNumber)}
                        className="text-xs text-gray-500 hover:text-red-400"
                      >
                        跳过
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 特殊技能触发 */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">特殊技能触发</h2>

            {/* 骑士决斗 — 仅显示状态提示，法官不可代操作 */}
            <div className="space-y-2 mb-4">
              <h3 className="text-sm font-medium text-gray-400">骑士决斗</h3>
              <p className="text-xs text-gray-500">
                骑士决斗由骑士玩家本人发起，法官不可代选目标。
                {alivePlayers.some((p) => p.role === 'knight' && p.status === 'alive')
                  ? '当前骑士存活，等待骑士主动发动。'
                  : '当前无存活骑士。'}
              </p>
            </div>

            {/* 白狼王自爆 */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-400">白狼王自爆</h3>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={explodeWolfSeat ?? ''}
                  onChange={(e) => setExplodeWolfSeat(parseInt(e.target.value) || null)}
                  className="select-field text-sm"
                >
                  <option value="">白狼王</option>
                  {alivePlayers
                    .filter((p) => p.role === 'white_wolf_king' && p.status === 'alive')
                    .map((p) => (
                      <option key={p.id} value={p.seatNumber}>
                        {p.seatNumber}号
                      </option>
                    ))}
                </select>
                <select
                  value={explodeTargetSeat ?? ''}
                  onChange={(e) => setExplodeTargetSeat(parseInt(e.target.value) || null)}
                  className="select-field text-sm"
                >
                  <option value="">目标</option>
                  {alivePlayers
                    .filter((p) => p.status === 'alive')
                    .map((p) => (
                      <option key={p.id} value={p.seatNumber}>
                        {p.seatNumber}号 {p.nickname}
                      </option>
                    ))}
                </select>
              </div>
              <button
                onClick={() => {
                  if (explodeWolfSeat !== null && explodeTargetSeat !== null) {
                    triggerWhiteWolf(explodeWolfSeat, explodeTargetSeat);
                    setExplodeWolfSeat(null);
                    setExplodeTargetSeat(null);
                  }
                }}
                disabled={explodeWolfSeat === null || explodeTargetSeat === null}
                className="btn-danger w-full text-sm"
              >
                触发白狼王自爆
              </button>
            </div>
          </div>

          {/* 夜间操作日志 */}
          {(state.phase === 'NIGHT' || state.phase === 'NIGHT_SETTLEMENT' || state.werewolfTarget !== null || state.witchSaveTarget !== null || state.witchPoisonTarget !== null || state.guardProtectTarget !== null || state.nightmareTarget !== null || Object.keys(state.nightActions).length > 0) && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-3">夜间操作日志</h2>

              {/* 当前夜间子阶段 */}
              {state.nightSubPhase && (
                <div className="mb-3 p-2 rounded bg-indigo-950/30 border border-indigo-900">
                  <span className="text-xs text-indigo-400">当前子阶段：</span>
                  <span className="text-sm text-indigo-300 font-medium">
                    {ROLE_META[state.nightSubPhase.currentRole].name}
                  </span>
                  {state.nightSubPhase.isBlockedByNightmare && (
                    <span className="ml-2 text-xs text-yellow-400">（被噩梦封印）</span>
                  )}
                </div>
              )}

              {/* 各角色行动记录 */}
              <div className="space-y-2 mb-3">
                {Object.entries(state.nightActions).map(([roleId, action]: [string, NightActionData]) => {
                  const actor = state.players.find((p) => p.seatNumber === action.actorSeat);
                  const target = action.targetSeat !== null
                    ? state.players.find((p) => p.seatNumber === action.targetSeat)
                    : null;
                  const roleMeta = ROLE_META[roleId as RoleId];
                  const extra = action.extra as Record<string, string | number | boolean | null | undefined>;

                  return (
                    <div
                      key={roleId}
                      className={`p-2 rounded text-sm ${
                        action.blockedByNightmare
                          ? 'bg-yellow-950/30 border border-yellow-900'
                          : action.submitted
                            ? 'bg-night-800/50 border border-night-700'
                            : 'bg-night-900/30 border border-night-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={isEvilRole(roleId as RoleId) ? 'tag-evil text-xs' : 'tag-good text-xs'}>
                            {roleMeta?.name ?? roleId}
                          </span>
                          <span className="text-gray-400">
                            {action.actorSeat}号 {actor?.nickname ?? ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {action.blockedByNightmare && (
                            <span className="text-xs text-yellow-400">噩梦封印</span>
                          )}
                          {action.submitted ? (
                            <span className="text-xs text-green-400">已提交</span>
                          ) : (
                            <span className="text-xs text-gray-500">等待中</span>
                          )}
                        </div>
                      </div>
                      {action.submitted && action.targetSeat !== null && (
                        <div className="mt-1 text-xs text-gray-400">
                          → 目标：<span className="text-white">{action.targetSeat}号 {target?.nickname ?? ''}</span>
                          {/* 角色特定信息 */}
                          {roleId === 'seer' && extra.checkResult != null ? (
                            <span className={extra.checkResult === 'evil' ? 'text-red-400 ml-1' : 'text-green-400 ml-1'}>
                              （{extra.checkResult === 'evil' ? '狼人' : '好人'}）
                            </span>
                          ) : null}
                          {roleId === 'witch' && (extra.useAntidote || extra.usePoison) && (
                            <span className="ml-1">
                              {extra.useAntidote ? <span className="text-green-400">解药</span> : null}
                              {extra.usePoison ? <span className="text-purple-400 ml-1">毒药</span> : null}
                            </span>
                          )}
                          {roleId === 'mechanical_wolf' && extra.imitateTarget != null && (
                            <span className="text-cyan-400 ml-1">模仿 {String(extra.imitateTarget)}号</span>
                          )}
                        </div>
                      )}
                      {action.submitted && action.targetSeat === null && roleId === 'witch' && (
                        <div className="mt-1 text-xs text-gray-500">未使用药水</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 狼人投票详情 */}
              {Object.keys(state.wolfVotes).length > 0 && (
                <div className="mb-3 p-2 rounded bg-red-950/20 border border-red-900/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-red-400 font-medium">狼人投票</span>
                    <span className={`text-xs ${state.wolfVoteConsensus ? 'text-green-400' : 'text-yellow-400'}`}>
                      {state.wolfVoteConsensus ? '已一致' : '未一致'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {Object.entries(state.wolfVotes).map(([voterSeat, targetSeat]) => {
                      const voter = state.players.find((p) => p.seatNumber === Number(voterSeat));
                      const target = state.players.find((p) => p.seatNumber === targetSeat);
                      return (
                        <div key={voterSeat} className="text-xs text-gray-400">
                          <span className="text-red-300">{voterSeat}号 {voter?.nickname ?? ''}</span>
                          {' → '}
                          <span className="text-white">{targetSeat}号 {target?.nickname ?? ''}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 狼人聊天记录 */}
              {state.wolfChatMessages.length > 0 && (
                <div className="mb-3 p-2 rounded bg-red-950/10 border border-red-900/30">
                  <span className="text-xs text-red-400 font-medium">狼人聊天</span>
                  <div className="space-y-1 mt-1 max-h-32 overflow-y-auto">
                    {state.wolfChatMessages.map((msg: WolfChatMessage) => (
                      <div key={msg.id} className="text-xs">
                        <span className="text-red-300">{msg.senderSeat}号 {msg.senderNickname}</span>
                        <span className="text-gray-500 mx-1">:</span>
                        <span className="text-gray-300">{msg.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 汇总信息 */}
              {(state.werewolfTarget !== null || state.witchSaveTarget !== null || state.witchPoisonTarget !== null || state.guardProtectTarget !== null || state.nightmareTarget !== null) && (
                <div className="p-2 rounded bg-night-900/50 border border-night-700">
                  <span className="text-xs text-gray-400 font-medium">行动汇总</span>
                  <div className="space-y-1 mt-1 text-sm">
                    {state.nightmareTarget !== null && (
                      <p className="text-yellow-400">噩梦恐惧：{state.nightmareTarget}号 {state.players.find(p => p.seatNumber === state.nightmareTarget)?.nickname ?? ''}</p>
                    )}
                    {state.werewolfTarget !== null && (
                      <p>狼人击杀：{state.werewolfTarget}号 {state.players.find(p => p.seatNumber === state.werewolfTarget)?.nickname ?? ''}</p>
                    )}
                    {state.guardProtectTarget !== null && (
                      <p className="text-blue-400">守卫守护：{state.guardProtectTarget}号 {state.players.find(p => p.seatNumber === state.guardProtectTarget)?.nickname ?? ''}</p>
                    )}
                    {state.witchSaveTarget !== null && (
                      <p className="text-green-400">女巫解药：{state.witchSaveTarget}号 {state.players.find(p => p.seatNumber === state.witchSaveTarget)?.nickname ?? ''}</p>
                    )}
                    {state.witchPoisonTarget !== null && (
                      <p className="text-purple-400">女巫毒药：{state.witchPoisonTarget}号 {state.players.find(p => p.seatNumber === state.witchPoisonTarget)?.nickname ?? ''}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}</div>
        </div>
      )}
    </div>
  );
};

export default JudgeConsole;
