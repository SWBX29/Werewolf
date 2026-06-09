import { useEffect, lazy } from 'react';
import { useGameStore } from '../../../useGameStore';
import { useVoiceStore } from '../../../store/useVoiceStore';
import { getZegoVoiceService } from '../../../services/zego';
import { ROLE_META, isSharedWolfRole } from '@langrensha/shared';
import type { RoleId } from '@langrensha/shared';
import CountdownTimer from '../CountdownTimer';
const NightWaiting = lazy(() => import('./NightWaiting'));
const NightmarePanel = lazy(() => import('./NightmarePanel'));
const WolfVotePanel = lazy(() => import('./WolfVotePanel'));
const WitchPanel = lazy(() => import('./WitchPanel'));
const SeerPanel = lazy(() => import('./SeerPanel'));
const GuardPanel = lazy(() => import('./GuardPanel'));
const MechanicalWolfPanel = lazy(() => import('./MechanicalWolfPanel'));

export default function NightPhase() {
  const playerState = useGameStore((s) => s.playerState);
  const roleConfirmed = useGameStore((s) => s.roleConfirmed);
  const phaseTimeRemaining = useGameStore((s) => s.phaseTimeRemaining);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const connectionState = useVoiceStore((s) => s.connectionState);
  const setCanSpeak = useVoiceStore((s) => s.setCanSpeak);
  const setNightVoiceMode = useVoiceStore((s) => s.setNightVoiceMode);
  const setVoiceStatusHint = useVoiceStore((s) => s.setVoiceStatusHint);
  const leaveVoiceRoom = useVoiceStore((s) => s.leaveVoiceRoom);

  // 夜晚阶段语音连接管理策略
  useEffect(() => {
    if (!playerState || connectionState !== 'CONNECTED') return;

    const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
    if (!myPlayer) return;

    const nightActionRequest = playerState.nightActionRequest;
    const sharedWolfRoles = ruleConfig?.sharedWolfRoles || ['werewolf', 'white_wolf_king', 'wolf_king'];
    
    // 判断玩家身份
    const isJudge = myPlayer.isJudge;
    const isDead = myPlayer.status !== 'alive';
    const isWolfRole = myPlayer.role ? isSharedWolfRole(myPlayer.role as RoleId, sharedWolfRoles) : false;
    const isCurrentActionPlayer = nightActionRequest && myPlayer.role === nightActionRequest.roleId;
    
    // 死亡玩家 → 断开连接，显示"夜晚休息"
    if (isDead && !isJudge) {
      leaveVoiceRoom();
      setNightVoiceMode(true);
      setVoiceStatusHint('夜晚休息');
      return;
    }

    // 判断当前是否是狼人行动阶段
    const isWolfActionPhase = nightActionRequest && isSharedWolfRole(nightActionRequest.roleId as RoleId, sharedWolfRoles);

    // 狼人行动阶段 + 我是狼人 + 存活 → 保持连接，狼人可互相交流
    if (isWolfActionPhase && isWolfRole && myPlayer.status === 'alive') {
      setCanSpeak(true);
      getZegoVoiceService().muteMicrophone(false);
      getZegoVoiceService().resetRemoteAudio();
      
      // 设置狼人列表为允许说话的用户
      const wolfIDs = playerState.players
        .filter((p) => p.status === 'alive' && p.role && isSharedWolfRole(p.role as RoleId, sharedWolfRoles))
        .map((p) => p.id);
      getZegoVoiceService().setAllowedSpeakers(wolfIDs);
      
      setNightVoiceMode(true);
      setVoiceStatusHint('狼人密谋');
    } 
    // 法官或当前行动玩家 → 保持连接，法官与行动玩家可交流
    else if ((isJudge && nightActionRequest) || (isCurrentActionPlayer && myPlayer.status === 'alive')) {
      setCanSpeak(true);
      getZegoVoiceService().muteMicrophone(false);
      getZegoVoiceService().resetRemoteAudio();
      
      // 获取法官ID（可能是自己，也可能是其他玩家）
      const judgeId = isJudge 
        ? playerState.myPlayerId 
        : playerState.players.find((p) => p.isJudge)?.id;
      
      // 获取当前行动玩家ID列表
      const actionPlayerIds = playerState.players
        .filter((p) => p.status === 'alive' && p.role === nightActionRequest.roleId)
        .map((p) => p.id);
      
      const allowedSpeakers = judgeId ? [judgeId, ...actionPlayerIds] : actionPlayerIds;
      getZegoVoiceService().setAllowedSpeakers(allowedSpeakers);
      
      setNightVoiceMode(true);
      setVoiceStatusHint('法官指导');
    }
    // 非狼人 + 非法官 + 非当前行动玩家 → 断开连接，显示"夜晚休息"
    else if (!isWolfRole && !isJudge && !isCurrentActionPlayer) {
      leaveVoiceRoom();
      setNightVoiceMode(true);
      setVoiceStatusHint('夜晚休息');
    }
    // 其他情况：所有人静音（行动前后不可交流）
    else {
      setCanSpeak(false);
      getZegoVoiceService().muteMicrophone(true);
      getZegoVoiceService().muteAllRemoteAudio();
      setNightVoiceMode(true);
      setVoiceStatusHint('夜晚休息');
    }

    return () => {
      // 清理时恢复语音状态
      setCanSpeak(true);
      getZegoVoiceService().muteMicrophone(false);
      getZegoVoiceService().resetRemoteAudio();
      setVoiceStatusHint(null);
    };
  }, [
    playerState?.myPlayerId,
    playerState?.players,
    playerState?.nightActionRequest,
    playerState?.nightActionRequest?.roleId,
    playerState?.phase,
    connectionState,
    ruleConfig?.sharedWolfRoles,
    leaveVoiceRoom,
    setCanSpeak,
    setNightVoiceMode,
    setVoiceStatusHint,
  ]);

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

  const actingRoleName = currentNightRole
    ? (ROLE_META[currentNightRole]?.name ?? '未知角色')
    : (ROLE_META[roleId as RoleId]?.name ?? '未知角色');

  // 被噩梦之影恐惧：显示封印提示，等待倒计时结束
  if (nightActionRequest.isBlockedByNightmare) {
    const blockedRoleName = ROLE_META[roleId as RoleId]?.name ?? '你的角色';
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

        {/* 被恐惧封印提示 */}
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-6xl mb-6 animate-pulse">😱</div>
          <h2 className="text-xl font-bold text-purple-300 mb-3">
            你被噩梦之影恐惧了！
          </h2>
          <p className="text-gray-400 text-center mb-2">
            你的 <span className="text-purple-300 font-semibold">{blockedRoleName}</span> 技能已被封印
          </p>
          <p className="text-gray-500 text-sm">
            本回合无法行动，请等待倒计时结束
          </p>
          <div className="mt-8 text-3xl opacity-50 animate-pulse">🔒</div>
        </div>
      </div>
    );
  }

  const renderPanel = () => {
    switch (roleId) {
      case 'nightmare_shadow':
        return <NightmarePanel />;
      case 'werewolf':
      // Bug 39 修复：white_wolf_king 和 wolf_king 也使用狼人投票面板
      case 'white_wolf_king':
      case 'wolf_king':
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
