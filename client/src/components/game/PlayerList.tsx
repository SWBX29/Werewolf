import { useState } from 'react';
import { useGameStore } from '../../useGameStore';
import type { PlayerDTO } from '@langrensha/shared';
import { ROLE_META } from '@langrensha/shared';

/**
 * 玩家/座位列表组件
 * 显示所有玩家的座位号、昵称、存活状态
 */
interface PlayerListProps {
  compact?: boolean;
}

export default function PlayerList({ compact = false }: PlayerListProps) {
  const playerState = useGameStore((s) => s.playerState);
  const judgeState = useGameStore((s) => s.judgeState);
  const isJudge = useGameStore((s) => s.isJudge);
  const [popoverSeat, setPopoverSeat] = useState<number | null>(null);

  if (!playerState && !judgeState) return null;

  const players: PlayerDTO[] = isJudge
    ? (judgeState!.players as unknown as PlayerDTO[])
    : playerState!.players;
  const speechOrder = isJudge ? judgeState!.speechOrder : playerState!.speechOrder;
  const currentSpeakerIndex = isJudge ? judgeState!.currentSpeakerIndex : playerState!.currentSpeakerIndex;

  const phase = isJudge ? judgeState!.phase : playerState!.phase;

  // 找到自己的玩家（法官模式下无 myPlayerId，不需要定位自己）
  const myPlayer = (!isJudge && playerState) ? players.find((p) => p.id === playerState.myPlayerId) : undefined;

  // 当前正在发言的座位号（仅白天发言阶段显示）
  const isSpeechPhase = phase === 'DAY_SPEECH';
  const speakingSeat =
    isSpeechPhase && speechOrder.length > 0 && currentSpeakerIndex < speechOrder.length
      ? speechOrder[currentSpeakerIndex]
      : null;

  const gridCols = compact ? 'grid-cols-6' : 'grid-cols-4';

  return (
    <div className="relative">
      <div className={`grid ${gridCols} gap-2`}>
        {players.filter((p) => !p.isJudge).map((p) => {
          const isDead = p.status === 'dead' || p.status === 'poisoned' || p.status === 'voted_out';
          const isSelf = myPlayer?.seatNumber === p.seatNumber;
          const isSpeaking = speakingSeat === p.seatNumber;
          const isMuted = p.isMuted;

          // 组合 CSS 类
          let seatClass = 'seat-cell';
          if (isDead) seatClass += ' seat-dead';
          else seatClass += ' seat-alive';
          if (isSelf) seatClass += ' seat-self';
          if (isMuted) seatClass += ' seat-muted';
          if (isSpeaking) seatClass += ' seat-speaking';

          return (
            <div
              key={p.seatNumber}
              className={seatClass}
              onClick={() => {
                if (isSelf) setPopoverSeat(popoverSeat === p.seatNumber ? null : p.seatNumber);
              }}
            >
              {/* 座位号 */}
              <span className="text-xs font-bold text-gray-400">{p.seatNumber}号</span>

              {/* 昵称 */}
              <span className={`text-sm truncate max-w-full ${isDead ? 'text-gray-500' : 'text-gray-200'}`}>
                {compact ? p.nickname.slice(0, 3) : p.nickname}
              </span>

              {/* 状态图标 */}
              <div className="flex items-center gap-1">
                {isDead && <span className="text-xs text-gray-600">💀</span>}
                {p.idiotRevealed && !isDead && <span className="text-xs">🃏</span>}
                {isMuted && <span className="text-xs">🔇</span>}
                {isSpeaking && !isDead && (
                  <span className="text-xs text-amber-400">🎤</span>
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
