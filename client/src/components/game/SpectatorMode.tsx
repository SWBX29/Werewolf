/**
 * ============================================================================
 * SpectatorMode — 观战模式组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 死亡玩家进入观战模式，可查看场上发言回放
 *   2. 根据死亡经过的夜晚数逐步揭示玩家身份信息
 *   3. 集成亡灵聊天功能
 *
 * 设计原则：
 *   - 死亡1夜后可感知狼人行动，2夜后揭示全部身份
 *   - 发言回放自动滚动到最新消息
 *   - 亡灵聊天仅亡灵可见
 * ============================================================================
 */

import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import DeadChat from './DeadChat';

/** 观战模式组件，死亡玩家可查看场上发言和逐步揭示的身份信息 */
const SpectatorMode: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const speechMessages = useGameStore((s) => s.speechMessages);
  const spectatorIdentities = useGameStore((s) => s.spectatorIdentities);
  const deadNightsElapsed = useGameStore((s) => s.deadNightsElapsed);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [speechMessages]);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || myPlayer.status === 'alive') return null;

  const { players } = playerState;

  // 身份揭示时间表
  const canSeeAllIdentities = deadNightsElapsed >= 2;
  const canSeeWolfHint = deadNightsElapsed >= 1;
  const isSpeechPhase = playerState.phase === 'DAY_SPEECH';

  // 当前正在发言的玩家
  const currentSpeakerSeat = isSpeechPhase
    ? playerState.speechOrder[playerState.currentSpeakerIndex] ?? null
    : null;

  const getPlayerName = (seat: number) => {
    const p = players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col p-4 space-y-4">
      {/* 观战标题 */}
      <div className="flex items-center gap-2">
        <span className="text-lg">👁️</span>
        <h3 className="text-lg font-bold text-gray-400">观战模式</h3>
        {isSpeechPhase && currentSpeakerSeat && (
          <span className="text-xs text-amber-400/70 ml-auto">
            🎤 当前发言：{currentSpeakerSeat}号 {getPlayerName(currentSpeakerSeat)}
          </span>
        )}
      </div>

      {/* 发言回放面板 — 亡灵可查看场上所有存活玩家发言 */}
      <div className="card p-3 border-gray-700 flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs text-amber-400">🎤</span>
          <h4 className="text-sm font-semibold text-gray-400">场上发言</h4>
          <span className="text-xs text-gray-600 ml-auto">
            {speechMessages.length} 条消息
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {speechMessages.length === 0 ? (
            <div className="text-xs text-gray-600 text-center py-8">暂无发言记录</div>
          ) : (
            speechMessages.map((msg, idx) => {
              const player = players.find((p) => p.seatNumber === msg.seatNumber);
              const isDead = player && player.status !== 'alive';
              const isCurrentSpeaker = msg.seatNumber === currentSpeakerSeat;
              return (
                <div
                  key={idx}
                  className={`text-sm py-1 px-2 rounded ${
                    isCurrentSpeaker
                      ? 'bg-amber-900/10 border-l-2 border-amber-500'
                      : 'border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className={`font-semibold text-xs ${isDead ? 'text-gray-500' : 'text-amber-300'}`}>
                      {msg.seatNumber}号 {msg.nickname}
                      {isDead && <span className="ml-0.5 text-gray-500">💀</span>}
                    </span>
                    <span className="text-xs text-gray-600">{formatTime(msg.timestamp)}</span>
                  </div>
                  <p className="text-gray-300 text-sm mt-0.5 break-words">{msg.content}</p>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 玩家状态面板 */}
      <div className="card p-3 border-gray-700">
        <div className="flex items-center gap-1.5 mb-2">
          <h4 className="text-sm font-semibold text-gray-400">玩家状态</h4>
          <span className="text-xs text-gray-600 ml-auto">
            {deadNightsElapsed === 0 && '仅公开信息'}
            {deadNightsElapsed === 1 && '🐺 感知狼人行动'}
            {deadNightsElapsed >= 2 && '🔍 身份全部揭示'}
          </span>
        </div>
        <div className="space-y-1">
          {players
            .filter((p) => !p.isJudge)
            .map((p) => {
              const identity = spectatorIdentities?.[p.seatNumber];
              const showIdentity = canSeeAllIdentities && identity;
              const showWolfHint =
                canSeeWolfHint &&
                !canSeeAllIdentities &&
                identity &&
                identity.faction === 'evil';
              const isDead = p.status !== 'alive';
              const isSpeaking = p.seatNumber === currentSpeakerSeat;

              return (
                <div
                  key={p.seatNumber}
                  className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
                    isDead
                      ? 'bg-night-900 text-gray-500 line-through'
                      : isSpeaking
                        ? 'bg-amber-900/10 text-amber-200 border-l-2 border-amber-500'
                        : 'bg-night-800 text-gray-300'
                  }`}
                >
                  <span className="font-mono w-8 text-xs">{p.seatNumber}号</span>
                  <span className="flex-1 truncate">{p.nickname}</span>
                  {isSpeaking && <span className="text-xs text-amber-400">🎤</span>}
                  {showIdentity && (
                    <span className={`tag ${identity.faction === 'evil' ? 'tag-evil' : 'tag-good'}`}>
                      {ROLE_META[identity.role].name}
                    </span>
                  )}
                  {showWolfHint && <span className="text-xs text-red-400">🐺</span>}
                  {!showIdentity && !showWolfHint && p.status === 'alive' && (
                    <span className="text-xs text-gray-600">???</span>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* 亡灵聊天 — 仅亡灵可见 */}
      <DeadChat />
    </div>
  );
};

export default SpectatorMode;
