/**
 * ============================================================================
 * useZegoVoice — 语音操作 React Hook
 * ============================================================================
 *
 * 架构说明：
 *   本 Hook 封装语音操作的 React 接口，处理：
 *   1. 麦克风权限请求与状态检查
 *   2. 麦克风/扬声器切换（同步 ZegoVoiceService）
 *   3. 从 useVoiceStore 读取状态
 *
 * 注意：
 *   - 本 Hook 不负责初始化 Zego 引擎和加入房间（这些在 App 层面处理）
 *   - toggleMicrophone/toggleSpeaker 会同时更新 store 和 ZegoVoiceService
 * ============================================================================
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useVoiceStore } from '../store/useVoiceStore';
import { getZegoVoiceService } from '../services/zego';
import type { ZegoConnectionState } from '@langrensha/shared/types/zego';

// ============================================================================
// Hook 返回类型
// ============================================================================

export interface UseZegoVoiceReturn {
  // ---- 状态 ----
  connectionState: ZegoConnectionState;
  isMicrophoneMuted: boolean;
  isSpeakerMuted: boolean;
  voiceEnabled: boolean;
  voiceError: string | null;
  speakingUsers: Record<string, number>;
  canSpeak: boolean;
  connectionDuration: number;
  networkQuality: 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Die' | null;
  microphonePermission: 'GRANTED' | 'DENIED' | 'PROMPT';
  operationFeedback: { type: 'mic-on' | 'mic-off' | 'speaker-on' | 'speaker-off'; timestamp: number } | null;

  // ---- 操作 ----
  toggleMicrophone: () => void;
  toggleSpeaker: () => void;
  requestMicrophonePermission: () => Promise<boolean>;
  dismissVoiceError: () => void;
}

// ============================================================================
// Hook 实现
// ============================================================================

export function useZegoVoice(): UseZegoVoiceReturn {
  // 从 store 读取状态
  const connectionState = useVoiceStore((s) => s.connectionState);
  const isMicrophoneMuted = useVoiceStore((s) => s.isMicrophoneMuted);
  const isSpeakerMuted = useVoiceStore((s) => s.isSpeakerMuted);
  const voiceEnabled = useVoiceStore((s) => s.voiceEnabled);
  const voiceError = useVoiceStore((s) => s.voiceError);
  const speakingUsers = useVoiceStore((s) => s.speakingUsers);
  const canSpeak = useVoiceStore((s) => s.canSpeak);
  const connectionDuration = useVoiceStore((s) => s.connectionDuration);
  const networkQuality = useVoiceStore((s) => s.networkQuality);
  const microphonePermission = useVoiceStore((s) => s.microphonePermission);

  // store actions
  const storeToggleMicrophone = useVoiceStore((s) => s.toggleMicrophone);
  const storeToggleSpeaker = useVoiceStore((s) => s.toggleSpeaker);
  const setMicrophoneMuted = useVoiceStore((s) => s.setMicrophoneMuted);
  const setSpeakerMuted = useVoiceStore((s) => s.setSpeakerMuted);
  const setMicrophonePermission = useVoiceStore((s) => s.setMicrophonePermission);
  const setVoiceError = useVoiceStore((s) => s.setVoiceError);
  const dismissVoiceError = useVoiceStore((s) => s.dismissVoiceError);
  const updateConnectionDuration = useVoiceStore((s) => s.updateConnectionDuration);

  // 定时器引用
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // 操作反馈状态
  const [operationFeedback, setOperationFeedback] = useState<{ type: 'mic-on' | 'mic-off' | 'speaker-on' | 'speaker-off'; timestamp: number } | null>(null);

  // ---- 麦克风切换 ----
  const toggleMicrophone = useCallback(() => {
    const newMuted = !isMicrophoneMuted;
    // 同步到 ZegoVoiceService
    getZegoVoiceService().muteMicrophone(newMuted);
    // 更新 store
    setMicrophoneMuted(newMuted);
    // 设置操作反馈
    setOperationFeedback({ type: newMuted ? 'mic-off' : 'mic-on', timestamp: Date.now() });
  }, [isMicrophoneMuted, setMicrophoneMuted]);

  // ---- 扬声器切换 ----
  const toggleSpeaker = useCallback(() => {
    const newMuted = !isSpeakerMuted;
    // 同步到 ZegoVoiceService
    getZegoVoiceService().muteSpeaker(newMuted);
    // 更新 store
    setSpeakerMuted(newMuted);
    // 设置操作反馈
    setOperationFeedback({ type: newMuted ? 'speaker-off' : 'speaker-on', timestamp: Date.now() });
  }, [isSpeakerMuted, setSpeakerMuted]);

  // ---- 请求麦克风权限 ----
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 获取到流说明权限已授予，立即释放流（Zego SDK 会自行创建流）
      stream.getTracks().forEach((track) => track.stop());
      setMicrophonePermission('GRANTED');
      return true;
    } catch (error) {
      console.error('[useZegoVoice] 麦克风权限请求失败:', error);
      setMicrophonePermission('DENIED');
      if (error instanceof DOMException) {
        const message = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
          ? '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风'
          : error.name === 'NotFoundError'
            ? '未检测到麦克风设备，请连接麦克风后重试'
            : error.name === 'NotReadableError'
              ? '麦克风正被其他应用占用，请关闭占用程序后重试'
              : error.name === 'SecurityError'
                ? '当前页面不允许访问麦克风，请使用 HTTPS 或 localhost 访问'
                : `麦克风权限请求失败：${error.message || error.name}`;
        setVoiceError(message);
      } else {
        setVoiceError('麦克风权限请求失败');
      }
      return false;
    }
  }, [setMicrophonePermission, setVoiceError]);

  // ---- 组件挂载时自动检查麦克风权限状态 ----
  useEffect(() => {
    // navigator.permissions.query 可能不被所有浏览器支持
    if (typeof navigator === 'undefined' || !navigator.permissions) return;

    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        const mapState = (state: PermissionState) => {
          switch (state) {
            case 'granted':
              return 'GRANTED' as const;
            case 'denied':
              return 'DENIED' as const;
            default:
              return 'PROMPT' as const;
          }
        };

        setMicrophonePermission(mapState(status.state));

        // 监听权限状态变化
        status.onchange = () => {
          setMicrophonePermission(mapState(status.state));
        };
      })
      .catch(() => {
        // 某些浏览器不支持查询麦克风权限，保持默认 PROMPT 状态
      });
  }, [setMicrophonePermission]);

  // ---- 连接时长定时器管理 ----
  useEffect(() => {
    // 连接成功时启动定时器
    if (connectionState === 'CONNECTED') {
      if (!durationTimerRef.current) {
        durationTimerRef.current = setInterval(() => {
          updateConnectionDuration();
        }, 1000);
      }
    } else {
      // 断开连接时停止定时器
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    }

    // 组件卸载时清理定时器
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [connectionState, updateConnectionDuration]);

  return {
    // 状态
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

    // 操作
    toggleMicrophone,
    toggleSpeaker,
    requestMicrophonePermission,
    dismissVoiceError,
  };
}
