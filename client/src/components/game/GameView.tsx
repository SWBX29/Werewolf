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

import React, { useEffect, lazy, Suspense } from 'react';
import { useGameStore } from '../../useGameStore';
import { useVoiceStore } from '../../store/useVoiceStore';
import { getZegoVoiceService } from '../../services/zego';
import { ROLE_META } from '@langrensha/shared';

// 始终渲染的核心组件 — 同步导入
import StatusBar from './StatusBar';
import PlayerList from './PlayerList';
import AppealButton from './AppealButton';
import VoiceControlBar from './VoiceControlBar';
import JudgeActionToast from './JudgeActionToast';
import CountdownTimer from './CountdownTimer';

// 按游戏阶段条件渲染的组件 — 懒加载，按需拉取
const RoleReveal = lazy(() => import('./RoleReveal'));
const NightPhase = lazy(() => import('./night/NightPhase'));
const SpeechPhase = lazy(() => import('./day/SpeechPhase'));
const VotePhase = lazy(() => import('./day/VotePhase'));
const SheriffElection = lazy(() => import('./day/SheriffElection'));
const SheriffTransfer = lazy(() => import('./day/SheriffTransfer'));
const DayAnnounce = lazy(() => import('./day/DayAnnounce'));
const SpectatorMode = lazy(() => import('./SpectatorMode'));
const GameOver = lazy(() => import('./GameOver'));
const WhiteWolfExplode = lazy(() => import('./skills/WhiteWolfExplode'));
const HunterGun = lazy(() => import('./skills/HunterGun'));
const WolfKingGun = lazy(() => import('./skills/WolfKingGun'));
const IdiotReveal = lazy(() => import('./skills/IdiotReveal'));
const KnightDuel = lazy(() => import('./skills/KnightDuel'));

// 阶段切换时的轻量加载指示器
const PhaseLoading: React.FC = () => (
  <div className="flex-1 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-night-600 border-t-night-300 rounded-full animate-spin" />
  </div>
);

const GameView: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const roleConfirmed = useGameStore((s) => s.roleConfirmed);
  const gameOverData = useGameStore((s) => s.gameOverData);
  const roomDissolvedData = useGameStore((s) => s.roomDissolvedData);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const phaseAnnouncement = useGameStore((s) => s.phaseAnnouncement);
  const dismissAnnouncement = useGameStore((s) => s.dismissAnnouncement);
  
  // 语音状态
  const connectionState = useVoiceStore((s) => s.connectionState);
  const nightVoiceMode = useVoiceStore((s) => s.nightVoiceMode);
  const joinVoiceRoom = useVoiceStore((s) => s.joinVoiceRoom);
  const setNightVoiceMode = useVoiceStore((s) => s.setNightVoiceMode);
  const setVoiceStatusHint = useVoiceStore((s) => s.setVoiceStatusHint);

  // 白天阶段恢复语音连接
  useEffect(() => {
    if (!playerState) return;
    
    const phase = playerState.phase;
    const isNightPhase = ['NIGHT', 'NIGHT_SETTLEMENT', 'PRE_NIGHT'].includes(phase);
    const isDayPhase = ['DAY_ANNOUNCE', 'DAY_SPEECH', 'PRE_VOTE_WAIT', 'DAY_VOTE', 'PK_VOTE', 'SHERIFF_ELECTION', 'SHERIFF_TRANSFER', 'DAY_SETTLEMENT', 'DAY_INTERRUPT'].includes(phase);
    
    // 定时器引用（用于 cleanup）
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    
    // 从夜晚切换到白天时，恢复语音连接
    if (!isNightPhase && nightVoiceMode && isDayPhase) {
      const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
      if (myPlayer && myPlayer.status === 'alive' && connectionState === 'DISCONNECTED') {
        // 恢复语音连接
        const roomID = playerState.roomCode;
        const userID = playerState.myPlayerId;
        const userName = myPlayer.nickname;
        joinVoiceRoom(roomID, userID, userName);
        
        // 设置状态提示为"天亮了"
        setNightVoiceMode(false);
        setVoiceStatusHint('天亮了');
        
        // 3秒后清除状态提示
        hintTimer = setTimeout(() => {
          setVoiceStatusHint(null);
        }, 3000);
      }
    }
    
    // 清理定时器
    return () => {
      if (hintTimer) {
        clearTimeout(hintTimer);
      }
    };
  }, [playerState?.phase, nightVoiceMode, connectionState]);

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
    return <Suspense fallback={<PhaseLoading />}><RoleReveal /></Suspense>;
  }

  // 游戏结束 → 显示结束界面
  if (gameOverData) {
    return <Suspense fallback={<PhaseLoading />}><GameOver /></Suspense>;
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

      case 'PRE_VOTE_WAIT':
        return <PreVoteWaitPanel />;

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

  // Bug 21 修复：背景样式根据阶段切换，白天使用明亮的背景
  const isNight = ['NIGHT', 'NIGHT_SETTLEMENT', 'PRE_NIGHT'].includes(playerState.phase);
  const bgClass = isNight ? 'bg-night-phase' : 'bg-gradient-to-b from-amber-950/50 to-night-950';

  return (
    <div className={`min-h-screen flex flex-col ${bgClass}`}>
      {/* 顶部状态栏 */}
      <StatusBar />

      {/* 法官操作通知 Toast */}
      <JudgeActionToast />

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

      {/* 主面板区域 — Suspense 包裹按阶段懒加载的组件 */}
      <Suspense fallback={<PhaseLoading />}>
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 死亡玩家 → 观战模式（替代主面板） */}
          {!isAlive && myPlayer && playerState.phase !== 'LOBBY' && (
            <SpectatorMode />
          )}

          {/* 主面板：存活玩家 或 大厅阶段 */}
          {(isAlive || playerState.phase === 'LOBBY') && renderMainPanel()}
        </div>
      </Suspense>

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
            {myRole && ROLE_META[myRole] && (
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

      {/* 语音控制栏 */}
      <VoiceControlBar />

      {/* 技能覆盖层（白狼王自爆、猎人开枪、狼王开枪、白痴翻牌）— 懒加载 */}
      <Suspense fallback={null}>
        {renderSkillOverlays()}
      </Suspense>
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
  const connectionState = useVoiceStore((s) => s.connectionState);
  const speakingUsers = useVoiceStore((s) => s.speakingUsers);

  // LOBBY 阶段：自由语音，所有人可以说话
  useEffect(() => {
    if (connectionState !== 'CONNECTED') return;
    getZegoVoiceService().muteMicrophone(false);
    getZegoVoiceService().resetRemoteAudio();
    useVoiceStore.getState().setCanSpeak(true);
    useVoiceStore.getState().setMicrophoneMuted(false);
  }, [connectionState]);

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

            const isSpeaking = speakingUsers[p.id] !== undefined;

            return (
              <div
                key={p.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                  p.seatNumber === myPlayer?.seatNumber
                    ? 'bg-wolf-900/30 border border-wolf-700'
                    : 'bg-night-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {p.seatNumber}号 {p.nickname}
                  </span>
                  {/* 说话状态指示 */}
                  {connectionState === 'CONNECTED' && isSpeaking && (
                    <span className="text-amber-400 text-xs animate-pulse">💬 说话中</span>
                  )}
                </div>
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
  const ruleConfig = useGameStore((s) => s.ruleConfig);

  const round = (playerState?.round ?? 0) + 1;
  const preNightHint = (playerState as any)?.preNightHint ?? null;
  const fallbackTime = ruleConfig?.skillActivationTimeout || 15;

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
          <CountdownTimer seconds={phaseTimeRemaining > 0 ? phaseTimeRemaining : fallbackTime} />
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 投票前等待面板（Bug 4+6 修复）
// 所有发言结束后、投票开始前的等待阶段
// 骑士可以在此阶段发动决斗
// ============================================================================

const PreVoteWaitPanel: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const phaseTimeRemaining = useGameStore((s) => s.phaseTimeRemaining);
  const ruleConfig = useGameStore((s) => s.ruleConfig);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  const isKnight = myPlayer?.role === 'knight' && myPlayer?.status === 'alive';

  const waitTime = ruleConfig?.preVoteWaitTime || 10;
  const countdown = phaseTimeRemaining > 0 ? phaseTimeRemaining : waitTime;

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="card max-w-md w-full text-center space-y-4 animate-fade-in-up">
        <div className="text-4xl">⏳</div>
        <h2 className="text-xl font-bold text-amber-300">
          发言结束，即将进入投票
        </h2>
        <p className="text-sm text-gray-400">
          {isKnight ? '你是骑士，可以发动决斗！' : '等待投票开始...'}
        </p>

        {/* 倒计时 */}
        <div className="w-48 mx-auto">
          <CountdownTimer seconds={countdown} urgentThreshold={3} />
        </div>

        {/* 骑士决斗按钮 */}
        {isKnight && <Suspense fallback={null}><KnightDuel /></Suspense>}
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
