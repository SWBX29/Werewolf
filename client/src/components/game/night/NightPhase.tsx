/**
 * ============================================================================
 * NightPhase — 夜晚阶段主控组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 作为夜晚阶段的入口组件，根据当前行动请求的角色类型分发到对应面板
 *   2. 管理夜晚阶段的语音连接策略（狼人密谋、法官指导、行动玩家交流等）
 *   3. 处理被噩梦之影恐惧时的封印提示
 *
 * 设计原则：
 *   - 面板按角色 ID 分发，使用懒加载减少首屏体积
 *   - 语音策略按玩家身份（法官/狼人/行动玩家/旁观者）分级管理
 *   - 死亡或无行动请求时统一显示等待界面
 * ============================================================================
 */

import { useEffect, useRef, lazy } from 'react';
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

/**
 * 夜晚阶段主控组件
 *
 * 根据当前夜间行动请求的角色类型，渲染对应的面板组件；
 * 同时管理夜晚阶段的语音连接策略，确保不同身份的玩家获得正确的语音权限。
 */
export default function NightPhase() {
  const playerState = useGameStore((s) => s.playerState);
  const roleConfirmed = useGameStore((s) => s.roleConfirmed);
  const phaseTimeRemaining = useGameStore((s) => s.phaseTimeRemaining);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const enableVoice = useGameStore((s) => s.enableVoice);
  const connectionState = useVoiceStore((s) => s.connectionState);
  const setCanSpeak = useVoiceStore((s) => s.setCanSpeak);
  const setMicrophoneMuted = useVoiceStore((s) => s.setMicrophoneMuted);
  const setNightVoiceMode = useVoiceStore((s) => s.setNightVoiceMode);
  const setVoiceStatusHint = useVoiceStore((s) => s.setVoiceStatusHint);
  const leaveVoiceRoom = useVoiceStore((s) => s.leaveVoiceRoom);

  // 追踪上一次语音操作类型，用于 cleanup 时判断是否需要恢复语音状态
  const prevVoiceActionRef = useRef<'stay' | 'leave' | null>(null);

  // 夜晚阶段语音连接管理策略
  useEffect(() => {
    if (!enableVoice || !playerState || connectionState !== 'CONNECTED') return;

    const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
    if (!myPlayer) return;

    const nightActionRequest = playerState.nightActionRequest;
    const sharedWolfRoles = ruleConfig?.sharedWolfRoles || ['werewolf', 'white_wolf_king', 'wolf_king'];

    // 判断玩家身份类别
    const isJudge = myPlayer.isJudge;
    const isDead = myPlayer.status !== 'alive';
    const isWolfRole = myPlayer.role ? isSharedWolfRole(myPlayer.role as RoleId, sharedWolfRoles) : false;
    const isCurrentActionPlayer = nightActionRequest && myPlayer.role === nightActionRequest.roleId;

    // 死亡非法官玩家：断开语音连接，显示"夜晚休息"
    if (isDead && !isJudge) {
      prevVoiceActionRef.current = 'leave';
      leaveVoiceRoom();
      setNightVoiceMode(true);
      setVoiceStatusHint('夜晚休息');
      setCanSpeak(false);
      return;
    }

    // 判断当前是否为狼人行动阶段
    const isWolfActionPhase = nightActionRequest && isSharedWolfRole(nightActionRequest.roleId as RoleId, sharedWolfRoles);

    // 狼人行动阶段 + 我是狼人 + 存活：保持语音连接，狼人可互相交流
    if (isWolfActionPhase && isWolfRole && myPlayer.status === 'alive') {
      prevVoiceActionRef.current = 'stay';
      setCanSpeak(true);
      setMicrophoneMuted(false);
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
    // 法官（含死亡法官）+ 有行动请求 → 保持连接，法官与行动玩家可交流
    else if (isJudge && nightActionRequest) {
      prevVoiceActionRef.current = 'stay';
      setCanSpeak(true);
      setMicrophoneMuted(false);
      getZegoVoiceService().muteMicrophone(false);
      getZegoVoiceService().resetRemoteAudio();

      // 获取当前行动玩家ID列表
      const actionPlayerIds = playerState.players
        .filter((p) => p.status === 'alive' && p.role === nightActionRequest.roleId)
        .map((p) => p.id);

      // 法官 + 行动玩家可互相交流
      const allowedSpeakers = [playerState.myPlayerId, ...actionPlayerIds];
      getZegoVoiceService().setAllowedSpeakers(allowedSpeakers);

      setNightVoiceMode(true);
      setVoiceStatusHint('法官指导');
    }
    // 当前行动玩家 + 存活 → 保持连接，与法官交流
    else if (isCurrentActionPlayer && myPlayer.status === 'alive') {
      prevVoiceActionRef.current = 'stay';
      setCanSpeak(true);
      setMicrophoneMuted(false);
      getZegoVoiceService().muteMicrophone(false);
      getZegoVoiceService().resetRemoteAudio();

      // 获取法官ID
      const judgeId = playerState.players.find((p) => p.isJudge)?.id;

      // 获取当前行动玩家ID列表
      const actionPlayerIds = playerState.players
        .filter((p) => p.status === 'alive' && p.role === nightActionRequest.roleId)
        .map((p) => p.id);

      const allowedSpeakers = judgeId ? [judgeId, ...actionPlayerIds] : actionPlayerIds;
      getZegoVoiceService().setAllowedSpeakers(allowedSpeakers);

      setNightVoiceMode(true);
      setVoiceStatusHint('法官指导');
    }
    // 非狼人 + 非法官 + 非当前行动玩家 + 存活 → 断开连接，节省时长
    else if (!isWolfRole && !isJudge && !isCurrentActionPlayer) {
      prevVoiceActionRef.current = 'leave';
      leaveVoiceRoom();
      setNightVoiceMode(true);
      setVoiceStatusHint('夜晚休息');
      setCanSpeak(false);
    }
    // 其他情况（如狼人非行动阶段）：保持连接但静音
    else {
      prevVoiceActionRef.current = 'stay';
      setCanSpeak(false);
      setMicrophoneMuted(true);
      getZegoVoiceService().muteMicrophone(true);
      getZegoVoiceService().muteAllRemoteAudio();
      setNightVoiceMode(true);
      setVoiceStatusHint('夜晚休息');
    }

    return () => {
      // 仅在保持连接（stay）时恢复语音状态
      // 如果已 leaveVoiceRoom，则不恢复（避免对已退出的房间操作 SDK）
      if (prevVoiceActionRef.current === 'stay') {
        setCanSpeak(true);
        setMicrophoneMuted(false);
        getZegoVoiceService().muteMicrophone(false);
        getZegoVoiceService().resetRemoteAudio();
      }
      setVoiceStatusHint(null);
      prevVoiceActionRef.current = null;
    };
  }, [
    playerState?.myPlayerId,
    playerState?.players,
    playerState?.nightActionRequest,
    playerState?.nightActionRequest?.roleId,
    playerState?.phase,
    connectionState,
    ruleConfig?.sharedWolfRoles,
    enableVoice,
    leaveVoiceRoom,
    setCanSpeak,
    setMicrophoneMuted,
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
      // 白狼王和狼王也使用狼人投票面板
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
