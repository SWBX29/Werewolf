import { useGameStore } from '../../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import type { RoleId, NightActionData } from '@langrensha/shared';
import CountdownTimer from '../CountdownTimer';

/**
 * 渲染已行动技能的释放信息
 * 当玩家自己已经提交了夜间行动、正在等待其他角色行动时显示
 */
export function MyActionInfo({ action }: { action: NightActionData }) {
  const players = useGameStore((s) => s.playerState?.players) ?? [];
  const roleName = ROLE_META[action.roleId as RoleId]?.name ?? '未知角色';

  // 获取目标玩家昵称
  const getTargetName = (seat: number | null) => {
    if (seat === null) return null;
    const target = players.find((p) => p.seatNumber === seat);
    return target ? `${seat}号 ${target.nickname}` : `${seat}号`;
  };

  // 根据不同角色渲染行动详情
  const renderDetail = () => {
    const targetName = getTargetName(action.targetSeat);

    switch (action.roleId) {
      case 'seer': {
        const seerResult = action.extra?.seerResult as string | undefined;
        const resultText = seerResult === 'good' ? '好人阵营' : seerResult === 'evil' ? '狼人阵营' : null;
        return (
          <div className="space-y-1">
            <p className="text-sm text-indigo-300">查验目标：{targetName ?? '无'}</p>
            {resultText && (
              <p className={`text-sm font-semibold ${seerResult === 'good' ? 'text-emerald-400' : 'text-red-400'}`}>
                查验结果：{resultText}
              </p>
            )}
          </div>
        );
      }
      case 'guard': {
        const protectTarget = action.extra?.protectTarget as number | null | undefined;
        const protectName = getTargetName(protectTarget ?? action.targetSeat);
        return <p className="text-sm text-indigo-300">守护目标：{protectName ?? '空守'}</p>;
      }
      case 'witch': {
        const useAntidote = action.extra?.useAntidote as boolean | undefined;
        const usePoison = action.extra?.usePoison as boolean | undefined;
        const poisonTarget = action.extra?.poisonTarget as number | null | undefined;
        return (
          <div className="space-y-1">
            <p className="text-sm text-emerald-400">
              解药：{useAntidote ? '已使用' : '未使用'}
            </p>
            <p className="text-sm text-purple-400">
              毒药：{usePoison ? `已对${getTargetName(poisonTarget ?? null) ?? '未知'}使用` : '未使用'}
            </p>
          </div>
        );
      }
      case 'nightmare_shadow': {
        return <p className="text-sm text-indigo-300">恐惧目标：{targetName ?? '无'}</p>;
      }
      case 'werewolf': {
        return <p className="text-sm text-indigo-300">击杀目标：{targetName ?? '无'}</p>;
      }
      case 'mechanical_wolf': {
        const phase = action.extra?.phase as string | undefined;
        const imitateTarget = action.extra?.imitateTarget as number | null | undefined;
        const skillTarget = action.extra?.imitateSkillTarget as number | null | undefined;
        if (phase === 'selecting') {
          return <p className="text-sm text-indigo-300">模仿目标：{getTargetName(imitateTarget ?? action.targetSeat) ?? '无'}</p>;
        }
        if (phase === 'active') {
          return <p className="text-sm text-indigo-300">技能目标：{getTargetName(skillTarget ?? action.targetSeat) ?? '无'}</p>;
        }
        return <p className="text-sm text-indigo-300">目标：{targetName ?? '无'}</p>;
      }
      default:
        return targetName ? <p className="text-sm text-indigo-300">目标：{targetName}</p> : null;
    }
  };

  return (
    <div className="mt-6 w-full max-w-xs bg-indigo-950/40 border border-indigo-800/30 rounded-xl p-4 text-center">
      <p className="text-xs text-gray-500 mb-2">你已行动</p>
      <p className="text-sm font-semibold text-indigo-200 mb-2">{roleName}</p>
      {renderDetail()}
    </div>
  );
}

/**
 * 夜间等待动画 — 非行动玩家看到的统一等待界面
 * 关键：无论真实玩家行动还是死亡角色的时间模拟，动画完全一致
 * 当自身有已经行动的技能时，额外显示已行动技能的释放信息
 */
export default function NightWaiting() {
  const playerState = useGameStore((s) => s.playerState);
  const phaseTimeRemaining = useGameStore((s) => s.phaseTimeRemaining);

  const round = playerState?.round ?? 1;
  const currentNightRole = playerState?.currentNightRole;
  const myNightAction = playerState?.myNightAction ?? null;

  // 从 currentNightRole 推断当前行动角色名（所有玩家可见）
  let actingRoleName = '神秘角色';
  if (currentNightRole) {
    actingRoleName = ROLE_META[currentNightRole]?.name ?? '神秘角色';
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[50vh] select-none">
      {/* 月亮动画 */}
      <div className="relative mb-8">
        <div className="animate-float">
          <div className="animate-moon-glow text-8xl">
            🌙
          </div>
        </div>
        {/* 星星点缀 */}
        <div className="absolute -top-2 -left-6 text-2xl opacity-40 animate-pulse">✦</div>
        <div className="absolute top-4 -right-8 text-xl opacity-30 animate-pulse" style={{ animationDelay: '0.5s' }}>✧</div>
        <div className="absolute -bottom-1 left-2 text-sm opacity-25 animate-pulse" style={{ animationDelay: '1s' }}>⋆</div>
      </div>

      {/* 轮次 */}
      <h2 className="text-2xl font-bold text-indigo-300 mb-3">
        第 {round} 夜
      </h2>

      {/* 行动提示 — 显示实际角色身份 */}
      <p className="text-lg text-gray-400 animate-pulse">
        {actingRoleName} 正在行动……
      </p>

      {/* 进度条 — 显示当前行动角色的剩余时间 */}
      {phaseTimeRemaining > 0 && (
        <div className="mt-4 w-64">
          <CountdownTimer seconds={phaseTimeRemaining} />
        </div>
      )}

      {/* 已行动技能信息 — 当自己已经提交行动时显示 */}
      {myNightAction && <MyActionInfo action={myNightAction} />}

      {/* 沙漏装饰 */}
      <div className="mt-6 text-3xl opacity-50 animate-pulse">
        ⏳
      </div>
    </div>
  );
}
