/**
 * ============================================================================
 * 错误日志 — 独立数据库连接与错误记录管理
 * ============================================================================
 *
 * 架构说明：
 *   1. 管理独立的 MongoDB 连接，专门用于错误日志的持久化
 *   2. 使用 mongoose.createConnection 创建独立连接，避免与游戏主数据库共用连接池
 *   3. 错误日志存放在独立的 langrensha_errors 数据库中，实现物理隔离
 *   4. 相同错误通过 fingerprint 去重，累加计数而非重复插入
 *
 * 设计原则：
 *   - 错误日志与游戏数据物理隔离，互不影响
 *   - 连接失败不应影响主游戏流程，仅记录警告
 *   - 相同错误通过 fingerprint 去重，累加计数而非重复插入
 * ============================================================================
 */

import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

// ============================================================================
// 类型定义
// ============================================================================

/** 错误来源类型：服务端或客户端 */
export type ErrorSource = 'server' | 'client';

/** 错误级别 */
export type ErrorLevel = 'error' | 'warn' | 'fatal';

/** 客户端信息接口 */
export interface ErrorClientInfo {
  url: string;
  userAgent: string;
}

/**
 * 错误日志文档接口
 */
export interface ErrorLogDocument extends Document {
  source: ErrorSource;
  level: ErrorLevel;
  message: string;
  stack: string | null;
  timestamp: number;
  lastOccurredAt: number;
  count: number;
  context: Record<string, unknown>;
  clientInfo: ErrorClientInfo | null;
  resolved: boolean;
  resolvedAt: number | null;
  fingerprint: string;
}

// ============================================================================
// URI 派生
// ============================================================================

/**
 * 从主数据库 URI 派生错误数据库 URI
 * 将路径中的 langrensha 替换为 langrensha_errors
 */
function deriveErrorDbUri(uri: string): string {
  const errorDbUri = uri
    .replace(/\/langrensha\?/, '/langrensha_errors?')
    .replace(/\/langrensha$/, '/langrensha_errors');
  if (errorDbUri.includes('langrensha_errors')) {
    return errorDbUri;
  }
  // 如果 URI 中没有数据库名，则追加
  const baseUri = uri.replace(/\?.*$/, '');
  const queryString = uri.includes('?') ? '?' + uri.split('?')[1] : '';
  return `${baseUri}/langrensha_errors${queryString}`;
}

// ============================================================================
// Schema 定义
// ============================================================================

/**
 * 客户端信息子文档 Schema
 */
const ErrorClientInfoSubSchema = new Schema<ErrorClientInfo>(
  {
    url: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { _id: false, strict: false },
);

/**
 * 错误日志 Schema
 * 集合名：error_logs，不使用 Mongoose 内置时间戳（自定义 timestamp 字段）
 */
const ErrorLogSchema = new Schema<ErrorLogDocument>(
  {
    source: {
      type: String,
      required: true,
      enum: ['server', 'client'],
    },
    level: {
      type: String,
      required: true,
      enum: ['error', 'warn', 'fatal'],
      default: 'error',
    },
    message: { type: String, required: true },
    stack: { type: String, default: null },
    timestamp: { type: Number, required: true, default: () => Date.now() },
    lastOccurredAt: { type: Number, required: true, default: () => Date.now() },
    count: { type: Number, required: true, default: 1 },
    context: { type: Schema.Types.Mixed, default: {} },
    clientInfo: { type: ErrorClientInfoSubSchema, default: null },
    resolved: { type: Boolean, required: true, default: false },
    resolvedAt: { type: Number, default: null },
    fingerprint: { type: String, required: true, index: true },
  },
  {
    collection: 'error_logs',
    timestamps: false,
  },
);

// ============================================================================
// 连接管理
// ============================================================================

/** 错误数据库连接实例 */
let errorDbConnection: mongoose.Connection | null = null;

/** 错误日志 Model（连接建立后创建） */
let ErrorLogModel: mongoose.Model<ErrorLogDocument> | null = null;

/**
 * 连接错误数据库
 *
 * 连接失败仅记录警告，不抛出异常，确保不影响主游戏流程。
 * 使用 mongoose.createConnection 创建独立连接，与游戏主数据库隔离。
 *
 * @param uri - MongoDB 连接字符串
 */
export async function connectErrorDb(uri: string): Promise<void> {
  const errorDbUri = deriveErrorDbUri(uri);

  try {
    errorDbConnection = mongoose.createConnection(errorDbUri, {
      serverSelectionTimeoutMS: 30_000,
      heartbeatFrequencyMS: 10_000,
      maxPoolSize: 5,
      minPoolSize: 1,
      directConnection: errorDbUri.includes('directConnection=true'),
    });

    await errorDbConnection.asPromise();

    errorDbConnection.on('error', (err) => {
      console.error('[ErrorDB] 连接错误:', err.message);
    });

    errorDbConnection.on('disconnected', () => {
      console.warn('[ErrorDB] 连接断开');
    });

    errorDbConnection.on('reconnected', () => {
      console.log('[ErrorDB] 已自动重连');
    });

    ErrorLogModel = errorDbConnection.model<ErrorLogDocument>('ErrorLog', ErrorLogSchema);

    console.log(`[ErrorDB] 已连接 | 数据库: ${errorDbConnection.name}`);
  } catch (error) {
    console.warn(`[ErrorDB] 连接失败（错误日志功能将不可用）: ${(error as Error).message}`);
    errorDbConnection = null;
    ErrorLogModel = null;
  }
}

/**
 * 断开错误数据库连接
 *
 * 关闭连接并清理引用，确保资源正确释放。
 */
export async function disconnectErrorDb(): Promise<void> {
  if (errorDbConnection) {
    await errorDbConnection.close();
    errorDbConnection = null;
    ErrorLogModel = null;
    console.log('[ErrorDB] 已断开连接');
  }
}

/**
 * 检查错误数据库是否已连接
 *
 * @returns 连接是否就绪
 */
export function isErrorDbConnected(): boolean {
  return errorDbConnection !== null && errorDbConnection.readyState === 1;
}

/**
 * 获取错误日志 Model
 *
 * 供 CLI 脚本等外部模块查询使用。
 * 仅在错误数据库连接成功后返回有效 Model，否则返回 null。
 *
 * @returns ErrorLog Model 实例，连接未建立时返回 null
 */
export function getErrorLogModel(): mongoose.Model<ErrorLogDocument> | null {
  return ErrorLogModel;
}

// ============================================================================
// Fingerprint 计算
// ============================================================================

/**
 * 计算错误指纹
 *
 * 用于去重：相同来源、消息、堆栈的错误视为同一条记录。
 * 对消息截取前 200 字符、堆栈截取前 500 字符后进行 SHA-256 哈希。
 *
 * @param source - 错误来源（server / client）
 * @param message - 错误消息
 * @param stack - 错误堆栈（可为 null）
 * @returns SHA-256 哈希的十六进制字符串
 */
function computeFingerprint(source: string, message: string, stack: string | null): string {
  const msgPart = (message || '').slice(0, 200);
  const stackPart = (stack || '').slice(0, 500);
  return crypto.createHash('sha256').update(`${source}:${msgPart}:${stackPart}`).digest('hex');
}

// ============================================================================
// 日志记录函数
// ============================================================================

/**
 * 记录服务端错误
 *
 * 相同指纹的错误累加计数，不重复插入。
 * 使用 upsert 策略：已存在则更新 lastOccurredAt 和 count，不存在则插入新记录。
 *
 * @param message - 错误消息
 * @param level - 错误级别，默认 'error'
 * @param context - 附加上下文信息
 * @param stack - 错误堆栈（可选）
 */
export async function logServerError(
  message: string,
  level: 'error' | 'warn' | 'fatal' = 'error',
  context: Record<string, unknown> = {},
  stack?: string | null,
): Promise<void> {
  if (!ErrorLogModel) {
    return;
  }

  try {
    const now = Date.now();
    const stackValue = stack ?? null;
    const fingerprint = computeFingerprint('server', message, stackValue);

    await ErrorLogModel.updateOne(
      { fingerprint },
      {
        $set: { lastOccurredAt: now },
        $inc: { count: 1 },
        $setOnInsert: {
          source: 'server',
          level,
          message,
          stack: stackValue,
          timestamp: now,
          context,
          clientInfo: null,
          resolved: false,
          resolvedAt: null,
          fingerprint,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    console.error('[ErrorDB] 记录服务端错误失败:', (error as Error).message);
  }
}

/**
 * 记录客户端错误
 *
 * 相同指纹的错误累加计数，不重复插入。
 * 使用 upsert 策略：已存在则更新 lastOccurredAt 和 count，不存在则插入新记录。
 *
 * @param message - 错误消息
 * @param level - 错误级别（error 或 warn）
 * @param stack - 错误堆栈
 * @param context - 附加上下文信息
 * @param clientInfo - 客户端环境信息（URL、UserAgent）
 */
export async function logClientError(
  message: string,
  level: 'error' | 'warn',
  stack: string | null,
  context: Record<string, unknown>,
  clientInfo: { url: string; userAgent: string },
): Promise<void> {
  if (!ErrorLogModel) {
    return;
  }

  try {
    const now = Date.now();
    const fingerprint = computeFingerprint('client', message, stack);

    await ErrorLogModel.updateOne(
      { fingerprint },
      {
        $set: { lastOccurredAt: now },
        $inc: { count: 1 },
        $setOnInsert: {
          source: 'client',
          level,
          message,
          stack,
          timestamp: now,
          context,
          clientInfo,
          resolved: false,
          resolvedAt: null,
          fingerprint,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    console.error('[ErrorDB] 记录客户端错误失败:', (error as Error).message);
  }
}
