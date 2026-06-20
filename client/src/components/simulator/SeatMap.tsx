/**
 * ============================================================================
 * SeatMap — 模拟器环形座位图
 * ============================================================================
 *
 * 架构说明：
 *   1. 环形排列座位，响应式适配容器尺寸
 *   2. 每个座位显示角色名、昵称、阵营色条和死亡标记
 *   3. 当前行动角色高亮脉冲动画
 *   4. 底部统计栏显示存活/死亡/阵营人数
 *
 * 设计原则：
 *   - 使用 React.memo 优化座位和统计栏的渲染性能
 *   - LOBBY 阶段隐藏角色信息（服务器默认角色无意义）
 * ============================================================================
 */

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useSimulatorStore } from './useSimulatorStore';
import { ROLE_META, PHASE_NAMES, isEvilRole, isGodRole, type RoleId, type Player } from '@langrensha/shared';
import type { SimConnection } from './types';

// ============================================================================
// 常量
// ============================================================================

const SEAT_SIZE = 80;
const MIN_CONTAINER = 300;
const MAX_CONTAINER = 600;

// ============================================================================
// 辅助函数
// ============================================================================

/** 计算环形座位坐标 */
function getSeatPosition(index: number, total: number, containerSize: number) {
  const radius = (containerSize - SEAT_SIZE * 2 - 40) / 2;
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const x = containerSize / 2 + radius * Math.cos(angle) - SEAT_SIZE / 2;
  const y = containerSize / 2 + radius * Math.sin(angle) - SEAT_SIZE / 2;
  return { x, y };
}

/** 获取阵营颜色 */
function getFactionColor(role: RoleId | null): string {
  if (!role) return 'bg-gray-400';
  if (isEvilRole(role)) return 'bg-red-500';
  if (isGodRole(role)) return 'bg-blue-500';
  return 'bg-blue-300';
}

/** 获取阵营边框颜色 */
function getFactionBorderColor(role: RoleId | null): string {
  if (!role) return 'border-gray-400';
  if (isEvilRole(role)) return 'border-red-500';
  if (isGodRole(role)) return 'border-blue-500';
  return 'border-blue-300';
}

// ============================================================================
// Seat 组件
// ============================================================================

interface SeatProps {
  connection: SimConnection;
  player: Player | undefined;
  isSelected: boolean;
  isCurrentActor: boolean;
  isLobby: boolean;
  onClick: () => void;
}

const Seat = React.memo(function Seat({
  connection,
  player,
  isSelected,
  isCurrentActor,
  onClick,
  isLobby,
}: SeatProps) {
  const isDead = player?.status === 'dead' || player?.status === 'poisoned' || player?.status === 'voted_out';
  // LOBBY 阶段不显示角色（服务器默认角色为 villager，无意义）
  const role: RoleId | null = isLobby ? null : (connection.role ?? player?.role ?? null);
  const roleName = role ? ROLE_META[role].name : '???';
  const nickname = connection.nickname || `玩家${connection.seatNumber}`;
  const seatNumber = connection.seatNumber ?? '?';

  const factionColor = getFactionColor(role);
  const factionBorder = getFactionBorderColor(role);

  return (
    <button
      onClick={onClick}
      className={`
        absolute flex flex-col items-center justify-center rounded-lg border-2 bg-gray-800
        transition-all duration-200 hover:brightness-125 cursor-pointer select-none
        ${SEAT_SIZE}px w-[${SEAT_SIZE}px] h-[${SEAT_SIZE}px]
        ${isSelected ? 'border-yellow-400 ring-2 ring-yellow-400/50' : factionBorder}
        ${isCurrentActor ? 'animate-pulse-ring border-yellow-300' : ''}
        ${isDead ? 'opacity-40 grayscale' : ''}
      `}
      style={{
        width: SEAT_SIZE,
        height: SEAT_SIZE,
      }}
      title={isDead && player?.deathCause ? `死因: ${player.deathCause}` : undefined}
    >
      {/* 阵营色条 */}
      <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-md ${factionColor}`} />

      {/* 座位号 */}
      <span className="text-[10px] text-gray-400 leading-none">{seatNumber}号</span>

      {/* 角色名 */}
      <span className={`text-xs font-bold leading-tight ${role && isEvilRole(role) ? 'text-red-400' : 'text-blue-300'}`}>
        {roleName}
      </span>

      {/* 昵称 */}
      <span className="text-[10px] text-gray-300 truncate max-w-full px-1 leading-tight">{nickname}</span>

      {/* 死亡标记 */}
      {isDead && (
        <span className="text-[9px] text-red-400 leading-none">
          {player?.deathCause ? getDeathCauseLabel(player.deathCause) : '已死亡'}
        </span>
      )}

      {/* 警长标记 */}
      {player?.isSheriff && !isDead && (
        <span className="absolute -top-1 -right-1 text-xs">🏅</span>
      )}
    </button>
  );
});

/** 死因标签映射 */
function getDeathCauseLabel(cause: string): string {
  const map: Record<string, string> = {
    werewolf_kill: '狼杀',
    witch_poison: '毒杀',
    vote_out: '票出',
    hunter_gun: '枪杀',
    explosion: '自爆',
    duel: '决斗',
  };
  return map[cause] ?? cause;
}

// ============================================================================
// JudgeBadge 组件
// ============================================================================

const JudgeBadge = React.memo(function JudgeBadge({ connection }: { connection: SimConnection }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-purple-500/50 bg-purple-900/30 px-4 py-2">
      <span className="text-lg">⚖️</span>
      <div className="flex flex-col">
        <span className="text-sm font-bold text-purple-300">法官</span>
        <span className="text-xs text-gray-400">{connection.nickname || '法官'}</span>
      </div>
      <div className={`w-2 h-2 rounded-full ${connection.isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
    </div>
  );
});

// ============================================================================
// StatsBar 组件
// ============================================================================

interface StatsBarProps {
  players: Player[];
  isLobby: boolean;
}

const StatsBar = React.memo(function StatsBar({ players, isLobby }: StatsBarProps) {
  const alive = players.filter(p => p.status === 'alive').length;
  const dead = players.filter(p => p.status !== 'alive').length;
  const sheriff = players.find(p => p.isSheriff);

  // LOBBY 阶段不显示阵营信息（角色未分配）
  const goodAlive = isLobby ? null : players.filter(p => p.status === 'alive' && !isEvilRole(p.role)).length;
  const evilAlive = isLobby ? null : players.filter(p => p.status === 'alive' && isEvilRole(p.role)).length;

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
      <span className="rounded bg-green-900/40 px-2 py-1 text-green-300">
        存活: {alive}
      </span>
      <span className="rounded bg-red-900/40 px-2 py-1 text-red-300">
        死亡: {dead}
      </span>
      {!isLobby && goodAlive !== null && (
        <span className="rounded bg-blue-900/40 px-2 py-1 text-blue-300">
          好人: {goodAlive}
        </span>
      )}
      {!isLobby && evilAlive !== null && (
        <span className="rounded bg-red-900/40 px-2 py-1 text-red-400">
          狼人: {evilAlive}
        </span>
      )}
      {sheriff && (
        <span className="rounded bg-yellow-900/40 px-2 py-1 text-yellow-300">
          警长: {sheriff.seatNumber}号
        </span>
      )}
    </div>
  );
});

/** 环形座位图主组件，展示所有玩家座位和法官标识 */

const SeatMap = React.memo(function SeatMap() {
  const connections = useSimulatorStore(s => s.connections);
  const judgeState = useSimulatorStore(s => s.judgeState);
  const selectedPlayerId = useSimulatorStore(s => s.selectedPlayerId);
  const currentPhase = useSimulatorStore(s => s.currentPhase);
  const nightSubPhase = useSimulatorStore(s => s.nightSubPhase);
  const selectPlayer = useSimulatorStore(s => s.selectPlayer);

  // 响应式容器尺寸
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(MIN_CONTAINER);

  const updateSize = useCallback(() => {
    if (containerRef.current) {
      const w = containerRef.current.parentElement?.clientWidth ?? MIN_CONTAINER;
      const h = containerRef.current.parentElement?.clientHeight ?? MIN_CONTAINER;
      const size = Math.max(MIN_CONTAINER, Math.min(MAX_CONTAINER, Math.min(w, h) - 16));
      setContainerSize(size);
    }
  }, []);

  useEffect(() => {
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current?.parentElement) {
      observer.observe(containerRef.current.parentElement);
    }
    return () => observer.disconnect();
  }, [updateSize]);

  // 分离法官和玩家连接，按座位号排序
  const { judgeConn, playerConns } = useMemo(() => {
    let judge: SimConnection | null = null;
    const players: SimConnection[] = [];

    connections.forEach(conn => {
      if (conn.isJudge) {
        judge = conn;
      } else if (conn.seatNumber !== null) {
        players.push(conn);
      }
    });

    players.sort((a, b) => (a.seatNumber ?? 0) - (b.seatNumber ?? 0));
    return { judgeConn: judge, playerConns: players };
  }, [connections]);

  // 从 judgeState 获取完整玩家数据
  const playerMap = useMemo(() => {
    const map = new Map<number, Player>();
    if (judgeState?.players) {
      for (const p of judgeState.players) {
        map.set(p.seatNumber, p);
      }
    }
    return map;
  }, [judgeState]);

  // 当前行动角色
  const currentActorRole = nightSubPhase?.currentRole ?? null;

  const isLobby = currentPhase === 'LOBBY';

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-4">
      {/* 环形座位区域 */}
      <div
        className="relative shrink-0"
        style={{ width: containerSize, height: containerSize }}
      >
        {/* 中心装饰 */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
          <span className="text-2xl">🌙</span>
          <span className="text-xs text-gray-500">
            {currentPhase === 'NIGHT' ? `第${judgeState?.round ?? '?'}夜` :
             ['DAY_ANNOUNCE', 'DAY_SPEECH', 'DAY_VOTE', 'DAY_SETTLEMENT', 'DAY_INTERRUPT', 'PK_VOTE'].includes(currentPhase) ? `第${judgeState?.round ?? '?'}天` :
             PHASE_NAMES[currentPhase] ?? currentPhase}
          </span>
        </div>

        {/* 座位 */}
        {playerConns.map((conn, i) => {
          const pos = getSeatPosition(i, playerConns.length, containerSize);
          const player = playerMap.get(conn.seatNumber ?? 0);
          const isCurrentActor = currentActorRole !== null && conn.role === currentActorRole;

          return (
            <div key={conn.playerId} style={{ left: pos.x, top: pos.y }} className="absolute">
              <Seat
                connection={conn}
                player={player}
                isSelected={selectedPlayerId === conn.playerId}
                isCurrentActor={isCurrentActor}
                isLobby={isLobby}
                onClick={() => selectPlayer(conn.playerId)}
              />
            </div>
          );
        })}
      </div>

      {/* 法官 */}
      {judgeConn && <JudgeBadge connection={judgeConn} />}

      {/* 统计栏 */}
      {judgeState?.players && <StatsBar players={judgeState.players} isLobby={isLobby} />}
    </div>
  );
});

export default SeatMap;
