/**
 * ============================================================================
 * GameView — 玩家游戏主界面容器
 * ============================================================================
 *
 * 架构说明：
 *   1. 根据游戏阶段动态切换主面板内容
 *   2. 渲染通用布局（状态栏 + 主面板 + 底部信息栏）
 *   3. 管理角色揭示、观战模式、申诉等全局覆盖层
 *
 * 设计原则：
 *   - 阶段切换使用懒加载减少首屏体积
 *   - 白天/夜晚背景样式自动切换
 *   - 死亡玩家自动进入观战模式
 * ============================================================================
 */

import React, { useEffect, useMemo, lazy, Suspense } from 'react';
import { useGameStore } from '../../useGameStore';
import { useVoiceStore } from '../../store/useVoiceStore';
import { useZegoVoice } from '../../hooks/useZegoVoice';
import { getZegoVoiceService } from '../../services/zego';
import { ROLE_META } from '@langrensha/shared';

// 始终渲染的核心组件 — 同步导入
import StatusBar from './StatusBar';
import PlayerList from './PlayerList';
import AppealButton from './AppealButton';
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
  const enableVoice = useGameStore((s) => s.enableVoice);

  // 语音状态
  const connectionState = useVoiceStore((s) => s.connectionState);
  const nightVoiceMode = useVoiceStore((s) => s.nightVoiceMode);
  const joinVoiceRoom = useVoiceStore((s) => s.joinVoiceRoom);
  const setNightVoiceMode = useVoiceStore((s) => s.setNightVoiceMode);
  const setVoiceStatusHint = useVoiceStore((s) => s.setVoiceStatusHint);
  const isManualReconnecting = useVoiceStore((s) => s.isManualReconnecting);
  const voiceError = useVoiceStore((s) => s.voiceError);
  const manualReconnect = useVoiceStore((s) => s.manualReconnect);
  const dismissVoiceError = useVoiceStore((s) => s.dismissVoiceError);

  // 语音操作 hook
  const {
    isMicrophoneMuted,
    isSpeakerMuted,
    toggleMicrophone,
    toggleSpeaker,
    requestMicrophonePermission,
    connectionState: zegoConnectionState,
  } = useZegoVoice();

  // 白天阶段恢复语音连接
  useEffect(() => {
    if (!enableVoice || !playerState) return;

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

        joinVoiceRoom(roomID, userID, userName).then(() => {
          // 加入成功后开启麦克风（白天自由发言）
          getZegoVoiceService().muteMicrophone(false);
          useVoiceStore.getState().setMicrophoneMuted(false);
          useVoiceStore.getState().setCanSpeak(true);
        });

        // 设置状态提示为"天亮了"
        setNightVoiceMode(false);
        setVoiceStatusHint('天亮了');

        // 3秒后清除状态提示
        hintTimer = setTimeout(() => {
          setVoiceStatusHint(null);
        }, 3000);
      } else if (myPlayer && myPlayer.status === 'alive' && connectionState === 'CONNECTED') {
        // 已连接但处于夜晚模式（如狼人/法官），恢复白天自由语音
        getZegoVoiceService().muteMicrophone(false);
        getZegoVoiceService().resetRemoteAudio();
        useVoiceStore.getState().setMicrophoneMuted(false);
        useVoiceStore.getState().setCanSpeak(true);
        setNightVoiceMode(false);
        setVoiceStatusHint('天亮了');

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
  }, [playerState?.phase, nightVoiceMode, connectionState, enableVoice]);

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

  // 背景样式根据阶段切换，白天使用明亮的背景
  const isNight = ['NIGHT', 'NIGHT_SETTLEMENT', 'PRE_NIGHT'].includes(playerState.phase);
  const bgClass = isNight ? 'bg-night-phase' : 'bg-gradient-to-b from-amber-950/50 to-night-950';

  return (
    <div className={`min-h-screen flex flex-col ${bgClass}`}>
      {/* 顶部状态栏 */}
      <StatusBar />

      {/* 法官操作通知 Toast */}
      <JudgeActionToast />

      {/* 阶段公告横幅（发言阶段不需要额外提示，SpeechPhase 已有标题） */}
      {phaseAnnouncement && playerState.phase !== 'DAY_SPEECH' && (
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

      {/* 语音控制行（集成到底部栏） */}
      {enableVoice && (
        <div className="border-t border-night-700 bg-night-900/90 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-3">
            {/* 发言推流（麦克风）按钮 */}
            <button
              onClick={async () => {
                if (isMicrophoneMuted) {
                  const granted = await requestMicrophonePermission();
                  if (granted) toggleMicrophone();
                } else {
                  toggleMicrophone();
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isMicrophoneMuted
                  ? 'bg-red-900/30 border-red-700 text-red-400 hover:bg-red-900/50'
                  : 'bg-green-900/30 border-green-700 text-green-400 hover:bg-green-900/50'
              }`}
            >
              {isMicrophoneMuted ? '🔇' : '🎤'}
              {isMicrophoneMuted ? '已静音' : '发言中'}
            </button>

            {/* 拉流（扬声器）按钮 */}
            <button
              onClick={toggleSpeaker}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isSpeakerMuted
                  ? 'bg-gray-900/30 border-gray-700 text-gray-400 hover:bg-gray-900/50'
                  : 'bg-blue-900/30 border-blue-700 text-blue-400 hover:bg-blue-900/50'
              }`}
            >
              {isSpeakerMuted ? '🔈' : '🔊'}
              {isSpeakerMuted ? '已关闭' : '收听中'}
            </button>

            {/* 连接状态指示 */}
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  zegoConnectionState === 'CONNECTED'
                    ? 'bg-green-400'
                    : zegoConnectionState === 'CONNECTING' || zegoConnectionState === 'RECONNECTING'
                      ? 'bg-yellow-400 animate-pulse'
                      : 'bg-red-400'
                }`}
              />
              <span className="text-xs text-gray-500">
                {zegoConnectionState === 'CONNECTED'
                  ? '已连接'
                  : zegoConnectionState === 'CONNECTING'
                    ? '连接中'
                    : zegoConnectionState === 'RECONNECTING'
                      ? '重连中'
                      : '已断开'}
              </span>
            </div>

            {/* 手动重连按钮（仅在断开连接且非连接中/重连中时显示） */}
            {zegoConnectionState === 'DISCONNECTED' && (
              <button
                onClick={() => useVoiceStore.getState().manualReconnect()}
                disabled={isManualReconnecting}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-yellow-700 text-yellow-400 hover:bg-yellow-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isManualReconnecting ? (
                  <>
                    <span className="w-3 h-3 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
                    重连中
                  </>
                ) : (
                  '手动重连'
                )}
              </button>
            )}

            {/* 语音错误提示 */}
            {voiceError && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-red-400 truncate max-w-[200px]">{voiceError}</span>
                <button
                  onClick={dismissVoiceError}
                  className="text-red-500 hover:text-red-300 text-xs"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 申诉按钮（浮动） */}
      <AppealButton />

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
  const enableVoice = useGameStore((s) => s.enableVoice);
  const connectionState = useVoiceStore((s) => s.connectionState);
  const speakingUsers = useVoiceStore((s) => s.speakingUsers);

  // LOBBY 阶段：自由语音，所有人可以说话
  useEffect(() => {
    if (!enableVoice || connectionState !== 'CONNECTED') return;
    const phase = playerState?.phase;
    // 仅在 LOBBY 阶段设置自由语音
    if (phase !== 'LOBBY') return;
    getZegoVoiceService().muteMicrophone(false);
    getZegoVoiceService().resetRemoteAudio();
    useVoiceStore.getState().setCanSpeak(true);
    useVoiceStore.getState().setMicrophoneMuted(false);
  }, [connectionState, enableVoice, playerState?.phase]);

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

            const isSpeaking = enableVoice && speakingUsers[p.id] !== undefined;

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
                  {enableVoice && connectionState === 'CONNECTED' && isSpeaking && (
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

  // 计算投票详情数据
  const voteData = useMemo(() => {
    if (!voteResult || !playerState) return null;

    const { votes, eliminated, isPK: isPKResult, pkCandidates } = voteResult;

    // 所有投票条目
    const voteEntries = Object.entries(votes)
      .map(([voter, target]) => ({
        voter: Number(voter),
        target: target as number | null,
      }));

    // 有效投票（非弃权）
    const validVotes = voteEntries.filter((e) => e.target !== null && e.target !== undefined);

    // 弃权
    const abstainVoters = voteEntries.filter((e) => e.target === null || e.target === undefined);
    const abstainCount = abstainVoters.length;

    // 按目标分组统计票数
    const targetVoteMap: Record<number, number[]> = {};
    for (const { voter, target } of validVotes) {
      if (target !== null) {
        if (!targetVoteMap[target]) targetVoteMap[target] = [];
        targetVoteMap[target].push(voter);
      }
    }

    // 按票数降序排列
    const sortedTargets = Object.entries(targetVoteMap)
      .map(([target, voters]) => ({
        target: Number(target),
        voters,
        count: voters.length,
      }))
      .sort((a, b) => b.count - a.count);

    const maxVotes = sortedTargets.length > 0 ? sortedTargets[0].count : 0;

    return {
      voteEntries,
      validVotes,
      abstainCount,
      abstainVoters,
      targetVoteMap,
      sortedTargets,
      maxVotes,
      eliminated,
      isPKResult,
      pkCandidates,
    };
  }, [voteResult, playerState]);

  const getPlayerName = (seat: number) => {
    if (!playerState) return '';
    const p = playerState.players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-day-phase">
      <div className="card max-w-md w-full text-center space-y-4 animate-fade-in-up">
        <div className="text-4xl">{isSettlement ? '📋' : '⚡'}</div>
        <h2 className="text-xl font-bold text-amber-400">
          {isSettlement ? '白天结算' : '白天中断'}
        </h2>

        {/* 投票结果显示 */}
        {isSettlement && voteData && (
          <div className="p-4 rounded-lg bg-night-800/50 border border-night-600 space-y-4">
            <h4 className="text-lg font-bold text-amber-300">
              {voteData.isPKResult ? 'PK投票结果' : '投票结果'}
            </h4>

            {/* 票数柱状图 */}
            {voteData.sortedTargets.length > 0 && (
              <div className="space-y-2">
                {voteData.sortedTargets.map(({ target, voters, count }) => {
                  const isEliminated = target === voteData.eliminated;
                  const barWidth = voteData.maxVotes > 0 ? (count / voteData.maxVotes) * 100 : 0;
                  const barColor = isEliminated
                    ? 'bg-red-500'
                    : 'bg-amber-500/70';

                  return (
                    <div key={target} className="space-y-0.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className={`font-semibold ${isEliminated ? 'text-red-400' : 'text-gray-200'}`}>
                          {target}号 {getPlayerName(target)}
                        </span>
                        <span className={`font-mono ${isEliminated ? 'text-red-400' : 'text-amber-300'}`}>
                          {count}票
                        </span>
                      </div>
                      <div className="w-full h-5 bg-gray-800 rounded overflow-hidden">
                        <div
                          className={`h-full ${barColor} rounded transition-all duration-500`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      {/* 投票者列表 */}
                      <div className="flex flex-wrap gap-1 ml-1">
                        {voters.map((voterSeat) => (
                          <span
                            key={voterSeat}
                            className="text-xs text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded"
                          >
                            {voterSeat}号
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 弃权信息 */}
            {voteData.abstainCount > 0 && (
              <div className="text-sm text-gray-500">
                {voteData.abstainCount}人弃权
                {voteData.abstainVoters.length <= 5 && (
                  <span className="ml-1">
                    （{voteData.abstainVoters.map((v) => `${v.voter}号`).join('、')}）
                  </span>
                )}
              </div>
            )}

            {/* 出局结果 */}
            {voteData.eliminated ? (
              <div className="text-center p-3 bg-red-900/30 rounded-lg border border-red-700 animate-pulse">
                <p className="text-red-400 font-bold text-lg">
                  {voteData.eliminated}号玩家 {getPlayerName(voteData.eliminated)} 被放逐出局
                </p>
              </div>
            ) : (
              <div className="text-center p-3 bg-green-900/30 rounded-lg border border-green-700">
                <p className="text-green-400 font-bold text-lg">平安日，无人出局</p>
              </div>
            )}

            {/* PK 信息 */}
            {voteData.isPKResult && voteData.pkCandidates && voteData.pkCandidates.length > 0 && (
              <div className="p-3 bg-yellow-900/30 rounded-lg border border-yellow-700">
                <p className="text-yellow-400 font-semibold">⚠ 平票！进入PK投票</p>
                <p className="text-sm text-yellow-300 mt-1">
                  PK候选人：{voteData.pkCandidates.map((s) => `${s}号 ${getPlayerName(s)}`).join('、')}
                </p>
              </div>
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
// 投票前等待面板
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
