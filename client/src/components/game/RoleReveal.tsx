import { useState, useEffect } from 'react';
import { useGameStore } from '../../useGameStore';
import type { RoleId } from '@langrensha/shared';
import { ROLE_META } from '@langrensha/shared';
import CountdownTimer from './CountdownTimer';

/**
 * 角色 emoji 映射
 */
const ROLE_EMOJI: Record<RoleId, string> = {
  villager: '👤',
  seer: '🔮',
  witch: '🧪',
  hunter: '🔫',
  guard: '🛡️',
  idiot: '🃏',
  knight: '⚔️',
  werewolf: '🐺',
  white_wolf_king: '👑🐺',
  wolf_king: '🐺💥',
  nightmare_shadow: '😨',
  hidden_wolf: '🐺🫥',
  mechanical_wolf: '🤖🐺',
};

/**
 * 角色风味文本
 */
const FLAVOR_TEXT: Record<RoleId, string> = {
  villager: '你是村庄的守护者，用智慧和投票消灭狼人……',
  seer: '你拥有洞察真相的力量，每晚可查验一人的身份……',
  witch: '你掌握生死之药，一瓶救人，一瓶杀人……',
  hunter: '你身怀绝技，死亡之时可带走一人……',
  guard: '你是暗夜中的守护者，每晚可庇护一人免受伤害……',
  idiot: '你看似平凡，却拥有一次免死的机会……',
  knight: '你是正义的利刃，可在白天发起决斗……',
  werewolf: '你是一名暗夜中的猎手，与同伴商议猎杀目标……',
  white_wolf_king: '你是狼群之王，可在白天自爆带走一人并强制入夜……',
  wolf_king: '你是狼群中的霸主，死亡之时可开枪带走一人……',
  nightmare_shadow: '你是恐惧的化身，每晚可恐惧一人使其技能失效……',
  hidden_wolf: '你是潜伏的暗影，被查验时显示为好人……',
  mechanical_wolf: '你是机械造物，首夜选择模仿目标，次夜释放模仿技能……',
};

/**
 * 角色揭示组件
 * 游戏开始时显示一次，玩家确认后不再出现
 */
export default function RoleReveal() {
  const playerState = useGameStore((s) => s.playerState);
  const roleConfirmed = useGameStore((s) => s.roleConfirmed);
  const confirmRole = useGameStore((s) => s.confirmRole);
  const phase = playerState?.phase;

  if (!playerState) return null;

  // 找到自己的玩家
  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  if (!myPlayer || !myPlayer.role) return null;

  const roleId = myPlayer.role;
  const meta = ROLE_META[roleId];
  const emoji = ROLE_EMOJI[roleId];
  const flavor = FLAVOR_TEXT[roleId];
  const isEvil = meta.faction === 'evil';

  // ROLE_REVEAL阶段由服务端倒计时驱动，其他阶段由客户端确认按钮驱动
  const isAutoPhase = phase === 'ROLE_REVEAL';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="role-panel p-8 max-w-sm w-full mx-4 animate-fade-in-up text-center">
        {/* 角色 emoji */}
        <div className="text-6xl mb-4">{emoji}</div>

        {/* 角色名称 */}
        <h2 className="text-2xl font-bold text-gray-100 mb-2">{meta.name}</h2>

        {/* 阵营标签 */}
        <span className={isEvil ? 'tag-evil' : 'tag-good'}>
          {isEvil ? '狼人阵营' : '好人阵营'}
        </span>

        {/* 技能描述 */}
        <p className="text-sm text-gray-400 mt-4">{meta.description}</p>

        {/* 风味文本 */}
        <p className="text-sm text-gray-500 mt-3 italic">"{flavor}"</p>

        {/* 确认按钮或倒计时 */}
        {isAutoPhase ? (
          <div className="mt-6">
            <p className="text-xs text-gray-500 mb-2">即将进入夜晚...</p>
            <div className="w-48 mx-auto">
              <CountdownTimer seconds={5} />
            </div>
          </div>
        ) : (
          <button
            className="btn-primary mt-6 w-full"
            onClick={confirmRole}
          >
            确认知晓
          </button>
        )}
      </div>
    </div>
  );
}
