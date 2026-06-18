# 重构日志数据库系统 Spec

## Why
当前日志系统存在多个架构问题：`detail` 字段使用 Map 类型导致序列化需要 `convertDetailToPlainObject` 兜底；狼人聊天消息嵌入在 RoomModel 中导致房间文档膨胀且无法独立查询；发言内容和死者聊天仅广播未持久化，复盘时无法还原完整游戏过程；Admin 日志查询缺少按房间/玩家为单位的过滤和分页支持；日志 ID 生成方式与 MongoDB _id 重复冗余。

## What Changes
- 将 `detail` 字段从 `Map<string, unknown>` 改为 `Record<string, unknown>`（普通对象），消除 `convertDetailToPlainObject` 兜底逻辑
- 将狼人聊天消息从 RoomModel 嵌入数组迁移到独立的 `WolfChatLogModel` 集合
- 新增发言内容（SPEECH_CONTENT）和死者聊天（DEAD_CHAT_MESSAGE）的持久化记录
- 为 Admin 日志查询增加以房间号为主单位、以玩家/系统为基本单位的查询能力及分页支持
- 移除冗余的 `id` 字段（使用 MongoDB `_id` 即可）
- 将 `GameLogDocument` 的 `detail` Schema 从 `Map` 改为 `Schema.Types.Mixed`

## Impact
- Affected specs: Admin 后台日志查询、狼人聊天持久化、发言内容持久化、死者聊天持久化、房间状态序列化
- Affected code:
  - `server/src/models.ts` — GameLogSchema、RoomSchema、新增 WolfChatLogSchema
  - `server/src/server.ts` — persistLog、handleAdminFetchLogs、convertDetailToPlainObject、狼人聊天回调、发言处理、死者聊天处理
  - `server/src/GameEngine.ts` — logAction、generateLogId、狼人聊天相关
  - `server/src/LobbyManager.ts` — onLog 调用点、狼人聊天回调
  - `shared/types.ts` — ActionLog、ActionLogDTO、ActionType、新增 WolfChatLog 接口
  - `client/src/components/AdminDashboard.tsx` — 日志查询参数、分页 UI、按玩家筛选

## ADDED Requirements

### Requirement: 狼人聊天独立集合
系统 SHALL 将狼人聊天消息存储在独立的 `wolf_chat_logs` 集合中，而非嵌入 RoomModel。

#### Scenario: 狼人发送聊天消息
- **WHEN** 狼人在夜间聊天区发送消息
- **THEN** 消息被写入 `wolf_chat_logs` 集合，包含 roomCode、gameId、round、senderSeat、senderNickname、content、timestamp 字段
- **AND** RoomModel 中的 wolfChatMessages 数组不再增长

#### Scenario: 查询狼人聊天历史
- **WHEN** 客户端请求狼人聊天历史
- **THEN** 从 `wolf_chat_logs` 集合按 roomCode + round 查询，而非从 RoomModel 读取

### Requirement: 发言内容持久化
系统 SHALL 将白天发言内容持久化到 game_logs 集合，确保复盘时可还原完整发言。

#### Scenario: 玩家发言
- **WHEN** 玩家在白天发言阶段发送发言内容
- **THEN** 系统在广播发言的同时，通过 logAction 记录一条 actionType 为 SPEECH_CONTENT 的日志
- **AND** 日志的 actorSeat/actorNickname 为发言玩家，detail.content 为发言文本内容

#### Scenario: 查询某房间所有发言
- **WHEN** Admin 按房间号查询 actionType 为 SPEECH_CONTENT 的日志
- **THEN** 返回该房间所有玩家的发言记录，按时间排序

### Requirement: 死者聊天持久化
系统 SHALL 将死者聊天消息持久化到 game_logs 集合。

#### Scenario: 死者发送聊天消息
- **WHEN** 死亡玩家发送死者聊天消息
- **THEN** 系统在广播消息的同时，通过 logAction 记录一条 actionType 为 DEAD_CHAT_MESSAGE 的日志
- **AND** 日志的 actorSeat/actorNickname 为发送者，detail.content 为消息文本内容

### Requirement: Admin 日志高级查询
系统 SHALL 支持 Admin 后台以房间号为主单位、以玩家/系统为基本单位进行日志查询，并支持分页。

#### Scenario: 按房间号查询全部日志
- **WHEN** Admin 请求日志时指定 roomCode
- **THEN** 返回该房间的所有日志（系统操作、玩家操作、发言内容、狼人聊天等），按时间排序

#### Scenario: 按玩家/系统筛选
- **WHEN** Admin 请求日志时指定 actorSeat（0 表示系统，1-N 表示对应座位号玩家）
- **THEN** 仅返回该玩家（或系统）相关的日志

#### Scenario: 按 actionType 过滤
- **WHEN** Admin 请求日志时指定 actionTypes 数组
- **THEN** 仅返回匹配指定 actionType 的日志

#### Scenario: 按 phase 过滤
- **WHEN** Admin 请求日志时指定 phases 数组
- **THEN** 仅返回匹配指定 phase 的日志

#### Scenario: 分页查询
- **WHEN** Admin 请求日志时指定 page 和 pageSize
- **THEN** 返回对应页的日志数据和总数

### Requirement: WolfChatLog 共享类型
系统 SHALL 在 shared/types.ts 中定义 WolfChatLog 接口，供服务端和客户端共用。

#### Scenario: 类型定义
- **WHEN** 定义狼人聊天日志类型
- **THEN** WolfChatLog 接口包含 id、roomCode、gameId、round、senderSeat、senderNickname、content、timestamp、visibility 字段

## MODIFIED Requirements

### Requirement: GameLog detail 字段类型
GameLogDocument 的 `detail` 字段 SHALL 使用 `Record<string, unknown>`（Schema.Types.Mixed）而非 `Map<string, unknown>`。

- Schema 定义从 `{ type: Map, of: Schema.Types.Mixed }` 改为 `{ type: Schema.Types.Mixed, default: {} }`
- `convertDetailToPlainObject` 函数 SHALL 被移除，所有读取日志处直接使用 `doc.detail`
- `persistLog` 函数中 `detail: log.detail as Record<string, any>` 的类型转换不再需要

### Requirement: ActionLog 移除冗余 id 字段
ActionLog 接口 SHALL 移除 `id` 字段，使用 MongoDB 自动生成的 `_id` 作为唯一标识。

- ActionLog 接口移除 `id` 字段
- ActionLogDTO 的 `id` 字段改为从 `_id.toString()` 获取
- GameEngine 的 `generateLogId` 方法移除
- `logAction` 方法不再生成 id

### Requirement: RoomModel 移除 wolfChatMessages 嵌入数组
RoomDocument 接口和 RoomSchema SHALL 移除 `wolfChatMessages` 字段。

- RoomDocument 接口移除 `wolfChatMessages: WolfChatMessage[]`
- RoomSchema 移除 `wolfChatMessages: [WolfChatMessageSubSchema]`
- WolfChatMessageSubSchema 保留但仅用于新的 WolfChatLogSchema
- 房间状态序列化中 wolfChatMessages 改为从 WolfChatLogModel 查询

### Requirement: Admin 日志查询消息类型扩展
ADMIN_FETCH_LOGS 消息 SHALL 支持 actorSeat、actionTypes、phases、page、pageSize 参数。

- 新增 actorSeat: number 可选参数（0=系统，1-N=玩家座位号）
- 新增 actionTypes: ActionType[] 可选参数
- 新增 phases: GamePhase[] 可选参数
- 新增 page: number 可选参数（默认 1）
- 新增 pageSize: number 可选参数（默认 50）
- 现有 limit 参数废弃，由 pageSize 替代

## REMOVED Requirements

### Requirement: convertDetailToPlainObject 函数
**Reason**: detail 字段改为 Schema.Types.Mixed 后，MongoDB 查询结果直接为普通对象，无需转换。
**Migration**: 所有调用 `convertDetailToPlainObject(doc.detail)` 的地方改为直接使用 `doc.detail || {}`。

### Requirement: GameEngine.generateLogId 方法
**Reason**: 使用 MongoDB _id 作为唯一标识，无需手动生成。
**Migration**: 移除 generateLogId 方法，logAction 不再设置 id 字段。
