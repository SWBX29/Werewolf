/**
 * ============================================================================
 * 狼人杀联机游戏 — 迁移脚本运行器
 * ============================================================================
 *
 * 用途：
 *   连接 MongoDB，执行日志数据库迁移，然后断开连接。
 *
 * 运行方式：
 *   npx tsx server/src/migrations/run-migration.ts
 *
 * 环境变量：
 *   MONGODB_URI — MongoDB 连接字符串（必需）
 * ============================================================================
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { connectMongoDB, disconnectMongoDB } from '../models.js';
import { runMigration } from './migrate-log-database.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const LOCK_FILE = path.join(__dirname, '.migration.lock');

function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockContent = fs.readFileSync(LOCK_FILE, 'utf-8');
      const lockTime = parseInt(lockContent, 10);
      if (Date.now() - lockTime < 30 * 60 * 1000) {
        console.error('[错误] 另一个迁移进程正在运行（锁文件存在）');
        return false;
      }
      console.warn('[警告] 发现过期的锁文件，将覆盖');
    }
    fs.writeFileSync(LOCK_FILE, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {}
}

async function main(): Promise<void> {
  if (!MONGODB_URI) {
    console.error('[错误] 未配置 MONGODB_URI 环境变量，无法执行迁移');
    process.exit(1);
  }

  const migrationDir = __dirname;
  if (!fs.existsSync(migrationDir)) {
    console.error(`[错误] 迁移目录不存在: ${migrationDir}`);
    process.exit(1);
  }

  if (!acquireLock()) {
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
    releaseLock();
    console.log('[运行器] 已断开连接，退出');
  }
}

main();
