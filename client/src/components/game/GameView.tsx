/**
 * ============================================================================
 * GameView — 玩家游戏主界面容器
 * ============================================================================
 *
 * 架构说明：
 *   本组件是玩家游玩界面的顶层容器，负责：
 *   1. 根据游戏阶段动态切换主面板内容
 *   2. 渲染通用布局（状态栏 + 主面板 + 底部信息栏）
 *   3. 管理角色揭示、观战模式、申诉等全局覆盖层
 *
 * 布局结构：
 *   ┌──────────────────────────────────────────┐
 *   │  [StatusBar]  阶段名 | 倒计时 | 行动提示  │
 *   ├──────────────────────────────────────────┤
 *   │                                            │
 *   │   [主面板]  根据阶段动态切换                │
 *   │                                            │
 *   ├──────────────────────────────────────────┤
 *   │  [底部栏]  存活人数 | 座位表 | 设置        │
 *   └──────────────────────────────────────────┘
 * ============================================================================
 */

import React from 'react';
import { useGameStore } from '../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import StatusBar from './StatusBar';
import PlayerList from './PlayerList';
import RoleReveal from './RoleReveal';
import NightPhase from './night/NightPhase';
import SpeechPhase from './day/SpeechPhase';
import VotePhase from './day/VotePhase';
import SheriffElection from './day/SheriffElection';
import SheriffTransfer from './day/SheriffTransfer';
import DayAnnounce from './day/DayAnnounce';
import SpectatorMode from './SpectatorMode';
import AppealButton from './AppealButton';
import GameOver from './GameOver';
import WhiteWolfExplode from './skills/WhiteWolfExplode';
import HunterGun from './skills/HunterGun';
import WolfKingGun from './skills/WolfKingGun';
import IdiotReveal from './skills/IdiotReveal';

import CountdownTimer from './CountdownTimer';

const GameView: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const roleConfirmed = useGameStore((s) => s.roleConfirmed);
  const gameOverData = useGameStore((s) => s.gameOverData);
  const roomDissolvedData = useGameStore((s) => s.roomDissolvedData);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const phaseAnnouncement = useGameStore((s) => s.phaseAnnouncement);
  const dismissAnnouncement = useGameStore((s) => s.dismissAnnouncement);

  // 房间解散 → 显示解散界面（优先级最高）
  if (roomDissolvedData) {
    return <RoomDissolved />;
  }

  if (!playerState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-float">🌙</div>
          <p className="text-gray-500">等待游戏数据...</p>
        </div>
      </div>
    );
  }

  // 用 myPlayerId 匹配自己（LOBBY 阶段 role 为 null，不能用 role 定位）
  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  const isAlive = myPlayer?.status === 'alive';
  const myRole = myPlayer?.role;
  const mySeat = myPlayer?.seatNumber;
  const aliveCount = playerState.players.filter((p) => !p.isJudge && p.status === 'alive').length;
  const totalCount = playerState.players.filter((p) => !p.isJudge).length;

  // 角色未确认且处于身份展示阶段 → 显示角色揭示（自动倒计时，无需点击）
  // 限定仅在 ROLE_REVEAL 阶段渲染，防止身份展示结束后再次弹出"确认知晓"按钮
  if (!roleConfirmed && myRole && playerState.phase === 'ROLE_REVEAL') {
    return <RoleReveal />;
  }

  // 游戏结束 → 显示结束界面
  if (gameOverData) {
    return <GameOver />;
  }

  // 判断当前主面板内容
  const renderMainPanel = () => {
    const phase = playerState.phase;

    switch (phase) {
      case 'LOBBY':
        return <LobbyPanel />;

      case 'ROLE_REVEAL':
        return <RoleReveal />;

      case 'PRE_NIGHT':
        return <PreNightWait />;

      case 'NIGHT':
      case 'NIGHT_SETTLEMENT':
        return <NightPhase />;

      case 'DAY_ANNOUNCE':
        return (
          <>
            <DayAnnounce />
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-4 animate-float">☀️</div>
                <p className="text-gray-400">天亮了...</p>
              </div>
            </div>
          </>
        );

      case 'DAY_SPEECH':
        return <SpeechPhase />;

      case 'DAY_VOTE':
      case 'PK_VOTE':
        return <VotePhase />;

      case 'SHERIFF_ELECTION':
        return <SheriffElection />;

      case 'SHERIFF_TRANSFER':
        return <SheriffTransfer />;

      case 'DAY_SETTLEMENT':
      case 'DAY_INTERRUPT':
        return <InterruptPanel />;

      default:
        return (
          <div className="flex items-center justify-center flex-1">
            <p className="text-gray-500">未知阶段: {phase}</p>
          </div>
        );
    }
  };

  // 判断是否需要显示技能覆盖层（死亡后的猎人/狼王开枪等）
  const renderSkillOverlays = () => {
    if (!myPlayer || !myRole) return null;

    return (
      <>
        {/* 白狼王自爆（发言/投票阶段可用） */}
        <WhiteWolfExplode />
        {/* 猎人开枪（死亡后触发） */}
        <HunterGun />
        {/* 狼王开枪（死亡后触发） */}
        <WolfKingGun />
        {/* 白痴翻牌（被投票出局时触发） */}
        <IdiotReveal />
      </>
    );
  };

  // 背景样式根据阶段切换
  const isNight = ['NIGHT', 'NIGHT_SETTLEMENT'].includes(playerState.phase);
  const bgClass = isNight ? 'bg-night-phase' : 'bg-night-950';

  return (
    <div className={`min-h-screen flex flex-col ${bgClass}`}>
      {/* 顶部状态栏 */}
      <StatusBar />

      {/* 阶段公告横幅 */}
      {phaseAnnouncement && (
        <div className="mx-4 mt-2 card border-wolf-700 flex items-center justify-between animate-fade-in-up">
          <span className="text-wolf-300 font-semibold text-sm">{phaseAnnouncement}</span>
          <button
            onClick={dismissAnnouncement}
            className="text-gray-500 hover:text-gray-300 text-xs ml-3"
          >
            关闭
          </button>
        </div>
      )}

      {/* 主面板区域 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* 死亡玩家 → 观战模式（替代主面板） */}
        {!isAlive && myPlayer && playerState.phase !== 'LOBBY' && (
          <SpectatorMode />
        )}

        {/* 主面板：存活玩家 或 大厅阶段 */}
        {(isAlive || playerState.phase === 'LOBBY') && renderMainPanel()}
      </div>

      {/* 底部信息栏 */}
      <div className="border-t border-night-800 bg-night-900/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
          {/* 存活人数 */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">存活</span>
            <span className="text-white font-bold">{aliveCount}</span>
            <span className="text-gray-600">/</span>
            <span className="text-gray-400">{totalCount}</span>
          </div>

          {/* 简略座位表 */}
          <div className="flex-1 overflow-x-auto">
            <PlayerList compact />
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            {/* 自己的角色标识 */}
            {myRole && (
              <button
                className="text-xs px-2 py-1 rounded bg-night-800 border border-night-600 hover:border-wolf-500 transition-colors"
                title={`${ROLE_META[myRole].name} · ${mySeat}号`}
              >
                {ROLE_META[myRole].name}
              </button>
            )}
            <button
              onClick={leaveRoom}
              className="text-xs px-2 py-1 rounded bg-night-800 border border-night-600 text-gray-400 hover:text-red-400 hover:border-red-700 transition-colors"
            >
              离开
            </button>
          </div>
        </div>
      </div>

      {/* 申诉按钮（浮动） */}
      <AppealButton />

      {/* 技能覆盖层（白狼王自爆、猎人开枪、狼王开枪、白痴翻牌） */}
      {renderSkillOverlays()}
    </div>
  );
};

// ============================================================================
// 大厅等待面板
// ============================================================================

const LobbyPanel: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const setReady = useGameStore((s) => s.setReady);
  const startGame = useGameStore((s) => s.startGame);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  const isHost = myPlayer?.isHost ?? false;
  const nonJudgePlayers = playerState.players.filter((p) => !p.isJudge);
  const allReady = nonJudgePlayers.every((p) => p.isReady);
  const playerCount = nonJudgePlayers.length;
  const totalSeats = playerState.playerCount;
  const hasJudge = playerState.players.some((p) => p.isJudge);
  const enoughPlayers = playerCount >= totalSeats;

  // 构建座位号 → 玩家映射
  const playerBySeat = new Map<number, typeof nonJudgePlayers[number]>();
  nonJudgePlayers.forEach((p) => playerBySeat.set(p.seatNumber, p));
  const allSeats = Array.from({ length: totalSeats }, (_, i) => i + 1);

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="card max-w-md w-full text-center space-y-4">
        <h2 className="text-xl font-bold text-wolf-400">等待玩家加入</h2>
        <p className="text-gray-400">
          房间码：<span className="font-mono text-white text-lg">{playerState.roomCode}</span>
        </p>
        <p className="text-sm text-gray-500">
          当前 {playerCount}/{totalSeats} 名玩家
        </p>

        {/* 玩家列表 */}
        <div className="space-y-1">
          {allSeats.map((seatNumber) => {
            const p = playerBySeat.get(seatNumber);

            // 空座位占位
            if (!p) {
              return (
                <div
                  key={seatNumber}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-night-900/30 opacity-40"
                >
                  <span className="text-sm text-gray-600">
                    {seatNumber}号 等待加入
                  </span>
                  <span className="text-xs text-gray-600">空座位</span>
                </div>
              );
            }

            return (
              <div
                key={p.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                  p.seatNumber === myPlayer?.seatNumber
                    ? 'bg-wolf-900/30 border border-wolf-700'
                    : 'bg-night-800'
                }`}
              >
                <span className="text-sm">
                  {p.seatNumber}号 {p.nickname}
                </span>
                <span className={`text-xs ${p.isReady ? 'text-green-400' : 'text-gray-500'}`}>
                  {p.isReady ? '已准备' : '未准备'}
                </span>
              </div>
            );
          })}
        </div>

        {/* 操作按钮 */}
        <div className="space-y-2">
          {myPlayer && !myPlayer.isReady && (
            <button
              onClick={() => setReady(true)}
              className="btn-primary w-full"
            >
              准备
            </button>
          )}
          {myPlayer?.isReady && (
            <button
              onClick={() => setReady(false)}
              className="btn-secondary w-full"
            >
              取消准备
            </button>
          )}
          {/* 法官在场时，法官在控制台开始游戏；玩家显示等待提示 */}
          {hasJudge && allReady && enoughPlayers && (
            <p className="text-sm text-yellow-400 animate-pulse">等待法官开始游戏...</p>
          )}
          {!hasJudge && isHost && (
            <button
              onClick={startGame}
              disabled={!allReady || !enoughPlayers}
              className="btn-primary w-full"
            >
              开始游戏 ({playerCount}人)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 白天中断面板（骑士决斗/白狼王自爆触发）
// ============================================================================

const InterruptPanel: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const knightDuelResult = useGameStore((s) => s.knightDuelResult);
  const voteResult = useGameStore((s) => s.voteResult);

  const isSettlement = playerState?.phase === 'DAY_SETTLEMENT';

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-day-phase">
      <div className="card max-w-md w-full text-center space-y-4 animate-fade-in-up">
        <div className="text-4xl">{isSettlement ? '📋' : '⚡'}</div>
        <h2 className="text-xl font-bold text-amber-400">
          {isSettlement ? '白天结算' : '白天中断'}
        </h2>

        {/* 投票结果显示 */}
        {isSettlement && voteResult && (
          <div className="p-4 rounded-lg bg-night-800/50 border border-night-600">
            {voteResult.eliminated ? (
              <p className="font-semibold text-red-400">
                {voteResult.eliminated}号玩家被投票出局
              </p>
            ) : (
              <p className="font-semibold text-green-400">平安日，无人出局</p>
            )}
            {voteResult.isPK && voteResult.pkCandidates && voteResult.pkCandidates.length > 0 && (
              <p className="text-sm text-yellow-300 mt-2">
                平票进入PK：{voteResult.pkCandidates.map((s) => `${s}号`).join('、')}
              </p>
            )}
          </div>
        )}

        {knightDuelResult && (
          <div className={`p-4 rounded-lg ${
            knightDuelResult.targetIsWolf
              ? 'bg-green-900/30 border border-green-700'
              : 'bg-red-900/30 border border-red-700'
          }`}>
            <p className="font-semibold">
              {knightDuelResult.targetIsWolf
                ? `⚔️ ${knightDuelResult.targetSeat}号是狼人，决斗胜利！`
                : `💀 ${knightDuelResult.targetSeat}号是好人，骑士翻车！`}
            </p>
            {knightDuelResult.revealedRole && (
              <p className="text-sm text-gray-400 mt-1">
                真实身份：{ROLE_META[knightDuelResult.revealedRole]?.name}
              </p>
            )}
            {knightDuelResult.forceNight && (
              <p className="text-xs text-gray-500 mt-1">🌙 强制入夜</p>
            )}
          </div>
        )}

        <p className="text-sm text-gray-500">等待结算完成...</p>
      </div>
    </div>
  );
};

// ============================================================================
// 入夜前等待面板
// ============================================================================

const PreNightWait: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const phaseTimeRemaining = useGameStore((s) => s.phaseTimeRemaining);

  const round = (playerState?.round ?? 0) + 1;
  const preNightHint = (playerState as any)?.preNightHint ?? null;

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-night-phase">
      <div className="card max-w-md w-full text-center space-y-4 animate-fade-in-up">
        <div className="text-4xl animate-float">🌙</div>
        <h2 className="text-xl font-bold text-indigo-300">
          第 {round} 夜即将到来
        </h2>
        <p className="text-sm text-gray-400">天黑请闭眼...</p>
        {preNightHint && (
          <div className="p-3 rounded-lg bg-wolf-900/30 border border-wolf-700">
            <p className="text-sm text-wolf-300">⚠️ {preNightHint}</p>
          </div>
        )}
        <div className="w-48 mx-auto">
          <CountdownTimer seconds={5} />
        </div>
      </div>
    </div>
  );
};

export default GameView;

// ============================================================================
// 房间解散界面 — 法官解散房间后展示所有已知信息
// ============================================================================

const RoomDissolved: React.FC = () => {
  const roomDissolvedData = useGameStore((s) => s.roomDissolvedData);
  const leaveRoom = useGameStore((s) => s.leaveRoom);

  if (!roomDissolvedData) return null;

  const { reason, players } = roomDissolvedData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-fade-in-up">
      <div className="card max-w-lg w-full mx-4 space-y-6 text-center">
        <div className="text-5xl">🚪</div>

        <h2 className="text-2xl font-bold text-red-400">房间已解散</h2>

        <p className="text-sm text-gray-400">{reason}</p>

        {/* 玩家信息列表 */}
        {players.length > 0 && (
          <div className="space-y-2 text-left">
            <h4 className="text-sm font-semibold text-amber-300">本局玩家信息</h4>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {players
                .sort((a, b) => a.seatNumber - b.seatNumber)
                .map((p) => (
                  <div
                    key={p.seatNumber}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-sm bg-night-800"
                  >
                    <span className="font-mono w-8">{p.seatNumber}号</span>
                    <span className="flex-1 truncate">{p.nickname}</span>
                    {p.role && (
                      <span className={`tag ${ROLE_META[p.role as keyof typeof ROLE_META]?.faction === 'evil' ? 'tag-evil' : 'tag-good'}`}>
                        {ROLE_META[p.role as keyof typeof ROLE_META]?.name ?? p.role}
                      </span>
                    )}
                    <span className={`text-xs ${p.status === 'alive' ? 'text-green-400' : 'text-gray-500'}`}>
                      {p.status === 'alive' ? '存活' : '已死亡'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <button className="btn-primary w-full" onClick={leaveRoom}>
          返回大厅
        </button>
      </div>
    </div>
  );
};
