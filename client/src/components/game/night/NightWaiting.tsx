import { useGameStore } from '../../../useGameStore';
import { ROLE_META } from '@langrensha/shared';
import type { RoleId } from '@langrensha/shared';
import CountdownTimer from '../CountdownTimer';

/**
 * 夜间等待动画 — 非行动玩家看到的统一等待界面
 * 关键：无论真实玩家行动还是死亡角色的时间模拟，动画完全一致
 */
export default function NightWaiting() {
  const playerState = useGameStore((s) => s.playerState);
  const phaseTimeRemaining = useGameStore((s) => s.phaseTimeRemaining);

  const round = playerState?.round ?? 1;
  const currentNightRole = playerState?.currentNightRole;

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

      {/* 沙漏装饰 */}
      <div className="mt-6 text-3xl opacity-50 animate-pulse">
        ⏳
      </div>
    </div>
  );
}
