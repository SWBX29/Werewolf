/**
 * ============================================================================
 * Zego 实时语音 - 类型定义
 * ============================================================================
 *
 * 架构说明：
 *   本文件定义 Zego 实时语音功能所需的所有类型接口，
 *   包括语音连接状态、麦克风状态、用户信息、房间信息、
 *   事件回调以及与游戏状态联动的类型定义。
 *
 * 核心设计原则：
 *   1. 与现有的 types.ts 文件保持一致的代码风格
 *   2. 类型定义与游戏流程解耦，通过接口进行关联
 *   3. 提供完整的事件回调类型定义
 * ============================================================================
 */

// ============================================================================
// 第一部分：基础状态类型
// ============================================================================

/**
 * 语音连接状态
 */
export type ZegoConnectionState =
  | 'DISCONNECTED'  // 未连接
  | 'CONNECTING'    // 连接中
  | 'CONNECTED'     // 已连接
  | 'RECONNECTING'; // 重连中

/**
 * 麦克风状态
 */
export type ZegoMicrophoneState =
  | 'MUTED'    // 静音
  | 'UNMUTED'; // 未静音

/**
 * 扬声器状态
 */
export type ZegoSpeakerState =
  | 'MUTED'    // 静音
  | 'UNMUTED'; // 未静音

/**
 * 语音权限状态
 */
export type ZegoPermissionState =
  | 'GRANTED'  // 已授权
  | 'DENIED'   // 已拒绝
  | 'PROMPT';  // 待请求

// ============================================================================
// 第二部分：Zego 用户和房间信息类型
// ============================================================================

/**
 * Zego 用户信息
 */
export interface ZegoUser {
  /** 用户 ID（与游戏玩家 ID 一致） */
  userID: string;
  /** 用户昵称（与游戏玩家昵称一致） */
  userName: string;
  /** 是否是房主 */
  isHost?: boolean;
  /** 是否是法官 */
  isJudge?: boolean;
}

/**
 * Zego 房间信息
 */
export interface ZegoRoom {
  /** 房间 ID（与游戏房间码一致） */
  roomID: string;
  /** 房间名称 */
  roomName: string;
  /** 房间创建时间戳 */
  createTime?: number;
  /** 房间内用户列表 */
  users?: ZegoUser[];
}

/**
 * Zego 流信息
 */
export interface ZegoStream {
  /** 流 ID */
  streamID: string;
  /** 发布者用户 ID */
  userID: string;
  /** 流类型 */
  streamType: 'main' | 'aux' | 'screen';
  /** 视频状态 */
  videoState: 'NO_VIDEO' | 'PLAYING' | 'PAUSED' | 'LOADING';
  /** 音频状态 */
  audioState: 'NO_AUDIO' | 'PLAYING' | 'PAUSED' | 'MUTED';
  /** 额外数据 */
  extraInfo?: string;
}

/**
 * Zego Token 信息
 */
export interface ZegoTokenInfo {
  /** Token 字符串 */
  token: string;
  /** Token 过期时间戳（毫秒） */
  expireTime: number;
  /** App ID */
  appID: number;
}

// ============================================================================
// 第三部分：语音事件回调类型
// ============================================================================

/**
 * 房间状态变化事件
 */
export interface ZegoRoomStateEvent {
  /** 房间 ID */
  roomID: string;
  /** 状态变化原因（ZegoRoomStateChangedReason 枚举值） */
  reason: string;
  /** 错误码 */
  errorCode: number;
  /** 扩展信息 */
  extendedData: string;
}

/**
 * 推流状态变化事件
 */
export interface ZegoPublishStateEvent {
  /** 流 ID */
  streamID: string;
  /** 推流状态：PUBLISHING=正在推流, PUBLISH_FAILED=推流失败, NO_PUBLISH=未推流 */
  state: string;
  /** 错误码 */
  errorCode: number;
  /** 扩展信息 */
  extendedData: string;
}

/**
 * 拉流状态变化事件
 */
export interface ZegoPlayStateEvent {
  /** 流 ID */
  streamID: string;
  /** 拉流状态：PLAYING=正在拉流, PLAY_FAILED=拉流失败, NO_PLAY=未拉流 */
  state: string;
  /** 错误码 */
  errorCode: number;
  /** 扩展信息 */
  extendedData: string;
}

/**
 * 用户进入房间事件
 */
export interface ZegoUserJoinEvent {
  /** 房间 ID */
  roomID: string;
  /** 进入房间的用户列表 */
  userList: ZegoUser[];
}

/**
 * 用户离开房间事件
 */
export interface ZegoUserLeaveEvent {
  /** 房间 ID */
  roomID: string;
  /** 离开房间的用户列表 */
  userList: ZegoUser[];
}

/**
 * 流更新事件
 */
export interface ZegoStreamUpdateEvent {
  /** 房间 ID */
  roomID: string;
  /** 更新类型 */
  updateType: 'ADD' | 'DELETE';
  /** 流列表 */
  streamList: ZegoStream[];
}

/**
 * 流质量更新事件
 */
export interface ZegoStreamQualityEvent {
  /** 流 ID */
  streamID: string;
  /** 用户 ID */
  userID: string;
  /** 视频质量 */
  videoQuality: 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Die';
  /** 音频质量 */
  audioQuality: 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Die';
}

/**
 * 麦克风状态变化事件
 */
export interface ZegoMicrophoneStateEvent {
  /** 用户 ID */
  userID: string;
  /** 是否开启麦克风 */
  isMuted: boolean;
}

/**
 * 音量变化事件
 */
export interface ZegoSoundLevelInfo {
  /** 用户 ID */
  userID: string;
  /** 流 ID */
  streamID: string;
  /** 音量值（0-100） */
  soundLevel: number;
  /** 是否正在说话 */
  isSpeaking: boolean;
}

export interface ZegoSoundLevelUpdateEvent {
  /** 音量信息列表 */
  soundLevelList: ZegoSoundLevelInfo[];
}

/**
 * 网络质量事件
 */
export interface ZegoNetworkQualityEvent {
  /** 用户 ID */
  userID: string;
  /** 上行网络质量 */
  upQuality: 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Die';
  /** 下行网络质量 */
  downQuality: 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Die';
  /** 网络延迟（毫秒） */
  delay?: number;
  /** 丢包率（0-1） */
  packetLostRate?: number;
}

/**
 * 错误事件
 */
export interface ZegoErrorEvent {
  /** 错误码 */
  errorCode: number;
  /** 错误消息 */
  errorMessage: string;
  /** 扩展信息 */
  extendedData?: string;
}

/**
 * 事件回调接口集合
 */
export interface ZegoEventCallbacks {
  /** 房间状态变化 */
  onRoomStateChanged?: (event: ZegoRoomStateEvent) => void;
  /** 用户进入房间 */
  onUserJoin?: (event: ZegoUserJoinEvent) => void;
  /** 用户离开房间 */
  onUserLeave?: (event: ZegoUserLeaveEvent) => void;
  /** 流更新 */
  onStreamUpdate?: (event: ZegoStreamUpdateEvent) => void;
  /** 流质量更新 */
  onStreamQualityUpdate?: (event: ZegoStreamQualityEvent) => void;
  /** 推流状态变化 */
  onPublisherStateUpdate?: (event: ZegoPublishStateEvent) => void;
  /** 拉流状态变化 */
  onPlayerStateUpdate?: (event: ZegoPlayStateEvent) => void;
  /** 推流质量更新 */
  onPublishQualityUpdate?: (event: ZegoStreamQualityEvent) => void;
  /** 拉流质量更新 */
  onPlayQualityUpdate?: (event: ZegoStreamQualityEvent) => void;
  /** 麦克风状态变化 */
  onMicrophoneStateChanged?: (event: ZegoMicrophoneStateEvent) => void;
  /** 音量变化 */
  onSoundLevelUpdate?: (event: ZegoSoundLevelUpdateEvent) => void;
  /** 网络质量变化 */
  onNetworkQuality?: (event: ZegoNetworkQualityEvent) => void;
  /** 错误发生 */
  onError?: (event: ZegoErrorEvent) => void;
}

// ============================================================================
// 第四部分：与游戏状态联动的类型定义
// ============================================================================

/**
 * 语音房间类型
 */
export type VoiceRoomType =
  | 'MAIN'       // 主房间（白天全局语音）
  | 'WOLF'       // 狼人房间（夜晚狼人专属）
  | 'DEAD';      // 死亡玩家房间

/**
 * 语音阶段控制配置
 */
export interface VoicePhaseControl {
  /** 游戏阶段 */
  gamePhase: string;
  /** 语音房间类型 */
  voiceRoomType: VoiceRoomType;
  /** 是否允许发言 */
  canSpeak: boolean;
  /** 允许发言的用户列表（null 表示所有人） */
  allowedSpeakers: string[] | null;
  /** 禁止发言的用户列表 */
  forbiddenSpeakers: string[];
  /** 强制静音的用户列表 */
  mutedUsers: string[];
}

/**
 * 玩家语音状态
 */
export interface PlayerVoiceState {
  /** 玩家 ID */
  playerId: string;
  /** 座位号 */
  seatNumber: number;
  /** 麦克风状态 */
  microphoneState: ZegoMicrophoneState;
  /** 扬声器状态 */
  speakerState: ZegoSpeakerState;
  /** 是否正在发言 */
  isSpeaking: boolean;
  /** 音量值（0-100） */
  soundLevel: number;
  /** 网络质量 */
  networkQuality: 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Die';
  /** 是否被法官静音 */
  isMutedByJudge: boolean;
  /** 是否被阶段控制静音 */
  isMutedByPhase: boolean;
}

/**
 * 游戏语音状态
 */
export interface GameVoiceState {
  /** 语音连接状态 */
  connectionState: ZegoConnectionState;
  /** 麦克风权限状态 */
  microphonePermission: ZegoPermissionState;
  /** 当前语音房间类型 */
  currentVoiceRoomType: VoiceRoomType;
  /** 当前发言者用户 ID（null 表示无人发言或自由发言） */
  currentSpeakerId: string | null;
  /** 当前是否可以发言 */
  canSpeak: boolean;
  /** 所有玩家的语音状态 */
  playerVoiceStates: PlayerVoiceState[];
  /** 是否启用语音功能 */
  voiceEnabled: boolean;
}

/**
 * 语音控制操作类型
 */
export type VoiceControlActionType =
  | 'MUTE_PLAYER'        // 静音玩家
  | 'UNMUTE_PLAYER'      // 取消静音玩家
  | 'MUTE_ALL'           // 全局静音
  | 'UNMUTE_ALL'         // 取消全局静音
  | 'SET_SPEAKER'        // 设置发言者
  | 'CLEAR_SPEAKER'      // 清除发言者
  | 'SWITCH_VOICE_ROOM'; // 切换语音房间

/**
 * 语音控制操作
 */
export interface VoiceControlAction {
  /** 操作类型 */
  type: VoiceControlActionType;
  /** 操作人（通常是法官） */
  operatorId: string;
  /** 目标玩家 ID（某些操作需要） */
  targetPlayerId?: string;
  /** 目标语音房间类型（切换房间操作需要） */
  targetVoiceRoomType?: VoiceRoomType;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 语音配置
 */
export interface VoiceConfig {
  /** Zego App ID */
  appID: number;
  /** 是否启用语音功能 */
  enabled: boolean;
  /** 自动加入语音房间 */
  autoJoin: boolean;
  /** 自动开启麦克风 */
  autoEnableMicrophone: boolean;
  /** 音量调节范围最小值 */
  minVolume: number;
  /** 音量调节范围最大值 */
  maxVolume: number;
  /** 默认音量 */
  defaultVolume: number;
  /** 是否启用音量显示 */
  showSoundLevel: boolean;
  /** 说话检测阈值 */
  speakingThreshold: number;
  /** 重连超时时间（毫秒） */
  reconnectTimeout: number;
  /** 最大重连次数 */
  maxReconnectAttempts: number;
}
