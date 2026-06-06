import { useGameStore } from '../../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import type { RoleId } from '@langrensha/shared';
import CountdownTimer from '../CountdownTimer';
import NightWaiting from './NightWaiting';
import NightmarePanel from './NightmarePanel';
import WolfVotePanel from './WolfVotePanel';
import WitchPanel from './WitchPanel';
import SeerPanel from './SeerPanel';
import GuardPanel from './GuardPanel';
import MechanicalWolfPanel from './MechanicalWolfPanel';

/**
 * 夜间阶段容器 — 根据当前玩家的角色和行动请求切换面板
 *
 * 倒计时统一在此容器顶部显示，各角色面板不再独立渲染倒计时
 */
export default function NightPhase() {
  const playerState = useGameStore((s) => s.playerState);
  const roleConfirmed = useGameStore((s) => s.roleConfirmed);
  const phaseTimeRemaining = useGameStore((s) => s.phaseTimeRemaining);

  if (!playerState || !roleConfirmed) return null;

  const players = playerState.players;
  const myPlayer = players.find((p) => p.id === playerState.myPlayerId);
  const isAlive = myPlayer?.status === 'alive';
  const nightActionRequest = playerState.nightActionRequest;
  const currentNightRole = playerState.currentNightRole;

  // 死亡或无行动请求 → 等待界面
  if (!isAlive || !nightActionRequest) {
    return (
      <div className="bg-night-phase flex-1 p-4">
        <NightWaiting />
      </div>
    );
  }

  // 根据行动请求的 roleId 切换面板
  const roleId = nightActionRequest.roleId;

  const renderPanel = () => {
    switch (roleId) {
      case 'nightmare_shadow':
        return <NightmarePanel />;
      case 'werewolf':
        return <WolfVotePanel />;
      case 'witch':
        return <WitchPanel />;
      case 'seer':
        return <SeerPanel />;
      case 'guard':
        return <GuardPanel />;
      case 'mechanical_wolf':
        return <MechanicalWolfPanel />;
      default:
        return <NightWaiting />;
    }
  };

  const actingRoleName = currentNightRole
    ? (ROLE_META[currentNightRole]?.name ?? '未知角色')
    : (ROLE_META[roleId as RoleId]?.name ?? '未知角色');

  return (
    <div className="bg-night-phase flex-1 p-4 max-w-2xl mx-auto">
      {/* 夜间顶部信息 — 统一倒计时 */}
      <div className="text-center mb-4">
        <h1 className="text-lg text-indigo-300 font-semibold">
          第 {playerState.round} 夜
        </h1>
        <p className="text-sm text-gray-500">
          {actingRoleName} 行动中
        </p>
        {phaseTimeRemaining > 0 && (
          <div className="mt-2 w-56 mx-auto">
            <CountdownTimer seconds={phaseTimeRemaining} />
          </div>
        )}
      </div>

      {/* 角色面板 */}
      {renderPanel()}
    </div>
  );
}
