import React from 'react';
import type { PlayerDTO } from '@langrensha/shared';

export interface TargetSelectorProps {
  /** 可选目标座位号列表 */
  targets: number[];
  /** 玩家列表（用于显示昵称） */
  players: PlayerDTO[];
  /** 当前玩家座位号 */
  mySeat: number;
  /** 已选中的目标座位号 */
  selected: number | null;
  /** 选中变更回调 */
  onSelect: (seat: number | null) => void;
  /** 被禁用的目标座位号列表 */
  disabledTargets?: number[];
  /** 被禁用目标的原因映射 */
  disabledReasons?: Record<number, string>;
  /** 是否允许选择自己 */
  allowSelf?: boolean;
  /** 自己的标签（如"自刀"） */
  selfLabel?: string;
  /** 是否全局禁用（操作已锁定） */
  disabled?: boolean;
}

function TargetSelector({
  targets,
  players,
  mySeat,
  selected,
  onSelect,
  disabledTargets = [],
  disabledReasons = {},
  allowSelf = false,
  selfLabel,
  disabled = false,
}: TargetSelectorProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {targets.map((seat) => {
        const player = players.find((p) => p.seatNumber === seat);
        const isSelf = seat === mySeat;
        const isDisabled = disabledTargets.includes(seat) || (isSelf && !allowSelf) || disabled;
        const isSelected = selected === seat;
        const reason = disabledReasons[seat] || (isSelf && !allowSelf ? '不能选择自己' : '');

        let btnClass = 'target-btn';
        if (isSelected) btnClass += ' target-btn-selected';
        if (isDisabled) btnClass += ' target-btn-disabled';

        return (
          <button
            key={seat}
            className={btnClass}
            disabled={isDisabled}
            onClick={() => onSelect(isSelected ? null : seat)}
            title={reason || undefined}
          >
            <span className="font-mono text-lg font-bold">
              {seat}号
            </span>
            {isSelf && selfLabel && (
              <span className="text-xs text-wolf-400">{selfLabel}</span>
            )}
            {player && !isSelf && (
              <span className="text-xs text-gray-400 truncate max-w-full">
                {player.nickname}
              </span>
            )}
            {isDisabled && reason && (
              <span className="text-xs text-red-400/70 truncate max-w-full">
                {reason}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default React.memo(TargetSelector);
