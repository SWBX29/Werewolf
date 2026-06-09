/**
 * ============================================================================
 * Zego 实时语音服务封装
 * ============================================================================
 *
 * 架构说明：
 *   本文件封装 ZegoExpressEngine Web SDK，为狼人杀游戏提供纯音频实时语音能力。
 *   采用单例模式，确保全局只有一个 ZegoVoiceService 实例。
 *
 * 核心功能：
 *   1. 引擎初始化与销毁
 *   2. 登录/退出语音房间
 *   3. 麦克风/扬声器控制
 *   4. 自动拉流管理
 *   5. 事件回调转发
 *
 * 注意事项：
 *   - ZegoExpressEngine 实例不能被 React/Vue 等框架以响应式方式处理
 *   - 纯音频场景，camera.video 必须设为 false
 *   - Token 从后端 /api/zego/token 接口获取
 * ============================================================================
 */

// Zego SDK 使用动态导入，避免首屏加载过大的 WebRTC 库
import type { ZegoExpressEngine as ZegoExpressEngineType } from 'zego-express-engine-webrtc';
import type {
  ZegoEventCallbacks,
  ZegoConnectionState,
  ZegoSoundLevelInfo,
  ZegoSoundLevelUpdateEvent,
  ZegoRoomStateEvent,
  ZegoUserJoinEvent,
  ZegoUserLeaveEvent,
  ZegoStreamUpdateEvent,
  ZegoNetworkQualityEvent,
  ZegoErrorEvent,
  ZegoMicrophoneStateEvent,
} from '@langrensha/shared/types/zego';

// ============================================================================
// 常量定义
// ============================================================================

/**
 * Zego 服务器地址
 * 使用 ZEGO 提供的 AccessHub 服务器
 */
const ZEGO_SERVER = 'wss://accesshub-wss.zego.im/accesshub';

/** 说话检测阈值（音量超过此值视为正在说话） */
const SPEAKING_THRESHOLD = 10;

/** 音浪回调间隔（毫秒） */
const SOUND_LEVEL_INTERVAL = 1000;

/** 后端 Token 接口基础路径 */
const API_BASE = '/api/zego';

// ============================================================================
// ZegoVoiceService 单例类
// ============================================================================

export class ZegoVoiceService {
  // ---- 单例 ----
  private static _instance: ZegoVoiceService | null = null;

  // ---- Zego 引擎 ----
  private _zg: ZegoExpressEngineType | null = null;
  private _zgPromise: Promise<typeof import('zego-express-engine-webrtc')> | null = null;
  private _appID: number = 0;

  // ---- 房间状态 ----
  private _currentRoomID: string | null = null;
  private _currentUserID: string | null = null;
  private _currentUserNick: string | null = null;
  private _connectionState: ZegoConnectionState = 'DISCONNECTED';
  private _isLoggingIn: boolean = false; // 防止并发登录
  private _isLoggingOut: boolean = false; // 防止并发退出

  // ---- 流管理 ----
  private _localStream: any | null = null;
  private _publishStreamID: string | null = null;
  private _remoteStreams: Map<string, MediaStream> = new Map();

  // ---- 设备状态 ----
  private _isMicrophoneMuted: boolean = false;
  private _isSpeakerMuted: boolean = false;

  // ---- 事件回调 ----
  private _callbacks: ZegoEventCallbacks = {};

  // ---- 音浪映射（streamID -> userID） ----
  private _streamUserMap: Map<string, string> = new Map();

  // ============================================================================
  // 构造函数（私有，单例模式）
  // ============================================================================

  private constructor() {}

  /** 获取单例实例 */
  static getInstance(): ZegoVoiceService {
    if (!ZegoVoiceService._instance) {
      ZegoVoiceService._instance = new ZegoVoiceService();
    }
    return ZegoVoiceService._instance;
  }

  /** 销毁单例实例 */
  static destroyInstance(): void {
    if (ZegoVoiceService._instance) {
      ZegoVoiceService._instance.destroy();
      ZegoVoiceService._instance = null;
    }
  }

  // ============================================================================
  // 公共属性
  // ============================================================================

  /** 当前连接状态 */
  get connectionState(): ZegoConnectionState {
    return this._connectionState;
  }

  /** 当前房间 ID */
  get currentRoomID(): string | null {
    return this._currentRoomID;
  }

  /** 麦克风是否静音 */
  get isMicrophoneMuted(): boolean {
    return this._isMicrophoneMuted;
  }

  /** 扬声器是否静音 */
  get isSpeakerMuted(): boolean {
    return this._isSpeakerMuted;
  }

  /** 当前远程流列表 */
  get remoteStreams(): ReadonlyMap<string, MediaStream> {
    return this._remoteStreams;
  }

  // ============================================================================
  // 初始化引擎
  // ============================================================================

  /**
   * 初始化 Zego 引擎（异步加载 SDK）
   * @param appID 从即构控制台获取的 AppID
   */
  async init(appID: number): Promise<void> {
    if (this._zg) {
      console.warn('[ZegoVoice] 引擎已初始化，跳过重复初始化');
      return;
    }

    this._appID = appID;

    // 动态加载 Zego SDK（约 2MB），仅在需要语音时下载
    if (!this._zgPromise) {
      this._zgPromise = import('zego-express-engine-webrtc');
    }
    const { ZegoExpressEngine } = await this._zgPromise;

    this._zg = new ZegoExpressEngine(appID, ZEGO_SERVER);
    this._zg.setDebugVerbose(false);

    this._registerEventHandlers();

    console.log(`[ZegoVoice] 引擎初始化成功，appID: ${appID}`);
  }

  // ============================================================================
  // 登录语音房间
  // ============================================================================

  /**
   * 登录语音房间
   * @param roomID 房间 ID（与游戏房间码一致）
   * @param userID 用户 ID
   * @param userName 用户昵称
   * @returns 是否登录成功
   */
  async loginRoom(roomID: string, userID: string, userName: string): Promise<boolean> {
    const timestamp = new Date().toISOString().substring(11, 23);
    console.log(`[${timestamp}][ZegoVoice] loginRoom 开始: roomID=${roomID}, userID=${userID}`);

    // 1. 检查引擎是否已初始化
    if (!this._zg) {
      console.error(`[${timestamp}][ZegoVoice] 引擎未初始化，请先调用 init()`);
      return false;
    }

    // 2. 检查是否正在登录/退出（防止并发操作）
    if (this._isLoggingIn) {
      console.warn(`[${timestamp}][ZegoVoice] 正在登录中，跳过重复登录请求`);
      return false;
    }
    if (this._isLoggingOut) {
      console.warn(`[${timestamp}][ZegoVoice] 正在退出中，请等待退出完成后再登录`);
      return false;
    }

    // 3. 检查连接状态
    if (this._connectionState === 'CONNECTING' || this._connectionState === 'RECONNECTING') {
      console.warn(`[${timestamp}][ZegoVoice] 当前连接状态为 ${this._connectionState}，跳过重复登录`);
      return false;
    }

    // 4. 检查是否已在同一房间
    if (this._currentRoomID === roomID && this._connectionState === 'CONNECTED') {
      console.log(`[${timestamp}][ZegoVoice] 已在目标房间 ${roomID} 中，跳过登录`);
      return true;
    }

    // 5. 如果在其他房间，先退出
    if (this._currentRoomID && this._currentRoomID !== roomID) {
      console.log(`[${timestamp}][ZegoVoice] 需要先退出当前房间 ${this._currentRoomID}`);
      await this.logoutRoom();
    }

    this._isLoggingIn = true;

    try {
      this._connectionState = 'CONNECTING';

      // 1. 从后端获取 Token
      const token = await this._fetchToken(userID, roomID);

      // 2. 登录房间
      const loginResult = await this._zg.loginRoom(
        roomID,
        token,
        { userID, userName },
        { userUpdate: true }
      );

      if (!loginResult) {
        console.error(`[${timestamp}][ZegoVoice] 登录房间失败: roomID=${roomID}`);
        this._connectionState = 'DISCONNECTED';
        return false;
      }

      // 3. 记录当前房间信息
      this._currentRoomID = roomID;
      this._currentUserID = userID;
      this._currentUserNick = userName;

      // 4. 创建纯音频流
      const zegoLocalStream = await this._zg.createZegoStream({
        camera: { audio: true, video: false },
      });
      if (!zegoLocalStream) {
        throw new Error('创建本地音频流失败');
      }
      this._localStream = zegoLocalStream;

      // 5. 开始推流
      const streamID = this._buildStreamID(roomID, userID);
      this._publishStreamID = streamID;
      this._streamUserMap.set(streamID, userID);

      const publishResult = this._zg.startPublishingStream(streamID, this._localStream);
      if (!publishResult) {
        throw new Error('推流请求发送失败');
      }

      // 6. 开启音浪回调
      this._zg.setSoundLevelDelegate(true, SOUND_LEVEL_INTERVAL);

      this._connectionState = 'CONNECTED';
      console.log(`[${timestamp}][ZegoVoice] 登录房间成功: roomID=${roomID}, userID=${userID}`);
      return true;
    } catch (error) {
      console.error(`[${timestamp}][ZegoVoice] 登录房间异常:`, error);
      this._connectionState = 'DISCONNECTED';
      // 强制清理已创建的资源
      await this._forceCleanup();
      this._notifyError(error);
      return false;
    } finally {
      this._isLoggingIn = false;
    }
  }

  // ============================================================================
  // 退出语音房间
  // ============================================================================

  /**
   * 退出语音房间
   */
  async logoutRoom(): Promise<void> {
    const timestamp = new Date().toISOString().substring(11, 23);
    console.log(`[${timestamp}][ZegoVoice] logoutRoom 开始: currentRoomID=${this._currentRoomID ?? 'null'}`);

    // 1. 检查是否正在登录（防止退出时登录正在进行）
    if (this._isLoggingIn) {
      console.warn(`[${timestamp}][ZegoVoice] 正在登录中，请等待登录完成后再退出`);
      return;
    }

    // 2. 检查是否正在退出（防止并发退出）
    if (this._isLoggingOut) {
      console.warn(`[${timestamp}][ZegoVoice] 正在退出中，跳过重复退出请求`);
      return;
    }

    // 3. 检查是否需要退出
    if (!this._zg || !this._currentRoomID) {
      console.log(`[${timestamp}][ZegoVoice] 未在房间中，跳过退出`);
      return;
    }

    this._isLoggingOut = true;
    const roomIDToLeave = this._currentRoomID;

    try {
      // 1. 停止推流
      if (this._publishStreamID) {
        try {
          this._zg.stopPublishingStream(this._publishStreamID);
          console.log(`[${timestamp}][ZegoVoice] 停止推流成功: ${this._publishStreamID}`);
        } catch (error) {
          console.warn(`[${timestamp}][ZegoVoice] 停止推流失败:`, error);
        }
        this._publishStreamID = null;
      }

      // 2. 销毁本地流
      if (this._localStream) {
        try {
          this._zg.destroyStream(this._localStream);
          console.log(`[${timestamp}][ZegoVoice] 销毁本地流成功`);
        } catch (error) {
          console.warn(`[${timestamp}][ZegoVoice] 销毁本地流失败:`, error);
        }
        this._localStream = null;
      }

      // 3. 停止所有拉流
      for (const streamID of this._remoteStreams.keys()) {
        try {
          this._zg.stopPlayingStream(streamID);
          console.log(`[${timestamp}][ZegoVoice] 停止拉流成功: ${streamID}`);
        } catch (error) {
          console.warn(`[${timestamp}][ZegoVoice] 停止拉流失败: ${streamID}`, error);
        }
      }
      this._remoteStreams.clear();
      this._streamUserMap.clear();

      // 4. 关闭音浪回调
      try {
        this._zg.setSoundLevelDelegate(false);
      } catch (error) {
        console.warn(`[${timestamp}][ZegoVoice] 关闭音浪回调失败:`, error);
      }

      // 5. 退出房间
      try {
        this._zg.logoutRoom(roomIDToLeave);
        console.log(`[${timestamp}][ZegoVoice] 退出房间成功: ${roomIDToLeave}`);
      } catch (error) {
        console.warn(`[${timestamp}][ZegoVoice] 退出房间失败:`, error);
      }
    } catch (error) {
      console.error(`[${timestamp}][ZegoVoice] 退出房间异常:`, error);
    } finally {
      // 确保状态完全清理
      this._currentRoomID = null;
      this._currentUserID = null;
      this._currentUserNick = null;
      this._connectionState = 'DISCONNECTED';
      this._isMicrophoneMuted = false;
      this._isSpeakerMuted = false;
      this._publishStreamID = null;
      this._localStream = null;
      this._remoteStreams.clear();
      this._streamUserMap.clear();
      this._isLoggingOut = false;
      console.log(`[${timestamp}][ZegoVoice] logoutRoom 完成，资源已清理`);
    }
  }

  /**
   * 强制清理资源（用于异常情况）
   * 公共方法，可在异常情况下直接调用
   */
  async forceCleanup(): Promise<void> {
    const timestamp = new Date().toISOString().substring(11, 23);
    console.log(`[${timestamp}][ZegoVoice] forceCleanup 开始`);

    try {
      // 停止推流
      if (this._publishStreamID && this._zg) {
        try {
          this._zg.stopPublishingStream(this._publishStreamID);
        } catch (error) {
          console.warn(`[${timestamp}][ZegoVoice] 强制清理：停止推流失败`, error);
        }
      }

      // 销毁本地流
      if (this._localStream && this._zg) {
        try {
          this._zg.destroyStream(this._localStream);
        } catch (error) {
          console.warn(`[${timestamp}][ZegoVoice] 强制清理：销毁本地流失败`, error);
        }
      }

      // 停止所有拉流
      if (this._zg) {
        for (const streamID of this._remoteStreams.keys()) {
          try {
            this._zg.stopPlayingStream(streamID);
          } catch (error) {
            console.warn(`[${timestamp}][ZegoVoice] 强制清理：停止拉流失败 ${streamID}`, error);
          }
        }
      }

      // 尝试退出房间
      if (this._currentRoomID && this._zg) {
        try {
          this._zg.logoutRoom(this._currentRoomID);
        } catch (error) {
          console.warn(`[${timestamp}][ZegoVoice] 强制清理：退出房间失败`, error);
        }
      }
    } catch (error) {
      console.error(`[${timestamp}][ZegoVoice] 强制清理异常:`, error);
    } finally {
      // 重置所有状态
      this._currentRoomID = null;
      this._currentUserID = null;
      this._currentUserNick = null;
      this._connectionState = 'DISCONNECTED';
      this._isLoggingIn = false;
      this._isLoggingOut = false;
      this._publishStreamID = null;
      this._localStream = null;
      this._remoteStreams.clear();
      this._streamUserMap.clear();
      console.log(`[${timestamp}][ZegoVoice] forceCleanup 完成`);
    }
  }

  /**
   * 内部强制清理（仅用于 loginRoom 异常时调用）
   */
  private async _forceCleanup(): Promise<void> {
    return this.forceCleanup();
  }

  // ============================================================================
  // 麦克风控制
  // ============================================================================

  /**
   * 麦克风静音/取消静音
   * @param muted true 静音，false 取消静音
   */
  muteMicrophone(muted: boolean): void {
    if (!this._zg) {
      console.warn('[ZegoVoice] 引擎未初始化');
      return;
    }

    this._zg.muteMicrophone(muted);
    this._isMicrophoneMuted = muted;

    // 通知上层
    if (this._callbacks.onMicrophoneStateChanged) {
      const event: ZegoMicrophoneStateEvent = {
        userID: this._currentUserID ?? '',
        isMuted: muted,
      };
      this._callbacks.onMicrophoneStateChanged(event);
    }
  }

  // ============================================================================
  // 扬声器控制
  // ============================================================================

  /**
   * 扬声器静音/取消静音
   * 通过停止/恢复拉取所有远程流的音频实现
   * @param muted true 静音，false 取消静音
   */
  muteSpeaker(muted: boolean): void {
    if (!this._zg) {
      console.warn('[ZegoVoice] 引擎未初始化');
      return;
    }

    this._isSpeakerMuted = muted;

    for (const streamID of this._remoteStreams.keys()) {
      this._zg.mutePlayStreamAudio(streamID, muted).catch((err: unknown) => {
        console.warn(`[ZegoVoice] 设置流 ${streamID} 音频静音状态失败:`, err);
      });
    }
  }

  // ============================================================================
  // 游戏阶段语音控制
  // ============================================================================

  /**
   * 静音所有远程音频流
   * 用于：白天发言阶段只允许当前发言者说话
   */
  muteAllRemoteAudio(): void {
    if (!this._zg) return;
    for (const streamID of this._remoteStreams.keys()) {
      this._zg.mutePlayStreamAudio(streamID, true).catch(() => {});
    }
  }

  /**
   * 取消静音所有远程音频流
   */
  unmuteAllRemoteAudio(): void {
    if (!this._zg) return;
    for (const streamID of this._remoteStreams.keys()) {
      this._zg.mutePlayStreamAudio(streamID, false).catch(() => {});
    }
  }

  /**
   * 静音指定用户的远程音频流
   * @param userID 要静音的用户 ID
   */
  muteRemoteAudioByUserID(userID: string): void {
    if (!this._zg) return;
    for (const [streamID, mappedUserID] of this._streamUserMap.entries()) {
      if (mappedUserID === userID) {
        this._zg.mutePlayStreamAudio(streamID, true).catch(() => {});
      }
    }
  }

  /**
   * 取消静音指定用户的远程音频流
   * @param userID 要取消静音的用户 ID
   */
  unmuteRemoteAudioByUserID(userID: string): void {
    if (!this._zg) return;
    for (const [streamID, mappedUserID] of this._streamUserMap.entries()) {
      if (mappedUserID === userID) {
        this._zg.mutePlayStreamAudio(streamID, false).catch(() => {});
      }
    }
  }

  /**
   * 仅允许指定用户列表的音频通过（其他远程流全部静音）
   * 用于：夜晚狼人语音（只听狼人）、白天发言（只听当前发言者）
   * @param allowedUserIDs 允许听到的用户 ID 列表
   */
  setAllowedSpeakers(allowedUserIDs: string[]): void {
    if (!this._zg) return;
    const allowedSet = new Set(allowedUserIDs);
    for (const [streamID, mappedUserID] of this._streamUserMap.entries()) {
      const shouldHear = allowedSet.has(mappedUserID);
      this._zg.mutePlayStreamAudio(streamID, !shouldHear).catch(() => {});
    }
  }

  /**
   * 恢复所有远程音频流为正常状态（取消所有静音限制）
   */
  resetRemoteAudio(): void {
    if (!this._zg) return;
    for (const streamID of this._remoteStreams.keys()) {
      this._zg.mutePlayStreamAudio(streamID, this._isSpeakerMuted).catch(() => {});
    }
  }

  // ============================================================================
  // 销毁引擎
  // ============================================================================

  /**
   * 销毁引擎实例
   */
  async destroy(): Promise<void> {
    if (!this._zg) {
      return;
    }

    // 先退出房间
    await this.logoutRoom();

    // 销毁引擎
    this._zg.destroyEngine();
    this._zg = null;
    this._appID = 0;

    console.log('[ZegoVoice] 引擎已销毁');
  }

  // ============================================================================
  // 事件回调注册
  // ============================================================================

  /**
   * 注册事件回调
   * @param callbacks 回调函数集合
   */
  on(callbacks: ZegoEventCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * 移除所有事件回调
   */
  offAll(): void {
    this._callbacks = {};
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 从后端获取 Token
   */
  private async _fetchToken(userID: string, roomID: string): Promise<string> {
    const params = new URLSearchParams({ userId: userID, roomCode: roomID });
    const response = await fetch(`${API_BASE}/token?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`获取 Token 失败: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.token) {
      throw new Error('Token 响应中缺少 token 字段');
    }
    return data.token;
  }

  /**
   * 构建 streamID
   * 规则：voice_{roomID}_{userID}
   */
  private _buildStreamID(roomID: string, userID: string): string {
    return `voice_${roomID}_${userID}`;
  }

  /**
   * 从 streamID 中解析 userID
   * streamID 格式：voice_{roomID}_{userID}
   */
  private _parseUserIDFromStreamID(streamID: string): string {
    const parts = streamID.split('_');
    // voice_roomID_userID — userID 可能包含下划线，取第三段之后
    return parts.length >= 3 ? parts.slice(2).join('_') : streamID;
  }

  /**
   * 注册 Zego SDK 事件回调
   */
  private _registerEventHandlers(): void {
    if (!this._zg) return;

    // 房间状态变化回调
    this._zg.on('roomStateChanged', (roomID: string, reason: string, errorCode: number, extendedData: string) => {
      const timestamp = new Date().toISOString().substring(11, 23);
      console.log(`[${timestamp}][ZegoVoice] roomStateChanged: roomID=${roomID}, reason=${reason}, errorCode=${errorCode}, userID=${this._currentUserID ?? 'null'}`);

      switch (reason) {
        case 'LOGINED':
          this._connectionState = 'CONNECTED';
          console.log(`[${timestamp}][ZegoVoice] 房间登录成功: roomID=${roomID}`);
          break;
        case 'LOGIN_FAILED':
          this._connectionState = 'DISCONNECTED';
          console.error(`[${timestamp}][ZegoVoice] 房间登录失败: roomID=${roomID}, errorCode=${errorCode}`);
          break;
        case 'RECONNECTING':
          this._connectionState = 'RECONNECTING';
          console.log(`[${timestamp}][ZegoVoice] 房间重连中: roomID=${roomID}`);
          break;
        case 'RECONNECTED':
          this._connectionState = 'CONNECTED';
          console.log(`[${timestamp}][ZegoVoice] 房间重连成功: roomID=${roomID}`);
          break;
        case 'RECONNECT_FAILED':
          this._connectionState = 'DISCONNECTED';
          console.error(`[${timestamp}][ZegoVoice] 房间重连失败: roomID=${roomID}, errorCode=${errorCode}`);
          break;
        case 'KICKOUT':
          this._connectionState = 'DISCONNECTED';
          console.warn(`[${timestamp}][ZegoVoice] 被踢出房间: roomID=${roomID}`);
          break;
        case 'LOGOUT':
          this._connectionState = 'DISCONNECTED';
          console.log(`[${timestamp}][ZegoVoice] 正常退出房间: roomID=${roomID}`);
          break;
        case 'LOGOUT_FAILED':
          this._connectionState = 'DISCONNECTED';
          console.warn(`[${timestamp}][ZegoVoice] 退出房间失败: roomID=${roomID}, errorCode=${errorCode}`);
          break;
      }

      if (this._callbacks.onRoomStateChanged) {
        const event: ZegoRoomStateEvent = { roomID, errorCode, extendedData };
        this._callbacks.onRoomStateChanged(event);
      }
    });

    // 用户进出房间通知
    this._zg.on('roomUserUpdate', (roomID: string, updateType: 'ADD' | 'DELETE', userList: Array<{ userID: string; userName?: string }>) => {
      if (updateType === 'ADD') {
        if (this._callbacks.onUserJoin) {
          const event: ZegoUserJoinEvent = {
            roomID,
            userList: userList.map((u) => ({
              userID: u.userID,
              userName: u.userName ?? u.userID,
            })),
          };
          this._callbacks.onUserJoin(event);
        }
      } else {
        if (this._callbacks.onUserLeave) {
          const event: ZegoUserLeaveEvent = {
            roomID,
            userList: userList.map((u) => ({
              userID: u.userID,
              userName: u.userName ?? u.userID,
            })),
          };
          this._callbacks.onUserLeave(event);
        }
      }
    });

    // 流更新回调 — 自动拉流管理
    this._zg.on('roomStreamUpdate', async (roomID: string, updateType: 'ADD' | 'DELETE', streamList: Array<{ streamID: string; user: { userID: string; userName?: string }; extraInfo: string }>, extendedData: string) => {
      if (updateType === 'ADD') {
        // 新增流 — 自动拉取
        for (const stream of streamList) {
          if (!stream?.streamID || !stream?.user?.userID) {
            console.warn('[ZegoVoice] 忽略无效的新增流:', stream);
            continue;
          }
          try {
            // 记录 streamID 与 userID 的映射
            this._streamUserMap.set(stream.streamID, stream.user.userID);

            const remoteStream = await this._zg!.startPlayingStream(stream.streamID);
            if (!remoteStream) {
              this._streamUserMap.delete(stream.streamID);
              throw new Error('拉流返回空流对象');
            }
            this._remoteStreams.set(stream.streamID, remoteStream);

            // 如果扬声器处于静音状态，新拉取的流也需要静音
            if (this._isSpeakerMuted) {
              this._zg!.mutePlayStreamAudio(stream.streamID, true).catch(() => {});
            }

            console.log(`[ZegoVoice] 拉流成功: ${stream.streamID}`);
          } catch (error) {
            this._remoteStreams.delete(stream.streamID);
            this._streamUserMap.delete(stream.streamID);
            console.error(`[ZegoVoice] 拉流失败: ${stream.streamID}`, error);
            this._notifyError(error);
          }
        }
      } else {
        // 删除流 — 停止拉取
        for (const stream of streamList) {
          if (!stream?.streamID) continue;
          try {
            this._zg!.stopPlayingStream(stream.streamID);
            console.log(`[ZegoVoice] 停止拉流: ${stream.streamID}`);
          } catch (error) {
            console.error(`[ZegoVoice] 停止拉流失败: ${stream.streamID}`, error);
            this._notifyError(error);
          } finally {
            this._remoteStreams.delete(stream.streamID);
            this._streamUserMap.delete(stream.streamID);
          }
        }
      }

      // 通知上层
      if (this._callbacks.onStreamUpdate) {
        const event: ZegoStreamUpdateEvent = {
          roomID,
          updateType,
          streamList: streamList.map((s) => ({
            streamID: s.streamID,
            userID: s.user.userID,
            streamType: 'main' as const,
            videoState: 'NO_VIDEO' as const,
            audioState: 'PLAYING' as const,
            extraInfo: s.extraInfo,
          })),
        };
        this._callbacks.onStreamUpdate(event);
      }
    });

    // 音浪回调 — 检测谁在说话
    this._zg.on('soundLevelUpdate', (soundLevelList: Array<{ streamID: string; soundLevel: number; type: 'push' | 'pull' }>) => {
      if (this._callbacks.onSoundLevelUpdate) {
        const infos: ZegoSoundLevelInfo[] = soundLevelList.map((item) => {
          const userID = this._streamUserMap.get(item.streamID) ?? this._parseUserIDFromStreamID(item.streamID);
          return {
            userID,
            streamID: item.streamID,
            soundLevel: item.soundLevel,
            isSpeaking: item.soundLevel >= SPEAKING_THRESHOLD,
          };
        });

        const event: ZegoSoundLevelUpdateEvent = { soundLevelList: infos };
        this._callbacks.onSoundLevelUpdate(event);
      }
    });

    // 网络质量回调
    this._zg.on('networkQuality', (userID: string, upstreamQuality: number, downstreamQuality: number) => {
      if (this._callbacks.onNetworkQuality) {
        const event: ZegoNetworkQualityEvent = {
          userID,
          upQuality: _mapQualityGrade(upstreamQuality),
          downQuality: _mapQualityGrade(downstreamQuality),
        };
        this._callbacks.onNetworkQuality(event);
      }
    });
  }

  /**
   * 通知上层发生错误
   */
  private _notifyError(error: unknown): void {
    if (this._callbacks.onError) {
      const event: ZegoErrorEvent = {
        errorCode: (error as any)?.errorCode ?? -1,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      this._callbacks.onError(event);
    }
  }
}

// ============================================================================
// 模块级辅助函数
// ============================================================================

/**
 * 将 Zego SDK 的 QualityGrade 枚举值映射为字符串
 * SDK QualityGrade: Unknown=-1, Excellent=0, Good=1, Middle=2, Poor=3, Die=4
 * 共享类型: 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Die'
 */
function _mapQualityGrade(grade: number): ZegoNetworkQualityEvent['upQuality'] {
  switch (grade) {
    case 0: return 'Excellent';
    case 1: return 'Good';
    case 2: return 'Medium';  // SDK 的 Middle 映射为 Medium
    case 3: return 'Poor';
    case 4: return 'Die';
    default: return 'Poor';   // Unknown 等未知值默认为 Poor
  }
}

// ============================================================================
// 便捷导出
// ============================================================================

/** 获取 ZegoVoiceService 单例 */
export function getZegoVoiceService(): ZegoVoiceService {
  return ZegoVoiceService.getInstance();
}
