/**
 * ============================================================================
 * 语音状态管理 — Zustand Store
 * ============================================================================
 *
 * 架构说明：
 *   本文件管理 Zego 实时语音的所有 UI 相关状态，包括：
 *   1. 连接状态
 *   2. 麦克风/扬声器静音状态
 *   3. 语音权限状态
 *   4. 正在说话的用户映射
 *   5. 语音错误信息
 *   6. 语音房间生命周期管理（初始化、加入、退出、销毁）
 *
 * 设计原则：
 *   - 仅管理 UI 层状态，通过 ZegoVoiceService 操作 SDK
 *   - 与 ZegoVoiceService 通过事件回调同步状态
 *   - 与游戏阶段联动控制发言权限
 * ============================================================================
 */

import { create } from 'zustand';
import type {
  ZegoConnectionState,
  ZegoPermissionState,
  ZegoEventCallbacks,
  ZegoNetworkQualityEvent,
} from '@langrensha/shared/types/zego';
import {
  ZegoVoiceService,
  getZegoVoiceService,
} from '../services/zego';

// ============================================================================
// Store 状态接口
// ============================================================================

interface VoiceState {
  // ---- 连接状态 ----
  /** 语音连接状态 */
  connectionState: ZegoConnectionState;
  /** 是否启用语音功能 */
  voiceEnabled: boolean;

  // ---- 设备状态 ----
  /** 麦克风是否静音 */
  isMicrophoneMuted: boolean;
  /** 扬声器是否静音 */
  isSpeakerMuted: boolean;
  /** 麦克风权限状态 */
  microphonePermission: ZegoPermissionState;

  // ---- 说话状态 ----
  /** 正在说话的用户映射（userID -> soundLevel） */
  speakingUsers: Record<string, number>;

  // ---- 错误信息 ----
  /** 语音错误信息 */
  voiceError: string | null;

  // ---- 发言权限 ----
  /** 当前是否可以发言（受游戏阶段控制） */
  canSpeak: boolean;

  // ---- 房间信息 ----
  /** 当前语音房间 ID */
  currentRoomID: string | null;
  /** 当前用户 ID */
  currentUserID: string | null;

  // ---- 夜晚阶段语音状态 ----
  /** 是否处于夜晚语音管理模式 */
  nightVoiceMode: boolean;
  /** 语音状态提示（"夜晚休息"、"狼人密谋"、"法官指导"、"天亮了"） */
  voiceStatusHint: string | null;

  // ---- 连接监控 ----
  /** 连接开始时间（时间戳，毫秒） */
  connectionStartTime: number | null;
  /** 当前连接时长（秒） */
  connectionDuration: number;
  /** 网络质量 */
  networkQuality: ZegoNetworkQualityEvent['upQuality'] | null;

  // ---- Actions ----
  setConnectionState: (state: ZegoConnectionState) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setMicrophoneMuted: (muted: boolean) => void;
  setSpeakerMuted: (muted: boolean) => void;
  setMicrophonePermission: (permission: ZegoPermissionState) => void;
  setSpeakingUsers: (users: Record<string, number>) => void;
  updateSpeakingUser: (userID: string, soundLevel: number) => void;
  removeSpeakingUser: (userID: string) => void;
  setVoiceError: (error: string | null) => void;
  setCanSpeak: (canSpeak: boolean) => void;
  toggleMicrophone: () => void;
  toggleSpeaker: () => void;
  dismissVoiceError: () => void;
  resetVoiceState: () => void;
  setNightVoiceMode: (mode: boolean) => void;
  setVoiceStatusHint: (hint: string | null) => void;
  setConnectionStartTime: (startTime: number | null) => void;
  setConnectionDuration: (duration: number) => void;
  setNetworkQuality: (quality: ZegoNetworkQualityEvent['upQuality'] | null) => void;
  updateConnectionDuration: () => void;

  // ---- 语音房间生命周期 ----
  /** 初始化 Zego 引擎并注册事件回调 */
  initVoice: (appID: number) => void;
  /** 加入语音房间 */
  joinVoiceRoom: (roomID: string, userID: string, userName: string) => Promise<void>;
  /** 退出语音房间 */
  leaveVoiceRoom: () => Promise<void>;
  /** 强制退出语音房间（用于异常情况，直接清理所有资源） */
  forceLeaveVoiceRoom: () => Promise<void>;
  /** 销毁 Zego 引擎 */
  destroyVoice: () => Promise<void>;
}

// ============================================================================
// 初始状态
// ============================================================================

const initialState = {
  connectionState: 'DISCONNECTED' as ZegoConnectionState,
  voiceEnabled: false,
  isMicrophoneMuted: true,
  isSpeakerMuted: false,
  microphonePermission: 'PROMPT' as ZegoPermissionState,
  speakingUsers: {} as Record<string, number>,
  voiceError: null as string | null,
  canSpeak: true,
  currentRoomID: null as string | null,
  currentUserID: null as string | null,
  nightVoiceMode: false,
  voiceStatusHint: null as string | null,
  connectionStartTime: null as number | null,
  connectionDuration: 0,
  networkQuality: null as ZegoNetworkQualityEvent['upQuality'] | null,
};

// ==========================================================================
// 创建 Zego 事件回调（与 store 联动）
// ==========================================================================

// 并发控制：Promise 队列确保语音操作串行执行
let voiceOperationQueue: Promise<void> = Promise.resolve();
let isProcessingVoiceOperation = false;

/**
 * 获取时间戳日志前缀
 */
function getTimestamp(): string {
  return new Date().toISOString().substring(11, 23);
}

function createZegoEventCallbacks(): ZegoEventCallbacks {
  return {
    onRoomStateChanged: (event) => {
      const store = useVoiceStore.getState();
      const errorCode = event.errorCode;

      if (errorCode === 0) {
        store.setConnectionState('CONNECTED');
        store.setVoiceError(null);
      } else if (errorCode === 1000001) {
        store.setConnectionState('RECONNECTING');
        store.setVoiceError('语音重连中...');
      } else {
        store.setConnectionState('DISCONNECTED');
        if (errorCode !== 0) {
          store.setVoiceError(`语音连接断开 (错误码: ${errorCode})`);
        }
      }
    },
    onUserJoin: (event) => {
      console.log('[VoiceStore] 语音用户加入:', event.userList.map((u) => u.userID).join(', '));
    },
    onUserLeave: (event) => {
      const store = useVoiceStore.getState();
      for (const user of event.userList) {
        store.removeSpeakingUser(user.userID);
      }
      console.log('[VoiceStore] 语音用户离开:', event.userList.map((u) => u.userID).join(', '));
    },
    onStreamUpdate: () => {},
    onSoundLevelUpdate: (event) => {
      const store = useVoiceStore.getState();
      const newSpeakingUsers: Record<string, number> = {};
      for (const info of event.soundLevelList) {
        if (info.isSpeaking) {
          newSpeakingUsers[info.userID] = info.soundLevel;
        }
      }
      store.setSpeakingUsers(newSpeakingUsers);
    },
    onNetworkQuality: (event) => {
      const store = useVoiceStore.getState();
      const timestamp = getTimestamp();
      console.log(`[${timestamp}][VoiceStore] 网络质量更新: userID=${event.userID}, 上行=${event.upQuality}, 下行=${event.downQuality}`);
      store.setNetworkQuality(event.upQuality);
      
      // 网络质量差时设置错误提示
      if (event.upQuality === 'Poor' || event.upQuality === 'Die') {
        store.setVoiceError('网络质量较差，语音可能不稳定');
      } else if (event.upQuality === 'Medium') {
        store.setVoiceError('网络质量一般，可能出现延迟');
      } else {
        // 网络质量恢复时清除错误提示
        if (store.voiceError?.includes('网络质量')) {
          store.setVoiceError(null);
        }
      }
    },
    onError: (event) => {
      const store = useVoiceStore.getState();
      const errorCode = event.errorCode;
      let errorMessage = event.errorMessage;

      if (errorCode === 1000001) {
        errorMessage = '语音连接超时，请检查网络';
      } else if (errorCode === 1000002) {
        errorMessage = '语音认证失败，请重新加入房间';
      } else if (errorCode === 1000003) {
        errorMessage = '语音房间创建失败';
      }

      store.setVoiceError(`语音错误: ${errorMessage}`);
    },
    onMicrophoneStateChanged: () => {},
  };
}

// ============================================================================
// Zustand Store 创建
// ============================================================================

export const useVoiceStore = create<VoiceState>((set, get) => ({
  ...initialState,

  setConnectionState: (connectionState) => set({ connectionState }),

  setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),

  setMicrophoneMuted: (isMicrophoneMuted) => set({ isMicrophoneMuted }),

  setSpeakerMuted: (isSpeakerMuted) => set({ isSpeakerMuted }),

  setMicrophonePermission: (microphonePermission) => set({ microphonePermission }),

  setSpeakingUsers: (speakingUsers) => set({ speakingUsers }),

  updateSpeakingUser: (userID, soundLevel) =>
    set({ speakingUsers: { ...get().speakingUsers, [userID]: soundLevel } }),

  removeSpeakingUser: (userID) => {
    const { [userID]: _, ...rest } = get().speakingUsers;
    set({ speakingUsers: rest });
  },

  setVoiceError: (voiceError) => set({ voiceError }),

  setCanSpeak: (canSpeak) => set({ canSpeak }),

  toggleMicrophone: () => set({ isMicrophoneMuted: !get().isMicrophoneMuted }),

  toggleSpeaker: () => set({ isSpeakerMuted: !get().isSpeakerMuted }),

  dismissVoiceError: () => set({ voiceError: null }),

  resetVoiceState: () => set(initialState),

  setNightVoiceMode: (nightVoiceMode) => set({ nightVoiceMode }),

  setVoiceStatusHint: (voiceStatusHint) => set({ voiceStatusHint }),

  setConnectionStartTime: (connectionStartTime) => set({ connectionStartTime }),

  setConnectionDuration: (connectionDuration) => set({ connectionDuration }),

  setNetworkQuality: (networkQuality) => set({ networkQuality }),

  updateConnectionDuration: () => {
    const { connectionStartTime } = get();
    if (connectionStartTime) {
      const duration = Math.floor((Date.now() - connectionStartTime) / 1000);
      set({ connectionDuration: duration });
    }
  },

  // ---- 语音房间生命周期 ----

  initVoice: async (appID: number) => {
    try {
      const service = getZegoVoiceService();
      await service.init(appID);
      service.on(createZegoEventCallbacks());
      set({ voiceEnabled: true });
      console.log('[VoiceStore] Zego 语音引擎初始化成功');
    } catch (error) {
      console.error('[VoiceStore] Zego 语音引擎初始化失败:', error);
      set({ voiceEnabled: false, voiceError: '语音服务初始化失败' });
    }
  },

  joinVoiceRoom: async (roomID: string, userID: string, userName: string) => {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}][VoiceStore] joinVoiceRoom 请求: roomID=${roomID}, userID=${userID}`);

    // 使用 Promise 队列确保操作串行执行
    return new Promise<void>((resolve) => {
      voiceOperationQueue = voiceOperationQueue.then(async () => {
        if (isProcessingVoiceOperation) {
          console.log(`[${getTimestamp()}][VoiceStore] 正在处理其他语音操作，等待完成`);
        }

        isProcessingVoiceOperation = true;
        const state = get();

        try {
          // 检查是否已在目标房间
          if (state.connectionState === 'CONNECTED' || state.connectionState === 'CONNECTING') {
            if (state.currentRoomID === roomID && state.currentUserID === userID) {
              console.log(`[${getTimestamp()}][VoiceStore] 已在目标语音房间中，跳过加入`);
              return;
            }
            // 先退出当前房间
            console.log(`[${getTimestamp()}][VoiceStore] 需要先退出当前房间: ${state.currentRoomID}`);
            const leaveService = getZegoVoiceService();
            try {
              await leaveService.logoutRoom();
            } catch (e) {
              console.warn(`[${getTimestamp()}][VoiceStore] 离开旧房间失败:`, e);
            }
            set({
              connectionState: 'DISCONNECTED',
              currentRoomID: null,
              currentUserID: null,
              speakingUsers: {},
              isMicrophoneMuted: true,
              isSpeakerMuted: false,
              connectionStartTime: null,
              connectionDuration: 0,
              networkQuality: null,
            });
          }

          set({ connectionState: 'CONNECTING', voiceError: null });
          console.log(`[${getTimestamp()}][VoiceStore] 开始登录语音房间: ${roomID}`);

          const service = getZegoVoiceService();
          const success = await service.loginRoom(roomID, userID, userName);

          if (success) {
            set({
              connectionState: 'CONNECTED',
              currentRoomID: roomID,
              currentUserID: userID,
              isMicrophoneMuted: true,
              connectionStartTime: Date.now(),
              connectionDuration: 0,
              networkQuality: null,
            });
            console.log(`[${getTimestamp()}][VoiceStore] 加入语音房间成功: roomID=${roomID}, userID=${userID}`);
          } else {
            set({
              connectionState: 'DISCONNECTED',
              currentRoomID: null,
              currentUserID: null,
              voiceError: '加入语音房间失败',
            });
            console.error(`[${getTimestamp()}][VoiceStore] 加入语音房间失败: roomID=${roomID}`);
          }
        } catch (error) {
          set({
            connectionState: 'DISCONNECTED',
            currentRoomID: null,
            currentUserID: null,
            voiceError: error instanceof Error ? error.message : '加入语音房间异常',
          });
          console.error(`[${getTimestamp()}][VoiceStore] 加入语音房间异常:`, error);
        } finally {
          isProcessingVoiceOperation = false;
          resolve();
        }
      });
    });
  },

  leaveVoiceRoom: async () => {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}][VoiceStore] leaveVoiceRoom 请求`);

    // 使用 Promise 队列确保操作串行执行
    return new Promise<void>((resolve) => {
      voiceOperationQueue = voiceOperationQueue.then(async () => {
        if (isProcessingVoiceOperation) {
          console.log(`[${getTimestamp()}][VoiceStore] 正在处理其他语音操作，等待完成`);
        }

        isProcessingVoiceOperation = true;
        const state = get();

        try {
          if (!state.currentRoomID && state.connectionState === 'DISCONNECTED') {
            console.log(`[${getTimestamp()}][VoiceStore] 未在语音房间中，跳过退出`);
            return;
          }

          console.log(`[${getTimestamp()}][VoiceStore] 开始退出语音房间: ${state.currentRoomID ?? 'unknown'}`);
          const service = getZegoVoiceService();
          await service.logoutRoom();
          console.log(`[${getTimestamp()}][VoiceStore] 退出语音房间成功: ${state.currentRoomID ?? 'unknown'}`);
        } catch (error) {
          console.error(`[${getTimestamp()}][VoiceStore] 退出语音房间异常:`, error);
        } finally {
          set({
            connectionState: 'DISCONNECTED',
            currentRoomID: null,
            currentUserID: null,
            speakingUsers: {},
            isMicrophoneMuted: true,
            isSpeakerMuted: false,
            connectionStartTime: null,
            connectionDuration: 0,
            networkQuality: null,
          });
          isProcessingVoiceOperation = false;
          resolve();
        }
      });
    });
  },

  forceLeaveVoiceRoom: async () => {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}][VoiceStore] forceLeaveVoiceRoom 请求`);

    // 不使用 Promise 队列，直接强制清理
    try {
      const service = getZegoVoiceService();
      await service.forceCleanup();
      console.log(`[${timestamp}][VoiceStore] 强制退出语音房间成功`);
    } catch (error) {
      console.error(`[${timestamp}][VoiceStore] 强制退出语音房间异常:`, error);
    } finally {
      // 重置所有状态
      set({
        connectionState: 'DISCONNECTED',
        currentRoomID: null,
        currentUserID: null,
        speakingUsers: {},
        isMicrophoneMuted: true,
        isSpeakerMuted: false,
        nightVoiceMode: false,
        voiceStatusHint: null,
        voiceError: null,
        connectionStartTime: null,
        connectionDuration: 0,
        networkQuality: null,
      });
    }
  },

  destroyVoice: async () => {
    try {
      await get().leaveVoiceRoom();
      ZegoVoiceService.destroyInstance();
      set({ ...initialState, voiceEnabled: false });
      console.log('[VoiceStore] Zego 语音引擎已销毁');
    } catch (error) {
      console.error('[VoiceStore] 销毁语音引擎异常:', error);
    }
  },
}));