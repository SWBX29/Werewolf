import { createCipheriv, randomBytes } from 'crypto';

// ============================================================================
// Zego Token 生成服务 (generateToken04 算法实现)
// ============================================================================

enum ErrorCode {
  success = 0,
  appIDInvalid = 1,
  userIDInvalid = 3,
  secretInvalid = 5,
  effectiveTimeInSecondsInvalid = 6,
}

interface ErrorInfo {
  errorCode: ErrorCode;
  errorMessage: string;
}

function makeNonce(): string {
  return randomBytes(12).toString('hex');
}

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

function createError(errorCode: number, errorMessage: string): ErrorInfo {
  return { errorCode, errorMessage };
}

function generateToken04(
  appId: number,
  userId: string,
  secret: Buffer | string,
  effectiveTimeInSeconds: number,
  payload?: string,
): string {
  // Bug 127 修复：严格校验所有参数
  if (!appId || typeof appId !== 'number' || !Number.isFinite(appId) || appId <= 0) {
    throw createError(ErrorCode.appIDInvalid, 'appID invalid');
  }

  if (!userId || typeof userId !== 'string' || userId.trim().length === 0 || userId.length > 64) {
    throw createError(ErrorCode.userIDInvalid, 'userId invalid');
  }

  const secretBuffer = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'utf8');

  if (secretBuffer.length !== 32) {
    throw createError(ErrorCode.secretInvalid, 'secret must be a 32 byte string');
  }

  if (typeof effectiveTimeInSeconds !== 'number' || !Number.isFinite(effectiveTimeInSeconds) || !(effectiveTimeInSeconds > 0)) {
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

const TOKEN_EFFECTIVE_TIME = 3600; // 1 小时

class ZegoTokenService {
  private readonly appId: number;
  private readonly secret: Buffer;

  // Bug 157 修复：Token 请求去重缓存（userId -> { promise, timestamp }）
  private _pendingRequests: Map<string, { promise: Promise<string>; timestamp: number }> = new Map();
  private static readonly REQUEST_TTL_MS = 5000;

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
   * @param userId 用户 ID
   * @returns Token 字符串
   */
  generateToken(userId: string): string {
    return generateToken04(this.appId, userId, this.secret, TOKEN_EFFECTIVE_TIME);
  }

  /**
   * 生成 Zego Token（带去重和超时保护）
   * @param userId 用户 ID
   * @returns Token 字符串的 Promise
   */
  async generateTokenAsync(userId: string): Promise<string> {
    // Bug 157 修复：清理过期缓存
    const now = Date.now();
    for (const [key, entry] of this._pendingRequests) {
      if (now - entry.timestamp > ZegoTokenService.REQUEST_TTL_MS) {
        this._pendingRequests.delete(key);
      }
    }

    // 去重：如果同一 userId 的请求正在进行中，复用 Promise
    const pending = this._pendingRequests.get(userId);
    if (pending) {
      return pending.promise;
    }

    const promise = Promise.resolve().then(() => {
      const token = this.generateToken(userId);
      this._pendingRequests.delete(userId);
      return token;
    });

    this._pendingRequests.set(userId, { promise, timestamp: now });
    return promise;
  }

  /**
   * 获取当前配置的 AppID
   */
  getAppId(): number {
    return this.appId;
  }
}

// 延迟初始化：仅在首次调用时创建实例，避免服务启动时因环境变量缺失而崩溃
let _instance: ZegoTokenService | null = null;

function getZegoTokenService(): ZegoTokenService {
  if (!_instance) {
    _instance = new ZegoTokenService();
  }
  return _instance;
}

export { ZegoTokenService, getZegoTokenService };
