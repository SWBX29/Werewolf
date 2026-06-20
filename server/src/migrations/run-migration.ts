/**
 * ============================================================================
 * 迁移运行器 — 连接数据库并执行迁移脚本
 * ============================================================================
 *
 * 架构说明：
 *   1. 加载环境变量，连接 MongoDB
 *   2. 调用 migrate-log-database 中的迁移任务
 *   3. 迁移完成后断开连接
 *
 * 设计原则：
 *   - 最小化：仅负责连接管理和迁移调度
 *   - 安全退出：无论成功或失败，始终断开数据库连接
 *
 * 运行方式：
 *   npx tsx server/src/migrations/run-migration.ts
 *
 * 环境变量：
 *   MONGODB_URI — MongoDB 连接字符串（必需）
 * ============================================================================
 */

import * as dotenv from 'dotenv';
import { connectMongoDB, disconnectMongoDB } from '../models.js';
import { runMigration } from './migrate-log-database.js';

// 加载环境变量
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function main(): Promise<void> {
  if (!MONGODB_URI) {
    console.error('[错误] 未配置 MONGODB_URI 环境变量，无法执行迁移');
    process.exit(1);
  }

  try {
    console.log('[运行器] 正在连接 MongoDB ...');
    await connectMongoDB(MONGODB_URI);
    console.log('[运行器] MongoDB 已连接');

    await runMigration();

    console.log('[运行器] 迁移成功完成');
  } catch (error) {
    console.error('[运行器] 迁移失败:', error);
    process.exitCode = 1;
  } finally {
    console.log('[运行器] 正在断开 MongoDB ...');
    await disconnectMongoDB();
    console.log('[运行器] 已断开连接，退出');
  }
}

main();
