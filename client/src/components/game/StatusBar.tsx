import { useGameStore } from '../../useGameStore';
import type { GamePhase, RoleId } from '@langrensha/shared';
import { ROLE_META } from '@langrensha/shared';
import CountdownTimer from './CountdownTimer';

/**
 * 阶段名称映射
 */
const PHASE_NAMES: Record<GamePhase, string> = {
  LOBBY: '大厅等待',
  NIGHT: '天黑请闭眼',
  NIGHT_SETTLEMENT: '夜间结算中',
  DAY_ANNOUNCE: '天亮了',
  DAY_SPEECH: '发言阶段',
  DAY_VOTE: '投票阶段',
  DAY_SETTLEMENT: '白天结算中',
  DAY_INTERRUPT: '白天中断',
  PK_VOTE: 'PK投票',
  GAME_OVER: '游戏结束',
};

/**
 * 夜间子阶段角色名称映射（用于显示 "第X夜·XXX行动"）
 */
const NIGHT_ROLE_NAMES: Record<RoleId, string> = {
  nightmare_shadow: '噩梦之影',
  werewolf: '狼人',
  witch: '女巫',
  seer: '预言家',
  guard: '守卫',
  mechanical_wolf: '机械狼',
  // 以下角色没有独立夜间子阶段，但保留映射以防万一
  villager: '村民',
  hunter: '猎人',
  idiot: '白痴',
  knight: '骑士',
  white_wolf_king: '白狼王',
  wolf_king: '狼王',
  hidden_wolf: '隐狼',
};

/**
 * 顶部状态栏组件
 * 显示：当前阶段、倒计时、行动提示、网络状态
 */
export default function StatusBar() {
  const playerState = useGameStore((s) => s.playerState);
  const phaseTimeRemaining = useGameStore((s) => s.phaseTimeRemaining);
  const isConnected = useGameStore((s) => s.isConnected);
  const isReconnecting = useGameStore((s) => s.isReconnecting);
  const judgeState = useGameStore((s) => s.judgeState);
  const isJudge = useGameStore((s) => s.isJudge);

  if (!playerState && !judgeState) return null;

  const phase = isJudge ? judgeState!.phase : playerState!.phase;
  const round = isJudge ? judgeState!.round : playerState!.round;
  const nightActionRequest = !isJudge ? playerState!.nightActionRequest : null;

  // 构建阶段显示文本
  let phaseText = PHASE_NAMES[phase] || phase;

  // 夜间阶段显示子阶段信息
  if (phase === 'NIGHT' && isJudge && judgeState!.nightSubPhase) {
    const sub = judgeState!.nightSubPhase!;
    const roleName = NIGHT_ROLE_NAMES[sub.currentRole] || ROLE_META[sub.currentRole]?.name || sub.currentRole;
    phaseText = `第${round}夜·${roleName}行动`;
  } else if (phase === 'NIGHT' && !isJudge && nightActionRequest) {
    // 普通玩家从 nightActionRequest 推断当前行动角色
    const roleName = ROLE_META[nightActionRequest.roleId]?.name || NIGHT_ROLE_NAMES[nightActionRequest.roleId] || nightActionRequest.roleId;
    phaseText = `第${round}夜·${roleName}行动`;
  } else if (phase === 'NIGHT') {
    phaseText = `第${round}夜`;
  } else if (phase === 'DAY_SPEECH' || phase === 'DAY_VOTE' || phase === 'DAY_ANNOUNCE') {
    phaseText = `第${round}天·${PHASE_NAMES[phase]}`;
  }

  // 判断当前玩家是否需要行动
  const needsAction = nightActionRequest !== null;

  // 行动提示文本
  let actionHint = '';
  if (needsAction && nightActionRequest) {
    const roleName = ROLE_META[nightActionRequest.roleId]?.name || NIGHT_ROLE_NAMES[nightActionRequest.roleId] || nightActionRequest.roleId;
    actionHint = nightActionRequest.hint || `轮到你行动（${roleName}）`;
  }

  // 网络状态指示灯
  const networkDot = isReconnecting
    ? 'bg-yellow-400'
    : isConnected
      ? 'bg-green-400'
      : 'bg-red-500';

  const networkTitle = isReconnecting
    ? '重连中...'
    : isConnected
      ? '已连接'
      : '已断开';

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-night-900/80 border-b border-night-700 backdrop-blur-sm">
      {/* 阶段名称 */}
      <div className="flex-shrink-0">
        <span className="text-sm font-semibold text-gray-200">{phaseText}</span>
      </div>

      {/* 倒计时 — 大厅和夜晚阶段不在顶部显示 */}
      {phase !== 'LOBBY' && phase !== 'NIGHT' && phase !== 'NIGHT_SETTLEMENT' && (
        <div className="flex-1 max-w-xs">
          <CountdownTimer seconds={phaseTimeRemaining} />
        </div>
      )}

      {/* 行动提示 */}
      {needsAction && actionHint && (
        <div className="flex-shrink-0 animate-pulse">
          <span className="text-xs font-bold text-wolf-400 bg-wolf-900/40 px-2 py-1 rounded">
            ⚡ {actionHint}
          </span>
        </div>
      )}

      {/* 网络状态 */}
      <div className="flex-shrink-0 flex items-center gap-1.5" title={networkTitle}>
        <span className={`w-2 h-2 rounded-full ${networkDot}`} />
        <span className="text-xs text-gray-500">{networkTitle}</span>
      </div>
    </div>
  );
}
