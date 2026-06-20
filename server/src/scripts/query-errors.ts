/**
 * ============================================================================
 * 错误日志查询 — CLI 查询与管理工具
 * ============================================================================
 *
 * 架构说明：
 *   1. 连接错误数据库（langrensha_errors），提供命令行查询能力
 *   2. 支持按来源、级别、关键字等条件筛选错误记录
 *   3. 支持查看错误详情、标记已解决、批量标记等操作
 *   4. 支持 JSON 格式输出，便于 AI 代理解析
 *
 * 设计原则：
 *   - 独立运行：作为 CLI 脚本直接执行，不依赖服务端运行时
 *   - 安全操作：标记已解决等写操作需明确指定参数
 *   - 格式灵活：支持人类可读表格和机器可读 JSON 两种输出格式
 *
 * 运行方式（在项目根目录下执行）：
 *   npx tsx server/src/scripts/query-errors.ts [options]
 *
 * 选项：
 *   (无参数)            查询最近 20 条未解决错误
 *   --unresolved        仅查询未解决错误（默认）
 *   --resolved          仅查询已解决错误
 *   --all               查询所有错误（含已解决和未解决）
 *   --source <s>        按来源筛选（server | client）
 *   --level <l>         按级别筛选（error | warn | fatal）
 *   --search <keyword>  在 message 和 stack 中搜索关键字
 *   --limit <n>         限制返回数量（默认 20）
 *   --detail <id>       查看指定错误的完整详情
 *   --resolve <id>      标记指定错误为已解决
 *   --resolve-all-matching  批量标记当前查询匹配的错误为已解决
 *   --json              以 JSON 格式输出（便于 AI 解析）
 * ============================================================================
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { connectErrorDb, disconnectErrorDb, getErrorLogModel } from '../errorLogger.js';
import type { ErrorLogDocument } from '../errorLogger.js';

// ============================================================================
// 环境变量加载（复用 server.ts 的查找逻辑）
// ============================================================================

const possibleEnvPaths = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
];
const envPath = possibleEnvPaths.find((p) => {
  if (!fs.existsSync(p)) return false;
  const content = fs.readFileSync(p, 'utf8');
  return content.includes('ZEGO_APP_ID');
}) || possibleEnvPaths.find((p) => fs.existsSync(p)) || possibleEnvPaths[0];

dotenv.config({ path: envPath });

// ============================================================================
// 参数解析
// ============================================================================

interface CliOptions {
  resolvedFilter: 'unresolved' | 'resolved' | 'all';
  source?: 'server' | 'client';
  level?: 'error' | 'warn' | 'fatal';
  search?: string;
  limit: number;
  detailId?: string;
  resolveId?: string;
  resolveAllMatching: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    resolvedFilter: 'unresolved',
    limit: 20,
    resolveAllMatching: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--unresolved':
        opts.resolvedFilter = 'unresolved';
        break;
      case '--resolved':
        opts.resolvedFilter = 'resolved';
        break;
      case '--all':
        opts.resolvedFilter = 'all';
        break;
      case '--source':
        if (next === 'server' || next === 'client') {
          opts.source = next;
          i++;
        } else {
          console.error(`--source 的值必须为 server 或 client，收到: ${next ?? '(空)'}`);
          process.exit(1);
        }
        break;
      case '--level':
        if (next === 'error' || next === 'warn' || next === 'fatal') {
          opts.level = next;
          i++;
        } else {
          console.error(`--level 的值必须为 error、warn 或 fatal，收到: ${next ?? '(空)'}`);
          process.exit(1);
        }
        break;
      case '--search':
        if (next) {
          opts.search = next;
          i++;
        } else {
          console.error('--search 需要提供关键字');
          process.exit(1);
        }
        break;
      case '--limit':
        if (next && /^\d+$/.test(next)) {
          opts.limit = parseInt(next, 10);
          i++;
        } else {
          console.error(`--limit 需要一个正整数，收到: ${next ?? '(空)'}`);
          process.exit(1);
        }
        break;
      case '--detail':
        if (next) {
          opts.detailId = next;
          i++;
        } else {
          console.error('--detail 需要提供错误 ID');
          process.exit(1);
        }
        break;
      case '--resolve':
        if (next) {
          opts.resolveId = next;
          i++;
        } else {
          console.error('--resolve 需要提供错误 ID');
          process.exit(1);
        }
        break;
      case '--resolve-all-matching':
        opts.resolveAllMatching = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`未知参数: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return opts;
}

function printHelp(): void {
  console.log(`
错误日志查询脚本

用法: npx tsx server/src/scripts/query-errors.ts [options]

选项:
  (无参数)                查询最近 20 条未解决错误
  --unresolved            仅查询未解决错误（默认）
  --resolved              仅查询已解决错误
  --all                   查询所有错误
  --source <server|client>  按来源筛选
  --level <error|warn|fatal> 按级别筛选
  --search <keyword>      在 message 和 stack 中搜索关键字
  --limit <n>             限制返回数量（默认 20）
  --detail <id>           查看指定错误的完整详情
  --resolve <id>          标记指定错误为已解决
  --resolve-all-matching  批量标记当前查询匹配的错误为已解决
  --json                  以 JSON 格式输出
  --help, -h              显示帮助信息
`);
}

// ============================================================================
// 构建 MongoDB 查询过滤器
// ============================================================================

function buildFilter(opts: CliOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (opts.resolvedFilter === 'unresolved') {
    filter.resolved = false;
  } else if (opts.resolvedFilter === 'resolved') {
    filter.resolved = true;
  }

  if (opts.source) {
    filter.source = opts.source;
  }

  if (opts.level) {
    filter.level = opts.level;
  }

  if (opts.search) {
    filter.$or = [
      { message: { $regex: opts.search, $options: 'i' } },
      { stack: { $regex: opts.search, $options: 'i' } },
    ];
  }

  return filter;
}

// ============================================================================
// 格式化辅助
// ============================================================================

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function truncate(str: string, max: number): string {
  if (!str) return '';
  const s = String(str).replace(/\n/g, ' ');
  return s.length > max ? s.slice(0, max) + '...' : s;
}

// ============================================================================
// 操作函数
// ============================================================================

async function queryErrors(opts: CliOptions): Promise<void> {
  const model = getErrorLogModel();
  if (!model) {
    console.error('错误数据库未连接，无法查询');
    process.exit(1);
  }

  const filter = buildFilter(opts);
  const docs = await model
    .find(filter)
    .sort({ lastOccurredAt: -1 })
    .limit(opts.limit)
    .lean();

  if (docs.length === 0) {
    if (opts.json) {
      console.log('[]');
    } else {
      console.log('没有匹配的错误记录。');
    }
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(docs, null, 2));
    return;
  }

  console.log(`\n共 ${docs.length} 条错误（按最近发生时间倒序）\n`);
  console.log(
    'ID         | 来源   | 级别   | 次数 | 最近发生时间          | 消息'
  );
  console.log('-'.repeat(120));

  for (const doc of docs) {
    const id = String(doc._id).slice(0, 10).padEnd(10);
    const source = String(doc.source).padEnd(6);
    const level = String(doc.level).padEnd(6);
    const count = String(doc.count).padEnd(4);
    const time = formatTime(doc.lastOccurredAt);
    const msg = truncate(doc.message, 60);
    console.log(`${id} | ${source} | ${level} | ${count} | ${time} | ${msg}`);
  }
  console.log('');
}

async function showDetail(id: string, json: boolean): Promise<void> {
  const model = getErrorLogModel();
  if (!model) {
    console.error('错误数据库未连接，无法查询');
    process.exit(1);
  }

  const doc = await model.findById(id).lean();

  if (!doc) {
    console.error(`未找到 ID 为 ${id} 的错误记录`);
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }

  const d = doc as unknown as ErrorLogDocument;
  console.log('\n=== 错误详情 ===\n');
  console.log(`ID:           ${d._id}`);
  console.log(`来源:         ${d.source}`);
  console.log(`级别:         ${d.level}`);
  console.log(`已解决:       ${d.resolved ? '是' : '否'}${d.resolvedAt ? ` (于 ${formatTime(d.resolvedAt)})` : ''}`);
  console.log(`发生次数:     ${d.count}`);
  console.log(`首次发生:     ${formatTime(d.timestamp)}`);
  console.log(`最近发生:     ${formatTime(d.lastOccurredAt)}`);
  console.log(`指纹:         ${d.fingerprint}`);
  console.log(`\n--- 消息 ---\n${d.message}`);

  if (d.stack) {
    console.log(`\n--- 堆栈 ---\n${d.stack}`);
  }

  if (d.context && Object.keys(d.context).length > 0) {
    console.log(`\n--- 上下文 ---`);
    console.log(JSON.stringify(d.context, null, 2));
  }

  if (d.clientInfo) {
    console.log(`\n--- 客户端信息 ---`);
    console.log(`URL:        ${d.clientInfo.url || '(无)'}`);
    console.log(`UserAgent:  ${d.clientInfo.userAgent || '(无)'}`);
  }
  console.log('');
}

async function resolveError(id: string): Promise<void> {
  const model = getErrorLogModel();
  if (!model) {
    console.error('错误数据库未连接，无法操作');
    process.exit(1);
  }

  const now = Date.now();
  const result = await model.updateOne(
    { _id: id },
    { $set: { resolved: true, resolvedAt: now } },
  );

  if (result.matchedCount === 0) {
    console.error(`未找到 ID 为 ${id} 的错误记录`);
    process.exit(1);
  }

  if (result.modifiedCount > 0) {
    console.log(`已将错误 ${id} 标记为已解决（于 ${formatTime(now)}）`);
  } else {
    console.log(`错误 ${id} 已经是已解决状态，无需重复标记`);
  }
}

async function resolveAllMatching(opts: CliOptions): Promise<void> {
  const model = getErrorLogModel();
  if (!model) {
    console.error('错误数据库未连接，无法操作');
    process.exit(1);
  }

  const filter = buildFilter(opts);
  const now = Date.now();
  const result = await model.updateMany(
    filter,
    { $set: { resolved: true, resolvedAt: now } },
  );

  console.log(`批量标记完成：匹配 ${result.matchedCount} 条，已更新 ${result.modifiedCount} 条`);
}

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const mongoUri = process.env.MONGODB_URI || '';

  if (!mongoUri) {
    console.error('未配置 MONGODB_URI 环境变量，无法连接错误数据库');
    process.exit(1);
  }

  try {
    await connectErrorDb(mongoUri);

    if (!getErrorLogModel()) {
      console.error('错误数据库连接失败，请检查 MONGODB_URI 配置和数据库连通性');
      process.exit(1);
    }

    if (opts.resolveId) {
      await resolveError(opts.resolveId);
    } else if (opts.resolveAllMatching) {
      await resolveAllMatching(opts);
    } else if (opts.detailId) {
      await showDetail(opts.detailId, opts.json);
    } else {
      await queryErrors(opts);
    }
  } catch (error) {
    console.error('执行失败:', (error as Error).message);
    process.exit(1);
  } finally {
    await disconnectErrorDb();
  }
}

main().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
