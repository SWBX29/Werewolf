import React, { useEffect, useState, useRef, useCallback } from 'react';

/**
 * 可复用倒计时组件
 * 显示进度条 + 秒数文本，颜色随剩余时间变化
 */
interface CountdownTimerProps {
  seconds: number;
  onExpire?: () => void;
  urgentThreshold?: number;
}

function CountdownTimer({
  seconds,
  onExpire,
  urgentThreshold = 10,
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const onExpireRef = useRef(onExpire);
  // Bug 5 修复：添加标记防止 onExpire 多次触发
  const hasExpiredRef = useRef(false);
  
  onExpireRef.current = onExpire;

  // 当 seconds prop 变化时重置状态
  useEffect(() => {
    setRemaining(seconds);
    hasExpiredRef.current = false;
  }, [seconds]);

  // Bug 5 修复：使用单个 interval，不依赖 remaining
  useEffect(() => {
    if (seconds <= 0) return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timer);
          // 仅在首次到期时触发 onExpire
          if (!hasExpiredRef.current) {
            hasExpiredRef.current = true;
            onExpireRef.current?.();
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds]); // 仅依赖 seconds，不依赖 remaining

  const progress = seconds > 0 ? (remaining / seconds) * 100 : 0;

  const barClass =
    remaining < urgentThreshold
      ? 'timer-bar-urgent'
      : remaining < 30
        ? 'timer-bar-warning'
        : 'timer-bar-normal';

  const textClass = remaining < urgentThreshold ? 'countdown-urgent' : '';

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="timer-bar flex-1">
        <div
          className={`timer-bar-fill ${barClass}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className={`text-sm font-mono min-w-[2.5rem] text-right ${textClass}`}>
        {remaining}s
      </span>
    </div>
  );
}

export default React.memo(CountdownTimer);
