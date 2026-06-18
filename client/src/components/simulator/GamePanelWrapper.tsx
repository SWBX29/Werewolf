import React, { Suspense, lazy } from 'react';
import { useGameStore } from '../../useGameStore';

// Lazy load game phase components (same as GameView)
const NightPhase = lazy(() => import('../game/night/NightPhase'));
const SpeechPhase = lazy(() => import('../game/day/SpeechPhase'));
const VotePhase = lazy(() => import('../game/day/VotePhase'));
const SheriffElection = lazy(() => import('../game/day/SheriffElection'));
const SheriffTransfer = lazy(() => import('../game/day/SheriffTransfer'));
const DayAnnounce = lazy(() => import('../game/day/DayAnnounce'));
const GameOver = lazy(() => import('../game/GameOver'));
const WhiteWolfExplode = lazy(() => import('../game/skills/WhiteWolfExplode'));
const HunterGun = lazy(() => import('../game/skills/HunterGun'));
const WolfKingGun = lazy(() => import('../game/skills/WolfKingGun'));
const IdiotReveal = lazy(() => import('../game/skills/IdiotReveal'));
const KnightDuel = lazy(() => import('../game/skills/KnightDuel'));

const Loading: React.FC = () => (
  <div className="flex items-center justify-center p-8">
    <div className="w-6 h-6 border-2 border-night-600 border-t-night-300 rounded-full animate-spin" />
  </div>
);

const GamePanelWrapper: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const gameOverData = useGameStore((s) => s.gameOverData);

  if (gameOverData) {
    return <Suspense fallback={<Loading />}><GameOver /></Suspense>;
  }

  if (!playerState) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        选择一个玩家以查看操作面板
      </div>
    );
  }

  const phase = playerState.phase;

  return (
    <Suspense fallback={<Loading />}>
      <div className="flex-1 overflow-auto">
        {renderPhasePanel(phase)}
      </div>
      {/* Skill overlays always rendered */}
      <WhiteWolfExplode />
      <HunterGun />
      <WolfKingGun />
      <IdiotReveal />
      <KnightDuel />
    </Suspense>
  );
};

function renderPhasePanel(phase: string) {
  switch (phase) {
    case 'NIGHT':
    case 'NIGHT_SETTLEMENT':
      return <NightPhase />;
    case 'DAY_ANNOUNCE':
      return <DayAnnounce />;
    case 'DAY_SPEECH':
    case 'PRE_VOTE_WAIT':
      return <SpeechPhase />;
    case 'DAY_VOTE':
    case 'PK_VOTE':
      return <VotePhase />;
    case 'SHERIFF_ELECTION':
      return <SheriffElection />;
    case 'SHERIFF_TRANSFER':
      return <SheriffTransfer />;
    case 'DAY_INTERRUPT':
    case 'DAY_SETTLEMENT':
      return (
        <div className="flex items-center justify-center p-8 text-gray-400">
          结算中...
        </div>
      );
    case 'ROLE_REVEAL':
    case 'PRE_NIGHT':
      return (
        <div className="flex items-center justify-center p-8 text-gray-400">
          等待游戏开始...
        </div>
      );
    default:
      return (
        <div className="flex items-center justify-center p-8 text-gray-500">
          阶段: {phase}
        </div>
      );
  }
}

export default GamePanelWrapper;
