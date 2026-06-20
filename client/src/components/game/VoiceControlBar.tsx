/**
 * ============================================================================
 * VoiceControlBar — 语音控制栏组件
 * ============================================================================
 *
 * 架构说明：
 *   显示在游戏界面底部的语音控制工具栏，包含：
 *   1. 麦克风按钮（切换静音/取消静音）+ 权限状态指示
 *   2. 扬声器按钮（切换静音/取消静音）
 *   3. 连接状态指示器 + 状态文字提示
 *   4. 正在说话的用户显示
 *   5. 语音错误提示 + 解决建议
 *   6. 操作成功视觉反馈
 *
 * 设计原则：
 *   - 纯展示+操作组件，所有状态从 useZegoVoice hook 获取
 *   - 使用 Tailwind CSS，与现有暗色主题一致
 *   - 支持 compact 模式（法官控制台使用）
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useZegoVoice } from '../../hooks/useZegoVoice';
import { useGameStore } from '../../useGameStore';
import { useVoiceStore } from '../../store/useVoiceStore';
import VoiceInfoPanel from './VoiceInfoPanel';

// ============================================================================
// Props 类型
// ============================================================================

interface VoiceControlBarProps {
  /** 是否紧凑模式（法官控制台使用） */
  compact?: boolean;
}

// ============================================================================
// 状态提示配置
// ============================================================================

const STATUS_HINT_CONFIG: Record<string, { icon: string; color: string; bgColor: string }> = {
  '夜晚休息': { icon: '🌙', color: 'text-gray-400', bgColor: 'bg-gray-950/30' },
  '狼人密谋': { icon: '🐺', color: 'text-red-400', bgColor: 'bg-red-950/30' },
  '法官指导': { icon: '⚖️', color: 'text-purple-400', bgColor: 'bg-purple-950/30' },
  '天亮了': { icon: '☀️', color: 'text-yellow-400', bgColor: 'bg-yellow-950/30' },
};

// ============================================================================
// 网络质量配置
// ============================================================================

const NETWORK_QUALITY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  'Excellent': { icon: '📶', color: 'text-green-400', label: '优秀' },
  'Good': { icon: '📶', color: 'text-blue-400', label: '良好' },
  'Medium': { icon: '📶', color: 'text-yellow-400', label: '一般' },
  'Poor': { icon: '⚠️', color: 'text-red-400', label: '较差' },
  'Die': { icon: '❌', color: 'text-red-500 animate-pulse', label: '断线' },
};

// ============================================================================
// 操作反馈配置
// ============================================================================

const OPERATION_FEEDBACK_CONFIG: Record<string, { icon: string; color: string; bgColor: string; text: string }> = {
  'mic-on': { icon: '🎤', color: 'text-green-400', bgColor: 'bg-green-900/80', text: '麦克风已开启' },
  'mic-off': { icon: '🔇', color: 'text-red-400', bgColor: 'bg-red-900/80', text: '麦克风已关闭' },
  'speaker-on': { icon: '🔊', color: 'text-blue-400', bgColor: 'bg-blue-900/80', text: '扬声器已开启' },
  'speaker-off': { icon: '🔈', color: 'text-gray-400', bgColor: 'bg-gray-800/80', text: '扬声器已关闭' },
};

// ============================================================================
// 错误解决建议配置
// ============================================================================

const ERROR_SOLUTIONS: Record<string, { solution: string; action?: string }> = {
  '语音连接超时': { solution: '请检查网络连接，尝试刷新页面', action: '刷新页面' },
  '语音认证失败': { solution: '请重新加入房间', action: '重新加入' },
  '麦克风权限被拒绝': { solution: '请在浏览器设置中允许访问麦克风', action: '权限设置' },
  '未检测到麦克风设备': { solution: '请连接麦克风后重试', action: '重试' },
  '麦克风被占用': { solution: '请关闭占用程序后重试', action: '重试' },
  '麦克风正被其他应用占用': { solution: '请关闭占用程序后重试', action: '重试' },
  '网络质量较差': { solution: '语音可能不稳定，建议检查网络', action: undefined },
  '网络质量一般': { solution: '可能出现延迟', action: undefined },
};

// ============================================================================
// 格式化连接时长
// ============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 0) return '00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// 获取错误解决方案
// ============================================================================

function getErrorSolution(error: string): { solution: string; action?: string } {
  // 检查是否匹配已知错误
  for (const [key, value] of Object.entries(ERROR_SOLUTIONS)) {
    if (error.includes(key)) {
      return value;
    }
  }
  // 默认解决方案
  return { solution: '请尝试刷新页面或重新加入房间', action: '刷新页面' };
}

// ============================================================================
// 组件实现
// ============================================================================

/** 语音控制栏组件，提供麦克风/扬声器切换、连接状态显示、错误提示等功能 */
export default function VoiceControlBar({ compact = false }: VoiceControlBarProps) {
  const {
    connectionState,
    isMicrophoneMuted,
    isSpeakerMuted,
    voiceEnabled,
    voiceError,
    speakingUsers,
    canSpeak,
    connectionDuration,
    networkQuality,
    microphonePermission,
    operationFeedback,
    toggleMicrophone,
    toggleSpeaker,
    requestMicrophonePermission,
    dismissVoiceError,
  } = useZegoVoice();

  const playerState = useGameStore((s) => s.playerState);
  const voiceStatusHint = useVoiceStore((s) => s.voiceStatusHint);

  // 本地状态：显示权限详情弹窗
  const [showPermissionDetail, setShowPermissionDetail] = useState(false);
  // 本地状态：显示错误详情弹窗
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  // 本地状态：操作反馈显示状态
  const [showOperationFeedback, setShowOperationFeedback] = useState(false);
  // 本地状态：显示语音信息面板
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  // 未连接时显示简化状态栏
  const isConnected = connectionState === 'CONNECTED';

  // 连接状态指示器样式
  const connectionDotClass =
    connectionState === 'CONNECTED'
      ? 'bg-green-400'
      : connectionState === 'CONNECTING' || connectionState === 'RECONNECTING'
        ? 'bg-yellow-400 animate-pulse'
        : 'bg-red-500';

  const connectionTitle =
    connectionState === 'CONNECTED'
      ? '语音已连接'
      : connectionState === 'CONNECTING'
        ? '正在连接语音...'
        : connectionState === 'RECONNECTING'
          ? '语音重连中...'
          : '语音未连接';

  // 将正在说话的 userID 映射为玩家昵称
  const speakingUserIds = Object.keys(speakingUsers);
  const speakingNames = speakingUserIds.map((uid) => {
    // 尝试从玩家列表中找到对应的玩家
    const player = playerState?.players.find((p) => p.id === uid);
    if (player) {
      return `${player.seatNumber}号 ${player.nickname}`;
    }
    // 如果是自己（可能 ID 就是当前用户的 ID）
    if (uid === playerState?.myPlayerId) {
      const myPlayer = playerState?.players.find((p) => p.id === playerState.myPlayerId);
      if (myPlayer) {
        return `${myPlayer.seatNumber}号 ${myPlayer.nickname}`;
      }
    }
    return uid.length > 12 ? `用户${uid.slice(-6)}` : `用户${uid}`;
  });

  // 麦克风按钮样式
  const micBtnClass = isMicrophoneMuted
    ? 'bg-red-900/60 hover:bg-red-800/60 border-red-700'
    : canSpeak
      ? 'bg-green-900/60 hover:bg-green-800/60 border-green-700'
      : 'bg-night-800 hover:bg-night-700 border-night-600 opacity-60';

  // 扬声器按钮样式
  const speakerBtnClass = isSpeakerMuted
    ? 'bg-night-800 hover:bg-night-700 border-night-600'
    : 'bg-blue-900/60 hover:bg-blue-800/60 border-blue-700';

  // 紧凑模式尺寸
  const btnSize = compact ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';
  const textSize = compact ? 'text-[10px]' : 'text-xs';

  // 状态提示配置
  const statusHintConfig = voiceStatusHint ? STATUS_HINT_CONFIG[voiceStatusHint] : null;

  // 网络质量配置
  const networkQualityConfig = networkQuality ? NETWORK_QUALITY_CONFIG[networkQuality] : null;

  // 连接时长超过30分钟时显示警告颜色
  const durationWarningClass = connectionDuration >= 1800 ? 'text-yellow-400' : 'text-gray-500';

  // 权限状态图标配置
  const permissionIconConfig = {
    GRANTED: { icon: '✅', color: 'text-green-400', title: '麦克风权限已授予' },
    DENIED: { icon: '❌', color: 'text-red-400', title: '麦克风权限被拒绝，点击查看解决方法' },
    PROMPT: { icon: '⚠️', color: 'text-yellow-400', title: '麦克风权限未确定，点击授权' },
  };

  // 操作反馈配置
  const feedbackConfig = operationFeedback ? OPERATION_FEEDBACK_CONFIG[operationFeedback.type] : null;

  // 操作反馈自动隐藏（1秒后）
  useEffect(() => {
    if (operationFeedback) {
      setShowOperationFeedback(true);
      const timer = setTimeout(() => {
        setShowOperationFeedback(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [operationFeedback]);

  // 处理权限图标点击
  const handlePermissionClick = async () => {
    if (microphonePermission === 'DENIED') {
      setShowPermissionDetail(!showPermissionDetail);
    } else if (microphonePermission === 'PROMPT') {
      await requestMicrophonePermission();
    }
  };

  // 处理错误点击
  const handleErrorClick = () => {
    setShowErrorDetail(!showErrorDetail);
  };

  // 获取错误解决方案
  const errorSolution = voiceError ? getErrorSolution(voiceError) : null;

  return (
    <div className="flex flex-col gap-1">
      {/* 主控制栏 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-night-900/90 border-t border-night-700 backdrop-blur-sm">
        {/* 状态提示 */}
        {statusHintConfig && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded ${statusHintConfig.bgColor} animate-fade-in-up`}>
            <span className={statusHintConfig.color}>{statusHintConfig.icon}</span>
            <span className={`${textSize} ${statusHintConfig.color} font-medium`}>{voiceStatusHint}</span>
          </div>
        )}

        {/* 麦克风按钮 + 权限状态 */}
        <div className="relative flex items-center gap-0.5">
          <button
            onClick={async () => {
              // 如果要取消静音但还没有权限，先请求权限
              if (isMicrophoneMuted) {
                const granted = await requestMicrophonePermission();
                if (!granted) return;
              }
              toggleMicrophone();
            }}
            className={`${btnSize} flex items-center justify-center rounded-lg border transition-colors duration-200 ${isConnected ? micBtnClass : 'bg-night-800 border-night-600 opacity-40'}`}
            title={isMicrophoneMuted ? '取消静音' : '静音'}
            disabled={!isConnected || (!canSpeak && !isMicrophoneMuted)}
          >
            {isMicrophoneMuted ? '🔇' : '🎤'}
          </button>
          
          {/* 权限状态图标 */}
          {isConnected && (
            <button
              onClick={handlePermissionClick}
              className={`flex-shrink-0 w-4 h-4 flex items-center justify-center text-[10px] ${permissionIconConfig[microphonePermission].color} hover:scale-110 transition-transform`}
              title={permissionIconConfig[microphonePermission].title}
            >
              {permissionIconConfig[microphonePermission].icon}
            </button>
          )}
        </div>

        {/* 扬声器按钮 */}
        <button
          onClick={toggleSpeaker}
          className={`${btnSize} flex items-center justify-center rounded-lg border transition-colors duration-200 ${isConnected ? speakerBtnClass : 'bg-night-800 border-night-600 opacity-40'}`}
          title={isSpeakerMuted ? '取消静音' : '静音'}
          disabled={!isConnected}
        >
          {isSpeakerMuted ? '🔈' : '🔊'}
        </button>

        {/* 连接状态指示器 */}
        <div className="flex items-center gap-1" title={connectionTitle}>
          <span className={`w-2 h-2 rounded-full ${connectionDotClass}`} />
          {!compact && (
            <span className={`${textSize} text-gray-500`}>{connectionTitle}</span>
          )}
        </div>

        {/* 连接时长显示 */}
        {isConnected && connectionDuration > 0 && (
          <div className="flex items-center gap-1" title={`连接时长: ${formatDuration(connectionDuration)}`}>
            <span className={`${textSize} ${durationWarningClass}`}>
              ⏱ {formatDuration(connectionDuration)}
            </span>
          </div>
        )}

        {/* 网络质量显示 */}
        {isConnected && networkQualityConfig && (
          <div className="flex items-center gap-1" title={`网络质量: ${networkQualityConfig.label}`}>
            <span className={`${networkQualityConfig.color}`}>{networkQualityConfig.icon}</span>
            {!compact && (
              <span className={`${textSize} ${networkQualityConfig.color}`}>
                {networkQualityConfig.label}
              </span>
            )}
          </div>
        )}

        {/* 正在说话的用户 */}
        {speakingNames.length > 0 && (
          <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
            <span className="text-amber-400 flex-shrink-0">💬</span>
            <span className={`${textSize} text-amber-300 truncate`}>
              {speakingNames.join('、')} 正在说话
            </span>
          </div>
        )}

        {/* 占位：没有人在说话时填充空间 */}
        {speakingNames.length === 0 && <div className="flex-1" />}

        {/* 语音错误提示 */}
        {voiceError && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleErrorClick}
              className={`${textSize} text-red-400 hover:text-red-300 truncate max-w-[200px] underline decoration-dotted`}
              title="点击查看解决方法"
            >
              {voiceError}
            </button>
            <button
              onClick={dismissVoiceError}
              className="text-gray-500 hover:text-gray-300 text-xs"
              title="关闭"
            >
              ✕
            </button>
          </div>
        )}

        {/* 详细信息按钮 */}
        <button
          onClick={() => setShowInfoPanel(true)}
          className={`${textSize} text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-night-700 transition-colors flex items-center gap-1`}
          title="查看语音详细信息"
        >
          <span>ℹ️</span>
          {!compact && <span>详细信息</span>}
        </button>
      </div>

      {/* 操作反馈提示（浮动显示） */}
      {showOperationFeedback && feedbackConfig && (
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-fade-in-up">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${feedbackConfig.bgColor} shadow-lg`}>
            <span className={`text-lg ${feedbackConfig.color}`}>{feedbackConfig.icon}</span>
            <span className={`text-sm font-medium ${feedbackConfig.color}`}>{feedbackConfig.text}</span>
          </div>
        </div>
      )}

      {/* 权限详情弹窗 */}
      {showPermissionDetail && microphonePermission === 'DENIED' && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-night-800 border border-red-700 rounded-lg shadow-xl z-50 p-3 animate-fade-in-up">
          <div className="flex items-start gap-2">
            <span className="text-red-400 text-lg">❌</span>
            <div className="flex-1">
              <div className="text-sm font-medium text-red-400 mb-1">麦克风权限被拒绝</div>
              <div className="text-xs text-gray-400 mb-2">
                请在浏览器设置中允许访问麦克风：
              </div>
              <ol className="text-xs text-gray-500 list-decimal list-inside space-y-1">
                <li>点击地址栏左侧的锁图标或信息图标</li>
                <li>找到"麦克风"选项</li>
                <li>选择"允许"</li>
                <li>刷新页面重试</li>
              </ol>
              <button
                onClick={() => setShowPermissionDetail(false)}
                className="mt-2 text-xs text-gray-400 hover:text-gray-300"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 错误详情弹窗 */}
      {showErrorDetail && voiceError && errorSolution && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-night-800 border border-red-700 rounded-lg shadow-xl z-50 p-3 animate-fade-in-up">
          <div className="flex items-start gap-2">
            <span className="text-red-400 text-lg">⚠️</span>
            <div className="flex-1">
              <div className="text-sm font-medium text-red-400 mb-1">语音错误</div>
              <div className="text-xs text-gray-300 mb-2">{voiceError}</div>
              <div className="text-xs text-gray-400 mb-2">
                <span className="text-yellow-400">解决方法：</span>{errorSolution.solution}
              </div>
              {errorSolution.action && (
                <button
                  onClick={() => {
                    if (errorSolution.action === '刷新页面') {
                      window.location.reload();
                    } else if (errorSolution.action === '重新加入') {
                      // 触发重新加入房间逻辑
                      dismissVoiceError();
                    } else if (errorSolution.action === '重试') {
                      requestMicrophonePermission();
                    }
                    setShowErrorDetail(false);
                  }}
                  className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
                >
                  {errorSolution.action}
                </button>
              )}
              <button
                onClick={() => setShowErrorDetail(false)}
                className="ml-2 text-xs text-gray-400 hover:text-gray-300"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 语音信息面板 */}
      {showInfoPanel && (
        <VoiceInfoPanel onClose={() => setShowInfoPanel(false)} />
      )}
    </div>
  );
}