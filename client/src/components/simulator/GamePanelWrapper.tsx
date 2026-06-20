/**
 * ============================================================================
 * GamePanelWrapper — 模拟器游戏面板包装器
 * ============================================================================
 *
 * 架构说明：
 *   1. 根据当前游戏阶段渲染对应的游戏组件（复用 game/ 目录组件）
 *   2. 处理房间解散、游戏结束、角色揭示等优先级视图
 *   3. 死亡玩家切换为观战模式
 *   4. 包含大厅等待、白天中断、入夜等待、投票前等待等子面板
 *
 * 设计原则：
 *   - 通过 storeInjector 桥接状态，复用 GameView 的全部子组件
 *   - 使用 transform 创建包含块，避免 fixed 定位覆盖模拟器界面
 * ============================================================================
 */

import React, { Suspense, lazy, useMemo } from "react";
import { useGameStore } from "../../useGameStore";
import { useSimulatorStore } from "./useSimulatorStore";
import { ROLE_META, PHASE_NAMES } from "@langrensha/shared";
import type { RoleId } from "@langrensha/shared";

// 始终渲染的核心组件 — 同步导入
import StatusBar from "../game/StatusBar";
import PlayerList from "../game/PlayerList";
import AppealButton from "../game/AppealButton";
import JudgeActionToast from "../game/JudgeActionToast";
import CountdownTimer from "../game/CountdownTimer";

// 懒加载游戏阶段组件（与 GameView 一致）
const RoleReveal = lazy(() => import("../game/RoleReveal"));
const SpectatorMode = lazy(() => import("../game/SpectatorMode"));
const NightPhase = lazy(() => import("../game/night/NightPhase"));
const SpeechPhase = lazy(() => import("../game/day/SpeechPhase"));
const VotePhase = lazy(() => import("../game/day/VotePhase"));
const SheriffElection = lazy(() => import("../game/day/SheriffElection"));
const SheriffTransfer = lazy(() => import("../game/day/SheriffTransfer"));
const DayAnnounce = lazy(() => import("../game/day/DayAnnounce"));
const GameOver = lazy(() => import("../game/GameOver"));
const WhiteWolfExplode = lazy(() => import("../game/skills/WhiteWolfExplode"));
const HunterGun = lazy(() => import("../game/skills/HunterGun"));
const WolfKingGun = lazy(() => import("../game/skills/WolfKingGun"));
const IdiotReveal = lazy(() => import("../game/skills/IdiotReveal"));
const KnightDuel = lazy(() => import("../game/skills/KnightDuel"));

const Loading: React.FC = () => (
  <div className="flex items-center justify-center p-8">
    <div className="w-6 h-6 border-2 border-night-600 border-t-night-300 rounded-full animate-spin" />
  </div>
);

/** 模拟器游戏面板包装器，根据阶段渲染对应游戏组件 */
const GamePanelWrapper: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const gameOverData = useGameStore((s) => s.gameOverData);
  const roleConfirmed = useGameStore((s) => s.roleConfirmed);
  const roomDissolvedData = useGameStore((s) => s.roomDissolvedData);
  const phaseAnnouncement = useGameStore((s) => s.phaseAnnouncement);
  const dismissAnnouncement = useGameStore((s) => s.dismissAnnouncement);

  // 房间解散 → 显示解散界面（优先级最高）
  if (roomDissolvedData) {
    return (
      <div className="game-panel-container flex-1 overflow-hidden relative">
        <RoomDissolved />
      </div>
    );
  }

  if (gameOverData) {
    return (
      <div className="game-panel-container flex-1 overflow-hidden relative">
        <Suspense fallback={<Loading />}>
          <GameOver />
        </Suspense>
      </div>
    );
  }

  if (!playerState) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        选择一个玩家以查看操作面板
      </div>
    );
  }

  const phase = playerState.phase;
  const myPlayer = playerState.players.find(
    (p) => p.id === playerState.myPlayerId,
  );
  const isAlive = myPlayer?.status === "alive";
  const myRole = myPlayer?.role;
  const mySeat = myPlayer?.seatNumber;
  const aliveCount = playerState.players.filter(
    (p) => !p.isJudge && p.status === "alive",
  ).length;
  const totalCount = playerState.players.filter((p) => !p.isJudge).length;

  // 角色未确认且处于身份展示阶段 → 显示角色揭示
  if (!roleConfirmed && myRole && phase === "ROLE_REVEAL") {
    return (
      <div className="game-panel-container flex-1 overflow-hidden relative">
        <Suspense fallback={<Loading />}>
          <RoleReveal />
        </Suspense>
      </div>
    );
  }

  // 死亡玩家 → 观战模式（与 GameView 逻辑一致）
  const showSpectator = !isAlive && myPlayer && phase !== "LOBBY";

  // 背景样式根据阶段切换
  const isNight = ["NIGHT", "NIGHT_SETTLEMENT", "PRE_NIGHT"].includes(phase);
  const bgClass = isNight
    ? "bg-night-phase"
    : "bg-gradient-to-b from-amber-950/50 to-night-950";

  return (
    /*
     * game-panel-container: 使用 transform 创建新的包含块，
     * 使游戏组件中的 fixed 定位相对于此容器而非整个视口，
     * 避免全屏遮罩覆盖模拟器界面。
     */
    <div
      className={`game-panel-container flex-1 overflow-hidden relative flex flex-col ${bgClass}`}
    >
      {/* 顶部状态栏 */}
      <StatusBar />

      {/* 法官操作通知 Toast */}
      <JudgeActionToast />

      {/* 阶段公告横幅（发言阶段不需要额外提示，SpeechPhase 已有标题） */}
      {phaseAnnouncement && phase !== "DAY_SPEECH" && (
        <div className="mx-4 mt-2 card border-wolf-700 flex items-center justify-between animate-fade-in-up">
          <span className="text-wolf-300 font-semibold text-sm">
            {phaseAnnouncement}
          </span>
          <button
            onClick={dismissAnnouncement}
            className="text-gray-500 hover:text-gray-300 text-xs ml-3"
          >
            关闭
          </button>
        </div>
      )}

      {/* 主面板区域 */}
      <Suspense fallback={<Loading />}>
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 死亡玩家 → 观战模式（替代主面板） */}
          {showSpectator && <SpectatorMode />}

          {/* 主面板：存活玩家 或 大厅阶段 */}
          {(isAlive || phase === "LOBBY") && renderPhasePanel(phase)}
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
              onClick={() => useSimulatorStore.getState().selectPlayer(null)}
              className="text-xs px-2 py-1 rounded bg-night-800 border border-night-600 text-gray-400 hover:text-red-400 hover:border-red-700 transition-colors"
            >
              离开
            </button>
          </div>
        </div>
      </div>

      {/* 申诉按钮（浮动） */}
      <AppealButton />

      {/* 技能覆盖层（白狼王自爆、猎人开枪、狼王开枪、白痴翻牌、骑士决斗） */}
      <Suspense fallback={null}>
        <WhiteWolfExplode />
        <HunterGun />
        <WolfKingGun />
        <IdiotReveal />
        <KnightDuel />
      </Suspense>
    </div>
  );
};

function renderPhasePanel(phase: string) {
  switch (phase) {
    case "LOBBY":
      return <LobbyPanel />;
    case "ROLE_REVEAL":
      return <RoleReveal />;
    case "PRE_NIGHT":
      return <PreNightWait />;
    case "NIGHT":
    case "NIGHT_SETTLEMENT":
      return <NightPhase />;
    case "DAY_ANNOUNCE":
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
    case "DAY_SPEECH":
      return <SpeechPhase />;
    case "PRE_VOTE_WAIT":
      return <PreVoteWaitPanel />;
    case "DAY_VOTE":
    case "PK_VOTE":
      return <VotePhase />;
    case "SHERIFF_ELECTION":
      return <SheriffElection />;
    case "SHERIFF_TRANSFER":
      return <SheriffTransfer />;
    case "DAY_INTERRUPT":
    case "DAY_SETTLEMENT":
      return <InterruptPanel />;
    default:
      return (
        <div className="flex items-center justify-center p-8 text-gray-500">
          阶段: {phase}
        </div>
      );
  }
}

// ============================================================================
// 大厅等待面板
// ============================================================================

const LobbyPanel: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const setReady = useGameStore((s) => s.setReady);
  const startGame = useGameStore((s) => s.startGame);

  if (!playerState) return null;

  const myPlayer = playerState.players.find(
    (p) => p.id === playerState.myPlayerId,
  );
  const isHost = myPlayer?.isHost ?? false;
  const nonJudgePlayers = playerState.players.filter((p) => !p.isJudge);
  const allReady = nonJudgePlayers.every((p) => p.isReady);
  const playerCount = nonJudgePlayers.length;
  const totalSeats = playerState.playerCount;
  const hasJudge = playerState.players.some((p) => p.isJudge);
  const enoughPlayers = playerCount >= totalSeats;

  // 构建座位号 → 玩家映射
  const playerBySeat = new Map<number, (typeof nonJudgePlayers)[number]>();
  nonJudgePlayers.forEach((p) => playerBySeat.set(p.seatNumber, p));
  const allSeats = Array.from({ length: totalSeats }, (_, i) => i + 1);

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="card max-w-md w-full text-center space-y-4">
        <h2 className="text-xl font-bold text-wolf-400">等待玩家加入</h2>
        <p className="text-gray-400">
          房间码：
          <span className="font-mono text-white text-lg">
            {playerState.roomCode}
          </span>
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
                    ? "bg-wolf-900/30 border border-wolf-700"
                    : "bg-night-800"
                }`}
              >
                <span className="text-sm">
                  {p.seatNumber}号 {p.nickname}
                </span>
                <span
                  className={`text-xs ${p.isReady ? "text-green-400" : "text-gray-500"}`}
                >
                  {p.isReady ? "已准备" : "未准备"}
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
            <p className="text-sm text-yellow-400 animate-pulse">
              等待法官开始游戏...
            </p>
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

  const isSettlement = playerState?.phase === "DAY_SETTLEMENT";

  // 计算投票详情数据
  const voteData = useMemo(() => {
    if (!voteResult || !playerState) return null;

    const { votes, eliminated, isPK: isPKResult, pkCandidates } = voteResult;

    // 所有投票条目
    const voteEntries = Object.entries(votes).map(([voter, target]) => ({
      voter: Number(voter),
      target: target as number | null,
    }));

    // 有效投票（非弃权）
    const validVotes = voteEntries.filter(
      (e) => e.target !== null && e.target !== undefined,
    );

    // 弃权
    const abstainVoters = voteEntries.filter(
      (e) => e.target === null || e.target === undefined,
    );
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
    if (!playerState) return "";
    const p = playerState.players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? "";
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-day-phase">
      <div className="card max-w-md w-full text-center space-y-4 animate-fade-in-up">
        <div className="text-4xl">{isSettlement ? "📋" : "⚡"}</div>
        <h2 className="text-xl font-bold text-amber-400">
          {isSettlement ? "白天结算" : "白天中断"}
        </h2>

        {/* 投票结果显示 */}
        {isSettlement && voteData && (
          <div className="p-4 rounded-lg bg-night-800/50 border border-night-600 space-y-4">
            <h4 className="text-lg font-bold text-amber-300">
              {voteData.isPKResult ? "PK投票结果" : "投票结果"}
            </h4>

            {/* 票数柱状图 */}
            {voteData.sortedTargets.length > 0 && (
              <div className="space-y-2">
                {voteData.sortedTargets.map(({ target, voters, count }) => {
                  const isEliminated = target === voteData.eliminated;
                  const barWidth =
                    voteData.maxVotes > 0
                      ? (count / voteData.maxVotes) * 100
                      : 0;
                  const barColor = isEliminated
                    ? "bg-red-500"
                    : "bg-amber-500/70";

                  return (
                    <div key={target} className="space-y-0.5">
                      <div className="flex items-center justify-between text-sm">
                        <span
                          className={`font-semibold ${isEliminated ? "text-red-400" : "text-gray-200"}`}
                        >
                          {target}号 {getPlayerName(target)}
                        </span>
                        <span
                          className={`font-mono ${isEliminated ? "text-red-400" : "text-amber-300"}`}
                        >
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
                    （
                    {voteData.abstainVoters
                      .map((v) => `${v.voter}号`)
                      .join("、")}
                    ）
                  </span>
                )}
              </div>
            )}

            {/* 出局结果 */}
            {voteData.eliminated ? (
              <div className="text-center p-3 bg-red-900/30 rounded-lg border border-red-700 animate-pulse">
                <p className="text-red-400 font-bold text-lg">
                  {voteData.eliminated}号玩家{" "}
                  {getPlayerName(voteData.eliminated)} 被放逐出局
                </p>
              </div>
            ) : (
              <div className="text-center p-3 bg-green-900/30 rounded-lg border border-green-700">
                <p className="text-green-400 font-bold text-lg">
                  平安日，无人出局
                </p>
              </div>
            )}

            {/* PK 信息 */}
            {voteData.isPKResult &&
              voteData.pkCandidates &&
              voteData.pkCandidates.length > 0 && (
                <div className="p-3 bg-yellow-900/30 rounded-lg border border-yellow-700">
                  <p className="text-yellow-400 font-semibold">
                    ⚠ 平票！进入PK投票
                  </p>
                  <p className="text-sm text-yellow-300 mt-1">
                    PK候选人：
                    {voteData.pkCandidates
                      .map((s) => `${s}号 ${getPlayerName(s)}`)
                      .join("、")}
                  </p>
                </div>
              )}
          </div>
        )}

        {knightDuelResult && (
          <div
            className={`p-4 rounded-lg ${
              knightDuelResult.targetIsWolf
                ? "bg-green-900/30 border border-green-700"
                : "bg-red-900/30 border border-red-700"
            }`}
          >
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
          <CountdownTimer
            seconds={phaseTimeRemaining > 0 ? phaseTimeRemaining : fallbackTime}
          />
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

  const myPlayer = playerState.players.find(
    (p) => p.id === playerState.myPlayerId,
  );
  const isKnight = myPlayer?.role === "knight" && myPlayer?.status === "alive";

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
          {isKnight ? "你是骑士，可以发动决斗！" : "等待投票开始..."}
        </p>

        {/* 倒计时 */}
        <div className="w-48 mx-auto">
          <CountdownTimer seconds={countdown} urgentThreshold={3} />
        </div>

        {/* 骑士决斗按钮 */}
        {isKnight && (
          <Suspense fallback={null}>
            <KnightDuel />
          </Suspense>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 房间解散界面 — 法官解散房间后展示所有已知信息
// ============================================================================

const RoomDissolved: React.FC = () => {
  const roomDissolvedData = useGameStore((s) => s.roomDissolvedData);

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
            <h4 className="text-sm font-semibold text-amber-300">
              本局玩家信息
            </h4>
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
                      <span
                        className={`tag ${ROLE_META[p.role as keyof typeof ROLE_META]?.faction === "evil" ? "tag-evil" : "tag-good"}`}
                      >
                        {ROLE_META[p.role as keyof typeof ROLE_META]?.name ??
                          p.role}
                      </span>
                    )}
                    <span
                      className={`text-xs ${p.status === "alive" ? "text-green-400" : "text-gray-500"}`}
                    >
                      {p.status === "alive" ? "存活" : "已死亡"}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <button
          className="btn-primary w-full"
          onClick={() => {
            useSimulatorStore.getState().disconnectAll();
            useGameStore.setState({
              roomDissolvedData: null,
              gameOverData: null,
              playerState: null,
              judgeState: null,
            });
          }}
        >
          返回设置
        </button>
      </div>
    </div>
  );
};

export default GamePanelWrapper;
