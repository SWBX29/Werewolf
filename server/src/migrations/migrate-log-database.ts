/**
 * ============================================================================
 * 狼人杀联机游戏 — 日志数据库迁移脚本
 * ============================================================================
 *
 * 迁移任务：
 *   1. 将 Room 文档中的 wolfChatMessages 数组迁移到 wolf_chat_logs 集合
 *   2. 将 game_logs 中 Map 类型的 detail 字段转换为普通对象
 *
 * 运行方式：
 *   npx tsx server/src/migrations/migrate-log-database.ts
 *
 * 特性：
 *   - 幂等：可安全重复运行
 *   - 批量处理：每批 100 条文档
 *   - 完整的进度日志和错误处理
 * ============================================================================
 */

import mongoose from 'mongoose';
import { RoomModel, GameLogModel, WolfChatLogModel } from '../models.js';

const BATCH_SIZE = 100;

let migrationRunning = false;

function convertMapToObjectRecursive(obj: unknown): unknown {
  if (obj instanceof Map) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of obj.entries()) {
      result[key] = convertMapToObjectRecursive(value);
    }
    return result;
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key.startsWith('$')) continue;
      result[key] = convertMapToObjectRecursive(value);
    }
    return result;
  }
  if (Array.isArray(obj)) {
    return obj.map(convertMapToObjectRecursive);
  }
  return obj;
}

/**
 * 迁移任务 1：将 Room 文档中的 wolfChatMessages 迁移到 wolf_chat_logs 集合
 *
 * 流程：
 *   - 查询所有 wolfChatMessages 数组长度 > 0 的 Room 文档
 *   - 对每个 room，遍历 wolfChatMessages，创建 WolfChatLog 文档
 *   - 迁移成功后清空 Room 的 wolfChatMessages 数组
 *   - 幂等：已清空的 room 不会被重复处理
 */
async function migrateWolfChatMessages(): Promise<void> {
  console.log('[迁移1] 开始迁移 wolfChatMessages → wolf_chat_logs ...');

  let totalRoomsProcessed = 0;
  let totalMessagesMigrated = 0;

  // 使用原生 MongoDB 驱动查询，因为 wolfChatMessages 不在当前 Mongoose Schema 中
  const db = mongoose.connection.db!;
  const roomsCollection = db.collection('rooms');

  // 查询所有 wolfChatMessages 数组非空的文档
  const roomsWithMessages = await roomsCollection
    .find({ wolfChatMessages: { $exists: true, $ne: [], $not: { $size: 0 } } })
    .toArray();

  console.log(`[迁移1] 找到 ${roomsWithMessages.length} 个包含 wolfChatMessages 的房间`);

  for (const room of roomsWithMessages) {
    const messages = room.wolfChatMessages as Array<{
      id?: string;
      roomCode?: string;
      round: number;
      senderSeat: number;
      senderNickname: string;
      content: string;
      timestamp: number;
      visibility: string;
    }>;

    if (!Array.isArray(messages) || messages.length === 0) {
      continue;
    }

    // 构建 gameId：使用 roomCode_startedAt 格式
    const gameId = room.startedAt
      ? `${room.roomCode}_${room.startedAt}`
      : `${room.roomCode}_unknown`;

    // 批量构建 WolfChatLog 文档
    const wolfChatLogDocs = messages.map((msg) => ({
      roomCode: msg.roomCode || room.roomCode,
      gameId,
      round: msg.round,
      senderSeat: msg.senderSeat,
      senderNickname: msg.senderNickname,
      content: msg.content,
      timestamp: msg.timestamp,
      visibility: msg.visibility || 'wolf_only',
    }));

    // 幂等检查：检查是否已经迁移过该 room 的消息
    // 通过 gameId + timestamp 组合判断是否已存在
    const existingCount = await WolfChatLogModel.countDocuments({
      gameId,
      timestamp: { $in: wolfChatLogDocs.map((d) => d.timestamp) },
    });

    if (existingCount === wolfChatLogDocs.length) {
      console.log(
        `[迁移1] 房间 ${room.roomCode} (gameId: ${gameId}) 的消息已全部迁移，跳过写入，仅清理源数据`,
      );
    } else {
      // 使用 insertMany 批量插入，忽略重复键错误
      try {
        await WolfChatLogModel.insertMany(wolfChatLogDocs, { ordered: false });
      } catch (err: unknown) {
        // insertMany 在 ordered:false 时，重复键错误不会中断其他文档插入
        if (err instanceof Error && 'code' in err && (err as { code: number }).code === 11000) {
          console.log(
            `[迁移1] 房间 ${room.roomCode} 部分消息已存在（重复键），已跳过重复项`,
          );
        } else {
          throw err;
        }
      }
    }

    totalMessagesMigrated += wolfChatLogDocs.length;

    // 清空 Room 文档中的 wolfChatMessages 数组
    await roomsCollection.updateOne(
      { _id: room._id },
      { $set: { wolfChatMessages: [] } },
    );

    totalRoomsProcessed++;
    if (totalRoomsProcessed % BATCH_SIZE === 0) {
      console.log(
        `[迁移1] 进度：已处理 ${totalRoomsProcessed}/${roomsWithMessages.length} 个房间，已迁移 ${totalMessagesMigrated} 条消息`,
      );
    }
  }

  console.log(
    `[迁移1] 完成！共处理 ${totalRoomsProcessed} 个房间，迁移 ${totalMessagesMigrated} 条消息`,
  );
}

/**
 * 迁移任务 2：将 game_logs 中 Map 类型的 detail 字段转换为普通对象
 *
 * 背景：
 *   Mongoose 的 Map 类型在 MongoDB 中以特殊格式存储（带 $__dataType 等标记），
 *   这会导致查询和序列化时出现问题。需要将其转换为普通对象。
 *
 * 幂等性：
 *   - 已转换为普通对象的文档不会被重复处理
 *   - 通过检查 detail 是否包含 Map 标记来判断
 */
async function convertGameLogDetailMapToObject(): Promise<void> {
  console.log('[迁移2] 开始转换 game_logs 中 Map 类型的 detail 字段 ...');

  let totalConverted = 0;
  let skipCount = 0;

  // 查询 detail 字段中包含 Map 标记的文档
  // MongoDB 中 Map 类型可能以多种方式存储：
  // 1. 带有 $__dataType: 'Map' 标记
  // 2. 作为嵌套对象但没有 Map 标记但内部有特殊结构
  // 我们用原生集合来检测和处理
  const db = mongoose.connection.db!;
  const gameLogsCollection = db.collection('game_logs');

  // 查找 detail 为 Map 类型的文档
  // Map 在 MongoDB 中存储时，可能包含 $__dataType 字段，或者 detail 本身就是对象但需要转换
  // 更可靠的方式：查找 detail 中包含 $__dataType 的文档
  const mapQuery = {
    $or: [
      { 'detail.$__dataType': { $exists: true } },
      { 'detail.$__map': { $exists: true } },
    ],
  };

  const totalCount = await gameLogsCollection.countDocuments(mapQuery);
  console.log(`[迁移2] 找到 ${totalCount} 个包含 Map 类型 detail 的 game_logs 文档`);

  if (totalCount === 0) {
    // 也尝试查找 detail 为 null 或非对象的文档（可能需要修复）
    console.log('[迁移2] 未发现 Map 标记的文档，尝试扫描所有文档检查 detail 类型 ...');

    // 使用 Mongoose Model 查询，逐批检查 detail 是否为 Map 实例
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const docs = await GameLogModel.find({})
        .select('detail')
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean(false); // 不使用 lean，以便获取 Mongoose 文档对象

      if (docs.length === 0) {
        hasMore = false;
        break;
      }

      for (const doc of docs) {
        const detail = doc.get('detail');
        if (detail instanceof Map) {
          const plainObj = convertMapToObjectRecursive(detail);

          await gameLogsCollection.updateOne(
            { _id: doc._id },
            { $set: { detail: plainObj } },
          );

          totalConverted++;

          if (totalConverted % BATCH_SIZE === 0) {
            console.log(`[迁移2] 进度：已转换 ${totalConverted} 个文档`);
          }
        } else {
          skipCount++;
        }
      }

      skip += docs.length;

      if (docs.length < BATCH_SIZE) {
        hasMore = false;
      }
    }
  } else {
    // 处理带 Map 标记的文档
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const docs = await gameLogsCollection
        .find(mapQuery)
        .skip(skip)
        .limit(BATCH_SIZE)
        .toArray();

      if (docs.length === 0) {
        hasMore = false;
        break;
      }

      for (const doc of docs) {
        let detail = doc.detail;

        if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
          const cleanDetail = convertMapToObjectRecursive(detail);

          await gameLogsCollection.updateOne(
            { _id: doc._id },
            { $set: { detail: cleanDetail } },
          );

          totalConverted++;
        }
      }

      skip += docs.length;

      if (docs.length < BATCH_SIZE) {
        hasMore = false;
      }

      console.log(`[迁移2] 进度：已转换 ${totalConverted}/${totalCount} 个文档`);
    }
  }

  console.log(
    `[迁移2] 完成！共转换 ${totalConverted} 个文档，跳过 ${skipCount} 个无需转换的文档`,
  );
}

/**
 * 执行全部迁移任务
 */
export async function runMigration(): Promise<void> {
  // Bug 155: 并发保护，防止多个迁移进程同时执行
  if (migrationRunning) {
    console.error('[迁移] 另一个迁移任务正在执行中，跳过本次执行');
    return;
  }
  migrationRunning = true;

  console.log('========================================');
  console.log('  日志数据库迁移脚本');
  console.log(`  开始时间: ${new Date().toISOString()}`);
  console.log('========================================');

  try {
    // Bug 153: 检查目标集合是否已存在，避免重复创建
    const db = mongoose.connection.db!;
    const collections = await db.listCollections().toArray();
    const existingNames = new Set(collections.map((c) => c.name));

    if (!existingNames.has('wolf_chat_logs')) {
      console.log('[迁移] wolf_chat_logs 集合不存在，将在首次写入时自动创建');
    } else {
      console.log('[迁移] wolf_chat_logs 集合已存在');
    }

    if (!existingNames.has('game_logs')) {
      console.log('[迁移] game_logs 集合不存在，将在首次写入时自动创建');
    } else {
      console.log('[迁移] game_logs 集合已存在');
      // 检查已有索引，避免重复创建
      const existingIndexes = await db.collection('game_logs').indexes();
      const indexNames = new Set(existingIndexes.map((idx: any) => idx.name));
      const expectedIndexes = [
        'roomCode_1_timestamp_-1',
        'gameId_1_timestamp_-1',
        'actionType_1_timestamp_-1',
        'timestamp_-1',
        'roomCode_1_round_1_phase_1',
      ];
      const missingIndexes = expectedIndexes.filter((name) => !indexNames.has(name));
      if (missingIndexes.length > 0) {
        console.log(`[迁移] game_logs 缺少索引: ${missingIndexes.join(', ')}，将在 Mongoose 同步时自动创建`);
      }
    }

    // 迁移任务 1：wolfChatMessages → wolf_chat_logs
    await migrateWolfChatMessages();

    console.log('');

    // 迁移任务 2：game_logs detail Map → 普通对象
    await convertGameLogDetailMapToObject();

    console.log('');
    console.log('========================================');
    console.log('  全部迁移任务完成！');
    console.log(`  结束时间: ${new Date().toISOString()}`);
    console.log('========================================');
  } catch (error) {
    console.error('[迁移] 发生错误:', error);
    throw error;
  } finally {
    migrationRunning = false;
  }
}
