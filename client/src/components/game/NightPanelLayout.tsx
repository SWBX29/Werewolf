/**
 * ============================================================================
 * NightPanelLayout — 夜间面板统一布局组件
 * ============================================================================
 *
 * 架构说明：
 *   1. 提供一致的卡片样式、标题栏、倒计时显示
 *   2. 各角色夜间行动面板的通用布局容器
 *
 * 设计原则：
 *   - 支持多种主题颜色（蓝/紫/绿/红/青/琥珀）
 *   - 可选的倒计时和底部区域
 * ============================================================================
 */

import { ReactNode } from 'react';
import CountdownTimer from './CountdownTimer';

/** 夜间面板布局属性接口 */
interface NightPanelLayoutProps {
  /** 面板标题（如 "预言家 · 查验"） */
  title: string;
  /** 面板图标 emoji */
  icon: string;
  /** 面板主题颜色 */
  theme?: 'blue' | 'purple' | 'green' | 'red' | 'cyan' | 'amber';
  /** 剩余时间（秒），用于倒计时显示 */
  timeRemaining?: number;
  /** 子内容 */
  children: ReactNode;
  /** 底部额外内容 */
  footer?: ReactNode;
}

/** 夜间面板统一布局组件，提供一致的卡片样式、标题栏、倒计时显示 */
export default function NightPanelLayout({
  title,
  icon,
  theme = 'blue',
  timeRemaining,
  children,
  footer,
}: NightPanelLayoutProps) {
  // 主题颜色映射
  const themeColors = {
    blue: 'text-blue-300',
    purple: 'text-purple-300',
    green: 'text-green-300',
    red: 'text-red-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
  };

  return (
    <div className="night-panel">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-xl font-bold ${themeColors[theme]}`}>
          {icon} {title}
        </h2>
        {/* 倒计时 */}
        {timeRemaining && timeRemaining > 0 && (
          <div className="w-40">
            <CountdownTimer seconds={timeRemaining} />
          </div>
        )}
      </div>

      {/* 主内容 */}
      <div className="space-y-4">
        {children}
      </div>

      {/* 底部 */}
      {footer && (
        <div className="mt-4">
          {footer}
        </div>
      )}
    </div>
  );
}