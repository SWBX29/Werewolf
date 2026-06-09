/**
 * ============================================================================
 * VoiceInfoPanel — 语音信息面板组件
 * ============================================================================
 *
 * 架构说明：
 *   显示完整的语音连接信息，帮助用户了解当前语音状态，包括：
 *   1. 连接状态区域（状态图标 + 文字 + 连接时长）
 *   2. 网络质量区域（质量图标 + 文字 + 建议）
 *   3. 房间信息区域（房间 ID + 用户 ID）
 *   4. 设备信息区域（麦克风权限状态 + 设备名称）
 *   5. 计费提示区域（当前计费状态 + 节省时长提示）
 *   6. 操作按钮区域（刷新页面、重新连接、权限设置）
 *
 * 设计原则：
 *   - 信息实时更新，反映最新状态
 *   - 计费提示准确，帮助用户了解当前计费状态
 *   - UI 清晰明了，易于理解
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useZegoVoice } from '../../hooks/useZegoVoice';
import { useGameStore } from '../../useGameStore';
import { useVoiceStore } from '../../store/useVoiceStore';

// ============================================================================
// Props 类型
// ============================================================================

interface VoiceInfoPanelProps {
  /** 关闭面板的回调 */
  onClose: () => void;
}

// ============================================================================
// 连接状态配置
// ============================================================================

const CONNECTION_STATE_CONFIG: Record<string, { icon: string; color: string; bgColor: string; label: string }> = {
  'CONNECTED': { icon: '🟢', color: 'text-green-400', bgColor: 'bg-green-950/30', label: '已连接' },
  'CONNECTING': { icon: '🟡', color: 'text-yellow-400', bgColor: 'bg-yellow-950/30', label: '连接中...' },
  'RECONNECTING': { icon: '🟠', color: 'text-orange-400', bgColor: 'bg-orange-950/30', label: '重连中...' },
  'DISCONNECTED': { icon: '🔴', color: 'text-red-400', bgColor: 'bg-red-950/30', label: '未连接' },
};

// ============================================================================
// 网络质量配置
// ============================================================================

const NETWORK_QUALITY_CONFIG: Record<string, { icon: string; color: string; bgColor: string; label: string; suggestion?: string }> = {
  'Excellent': { icon: '📶', color: 'text-green-400', bgColor: 'bg-green-950/30', label: '优秀', suggestion: '网络质量极佳，语音流畅' },
  'Good': { icon: '📶', color: 'text-blue-400', bgColor: 'bg-blue-950/30', label: '良好', suggestion: '网络质量良好，语音稳定' },
  'Medium': { icon: '📶', color: 'text-yellow-400', bgColor: 'bg-yellow-950/30', label: '一般', suggestion: '网络质量一般，可能出现延迟' },
  'Poor': { icon: '⚠️', color: 'text-red-400', bgColor: 'bg-red-950/30', label: '较差', suggestion: '网络质量较差，建议检查网络连接' },
  'Die': { icon: '❌', color: 'text-red-500', bgColor: 'bg-red-950/30', label: '断线', suggestion: '网络已断线，请刷新页面' },
};

// ============================================================================
// 麦克风权限配置
// ============================================================================

const PERMISSION_CONFIG: Record<string, { icon: string; color: string; bgColor: string; label: string; action?: string }> = {
  'GRANTED': { icon: '✅', color: 'text-green-400', bgColor: 'bg-green-950/30', label: '已授权' },
  'DENIED': { icon: '❌', color: 'text-red-400', bgColor: 'bg-red-950/30', label: '未授权', action: '请在浏览器设置中允许访问麦克风' },
  'PROMPT': { icon: '⚠️', color: 'text-yellow-400', bgColor: 'bg-yellow-950/30', label: '未请求', action: '点击下方"请求权限"按钮' },
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
// 获取计费状态描述
// ============================================================================

function getBillingStatus(
  phase: string | undefined,
  isJudge: boolean,
  myRole: string | undefined | null,
  voiceStatusHint: string | null
): { status: string; icon: string; color: string; bgColor: string; tip?: string } {
  // 根据语音状态提示判断
  if (voiceStatusHint === '夜晚休息') {
    return {
      status: '夜晚休息中，不消耗时长',
      icon: '🌙',
      color: 'text-gray-400',
      bgColor: 'bg-gray-950/30',
      tip: '夜晚策略已为您节省时长',
    };
  }
  
  if (voiceStatusHint === '狼人密谋') {
    return {
      status: '狼人密谋中，正在计费',
      icon: '🐺',
      color: 'text-red-400',
      bgColor: 'bg-red-950/30',
    };
  }
  
  if (voiceStatusHint === '法官指导') {
    return {
      status: '法官指导中，正在计费',
      icon: '⚖️',
      color: 'text-purple-400',
      bgColor: 'bg-purple-950/30',
    };
  }
  
  if (voiceStatusHint === '天亮了') {
    return {
      status: '白天交流中，正在计费',
      icon: '☀️',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-950/30',
    };
  }
  
  // 根据游戏阶段判断
  if (phase === 'NIGHT' || phase === 'NIGHT_SETTLEMENT' || phase === 'PRE_NIGHT') {
    if (isJudge) {
      return {
        status: '法官指导中，正在计费',
        icon: '⚖️',
        color: 'text-purple-400',
        bgColor: 'bg-purple-950/30',
      };
    }
    // 狼人阵营
    if (myRole === 'wolf' || myRole === 'whiteWolf' || myRole === 'wolfKing') {
      return {
        status: '狼人密谋中，正在计费',
        icon: '🐺',
        color: 'text-red-400',
        bgColor: 'bg-red-950/30',
      };
    }
    // 其他角色夜晚休息
    return {
      status: '夜晚休息中，不消耗时长',
      icon: '🌙',
      color: 'text-gray-400',
      bgColor: 'bg-gray-950/30',
      tip: '夜晚策略已为您节省时长',
    };
  }
  
  // 白天阶段
  if (phase === 'DAY_SPEECH' || phase === 'DAY_VOTE' || phase === 'DAY_ANNOUNCE' || phase === 'DAY_SETTLEMENT' || phase === 'PK_VOTE') {
    return {
      status: '白天交流中，正在计费',
      icon: '☀️',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-950/30',
    };
  }
  
  // 默认
  return {
    status: '语音服务待连接',
    icon: '⏳',
    color: 'text-gray-400',
    bgColor: 'bg-gray-950/30',
  };
}

// ============================================================================
// 组件实现
// ============================================================================

export default function VoiceInfoPanel({ onClose }: VoiceInfoPanelProps) {
  const {
    connectionState,
    connectionDuration,
    networkQuality,
    microphonePermission,
    requestMicrophonePermission,
  } = useZegoVoice();

  const currentRoomID = useVoiceStore((s) => s.currentRoomID);
  const currentUserID = useVoiceStore((s) => s.currentUserID);
  const voiceStatusHint = useVoiceStore((s) => s.voiceStatusHint);

  const playerState = useGameStore((s) => s.playerState);
  const isJudge = useGameStore((s) => s.isJudge);
  const roomCode = useGameStore((s) => s.roomCode);
  const playerId = useGameStore((s) => s.playerId);
  const nickname = useGameStore((s) => s.nickname);

  // 本地状态：麦克风设备名称
  const [microphoneDeviceName, setMicrophoneDeviceName] = useState<string | null>(null);
  // 本地状态：夜晚节省时长（模拟数据）
  const [savedDuration, setSavedDuration] = useState(0);

  // 获取麦克风设备名称
  useEffect(() => {
    if (microphonePermission === 'GRANTED' && navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          const audioInput = devices.find((d) => d.kind === 'audioinput' && d.deviceId !== 'default');
          if (audioInput && audioInput.label) {
            setMicrophoneDeviceName(audioInput.label);
          } else {
            // 尝试获取默认设备
            const defaultAudio = devices.find((d) => d.kind === 'audioinput');
            if (defaultAudio && defaultAudio.label) {
              setMicrophoneDeviceName(defaultAudio.label);
            }
          }
        })
        .catch(() => {
          setMicrophoneDeviceName(null);
        });
    }
  }, [microphonePermission]);

  // 计算夜晚节省时长（模拟：根据夜晚阶段累计）
  useEffect(() => {
    // 这里简化处理：如果处于夜晚休息状态，每秒增加节省时长
    if (voiceStatusHint === '夜晚休息' && connectionState === 'CONNECTED') {
      const timer = setInterval(() => {
        setSavedDuration((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [voiceStatusHint, connectionState]);

  // 获取当前玩家角色
  const myPlayer = playerState?.players.find((p) => p.id === playerState?.myPlayerId);
  const myRole = myPlayer?.role;

  // 获取连接状态配置
  const connectionConfig = CONNECTION_STATE_CONFIG[connectionState] || CONNECTION_STATE_CONFIG['DISCONNECTED'];

  // 获取网络质量配置
  const networkConfig = networkQuality ? NETWORK_QUALITY_CONFIG[networkQuality] : null;

  // 获取权限配置
  const permissionConfig = PERMISSION_CONFIG[microphonePermission] || PERMISSION_CONFIG['PROMPT'];

  // 获取计费状态
  const billingStatus = getBillingStatus(
    playerState?.phase,
    isJudge,
    myRole,
    voiceStatusHint
  );

  // 连接时长超过30分钟时显示警告
  const durationWarning = connectionDuration >= 1800;

  // 处理刷新页面
  const handleRefresh = () => {
    window.location.reload();
  };

  // 处理重新连接
  const handleReconnect = async () => {
    // 先退出当前房间，再重新加入
    await useVoiceStore.getState().leaveVoiceRoom();
    if (currentRoomID && currentUserID) {
      await useVoiceStore.getState().joinVoiceRoom(currentRoomID, currentUserID, nickname || 'Unknown');
    }
  };

  // 处理请求权限
  const handleRequestPermission = async () => {
    await requestMicrophonePermission();
  };

  // 处理打开浏览器权限设置
  const handleOpenPermissionSettings = () => {
    // 不同浏览器有不同的权限设置页面
    // Chrome: chrome://settings/content/microphone
    // Firefox: about:preferences#privacy
    // Edge: edge://settings/content/microphone
    // Safari: 系统偏好设置 > 安全性与隐私 > 隐私 > 麦克风
    alert('请在浏览器设置中找到"麦克风"权限并允许访问。\n\nChrome: 设置 > 隐私和安全 > 网站设置 > 麦克风\nFirefox: 选项 > 隐私与安全 > 权限 > 麦克风\nEdge: 设置 > Cookie 和网站权限 > 麦克风');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-night-900 border border-night-700 rounded-xl shadow-2xl overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 bg-night-800 border-b border-night-700">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🎙️</span>
            <span>语音信息</span>
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-night-700 text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* 连接状态区域 */}
          <div className={`p-3 rounded-lg ${connectionConfig.bgColor}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{connectionConfig.icon}</span>
                <div>
                  <div className={`font-medium ${connectionConfig.color}`}>
                    {connectionConfig.label}
                  </div>
                  {connectionState === 'CONNECTED' && connectionDuration > 0 && (
                    <div className={`text-xs ${durationWarning ? 'text-yellow-400' : 'text-gray-400'} mt-1`}>
                      连接时长: {formatDuration(connectionDuration)}
                      {durationWarning && (
                        <span className="ml-2 text-yellow-400">⚠️ 已超过30分钟</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {connectionState === 'CONNECTED' && (
                <div className="text-xs text-green-400 bg-green-900/50 px-2 py-1 rounded">
                  正常
                </div>
              )}
            </div>
          </div>

          {/* 网络质量区域 */}
          <div className={`p-3 rounded-lg ${networkConfig ? networkConfig.bgColor : 'bg-gray-950/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{networkConfig ? networkConfig.icon : '📶'}</span>
              <div className={`font-medium ${networkConfig ? networkConfig.color : 'text-gray-400'}`}>
                网络质量: {networkConfig ? networkConfig.label : '未知'}
              </div>
            </div>
            {networkConfig?.suggestion && (
              <div className="text-xs text-gray-400 pl-7">
                {networkConfig.suggestion}
              </div>
            )}
            {!networkConfig && connectionState === 'CONNECTED' && (
              <div className="text-xs text-gray-400 pl-7">
                网络质量检测中...
              </div>
            )}
          </div>

          {/* 房间信息区域 */}
          <div className="p-3 rounded-lg bg-night-800/50">
            <div className="text-sm font-medium text-gray-300 mb-2">房间信息</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500">语音房间 ID</div>
                <div className="text-sm text-white truncate" title={currentRoomID || roomCode || '未加入'}>
                  {currentRoomID || roomCode || '未加入'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">用户 ID</div>
                <div className="text-sm text-white truncate" title={currentUserID || playerId || '未知'}>
                  {currentUserID || playerId || '未知'}
                  {nickname && (
                    <span className="text-gray-400 ml-1">({nickname})</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 设备信息区域 */}
          <div className="p-3 rounded-lg bg-night-800/50">
            <div className="text-sm font-medium text-gray-300 mb-2">设备信息</div>
            <div className="space-y-2">
              {/* 麦克风权限状态 */}
              <div className={`flex items-center justify-between p-2 rounded ${permissionConfig.bgColor}`}>
                <div className="flex items-center gap-2">
                  <span>{permissionConfig.icon}</span>
                  <div>
                    <div className={`text-sm font-medium ${permissionConfig.color}`}>
                      麦克风权限: {permissionConfig.label}
                    </div>
                    {permissionConfig.action && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {permissionConfig.action}
                      </div>
                    )}
                  </div>
                </div>
                {microphonePermission === 'PROMPT' && (
                  <button
                    onClick={handleRequestPermission}
                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                  >
                    请求权限
                  </button>
                )}
                {microphonePermission === 'DENIED' && (
                  <button
                    onClick={handleOpenPermissionSettings}
                    className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                  >
                    设置指南
                  </button>
                )}
              </div>
              
              {/* 麦克风设备名称 */}
              {microphonePermission === 'GRANTED' && (
                <div className="flex items-center gap-2 p-2 rounded bg-green-950/20">
                  <span>🎤</span>
                  <div>
                    <div className="text-xs text-gray-500">当前麦克风</div>
                    <div className="text-sm text-white truncate" title={microphoneDeviceName || '默认设备'}>
                      {microphoneDeviceName || '默认设备'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 计费提示区域 */}
          <div className={`p-3 rounded-lg ${billingStatus.bgColor}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{billingStatus.icon}</span>
              <div className={`font-medium ${billingStatus.color}`}>
                {billingStatus.status}
              </div>
            </div>
            {billingStatus.tip && savedDuration > 0 && (
              <div className="text-xs text-gray-400 pl-7">
                夜晚策略已为您节省 {formatDuration(savedDuration)} 时长
              </div>
            )}
            {!billingStatus.tip && connectionState === 'CONNECTED' && (
              <div className="text-xs text-gray-400 pl-7">
                当前正在使用语音服务，请合理控制时长
              </div>
            )}
          </div>
        </div>

        {/* 操作按钮区域 */}
        <div className="p-4 bg-night-800/50 border-t border-night-700">
          <div className="flex gap-2">
            {/* 刷新页面按钮 */}
            <button
              onClick={handleRefresh}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>🔄</span>
              <span>刷新页面</span>
            </button>
            
            {/* 重新连接按钮 */}
            {connectionState !== 'CONNECTING' && connectionState !== 'RECONNECTING' && (
              <button
                onClick={handleReconnect}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>🔗</span>
                <span>重新连接</span>
              </button>
            )}
            
            {/* 权限设置按钮 */}
            {microphonePermission !== 'GRANTED' && (
              <button
                onClick={handleOpenPermissionSettings}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>⚙️</span>
                <span>权限设置</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}