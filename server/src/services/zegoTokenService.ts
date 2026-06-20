/**
 * ============================================================================
 * 即构 Token 服务 — Zego 音视频鉴权 Token 生成
 * ============================================================================
 *
 * 架构说明：
 *   1. 实现即构云 Zego Token04 生成算法（AES-256-GCM 加密）
 *   2. 从环境变量读取 AppID 和 ServerSecret，延迟初始化服务实例
 *   3. 提供 HTTP API 接口供客户端获取音视频通话所需的鉴权 Token
 *
 * 设计原则：
 *   - 延迟初始化：仅在首次调用时创建实例，避免环境变量缺失导致启动崩溃
 *   - 安全性：Token 使用 AES-256-GCM 加密，包含过期时间和随机 Nonce
 *   - 隔离性：Token 生成逻辑与游戏核心逻辑完全解耦
 * ============================================================================
 */

import { createCipheriv, randomBytes } from 'crypto';

// ============================================================================
// Zego Token04 算法实现
// ============================================================================

/**
 * Token 生成错误码枚举
 */
enum ErrorCode {
  success = 0,
  appIDInvalid = 1,
  userIDInvalid = 3,
  secretInvalid = 5,
  effectiveTimeInSecondsInvalid = 6,
}

/**
 * 错误信息接口
 */
interface ErrorInfo {
  errorCode: ErrorCode;
  errorMessage: string;
}

/**
 * 生成随机 Nonce 字符串
 *
 * @returns 24 位十六进制随机字符串
 */
function makeNonce(): string {
  return randomBytes(12).toString('hex');
}

/**
 * 使用 AES-256-GCM 算法加密明文
 *
 * @param plainText - 待加密的明文字符串
 * @param key - 加密密钥（16/24/32 字节 Buffer 或字符串）
 * @returns 加密结果，包含密文 Buffer 和 Nonce Buffer
 * @throws 当密钥长度不合法时抛出异常
 */
function aesGcmEncrypt(plainText: string, key: Buffer | string): { encryptBuf: Buffer; nonce: Buffer } {
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'utf8');
  if (![16, 24, 32].includes(keyBuffer.length)) {
    throw createError(ErrorCode.secretInvalid, 'Invalid Secret length. Key must be 16, 24, or 32 bytes.');
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, nonce);
  cipher.setAutoPadding(true);
  const encrypted = cipher.update(plainText, 'utf8');
  const encryptBuf = Buffer.concat([encrypted, cipher.final(), cipher.getAuthTag()]);

  return { encryptBuf, nonce };
}

/**
 * 构造错误信息对象
 *
 * @param errorCode - 错误码
 * @param errorMessage - 错误描述
 * @returns 错误信息对象
 */
function createError(errorCode: number, errorMessage: string): ErrorInfo {
  return { errorCode, errorMessage };
}

/**
 * 生成 Zego Token04
 *
 * 按照 Zego 官方 Token04 规范生成鉴权 Token：
 * 1. 构建 TokenInfo JSON（包含 appId、userId、nonce、创建时间、过期时间）
 * 2. 使用 AES-256-GCM 加密 TokenInfo
 * 3. 拼接版本标识 + Base64 编码的二进制数据
 *
 * @param appId - Zego 应用 ID
 * @param userId - 用户唯一标识
 * @param secret - 服务端密钥（32 字节）
 * @param effectiveTimeInSeconds - Token 有效时长（秒）
 * @param payload - 附加载荷（可选）
 * @returns 生成的 Token 字符串
 * @throws 当参数不合法时抛出异常
 */
function generateToken04(
  appId: number,
  userId: string,
  secret: Buffer | string,
  effectiveTimeInSeconds: number,
  payload?: string,
): string {
  const secretBuffer = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'utf8');

  if (!appId || typeof appId !== 'number') {
    throw createError(ErrorCode.appIDInvalid, 'appID invalid');
  }

  if (!userId || typeof userId !== 'string' || userId.length > 64) {
    throw createError(ErrorCode.userIDInvalid, 'userId invalid');
  }

  if (secretBuffer.length !== 32) {
    throw createError(ErrorCode.secretInvalid, 'secret must be a 32 byte string');
  }

  if (!(effectiveTimeInSeconds > 0)) {
    throw createError(ErrorCode.effectiveTimeInSecondsInvalid, 'effectiveTimeInSeconds invalid');
  }

  const VERSION_FLAG = '04';

  const createTime = Math.floor(new Date().getTime() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: makeNonce(),
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || '',
  };

  const plaintText = JSON.stringify(tokenInfo);

  const { encryptBuf, nonce } = aesGcmEncrypt(plaintText, secretBuffer);

  const [b1, b2, b3, b4] = [new Uint8Array(8), new Uint8Array(2), new Uint8Array(2), new Uint8Array(1)];
  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);
  new DataView(b2.buffer).setUint16(0, nonce.byteLength, false);
  new DataView(b3.buffer).setUint16(0, encryptBuf.byteLength, false);
  new DataView(b4.buffer).setUint8(0, 1); // AesEncryptMode.GCM
  const buf = Buffer.concat([
    Buffer.from(b1),
    Buffer.from(b2),
    Buffer.from(nonce),
    Buffer.from(b3),
    Buffer.from(encryptBuf),
    Buffer.from(b4),
  ]);
  const dv = new DataView(Uint8Array.from(buf).buffer);
  return VERSION_FLAG + Buffer.from(dv.buffer).toString('base64');
}

// ============================================================================
// ZegoTokenService — 封装 Token 生成，从环境变量读取配置
// ============================================================================

/** Token 默认有效时长：1 小时（秒） */
const TOKEN_EFFECTIVE_TIME = 3600;

/**
 * 即构 Token 服务类
 *
 * 从环境变量读取 ZEGO_APP_ID 和 ZEGO_SERVER_SECRET，
 * 提供 Token 生成和配置查询能力。
 */
class ZegoTokenService {
  private readonly appId: number;
  private readonly secret: Buffer;

  constructor() {
    const appIdStr = process.env.ZEGO_APP_ID;
    const serverSecret = process.env.ZEGO_SERVER_SECRET;

    if (!appIdStr || appIdStr === '0') {
      throw new Error('ZEGO_APP_ID 环境变量未配置或无效');
    }

    if (!serverSecret) {
      throw new Error('ZEGO_SERVER_SECRET 环境变量未配置');
    }

    // ServerSecret 是 32 字节的字符串，直接使用
    let secret: Buffer;
    if (serverSecret.length === 32) {
      secret = Buffer.from(serverSecret, 'utf8');
    } else if (serverSecret.length === 64 && /^[0-9a-fA-F]+$/.test(serverSecret)) {
      // 如果是 64 字符十六进制，转换为 32 字节
      secret = Buffer.from(serverSecret, 'hex');
    } else {
      throw new Error(`ZEGO_SERVER_SECRET 格式无效：期望 32 字节字符串或 64 字符十六进制，实际长度 ${serverSecret.length}`);
    }

    const parsedAppId = Number(appIdStr);
    if (!Number.isInteger(parsedAppId) || parsedAppId <= 0) {
      throw new Error('ZEGO_APP_ID 环境变量必须是正整数');
    }

    this.appId = parsedAppId;
    this.secret = secret;
  }

  /**
   * 生成 Zego Token
   *
   * @param userId - 用户唯一标识
   * @returns 生成的 Token 字符串
   */
  generateToken(userId: string): string {
    return generateToken04(this.appId, userId, this.secret, TOKEN_EFFECTIVE_TIME);
  }

  /**
   * 获取当前配置的 AppID
   *
   * @returns Zego 应用 ID
   */
  getAppId(): number {
    return this.appId;
  }
}

/** 延迟初始化的服务实例，仅在首次调用时创建 */
let _instance: ZegoTokenService | null = null;

/**
 * 获取 ZegoTokenService 单例
 *
 * 延迟初始化策略：仅在首次调用时创建实例，
 * 避免服务启动时因环境变量缺失而崩溃。
 *
 * @returns ZegoTokenService 实例
 */
function getZegoTokenService(): ZegoTokenService {
  if (!_instance) {
    _instance = new ZegoTokenService();
  }
  return _instance;
}

export { ZegoTokenService, getZegoTokenService };
