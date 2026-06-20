/**
 * ============================================================================
 * PlayerList — 玩家/座位列表组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 显示所有玩家的座位号、昵称、存活状态、发言顺序
 *
 * 设计原则：
 *   - 兼顾法官与玩家两种视角，自动切换数据源
 *   - 支持紧凑模式（底部栏）和完整模式
 *   - 点击自己的座位可查看角色信息
 * ============================================================================
 */

import React, { useState } from 'react';
import { useGameStore } from '../../useGameStore';
import type { PlayerDTO } from '@langrensha/shared';
import { ROLE_META } from '@langrensha/shared';

/** 玩家列表属性接口 */
interface PlayerListProps {
  /** 是否紧凑模式（底部栏使用） */
  compact?: boolean;
}

/** 玩家/座位列表组件，显示座位号、昵称、存活状态、发言顺序 */
function PlayerList({ compact = false }: PlayerListProps) {
  const playerState = useGameStore((s) => s.playerState);
  const judgeState = useGameStore((s) => s.judgeState);
  const isJudge = useGameStore((s) => s.isJudge);
  const [popoverSeat, setPopoverSeat] = useState<number | null>(null);

  if (!playerState && !judgeState) return null;

  const players: PlayerDTO[] = isJudge
    ? (judgeState!.players as unknown as PlayerDTO[])
    : playerState!.players;
  const speechOrder = isJudge ? judgeState!.speechOrder : playerState!.speechOrder;
  const currentSpeakerIndex = (isJudge ? judgeState!.currentSpeakerIndex : playerState!.currentSpeakerIndex) ?? 0;

  const phase = isJudge ? judgeState!.phase : playerState!.phase;

  // 总座位数（始终显示所有座位号，即使对应座位暂无玩家）
  const totalSeats = isJudge
    ? judgeState!.config.playerCount
    : playerState!.playerCount;

  // 构建座位号 → 玩家映射
  const playerBySeat = new Map<number, PlayerDTO>();
  players.filter((p) => !p.isJudge).forEach((p) => playerBySeat.set(p.seatNumber, p));

  // 自己的玩家（法官模式下无 myPlayerId，不需要定位自己）
  const myPlayer = (!isJudge && playerState) ? players.find((p) => p.id === playerState.myPlayerId) : undefined;

  // 当前正在发言的座位号（仅白天发言阶段显示）
  const isSpeechPhase = phase === 'DAY_SPEECH';
  const speakingSeat =
    isSpeechPhase && speechOrder.length > 0 && currentSpeakerIndex < speechOrder.length
      ? speechOrder[currentSpeakerIndex]
      : null;

  // 构建座位号 → 发言顺序位置映射
  const speechOrderMap = new Map<number, number>();
  if (isSpeechPhase && speechOrder.length > 0) {
    speechOrder.forEach((seat, index) => speechOrderMap.set(seat, index));
  }

  const gridCols = compact ? 'grid-cols-6' : 'grid-cols-4';

  // 生成所有座位号（1 ~ totalSeats），按号数由小到大排列
  const allSeats = Array.from({ length: totalSeats }, (_, i) => i + 1);

  return (
    <div className="relative">
      <div className={`grid ${gridCols} gap-2`}>
        {allSeats.map((seatNumber) => {
          const p = playerBySeat.get(seatNumber);

          // 空座位占位
          if (!p) {
            return (
              <div key={seatNumber} className="seat-cell seat-empty opacity-30">
                <span className="text-xs font-bold text-gray-600">{seatNumber}号</span>
                <span className="text-sm truncate max-w-full text-gray-600">
                  {compact ? '空位' : '空座位'}
                </span>
                <div className="flex items-center gap-1" />
              </div>
            );
          }

          const isDead = p.status === 'dead' || p.status === 'poisoned' || p.status === 'voted_out';
          const isSelf = myPlayer?.seatNumber === p.seatNumber;
          const isSpeaking = speakingSeat === p.seatNumber;
          const isMuted = p.isMuted;

          // 发言顺序位置（-1 表示不在发言列表中，如已死亡）
          const speechIndex = speechOrderMap.get(p.seatNumber) ?? -1;
          const hasSpoken = isSpeechPhase && speechIndex >= 0 && speechIndex < currentSpeakerIndex;
          const yetToSpeak = isSpeechPhase && speechIndex >= 0 && speechIndex > currentSpeakerIndex;

          // 组合 CSS 类
          let seatClass = 'seat-cell';
          if (isDead) seatClass += ' seat-dead';
          else seatClass += ' seat-alive';
          if (isSelf) seatClass += ' seat-self';
          if (isMuted) seatClass += ' seat-muted';
          if (isSpeaking) seatClass += ' seat-speaking';
          if (hasSpoken && !isDead) seatClass += ' opacity-50';

          return (
            <div
              key={p.seatNumber}
              className={seatClass}
              onClick={() => {
                if (isSelf) setPopoverSeat(popoverSeat === p.seatNumber ? null : p.seatNumber);
              }}
            >
              {/* 座位号 + 发言顺序号 */}
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-gray-400">{p.seatNumber}号</span>
                {isSpeechPhase && speechIndex >= 0 && !isDead && !compact && (
                  <span className={`text-xs px-1 rounded ${
                    isSpeaking
                      ? 'bg-amber-700/60 text-amber-200'
                      : hasSpoken
                        ? 'bg-gray-700/60 text-gray-500'
                        : 'bg-night-700/60 text-gray-400'
                  }`}>
                    #{speechIndex + 1}
                  </span>
                )}
              </div>

              {/* 昵称 */}
              <span className={`text-sm truncate max-w-full ${isDead ? 'text-gray-500' : 'text-gray-200'}`}>
                {compact ? p.nickname.slice(0, 3) : p.nickname}
              </span>

              {/* 状态图标 */}
              <div className="flex items-center gap-1">
                {isDead && <span className="text-xs text-gray-600">💀</span>}
                {p.idiotRevealed && !isDead && <span className="text-xs">🃏</span>}
                {p.isSheriff && !isDead && <span className="text-xs">⭐</span>}
                {isMuted && <span className="text-xs">🔇</span>}
                {isSpeaking && !isDead && (
                  <span className="text-xs text-amber-400">🎤</span>
                )}
                {/* 发言状态标签（非紧凑模式） */}
                {!compact && !isDead && isSpeechPhase && !isSpeaking && (
                  <>
                    {hasSpoken && (
                      <span className="text-xs text-gray-500">已发言</span>
                    )}
                    {yetToSpeak && (
                      <span className="text-xs text-gray-400">待发言</span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 角色信息弹出层（点击自己的座位时显示） */}
      {popoverSeat !== null && myPlayer && popoverSeat === myPlayer.seatNumber && myPlayer.role && (
        <div className="absolute z-20 left-1/2 -translate-x-1/2 mt-2 animate-fade-in-up">
          <div className="role-panel p-4 min-w-[200px]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-bold text-gray-100">
                {ROLE_META[myPlayer.role].name}
              </span>
              <span className={myPlayer.role && ROLE_META[myPlayer.role].faction === 'good' ? 'tag-good' : 'tag-evil'}>
                {ROLE_META[myPlayer.role].faction === 'good' ? '好人阵营' : '狼人阵营'}
              </span>
            </div>
            <p className="text-sm text-gray-400">{ROLE_META[myPlayer.role].description}</p>
            <button
              className="mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              onClick={() => setPopoverSeat(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(PlayerList);
