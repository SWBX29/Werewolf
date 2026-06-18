# Tasks

- [x] Task 1: 修改 shared/types.ts 类型定义
  - [x] 1.1 ActionLog 接口移除 id 字段
  - [x] 1.2 新增 WolfChatLog 接口（id、roomCode、gameId、round、senderSeat、senderNickname、content、timestamp、visibility）
  - [x] 1.3 ADMIN_FETCH_LOGS 消息类型增加 actorSeat、actionTypes、phases、page、pageSize 可选参数
  - [x] 1.4 ADMIN_LOGS_RESULT 消息类型增加 page、pageSize、totalPages 字段

- [x] Task 2: 修改 server/src/models.ts 数据模型
  - [x] 2.1 GameLogSchema 的 detail 字段从 Map 改为 Schema.Types.Mixed
  - [x] 2.2 GameLogDocument 的 detail 字段类型从 Map<string, unknown> 改为 Record<string, unknown>
  - [x] 2.3 新增 WolfChatLogSchema 和 WolfChatLogModel（独立集合 wolf_chat_logs）
  - [x] 2.4 RoomSchema 移除 wolfChatMessages 字段
  - [x] 2.5 RoomDocument 接口移除 wolfChatMessages 字段
  - [x] 2.6 导出 WolfChatLogModel

- [x] Task 3: 修改 server/src/GameEngine.ts 日志写入逻辑
  - [x] 3.1 移除 generateLogId 方法
  - [x] 3.2 logAction 方法不再设置 id 字段
  - [x] 3.3 狼人聊天消息不再 push 到 state.wolfChatMessages，改为通过回调外泄
  - [x] 3.4 getWolfChatHistory 方法改为返回空数组（实际查询由外层从 WolfChatLogModel 获取）

- [x] Task 4: 修改 server/src/LobbyManager.ts
  - [x] 4.1 onLog 调用点适配 ActionLog 无 id 字段
  - [x] 4.2 狼人聊天回调适配：将消息写入 WolfChatLogModel

- [x] Task 5: 修改 server/src/server.ts
  - [x] 5.1 移除 convertDetailToPlainObject 函数
  - [x] 5.2 persistLog 函数适配：detail 直接赋值，移除类型转换
  - [x] 5.3 handleAdminFetchLogs 增加 actorSeat、actionTypes 和 phases 过滤
  - [x] 5.4 handleAdminFetchLogs 实现分页（page、pageSize）
  - [x] 5.5 日志 DTO 映射中 id 改为 doc._id.toString()，detail 直接使用 doc.detail
  - [x] 5.6 狼人聊天回调改为写入 WolfChatLogModel
  - [x] 5.7 房间状态序列化中 wolfChatMessages 从 WolfChatLogModel 查询
  - [x] 5.8 handleWolfChat 中消息持久化改为写入 WolfChatLogModel
  - [x] 5.9 handleSpeechContent 中增加 logAction 记录 SPEECH_CONTENT 日志
  - [x] 5.10 handleDeadChat 中增加 logAction 记录 DEAD_CHAT_MESSAGE 日志

- [x] Task 6: 修改客户端 AdminDashboard.tsx
  - [x] 6.1 日志查询增加 actionType 和 phase 过滤 UI
  - [x] 6.2 增加按玩家/系统筛选 UI（actorSeat 下拉选择）
  - [x] 6.3 增加分页控件
  - [x] 6.4 适配新的 ADMIN_LOGS_RESULT 响应格式

- [x] Task 7: 数据迁移脚本
  - [x] 7.1 编写迁移脚本：将现有 RoomModel 中的 wolfChatMessages 迁移到 wolf_chat_logs 集合
  - [x] 7.2 编写迁移脚本：将现有 game_logs 中 detail 为 Map 的文档转换为普通对象

# Task Dependencies
- [Task 2] depends on [Task 1] — 类型定义先于模型修改
- [Task 3] depends on [Task 1] — GameEngine 依赖 ActionLog 类型
- [Task 4] depends on [Task 2] — LobbyManager 依赖新模型
- [Task 5] depends on [Task 2, Task 3] — server.ts 依赖新模型和 GameEngine 变更
- [Task 6] depends on [Task 1] — 客户端依赖新类型定义
- [Task 7] depends on [Task 2, Task 5] — 迁移脚本依赖最终模型
- [Task 1] 无依赖，可先行
- [Task 6] 与 [Task 3-5] 可并行
