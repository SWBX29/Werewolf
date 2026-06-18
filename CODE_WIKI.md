# 狼人杀联机游戏 — Code Wiki

## 项目概述

**狼人杀联机游戏** 是一个联机狼人杀游戏引擎，支持多人在线实时对战。项目采用 npm workspaces 管理 `shared`、`server`、`client` 三个工作区，前后端通过 WebSocket 实现实时通信，服务端统一负责规则校验、状态推进和 DTO 脱敏广播，客户端负责 UI 展示与用户操作提交，并集成 ZEGO WebRTC 实时语音服务。

### 文档维护原则

- 本文件 [CODE_WIKI.md](file:///e:/GitHub/langrensha/CODE_WIKI.md) 是本仓库唯一的说明性文档入口。
- 以后所有更新说明、阶段汇总、Wiki、PRD、技术方案、验收清单、复盘记录、运行说明、架构说明等项目说明性内容，均只维护在本文件中。
- 禁止再新建 `CHANGELOG*.md`、`README*.md`、`docs/**/*.md`、`.trae/specs/**/*.md`、`.trae/documents/**/*.md` 等分散说明文档，除非用户明确要求创建独立交付文件。
- `.trae/skills/**/SKILL.md` 属于本地技能定义文件，不属于项目说明性文档，不参与合并删除。

### 当前系统状态快照（2026-06-09）

| 维度 | 当前状态 |
|------|----------|
| 工作区 | 根项目通过 npm workspaces 管理 `shared`、`server`、`client` |
| 唯一说明文档 | 仅维护 `CODE_WIKI.md`；仓库内其他项目说明性 Markdown 已合并删除 |
| 共享类型 | `shared/types.ts` 统一定义角色、村规、阶段、DTO、WebSocket 消息、日志类型 |
| 服务端 | `server/src/server.ts` 负责 HTTP + WebSocket + 静态资源 + ZEGO Token + FRP 管理入口 |
| 游戏引擎 | `server/src/GameEngine.ts` 负责状态机、夜间行动、白天发言/投票、警长、技能、胜负判定 |
| 房间管理 | `server/src/LobbyManager.ts` 负责连接上下文、房间生命周期、断线重连、离线清理 |
| 数据层 | `server/src/models.ts` 定义 `Room` 与 `GameLog` 两个 MongoDB 集合，严格 Schema 校验 |
| 客户端 | `client/src/useGameStore.ts` 管理 WebSocket 状态与服务端消息；`client/src/store/useVoiceStore.ts` 管理语音状态 |
| 构建 | `npm run build` 顺序构建 `shared → server → client` |
| 开发端口 | 后端 `3001`，前端 Vite `5180` |
| 语音配置 | 服务端代码实际读取 `ZEGO_APP_ID` 与 `ZEGO_SERVER_SECRET` |
| 已知实现差异 | 自动重连当前代码为固定 2.5 秒/50 次，但项目约束要求固定 1.5 秒；后续应修复实现 |

### 核心特性

- **完整游戏流程**：支持从大厅到游戏结束的全流程，含警长选举、警徽移交等高级机制
- **动态村规配置**：支持 20+ 种村规规则，法官可自定义
- **实时语音**：集成 ZEGO 实时语音，支持白天全局语音、夜晚狼人专属语音、死亡玩家语音、夜晚阶段自动断开普通玩家连接以节省时长
- **防作弊机制**：零信任架构，服务端强制校验，DTO 脱敏广播
- **断线重连**：支持玩家断线后恢复会话（TCP 半开连接强制替换）
- **复盘系统**：完整的操作日志，支持 Admin 后台查询
- **多平台支持**：支持 Web 浏览器访问
- **13 种角色**：村民至机械狼，涵盖经典与进阶变体

---

## 项目架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         客户端层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  HomeView    │  │  GameView    │  │AdminDashboard│      │
│  │  (大厅界面)   │  │  (游戏界面)   │  │  (管理后台)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                    ┌───────▼────────┐                        │
│                    │  Zustand Store │                        │
│                    │  (全局状态管理) │                        │
│                    └───────┬────────┘                        │
│                            │                                 │
│                    ┌───────▼────────┐                        │
│                    │  React 组件    │                        │
│                    │  (UI 渲染)     │                        │
│                    └───────┬────────┘                        │
│                            │                                 │
│              ┌─────────────▼──────────────┐                  │
│              │     ZEGO 语音模块           │                  │
│              │  ZegoVoiceService + Store  │                  │
│              └─────────────┬──────────────┘                  │
└────────────────────────────┼─────────────────────────────────┘
                             │ WebSocket + WebRTC
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                         服务端层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ LobbyManager │  │ GameEngine   │  │ZegoTokenSvc  │      │
│  │ (大厅管理)    │  │ (游戏引擎)    │  │ (语音Token)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                         数据层                                │
│  ┌──────────────┐  ┌──────────────────┐                    │
│  │  MongoDB     │  │  Room(内存+持久)  │                    │
│  │  (日志/快照)  │  │  GameEngine管理  │                    │
│  └──────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │  ZEGO 云端   │
                         │  实时语音服务 │
                         └──────────────┘
                              ↑
                         ┌────┴────┐
                         │ WebRTC  │
                         └─────────┘
```

### 架构分层

| 层级 | 说明 |
|------|------|
| **共享类型层** (shared/) | 前后端共用的类型定义、枚举、常量，确保类型契约一致 |
| **服务端层** (server/) | WebSocket 服务器、游戏引擎、大厅管理、数据持久化、Token 生成 |
| **客户端层** (client/) | React UI、Zustand 状态管理、ZEGO 语音集成 |
| **数据层** (MongoDB) | 房间状态快照、操作日志持久化 |

### 技术栈

| 模块 | 技术选型 | 版本 |
|------|----------|------|
| **前端框架** | React | 18.3.1 |
| **构建工具** | Vite | 5.2.10 |
| **状态管理** | Zustand | 4.5.2 |
| **样式** | Tailwind CSS | 3.4.3 |
| **语音 SDK** | ZEGO Express Engine WebRTC | 3.12.0 |
| **二维码** | qrcode | 1.5.3 |
| **服务端** | Node.js + WebSocket (ws) | 8.16.0 |
| **数据库** | MongoDB (Mongoose) | 8.3.2 |
| **环境变量** | dotenv | 16.4.5 |
| **压缩中间件** | compression | 1.8.1 |
| **语言** | TypeScript | 5.4.5 |
| **包管理** | npm workspaces | — |

---

## 目录结构

```
langrensha/
├── client/                          # 前端应用
│   ├── public/
│   │   └── sw.js                    # Service Worker (PWA 支持)
│   ├── src/
│   │   ├── components/
│   │   │   ├── game/                # 游戏相关组件
│   │   │   │   ├── day/             # 白天阶段组件
│   │   │   │   │   ├── DayAnnounce.tsx        # 天亮公告
│   │   │   │   │   ├── SheriffElection.tsx    # 警长选举
│   │   │   │   │   ├── SheriffTransfer.tsx    # 警徽移交
│   │   │   │   │   ├── SpeechPhase.tsx        # 发言阶段
│   │   │   │   │   └── VotePhase.tsx          # 投票阶段
│   │   │   │   ├── night/           # 夜间阶段组件
│   │   │   │   │   ├── NightPhase.tsx         # 夜间行动主容器
│   │   │   │   │   ├── NightWaiting.tsx       # 夜间等待
│   │   │   │   │   ├── WolfChat.tsx           # 狼人聊天
│   │   │   │   │   ├── WolfVotePanel.tsx      # 狼人投票
│   │   │   │   │   ├── SeerPanel.tsx          # 预言家
│   │   │   │   │   ├── WitchPanel.tsx         # 女巫
│   │   │   │   │   ├── GuardPanel.tsx         # 守卫
│   │   │   │   │   ├── NightmarePanel.tsx     # 噩梦之影
│   │   │   │   │   └── MechanicalWolfPanel.tsx# 机械狼
│   │   │   │   ├── skills/           # 特殊技能组件
│   │   │   │   │   ├── HunterGun.tsx          # 猎人开枪
│   │   │   │   │   ├── WolfKingGun.tsx        # 狼王开枪
│   │   │   │   │   ├── WhiteWolfExplode.tsx   # 白狼王自爆
│   │   │   │   │   ├── IdiotReveal.tsx        # 白痴翻牌
│   │   │   │   │   └── KnightDuel.tsx         # 骑士决斗
│   │   │   │   ├── AppealButton.tsx
│   │   │   │   ├── ConfirmDialog.tsx
│   │   │   │   ├── CountdownTimer.tsx
│   │   │   │   ├── DeadChat.tsx
│   │   │   │   ├── GameOver.tsx
│   │   │   │   ├── GameView.tsx               # 游戏主界面容器
│   │   │   │   ├── JudgeActionToast.tsx       # 法官操作提示
│   │   │   │   ├── PlayerList.tsx
│   │   │   │   ├── RoleReveal.tsx
│   │   │   │   ├── SpectatorMode.tsx
│   │   │   │   ├── StatusBar.tsx
│   │   │   │   ├── TargetSelector.tsx
│   │   │   │   ├── VoiceControlBar.tsx        # 语音控制栏
│   │   │   │   └── VoiceInfoPanel.tsx         # 语音信息面板
│   │   │   ├── AdminDashboard.tsx    # 管理员后台
│   │   │   ├── HomeView.tsx          # 主页/大厅
│   │   │   └── JudgeConsole.tsx      # 法官控制台
│   │   ├── hooks/
│   │   │   └── useZegoVoice.ts       # 语音 React Hook
│   │   ├── services/
│   │   │   └── zego.ts               # ZEGO 语音服务封装
│   │   ├── store/
│   │   │   └── useVoiceStore.ts      # 语音状态管理 (Zustand)
│   │   ├── App.tsx                   # 根组件
│   │   ├── main.tsx                  # 入口
│   │   ├── useGameStore.ts           # 游戏全局状态 (Zustand)
│   │   ├── index.css
│   │   └── vite-env.d.ts
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── server/                           # 后端服务
│   ├── src/
│   │   ├── services/
│   │   │   └── zegoTokenService.ts   # ZEGO Token 生成
│   │   ├── GameEngine.ts             # 游戏引擎核心
│   │   ├── LobbyManager.ts           # 大厅/房间管理器
│   │   ├── models.ts                 # MongoDB 数据模型
│   │   └── server.ts                 # 服务端入口 + WebSocket 路由
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                           # 共享类型
│   ├── types.ts                      # 全局类型定义
│   ├── types/
│   │   └── zego.ts                   # ZEGO 语音类型
│   ├── package.json
│   └── tsconfig.json
│
├── .trae/                            # AI 辅助配置
│   └── skills/
│       └── langrensha-project-manager/
│           └── SKILL.md              # 项目管理技能定义
├── .env.example                      # 环境变量模板
├── CODE_WIKI.md                      # 唯一说明性文档（含 Wiki、变更、计划、需求、验收归档）
├── package.json                      # 根 package (npm workspaces)
└── package-lock.json
```

---

## 核心模块详解

### 1. 共享层 (shared/)

**类型系统** 定义在 [shared/types.ts](file:///e:/GitHub/langrensha/shared/types.ts) 中，是整个项目的类型基石。

#### 1.1 角色系统 (13 种角色)

| 角色 ID | 阵营 | 说明 |
|----------|------|------|
| `villager` | 好人 | 无特殊技能，依靠投票 |
| `seer` | 好人 | 每晚查验一人阵营 |
| `witch` | 好人 | 解药/毒药各一 |
| `hunter` | 好人 | 死亡可开枪带走一人 |
| `guard` | 守卫 | 每晚守护一人（不可重复） |
| `idiot` | 好人 | 被票出可翻牌免死 |
| `knight` | 好人 | 白天可决斗验狼 |
| `werewolf` | 狼人 | 每晚共同刀人 |
| `white_wolf_king` | 狼人 | 白天自爆带走一人 |
| `wolf_king` | 狼人 | 死亡可开枪带走一人 |
| `nightmare_shadow` | 狼人 | 每晚恐惧一人封印技能 |
| `hidden_wolf` | 狼人 | 隐狼，被查为好人 |
| `mechanical_wolf` | 狼人 | 模仿目标技能 |

辅助判断函数：
- `isEvilRole(roleId)` — 判断是否狼人阵营
- `isHiddenWolf(roleId)` — 判断是否隐狼
- `isSharedWolfRole(roleId, sharedWolfRoles?)` — 判断是否属于"共同睁眼的狼人"（参与刀人投票）
- `hasNightAction(roleId)` — 判断是否有夜间行动能力
- `isImitationFailRole(roleId)` — 判断是否为模仿失败角色（平民/骑士/白痴）

#### 1.2 游戏状态机

完整的阶段流转：

```
LOBBY → ROLE_REVEAL → PRE_NIGHT → NIGHT → NIGHT_SETTLEMENT
→ DAY_ANNOUNCE → [SHERIFF_ELECTION] → [SHERIFF_TRANSFER]
→ DAY_SPEECH → PRE_VOTE_WAIT → DAY_VOTE → DAY_SETTLEMENT → NIGHT → ...
                                           → PK_VOTE (平票) → ...
                                            → GAME_OVER
```

**中断机制**：DAY_SPEECH/DAY_VOTE 阶段可被 `KNIGHT_DUEL`（骑士决斗）或 `WHITE_WOLF_EXPLODE`（白狼王自爆）中断，进入 `DAY_INTERRUPT` 处理连锁事件。

#### 1.3 规则配置 (RuleConfig)

[RuleConfig](file:///e:/GitHub/langrensha/shared/types.ts#L286) 接口定义了完整的村规配置体系，支持 20+ 项可调参数：

- **角色分布**：`roleDistribution` — 灵活配置每种角色数量
- **夜间顺序**：`nightActionOrder` — 可手动调整或使用预置模板（classic/seer_first/witch_first/chaos）
- **女巫规则**：`witchSaveSelf`（NEVER/FIRST_NIGHT/ALWAYS）、`witchCanUseBothPotions`、`guardWitchConflict`（DEATH/ALIVE）
- **骑士规则**：`knightDuelWolfKing`（CAN_SHOOT/SILENCED）、`knightDuelSuicide`（SUICIDE/REVEAL_ONLY）
- **投票规则**：`tieVoteResolution`（SKIP/PK_VOTE/RANDOM）、`revealIdentityOnDayVote`、`sheriffVoteWeight`（1/1.5/2）
- **获胜条件**：`winCondition`（SLAUGHTER_SIDE/SLAUGHTER_ALL）
- **狼人规则**：`werewolfSharedVision`（ALL_SHARE/LEADER_ONLY/NONE）、`sharedWolfRoles`
- **超时配置**：`nightActionTimeout`、`speechTimeout`、`voteTimeout`、`preVoteWaitTime`、`skillActivationTimeout`
- **发言顺序**：`speechOrderStrategy`（DEATH_LEFT/DEATH_RIGHT/SHERIFF_LEFT/SHERIFF_RIGHT/JUDGE_CUSTOM）
- **警长选举**：`sheriffElectionEnabled`

#### 1.4 WebSocket 消息协议

完整的消息协议定义在 [shared/types.ts](file:///e:/GitHub/langrensha/shared/types.ts#L930-1808) 中。

**客户端→服务端 (ClientMessageType)**：

| 类别 | 消息类型 |
|------|----------|
| 大厅 | CREATE_ROOM, JOIN_ROOM, LEAVE_ROOM, READY, START_GAME, DISSOLVE_ROOM |
| 夜间 | NIGHT_ACTION, WOLF_CHAT, WOLF_VOTE |
| 白天 | DAY_VOTE, SHERIFF_ELECTION_VOTE, SHERIFF_TRANSFER, KNIGHT_DUEL, WHITE_WOLF_EXPLODE, HUNTER_GUN, WOLF_KING_GUN |
| 发言 | SPEECH, FINISH_SPEECH |
| 法官 | UPDATE_NIGHT_ORDER, JUDGE_OVERRIDE_SETTLEMENT, JUDGE_FORCE_NEXT_PHASE, JUDGE_PAUSE, JUDGE_RESUME, JUDGE_MODIFY_SPEECH_ORDER, JUDGE_TRIGGER_KNIGHT_DUEL, JUDGE_TRIGGER_WHITE_WOLF, JUDGE_SKIP_SPEECH |
| 重连 | RECONNECT |
| 管理 | ADMIN_FETCH_LOGS, ADMIN_CLEANUP_CONFIG |
| 申诉 | APPEAL, ARBITRATION_VOTE |
| 死亡 | DEAD_CHAT |
| 心跳 | PING |

**服务端→客户端 (ServerMessageType)**：ROOM_CREATED, ROOM_STATE, PHASE_CHANGE, ROOM_DISSOLVED, NIGHT_ACTION_REQUEST, DAY_ANNOUNCE, VOTE_RESULT, KNIGHT_DUEL_RESULT, WHITE_WOLF_EXPLODE_RESULT, GAME_OVER, ERROR, JUDGE_WARNING, JUDGE_ACTION, NIGHT_COUNTDOWN, SPEECH_COUNTDOWN, RECONNECT_SUCCESS, WOLF_VOTE_UPDATE, WOLF_CHAT_HISTORY, DEAD_CHAT, SPEECH_CONTENT 等 40+ 种消息类型。

#### 1.5 防作弊 DTO

- **PlayerDTO**：[普通玩家视角](file:///e:/GitHub/langrensha/shared/types.ts#L752) — 其他玩家的 `role` 为 null，不包含夜间目标
- **JudgeRoomStateDTO**：[法官视角](file:///e:/GitHub/langrensha/shared/types.ts#L841) — 明文全量数据
- **PlayerRoomStateDTO**：[普通玩家房间状态](file:///e:/GitHub/langrensha/shared/types.ts#L792) — 脱敏后的完整房间状态
- **NightActionRequestDTO**：[夜间行动请求](file:///e:/GitHub/langrensha/shared/types.ts#L877) — 角色专属的可用目标、禁用原因、女巫专属信息、狼人投票状态等

#### 1.6 动作日志系统

[ActionLog](file:///e:/GitHub/langrensha/shared/types.ts#L1880) 接口定义游戏中每一项操作的记录结构：
- 50+ 种 ActionType 枚举值
- `nightActionOrderSnapshot` 字段用于复盘追溯
- `gameId` 字段（格式 `${roomCode}_${gameStartTimestamp}`）用于分离同房间不同局

#### 1.7 ZEGO 语音类型

[shared/types/zego.ts](file:///e:/GitHub/langrensha/shared/types/zego.ts) 定义：
- 连接状态：DISCONNECTED / CONNECTING / CONNECTED / RECONNECTING
- 麦克风/扬声器状态：MUTED / UNMUTED
- 权限状态：GRANTED / DENIED / PROMPT
- 网络质量：Excellent / Good / Medium / Poor / Die
- 事件回调：ZegoEventCallbacks、ZegoNetworkQualityEvent、ZegoErrorEvent 等

---

### 2. 服务端 (server/)

#### 2.1 server.ts — 服务端入口

路径：[server/src/server.ts](file:///e:/GitHub/langrensha/server/src/server.ts)

**职责**：WebSocket 服务器启动、消息路由、DTO 脱敏广播、HTTP 接口、生产静态资源服务、FRP 隧道进程管理。

**核心机制**：

```typescript
// 安全广播 — 法官和普通玩家看到不同的数据
function broadcastRoomState(roomCode: string): void {
  for (const client of clients) {
    if (client.isJudge) {
      message = buildJudgeRoomStateDTO(state);     // 明文全量
    } else {
      message = buildPlayerRoomStateDTO(state, id); // 脱敏
    }
    safeSend(client.ws, message);
  }
}
```

**暴露的 HTTP 接口**：
- `GET /health` — 健康检查（房间数、在线数、MongoDB 状态）
- `GET /api/zego/token?userId=xxx&roomCode=xxx` — 生成 ZEGO 实时语音 Token；真实房间场景校验 `roomCode` 和 `userId` 归属
- 静态资源服务 — 生产环境读取 `client/dist`，支持 SPA fallback、gzip/brotli 预压缩文件、哈希资源长期缓存

**FRP 隧道**：
- 通过 `MEFRP_ARGS` 控制是否启动 ME Frp 隧道
- 服务端查找路径为 `server/bin/mefrpc.exe`（当前已存在该文件）

**安全特性**：
- `timingSafeEqual` — 时序安全的字符串比较，防止 timing attack
- 环境变量路径自动发现（支持 .env 在多个位置）
- `safeSend` — 安全的 WebSocket 消息发送（忽略空连接）
- `broadcastToRoom` — 广播前检查房间存在性和 client.ws 非空

**消息路由**：根据 `ClientMessage.type` 分发到对应处理器，每个处理器调用 `LobbyManager` 或 `GameEngine` 的方法，完成后通过 `broadcastRoomState` 推送更新。

#### 2.2 LobbyManager — 大厅管理器

路径：[server/src/LobbyManager.ts](file:///e:/GitHub/langrensha/server/src/LobbyManager.ts)

**职责**：房间生命周期管理、玩家连接映射、断线重连。

**核心功能**：

| 方法 | 说明 |
|------|------|
| `registerConnection(ws)` | 注册 WebSocket 连接，分配临时 playerId |
| `unregisterConnection(ws)` | 标记断连，启动重连宽限期定时器（120 秒） |
| `createRoom(nickname, mode, config, ws, publicUrl)` | 生成 6 位房间码（密码学安全随机）并创建 GameEngine |
| `joinRoom(nickname, roomCode, ws)` | 玩家加入房间（昵称大小写不敏感去重） |
| `leaveRoom(playerId)` | 玩家离开房间 |
| `dissolveRoom(playerId)` | 法官解散房间（仅法官可操作） |
| `reconnectPlayer(playerId, roomCode, ws)` | 重连恢复会话（强制替换 TCP 半开连接） |
| `checkLobbyDisconnectedPlayers()` | 定期清理 LOBBY 阶段断连玩家（1.5 秒间隔） |

**断线重连策略**：
- 游戏进行中断连：宽限期 120 秒，保留所有游戏数据
- LOBBY 阶段断连：每 1.5 秒检查，立即移除
- 重连时强制处理 TCP 半开连接：清理旧 ws 映射、标记 disconnected=true

**ClientContext**：每个 WebSocket 连接的上下文，包含 playerId、roomCode、isJudge、ws 引用、disconnected 状态、宽限期定时器。

#### 2.3 GameEngine — 游戏引擎

路径：[server/src/GameEngine.ts](file:///e:/GitHub/langrensha/server/src/GameEngine.ts)

**职责**：游戏逻辑核心，负责完整的游戏状态机。

**核心接口**：

```typescript
class GameEngine {
  getState(): RoomState
  startGame(): GameResult                         // 分配角色，开始游戏
  submitNightAction(id, role, target, extra): NightActionResult
  submitVote(id, target): VoteResult
  finishSpeech(id): { success, error? }           // 玩家主动结束发言
  handleKnightDuel(id, target): DuelResult
  handleWhiteWolfExplode(id, target): Result
  triggerHunterGun(id, target): GunResult
  triggerWolfKingGun(id, target): GunResult
  submitWolfChat(id, content): ChatResult
  submitSheriffElectionVote(id, target): Result
  submitSheriffTransfer(id, target): Result
  overrideSettlement(id, seat, status, reason): OverrideResult
  forceNextPhase(id): ForceResult
}
```

**夜间行动子阶段**：
按 `nightActionOrder` 数组遍历（默认：噩梦之影→狼人→女巫→预言家→守卫→机械狼），每个角色有超时时间。被噩梦之影恐惧的角色显示标准倒计时，5-15 秒后自动提交空操作（防止信息泄露）。

**胜利条件**：
- 屠边（SLAUGHTER_SIDE）：消灭某一阵营全部成员
- 屠城（SLAUGHTER_ALL）：消灭所有好人

**定时器系统**：
- `setTimer(name, seconds, callback)` — 通用定时器
- `setNightActionTimer(roleId, seconds)` — 夜间行动倒计时
- `setSpeechTimer()` — 发言倒计时
- `setVoteTimer()` — 投票倒计时
- `setNightCountdownTimer(roleId, seconds)` — 夜间倒计时广播（每秒推送 NIGHT_COUNTDOWN）
- `setSpeechCountdownTimer(seat, seconds)` — 发言倒计时广播（每秒推送 SPEECH_COUNTDOWN）

**回调机制**：
- `LogCallback` — 日志写入回调（GameEngine 不直接依赖 MongoDB）
- `JudgeWarningCallback` — 法官警告推送回调
- `PhaseChangeCallback` — 阶段变更回调
- `VoteResultCallback` — 投票结果回调
- `GameOverCallback` — 游戏结束回调
- `IdentityRevealCallback` — 身份揭示回调

#### 2.4 models.ts — 数据模型

路径：[server/src/models.ts](file:///e:/GitHub/langrensha/server/src/models.ts)

**两个 MongoDB 集合**：

**Room 集合** — 房间状态持久化：
- Schema 严格对应 `RoomState` 接口（strict: true）
- 字段完全映射 Player、RuleConfig、NightSubPhase 等子文档
- 用于断线重连和服务重启恢复
- 索引：`roomCode`（唯一）

**GameLog 集合** — 操作日志：
- Schema 严格对应 `ActionLog` 接口
- 记录每项操作的详细信息，包含 `nightActionOrderSnapshot` 用于复盘追溯
- 复合索引：`roomCode + timestamp`、`gameId`、`actionType`、`roomCode + round + phase`

**MongoDB 连接管理**：
- `connectMongoDB()` — 带断线自动重连，指数退避（1s→2s→4s→最大 30s）
- `disconnectMongoDB()` — 安全断开
- `isMongoConnected()` — 连接状态查询

#### 2.5 ZegoTokenService — Token 生成

路径：[server/src/services/zegoTokenService.ts](file:///e:/GitHub/langrensha/server/src/services/zegoTokenService.ts)

实现 `generateToken04` 算法（AES-256-GCM 加密）：
- 从环境变量读取 `ZEGO_APP_ID` 和 `ZEGO_SERVER_SECRET`
- `ZEGO_SERVER_SECRET` 支持 32 字节字符串或 64 字符十六进制
- 生成有效期 1 小时的 Token04
- 延迟初始化避免启动时因缺少配置崩溃
- Token 接口要求真实房间场景必须带 `roomCode`，并校验 `userId` 是否属于该房间；仅 `preload` / `init` 用于前端预加载和初始化

---

### 3. 客户端 (client/)

#### 3.1 useGameStore.ts — 全局状态

路径：[client/src/useGameStore.ts](file:///e:/GitHub/langrensha/client/src/useGameStore.ts)

Zustand Store，前端的单一数据源。状态完全由服务端推送驱动，前端不做自主计算。

**核心状态**：

| 状态字段 | 类型 | 说明 |
|----------|------|------|
| `ws` | WebSocket \| null | WebSocket 连接实例 |
| `isConnected` | boolean | 连接状态 |
| `isManualReconnecting` | boolean | 手动重连中标志 |
| `currentView` | 'home' \| 'game' \| 'admin' | 视图路由 |
| `roomCode` | string | 当前房间码 |
| `playerId` | string | 当前玩家 ID |
| `playerState` | PlayerRoomStateDTO | 脱敏的玩家视角状态 |
| `judgeState` | JudgeRoomStateDTO | 法官视角全量状态 |
| `isJudge` | boolean | 当前是否法官 |
| `gameOverData` | GameOverMessage | 游戏结束数据 |
| `error` | string | 错误信息 |
| `judgeWarning` | JudgeWarningMessage | 法官警告 |
| `adminLogs` | ActionLogDTO[] | 管理日志 |
| `lastNightActionResult` | NightActionResultMessage | 最后一次夜间行动结果 |
| `lastKnightDuelResult` | KnightDuelResultMessage | 最后一次骑士决斗结果 |
| `lastGameOverData` | GameOverMessage | 最后一次游戏结束数据 |
| `lastDayAnnounce` | DayAnnounceMessage | 最后一次天亮公告 |
| `lastVoteResult` | VoteResultMessage | 最后一次投票结果 |

**核心方法**：
- `connect()` — 创建 WebSocket 连接（检查 readyState 防止重复连接）
- `send(message)` — 发送消息
- `manualReconnect(playerId, roomCode)` — 手动重连
- 消息处理器：onMessage — 根据 ServerMessage.type 分发处理

**重连机制**：
- 当前代码定义 `RECONNECT_FIXED_DELAY = 2500`，自动重连最多 50 次
- 项目硬性约束要求 WebSocket 断连后采用固定 1.5 秒间隔自动重连，后续修复代码时应将实现调整为 1500ms，并避免指数退避
- `isManualReconnecting` 标志位：手动重连时阻止自动重连
- WebSocket 事件处理器增加 `get().ws !== ws` 检查，忽略非当前连接的事件

#### 3.2 App.tsx — 根组件

路径：[client/src/App.tsx](file:///e:/GitHub/langrensha/client/src/App.tsx)

根据 `currentView` 路由渲染：`HomeView` / `GameView` / `AdminDashboard` / `JudgeConsole`。

**核心功能**：
- 初始化 WebSocket 连接
- 初始化 ZEGO 语音引擎（延迟加载，避免首屏性能损耗）
- 监听房间状态自动加入/退出语音房间
- 组件预加载策略：首页加载后按优先级预加载 GameView → 夜间面板 → 技能组件 → ZEGO SDK
- 骨架屏管理：首屏加载完成后隐藏

#### 3.3 GameView.tsx — 游戏主界面

路径：[client/src/components/game/GameView.tsx](file:///e:/GitHub/langrensha/client/src/components/game/GameView.tsx)

根据游戏阶段动态切换主面板：

```typescript
// 阶段路由
switch (phase) {
  case 'LOBBY':          → <PlayerList /> + 法官开始按钮
  case 'ROLE_REVEAL':    → <RoleReveal />
  case 'PRE_NIGHT':      → <NightWaiting /> + 预入夜提示
  case 'NIGHT':          → <NightPhase /> | <NightWaiting />
  case 'NIGHT_SETTLEMENT':→ <NightWaiting />
  case 'DAY_ANNOUNCE':   → <DayAnnounce />
  case 'SHERIFF_ELECTION':→ <SheriffElection />
  case 'SHERIFF_TRANSFER':→ <SheriffTransfer />
  case 'DAY_SPEECH':     → <SpeechPhase />
  case 'PRE_VOTE_WAIT':  → <VotePhase /> (骑士可发动技能)
  case 'DAY_VOTE':       → <VotePhase />
  case 'PK_VOTE':        → <VotePhase /> (PK 模式)
  case 'GAME_OVER':      → <GameOver />
}
```

布局结构：`StatusBar(顶栏)` → `主面板(中)` → `PlayerList(底栏)` + `VoiceControlBar(浮动)`。

#### 3.4 夜晚组件体系

**NightPhase.tsx** — 夜间行动主容器，根据 `nightActionRequest.roleId` 渲染对应角色面板：
- **SeerPanel**：选择查验目标
- **WitchPanel**：解药/毒药选择（显示被杀目标、守卫目标，盲救/明救根据顺序决定）
- **GuardPanel**：守护选择（不可重复、不可连续守同一人、首晚可守自己）
- **NightmarePanel**：恐惧目标选择（不可重复、不可恐惧自己）
- **MechanicalWolfPanel**：模仿目标选择 / 技能释放
- **WolfChat**：狼人聊天界面
- **WolfVotePanel**：狼人刀人投票（实时显示投票进度、狼人同伴列表）
- **NightWaiting**：夜间等待画面（显示当前行动角色、倒计时）

被恐惧封印的玩家显示专用 UI：😱表情、紫色标题"你被噩梦之影恐惧了！"、技能封印提示和倒计时器。

#### 3.5 白天组件体系

- **DayAnnounce**：公布昨晚死讯和禁言名单
- **SheriffElection**：警长选举投票（候选人排除法官和已当选警长，支持弃票）
- **SheriffTransfer**：警长死亡时选择移交对象（超时自动移交给最小序号存活玩家）
- **SpeechPhase**：轮流发言，含"结束发言"按钮
- **VotePhase**：投票出人（支持普通投票、PK 投票，支持弃票）
- **KnightDuel**：骑士决斗目标选择（仅在白天发言阶段可发动）

#### 3.6 特殊技能组件

- **HunterGun**：猎人开枪（被毒死时视村规决定是否封印）
- **WolfKingGun**：狼王开枪（决斗狼王时视村规决定是否封印）
- **WhiteWolfExplode**：白狼王自爆（强制入夜）
- **IdiotReveal**：白痴翻牌免死
- **KnightDuel**：骑士决斗（验狼成功则入夜，验好人则视村规自尽或仅揭示身份）

#### 3.7 法官控制台

路径：[client/src/components/JudgeConsole.tsx](file:///e:/GitHub/langrensha/client/src/components/JudgeConsole.tsx)

法官专属控制面板：
- 暂停/恢复游戏
- 强制进入下一阶段
- 强制改判结算
- 修改发言顺序
- 修改夜间行动顺序
- 代操作：触发骑士决斗/白狼王自爆
- 跳过某玩家发言
- 查看完整玩家状态（含底牌、夜间操作、投票）

---

### 4. ZEGO 实时语音集成

#### 4.1 整体架构

```
┌─────────────────┐     ┌─────────────────┐
│  ZEGO Web SDK   │     │ 游戏后端         │
│  客户端内嵌      │     │ Token 生成接口    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └──────────┬────────────┘
                    │
         ┌──────────▼──────────┐
         │  App.tsx 初始化引擎  │
         │  GameView 自动加入   │
         │  useVoiceStore 管理  │
         └─────────────────────┘
```

#### 4.2 核心文件

| 文件 | 说明 |
|------|------|
| [shared/types/zego.ts](file:///e:/GitHub/langrensha/shared/types/zego.ts) | 语音类型定义：连接状态、麦克风状态、事件回调、语音房间类型等 |
| [client/src/services/zego.ts](file:///e:/GitHub/langrensha/client/src/services/zego.ts) | ZegoVoiceService 单例封装：引擎初始化（动态导入）、登录房间、推拉流、麦克风/扬声器控制、游戏阶段音频管理 |
| [client/src/hooks/useZegoVoice.ts](file:///e:/GitHub/langrensha/client/src/hooks/useZegoVoice.ts) | React Hook：封装语音操作的 React 接口，包含连接时长追踪、网络质量监控、操作反馈 |
| [client/src/store/useVoiceStore.ts](file:///e:/GitHub/langrensha/client/src/store/useVoiceStore.ts) | 语音状态管理：连接状态、设备状态、说话用户映射、语音房间生命周期 |
| [client/src/components/game/VoiceControlBar.tsx](file:///e:/GitHub/langrensha/client/src/components/game/VoiceControlBar.tsx) | 语音控制栏 UI：麦克风/扬声器开关、音量调节、语音信息面板入口 |
| [client/src/components/game/VoiceInfoPanel.tsx](file:///e:/GitHub/langrensha/client/src/components/game/VoiceInfoPanel.tsx) | 语音信息面板：连接状态、网络质量、房间信息、设备信息、计费提示 |
| [server/src/services/zegoTokenService.ts](file:///e:/GitHub/langrensha/server/src/services/zegoTokenService.ts) | 服务端 Token 生成（generateToken04 算法） |

#### 4.3 ZegoVoiceService 核心 API

```typescript
class ZegoVoiceService {
  // 初始化引擎（动态导入 SDK）
  init(appID: number): void

  // 登录/退出语音房间
  loginRoom(roomID: string, userID: string, userName: string): Promise<boolean>
  logoutRoom(): Promise<void>

  // 设备控制
  muteMicrophone(muted: boolean): void
  muteSpeaker(muted: boolean): void

  // 游戏阶段语音控制
  muteAllRemoteAudio(): void                // 静音所有远程流
  unmuteAllRemoteAudio(): void              // 恢复所有远程流
  setAllowedSpeakers(userIDs: string[]): void // 仅允许指定用户发言
  muteRemoteAudioByUserID(userID): void     // 静音指定用户
  resetRemoteAudio(): void                  // 重置音频

  // 事件回调注册
  on(callbacks: ZegoEventCallbacks): void
  offAll(): void

  destroy(): Promise<void>
}
```

#### 4.4 语音房间切换策略

| 游戏阶段 | 语音房间 | 可发言者 |
|----------|----------|----------|
| 大厅 | 不加入 | — |
| 白天发言 | MAIN 主房间 | 当前发言者 |
| 白天自由讨论 | MAIN 主房间 | 所有存活玩家 |
| 夜晚（狼人行动） | WOLF 狼人房间 | 狼人阵营（共同睁眼的狼人） |
| 法官与当前行动玩家 | ACTION 行动房间 | 法官 + 当前行动角色玩家 |
| 死后 | DEAD 死亡房间 | 死亡玩家 |

#### 4.5 夜晚阶段语音连接管理

**核心策略**：为节省语音时长，夜晚阶段非相关玩家自动断开语音连接。

- **普通玩家**：进入夜晚后自动断开语音连接
- **共同睁眼的狼人**：保持连接，进入 WOLF 狼人房间，可互相交流
- **法官**：保持连接，可监听各阶段
- **当前行动角色玩家**：与法官保持连接，可交流
- **白天阶段**：所有存活玩家自动恢复连接

**并发控制**：语音操作通过 Promise 队列实现，防止重复连接导致资源泄漏。

**资源清理**：
- `beforeunload` 事件处理：页面关闭/刷新时自动退出语音
- 离开房间时自动退出语音
- 游戏结束时销毁语音引擎
- 异常时强制清理资源

**连接状态监控**：
- 连接时长追踪（MM:SS 或 HH:MM:SS 格式）
- 网络质量监控（Excellent/Good/Medium/Poor/Die）
- 超时警告机制

**UI 反馈**：
- 麦克风权限状态视觉指示（✅/❌/⚠️）
- 详细错误信息和解决建议
- 操作即时反馈（mic-on/mic-off/speaker-on/speaker-off）

#### 4.6 功能需求与验收

以下内容由原 ZEGO 语音集成需求文档归档而来，详细历史任务与验收记录见本文“文档归档与项目演进记录”。

| 编号 | 功能 | 验收标准 |
|------|------|----------|
| FR-1 | 语音房间自动加入 | 进入游戏视图自动连接语音房间 |
| FR-2 | 麦克风控制 | 开关切换，状态反馈明确 |
| FR-3 | 音量调节 | 调节范围 0-100 |
| FR-4 | 白天轮流发言 | 仅当前发言者可发送语音 |
| FR-5 | 夜晚狼人语音 | 仅狼人可沟通，好人听不到 |
| FR-6 | 法官语音控制台 | 全局/单独控制玩家语音 |
| FR-7 | 语音状态显示 | 显示发言者、麦克风状态、网络质量 |
| FR-8 | Token 认证 | 后端生成安全 Token |
| FR-9 | 夜晚语音管理 | 非相关玩家断开连接以节省时长 |
| FR-10 | 语音信息面板 | 显示连接状态、网络质量、房间信息等 |

---

## 环境配置

### 环境变量模板

```bash
# 服务端口
PORT=3001

# MongoDB 连接字符串
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/langrensha?retryWrites=true&w=majority

# 管理员密钥
ADMIN_SECRET=your_strong_random_string

# ZEGO 实时语音
ZEGO_APP_ID=0
ZEGO_SERVER_SECRET=

# ME Frp 内网穿透（可选）
MEFRP_ARGS=
```

### ZEGO 配置步骤

1. 登录 [ZEGO 控制台](https://console.zego.im)
2. 创建应用，获取 AppID 和 ServerSecret
3. 配置 `ZEGO_APP_ID` 和 `ZEGO_SERVER_SECRET`
4. 确认 `ZEGO_SERVER_SECRET` 为 32 字节字符串，或 64 字符十六进制字符串

---

## 运行方式

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 并发启动前后端
npm run dev

# 或分别启动
npm run dev:server
npm run dev:client
```

当前脚本对应端口：

| 服务 | 命令 | 地址 |
|------|------|------|
| 服务端 WebSocket / HTTP API | `npm run dev:server` | `http://localhost:3001` / `ws://localhost:3001` |
| 前端 Vite Dev Server | `npm run dev:client` | `http://localhost:5180` |

Vite 开发服务会代理：
- `/api` → `http://localhost:3001`
- `/ws` → `ws://localhost:3001`

### 生产构建与启动

```bash
npm run build
npm run server
```

`npm run build` 会按顺序构建：`shared → server → client`。生产启动后，服务端会同时提供：
- WebSocket 游戏连接
- `/health` 健康检查
- `/api/zego/token` 语音 Token 接口
- `client/dist` 静态资源服务
- SPA fallback 到 `index.html`
- gzip/brotli 预压缩资源优先返回
- 哈希资源长期缓存、HTML no-cache

### 前端构建分析

```bash
npm run analyze -w client
```

该命令会以 analyze 模式执行 Vite 构建，并通过 `rollup-plugin-visualizer` 生成包体分析页面。

### 校验命令

当前根 `package.json` 未定义 `lint`、`typecheck`、`test` 脚本。可用的代码级校验命令为：

```bash
npm run build
npm run build -w shared
npm run build -w server
npm run build -w client
```

若后续新增 lint/typecheck/test 脚本，需要同步更新本章节。

### 构建产物与缓存清理规范

以下内容属于可再生文件或本地运行产物，不应作为源码维护：

| 类型 | 路径/模式 | 说明 |
|------|-----------|------|
| 依赖目录 | `node_modules/` | npm 安装产物 |
| 构建输出 | `dist/` | TypeScript / Vite 构建产物 |
| Vite 缓存 | `.vite/` | 开发服务器预构建缓存 |
| TypeScript 增量文件 | `*.tsbuildinfo` | `tsc -b` 增量编译缓存 |
| 日志 | `*.log` | 本地运行日志 |
| 系统文件 | `.DS_Store`、`Thumbs.db` | 操作系统自动生成文件 |
| CPU profile | `server/cpu.json`、`*.cpuprofile` | 性能采样输出 |
| 本地环境变量 | `.env` | 本地私密配置，禁止提交 |

`server/bin/mefrpc.exe` 是 FRP 隧道功能的运行必需文件，不能被 `.gitignore` 忽略，也不能作为构建缓存清理。当前服务端会从该路径查找并启动它。

本次已清理 `client/tsconfig.tsbuildinfo`、`client/.vite` 和 `server/cpu.json`，并将可再生产物规则同步到 `.gitignore`。

---

## 数据库设计

### Room 集合

```typescript
{
  roomCode: string,                    // 6位大写字母+数字（排除0/O, 1/I/L）
  gameMode: 'HUMAN' | 'SYSTEM',
  phase: GamePhase,                    // 当前阶段
  nightSubPhase: NightSubPhase | null, // 夜间子阶段
  round: number,                       // 轮次（从1开始）
  config: RuleConfig,                  // 完整规则配置
  players: Player[],                   // 玩家数组
  speechOrder: number[],               // 发言顺序（座位号）
  currentSpeakerIndex: number,         // 当前发言者索引
  votes: Record<number, number>,       // 投票记录
  sheriffElectionVotes: Record<number, number>, // 警长选举投票
  nightActions: Record<string, NightActionData>,  // 夜间行动
  werewolfTarget: number | null,       // 狼人击杀目标
  witchSaveTarget: number | null,      // 女巫解药目标
  witchPoisonTarget: number | null,    // 女巫毒药目标
  guardProtectTarget: number | null,   // 守卫守护目标
  nightmareTarget: number | null,      // 噩梦恐惧目标
  wolfVotes: Record<number, number>,   // 狼人投票
  wolfVoteConsensus: boolean,          // 狼人投票是否一致
  wolfChatMessages: WolfChatMessage[], // 狼人聊天记录
  nightDeaths: NightDeathRecord[],     // 夜间死亡记录
  dayDeaths: DayDeathRecord[],         // 白天死亡记录
  isPaused: boolean,                   // 是否暂停
  winner: 'good' | 'evil' | null,      // 获胜阵营
  createdAt: number,                   // 创建时间戳
  startedAt: number | null,            // 开始时间
  endedAt: number | null,              // 结束时间
  configVersion: number                // 配置版本号
}
```

**索引**：`roomCode`（唯一）

### GameLog 集合

```typescript
{
  roomCode: string,                    // 房间码
  gameId: string,                      // 游戏局ID (roomCode_timestamp)
  timestamp: number,                   // 时间戳
  actorSeat: number,                   // 操作人座位号（系统操作为 0）
  actorNickname: string,               // 操作人昵称
  actionType: ActionType,              // 动作类型（50+ 种）
  targetSeat: number | null,           // 目标座位号
  targetNickname: string | null,       // 目标昵称
  phase: GamePhase,                    // 当前阶段
  round: number,                       // 当前轮次
  detail: Record<string, unknown>,     // 动作详情
  overridden: boolean,                 // 是否被法官改判
  overrideReason: string | null,       // 改判原因
  nightActionOrderSnapshot: RoleId[]   // 夜间顺序快照
}
```

**索引**：`roomCode+timestamp`、`gameId`、`actionType`、`roomCode+round+phase`

---

## 防作弊设计

### 1. 零信任架构

所有客户端操作在服务端重新校验合法性，不信任前端任何数据。

### 2. DTO 脱敏广播

- **法官视角**：`JudgeRoomStateDTO` 包含所有玩家的 `RoleId`、夜间操作目标、投票详情
- **普通玩家视角**：`PlayerRoomStateDTO` 中其他玩家的 `role` 为 null，不包含夜间行动数据

### 3. 角色信息隔离

- LOBBY 阶段不暴露角色信息
- 角色仅在游戏开始后通过 `ROLE_REVEAL` 阶段告知
- 死亡玩家视角限制（死亡后第二晚起方可查看全部存活玩家身份）

### 4. 噩梦封印防信息泄露

被恐惧的玩家不会秒过阶段，而是显示标准倒计时 + 5-15 秒随机延时后自动提交，防止其他玩家通过"快速跳过"推断出被恐惧对象。

### 5. 昵称唯一性

昵称重复校验大小写不敏感，防止混淆。

---

## 关键技术实现

### 当夜恐惧可正常行动效果

噩梦之影的恐惧效果默认在当前夜生效（前一晚恐惧 → 当夜行动被封印）。当噩梦之影排在夜间行动顺序最后时，恐惧效果在下一晚生效（延期），系统会自动降级并向法官发出警告。

### 法官与警长分离

法官（上帝/房主）和警长（选举产生的玩家角色）是两个独立概念：
- 法官负责流程控制、改判、暂停等管理操作
- 警长由玩家投票选举产生，拥有投票权重加成（1/1.5/2 倍）
- 警长死亡时可通过警徽移交指定继承人

### 超时机制

所有阶段统一使用超时机制（移除 SYSTEM/HUMAN 模式区分）：
- 夜间行动：`nightActionTimeout`（默认 30 秒）
- 发言：`speechTimeout`（默认 60 秒），可主动结束发言
- 投票：`voteTimeout`（默认 20 秒）
- 发言结束到投票前等待：`preVoteWaitTime`（默认 10 秒）
- 技能发动等待：`skillActivationTimeout`（默认 15 秒）

### 狼人聊天

- 共同睁眼的狼人在夜间可通过 `WOLF_CHAT` 消息在专属聊天区沟通
- 聊天消息持久化到 MongoDB（visibility: 'wolf_only'）
- 噩梦之影可查看全部历史；隐狼仅当唯一存活狼人时可回溯
- 狼人投票需达成一致才能结束子阶段，超时由系统随机选择目标

### 客户端重连机制

- **自动重连**：WebSocket 断连后固定 1.5 秒间隔重连，最多 5 次
- **手动重连**：用户主动触发，设置 `isManualReconnecting` 标志阻止自动重连
- **TCP 半开连接处理**：服务端检测旧连接 `disconnected=false` 时强制替换
- **状态恢复**：重连成功后推送 ROOM_STATE 消息恢复完整游戏状态
- **资源清理**：重连时清除旧定时器、删除新创建的 ClientContext 并恢复旧 context

### 语音并发控制

- 语音操作通过 Promise 队列实现，防止重复连接
- 连接前检查当前状态，避免重复初始化
- 连接失败时正确释放资源，避免内存泄漏
- 页面关闭/刷新时通过 `beforeunload` 事件自动退出语音

---

## 文档归档与项目演进记录

本节汇总了原仓库中分散的说明性文档内容，包括变更日志、需求规格、实施计划、任务清单、验收清单和技术总结。合并后，本文件作为项目唯一说明性文档来源。

### 已合并文档来源

| 原文档 | 原用途 | 合并位置 |
|--------|--------|----------|
| `CHANGELOG_2026-06-08.md` | 近期变更日志 | 文档归档与项目演进记录 → 近期变更 |
| `docs/superpowers/plans/2026-06-07-judge-sheriff-separation.md` | 法官与警长分离实施计划 | 文档归档与项目演进记录 → 法官与警长分离实施归档 |
| `.trae/documents/zego_voice_integration_plan.md` | ZEGO 语音技术方案 | ZEGO 实时语音集成、ZEGO 语音集成归档 |
| `.trae/specs/zego_voice_integration/spec.md` | ZEGO 语音 PRD | ZEGO 语音集成归档 |
| `.trae/specs/zego_voice_integration/tasks.md` | ZEGO 语音任务清单 | ZEGO 语音集成归档 |
| `.trae/specs/zego_voice_integration/checklist.md` | ZEGO 语音验收清单 | ZEGO 语音集成归档 |
| `.trae/specs/voice-duration-fix/spec.md` | 语音时长异常修复规格 | 语音时长异常修复归档 |
| `.trae/specs/voice-duration-fix/tasks.md` | 语音时长异常修复任务 | 语音时长异常修复归档 |
| `.trae/specs/voice-duration-fix/checklist.md` | 语音时长异常修复验收 | 语音时长异常修复归档 |
| `.trae/specs/frontend-performance-optimization/spec.md` | 前端性能优化规格 | 前端加载性能优化归档 |
| `.trae/specs/frontend-performance-optimization/tasks.md` | 前端性能优化任务 | 前端加载性能优化归档 |
| `.trae/specs/frontend-performance-optimization/checklist.md` | 前端性能优化验收 | 前端加载性能优化归档 |

### 近期变更：2026-06-08 / 2026-06-09

#### 噩梦之影恐惧技能优化

- 被恐惧玩家显示标准倒计时，不再秒过子阶段。
- 被恐惧玩家在 5-15 秒随机延时后自动提交空操作，避免其他玩家通过阶段推进速度推断信息。
- `NightActionRequestDTO` 新增 `isBlockedByNightmare` 字段。
- 客户端夜晚阶段新增封印提示 UI，包含紫色提示、恐惧图标、封印说明和倒计时。
- 自动推进时会清理夜间行动定时器和倒计时广播定时器，避免内存泄漏。

#### 移除 SYSTEM 模式差异

- 移除 `this.state.gameMode === 'SYSTEM'` 对超时机制的分支限制。
- 白天宣布、发言、警长选举、警徽移交、投票、PK 投票、夜间行动等阶段统一使用规则配置中的超时时间。
- 游戏模式行为更一致，规则配置更简单。

#### 玩家主动结束发言

- 新增客户端消息 `FINISH_SPEECH`。
- 新增行动日志类型 `SPEECH_FINISH`。
- `GameEngine.finishSpeech(playerId)` 校验当前阶段和当前发言者后推进到下一位发言者。
- `SpeechPhase` 新增“结束发言”按钮。
- `AdminDashboard` 支持显示“主动结束发言”日志类型。

#### 投票操作锁定

- 警长选举投票确认后锁定操作。
- 白天投票确认后锁定操作。
- 避免网络延迟或重复点击导致重复提交。

#### 法官强制推进逻辑优化

- 发言阶段的法官强制推进从“直接进入投票”改为“推进到下一位发言者”。
- 更符合逐位发言的游戏流程。

#### 语音时长优化

- 夜晚阶段普通玩家自动断开语音连接，减少不必要计费。
- 共同睁眼的狼人保持语音连接，用于夜间密谋。
- 法官与当前行动玩家保持必要连接。
- Promise 队列控制语音操作，防止重复连接和重复计费。
- `beforeunload` 处理页面关闭/刷新场景，尽可能释放语音资源。
- 新增 `VoiceInfoPanel` 展示连接状态、连接时长、网络质量、设备权限、房间信息和计费提示。

### 法官与警长分离实施归档

#### 目标

将“法官（上帝/房主）”与“警长（玩家选举产生）”彻底分离。法官负责游戏管理操作，警长是玩家身份属性，拥有投票权重和警徽移交机制。

#### 架构调整路径

实施顺序采用自底向上方式：

1. `shared/types.ts`：类型、阶段、消息、行动日志名称重构。
2. `server/src/models.ts`：MongoDB Schema 同步增加 `isSheriff` 和 `sheriffVoteWeight`。
3. `server/src/GameEngine.ts`：警长选举、警长权重、警徽状态和投票结算逻辑。
4. `server/src/server.ts`：WebSocket 消息路由和 DTO 构建。
5. `server/src/LobbyManager.ts`：房间初始化字段。
6. `client/src/useGameStore.ts`：客户端发送方法和消息处理。
7. 客户端组件：`SheriffElection`、`PlayerList`、`StatusBar`、`HomeView`、`JudgeConsole`、`AdminDashboard` 等。

#### 核心变更摘要

- `Player` / `PlayerDTO` 增加 `isSheriff` 字段。
- `RuleConfig` 将 `judgeElectionEnabled` 更名为 `sheriffElectionEnabled`，新增 `sheriffVoteWeight: 1 | 1.5 | 2`。
- 游戏阶段从 `JUDGE_ELECTION` 更名为 `SHERIFF_ELECTION`。
- 投票记录从 `judgeElectionVotes` 更名为 `sheriffElectionVotes`。
- 消息从 `JUDGE_ELECTION_VOTE` / `JUDGE_ELECTED` / `JUDGE_ELECTION_TIE` 更名为 `SHERIFF_ELECTION_VOTE` / `SHERIFF_ELECTED` / `SHERIFF_ELECTION_TIE`。
- 行动日志类型更名为 `SHERIFF_ELECTION_START`、`SHERIFF_ELECTION_VOTE`、`SHERIFF_ELECTED`、`SHERIFF_ELECTION_TIE`。
- 日间投票和 PK 投票按 `sheriffVoteWeight` 对警长投票计权。
- UI 文案统一使用“警长选举”，避免“法官选举”概念混淆。

#### 当前实现状态

本项目当前代码已包含警长选举、警徽移交、警长投票权重、法官与警长独立身份等机制。本归档保留原实施计划的目标、路径和关键设计，作为历史设计依据和后续维护参考。

### ZEGO 语音集成归档

#### 产品目标

- 为狼人杀游戏提供稳定实时语音通话。
- 支持白天轮流发言控制。
- 支持夜晚狼人专属语音通道。
- 支持法官语音控制能力。
- 支持麦克风开关、扬声器开关、音量控制、连接状态显示。
- 通过服务端生成 ZEGO Token，避免在客户端暴露 ServerSecret。

#### 非目标

- 不实现视频通话。
- 不实现语音录制和回放。
- 不实现语音转文字。
- 不实现自定义音效或变声。
- 不开发移动端原生应用。

#### 技术方案

语音集成采用以下模块划分：

| 模块 | 职责 |
|------|------|
| `shared/types/zego.ts` | 语音连接状态、网络质量、设备状态、回调类型定义 |
| `server/src/services/zegoTokenService.ts` | 服务端生成 Token04，读取 ZEGO 环境变量 |
| `client/src/services/zego.ts` | ZEGO SDK 单例封装，处理登录、退出、推流、拉流、设备控制 |
| `client/src/store/useVoiceStore.ts` | Zustand 管理连接状态、连接时长、网络质量、语音房间状态 |
| `client/src/hooks/useZegoVoice.ts` | React Hook 封装语音操作、权限状态和反馈状态 |
| `client/src/components/game/VoiceControlBar.tsx` | 游戏内语音控制条 |
| `client/src/components/game/VoiceInfoPanel.tsx` | 详细语音状态与计费说明面板 |

#### 功能需求归档

| 编号 | 需求 | 当前实现摘要 |
|------|------|--------------|
| FR-1 | 玩家进入游戏房间后自动加入语音房间 | 由 `App.tsx` / `useVoiceStore` 结合房间状态触发 |
| FR-2 | 麦克风控制 | `VoiceControlBar` 提供开关和状态反馈 |
| FR-3 | 音量调节 | 控制栏提供音量操作入口 |
| FR-4 | 白天发言控制 | 可基于当前发言者控制允许发言范围 |
| FR-5 | 夜晚狼人语音 | 共同睁眼狼人夜晚保持连接 |
| FR-6 | 法官语音控制 | 法官控制台具备夜晚指导/监听相关入口 |
| FR-7 | 语音状态显示 | 展示连接状态、麦克风、网络质量、连接时长 |
| FR-8 | Token 认证 | 服务端 `/api/zego/token` 生成 Token |

#### 原任务完成归档

- Task 1：安装依赖和环境配置，已完成。
- Task 2：创建共享类型定义，已完成。
- Task 3：实现后端 Token 生成服务，已完成。
- Task 4：创建 ZEGO 服务封装，已完成。
- Task 5：创建 Zustand 语音状态管理，已完成。
- Task 6：实现语音 Hook，已完成。
- Task 7：创建语音控制 UI 组件，已完成。
- Task 8-14：原计划中部分条目后续被“语音时长异常修复”和实际代码实现覆盖，包括游戏视图集成、夜晚语音控制、错误提示、自动重连和集成测试。

#### 原验收清单归档

- 基础功能：依赖、SDK 初始化、环境变量配置。
- 后端功能：Token 接口、Token 格式、错误处理。
- 前端服务：ZEGO 服务封装、Zustand 语音状态、语音 Hook、连接建立与重连。
- UI 组件：控制栏渲染、麦克风开关、音量调节、语音状态显示、界面风格一致。
- 游戏场景：加入房间自动连接、白天当前发言者控制、夜晚狼人语音、好人无法听狼人语音、法官控制语音。
- 安全权限：麦克风权限提示、Token 认证、权限拒绝友好提示。
- 性能兼容：延迟、CPU 增量、主流浏览器兼容性。
- 错误处理：网络断线、设备不可用、错误边界。
- 集成验证：完整游戏流程不被语音功能破坏。

### 语音时长异常修复归档

#### 问题背景

语音时长存在异常消耗风险，主要可能来自重复连接音频服务器、退出场景未正确关闭语音连接、UI 无法清楚展示当前语音状态和计费风险。

#### 新增需求

##### 夜晚阶段语音连接管理

- 夜晚阶段普通玩家断开语音连接。
- 共同睁眼的狼人保持语音连接。
- 法官与当前行动玩家保持连接。
- 夜晚结束进入白天后恢复存活玩家语音连接。
- 死亡玩家在夜晚阶段断开语音连接。

##### 防止重复连接

- 已连接同一房间时跳过重复加入。
- 快速切换视图时串行处理加入/退出。
- 多个组件同时触发加入时只执行一次。
- 登录失败时清理已创建资源。

##### 正确关闭连接

- 离开房间时退出语音房间。
- 游戏结束或房间解散时退出语音房间。
- 页面刷新/关闭时通过 `beforeunload` 尽可能释放资源。
- WebSocket 断连重连期间保持语音连接，不直接退出。
- ZEGO 异常断开时清理语音状态，避免反复重连造成重复计费。

##### UI 与监控

- 显示连接状态、房间 ID、连接时长、网络质量、麦克风权限状态。
- 错误提示包含具体原因和解决建议。
- 麦克风和扬声器操作提供即时视觉反馈。
- 控制台记录连接事件、房间 ID、用户 ID、事件类型和时间戳。

#### 任务完成归档

- Task 1：夜晚阶段语音连接管理策略，已完成。
- Task 2：重复连接问题诊断和修复，已完成。
- Task 3：连接未正确关闭问题修复，已完成。
- Task 4：连接状态监控和日志，已完成。
- Task 5：语音模块 UI 反馈优化，已完成。
- Task 6：语音完整信息面板 `VoiceInfoPanel`，已完成。
- Task 7：集成测试和构建验证，已完成。

#### 实现摘要

- `useVoiceStore.ts` 增加 `nightVoiceMode`、`voiceStatusHint`、`connectionStartTime`、`connectionDuration`、`networkQuality` 等状态。
- `NightPhase.tsx` 根据当前阶段、角色、共同睁眼狼人配置和当前行动角色动态管理语音连接。
- `GameView.tsx` 在白天阶段恢复语音连接。
- `JudgeConsole.tsx` 增强夜晚语音控制。
- `zego.ts` 增加 `_isLoggingIn`、`_isLoggingOut`、`forceCleanup()` 和更严格的资源清理。
- `App.tsx` 增加 ZEGO 初始化保护和 `beforeunload` 清理。
- `VoiceControlBar.tsx` 显示状态提示、连接时长、网络质量、权限状态、错误解决建议和操作反馈。
- `VoiceInfoPanel.tsx` 作为弹窗展示完整语音信息和计费提示。

#### 验证归档

- TypeScript 编译通过。
- Vite 构建成功。
- `VoiceControlBar` 打包大小约 19.42 kB，gzip 约 5.95 kB。
- 已覆盖夜晚连接管理、快速切换视图、离开房间、游戏结束、页面刷新/关闭、网络断连、麦克风权限等场景的验证设计。

### 前端加载性能优化归档

#### 问题背景

公网通过 chmlfrp 映射访问时，受网络延迟和 ZEGO WebRTC SDK 大包体影响，首屏存在长时间白屏问题。优化目标是在不改变游戏逻辑的前提下改善加载体验和二次访问速度。

#### 优化目标

- 页面加载时立即显示骨架屏，消除白屏感知。
- 首页优先加载，游戏组件在后台预加载。
- ZEGO SDK 仅在需要时或预加载阶段加载，不阻塞首屏。
- 构建产物支持分析、gzip 和 brotli 预压缩。
- 静态资源支持 Service Worker 缓存和 HTTP 缓存头。
- 所有优化均保持渐进增强，失败时不影响核心游戏逻辑。

#### 新增需求归档

- 骨架屏：页面加载开始立即显示，首屏完成后平滑过渡。
- 组件预加载：首页加载后按 GameView → 夜间面板 → 技能组件 → ZEGO SDK 顺序预加载。
- 构建分析：`npm run analyze -w client` 生成可视化包体报告。
- 资源预压缩：构建时生成 gzip 和 brotli 文件。
- Service Worker：缓存静态资源，二次访问和离线访问加速。
- 资源预加载：关键 CSS、vendor chunk、DNS 预解析和预连接。
- HTTP 缓存头：哈希资源长期缓存，HTML 禁用强缓存。
- ZEGO SDK 延迟加载：首页不加载 1.8MB 左右的 ZEGO chunk。

#### 任务完成归档

- Task 1：骨架屏消除白屏，已完成。
- Task 2：组件预加载策略，已完成。
- Task 3：构建分析工具，已完成。
- Task 4：gzip/brotli 预压缩，已完成。
- Task 5：Service Worker 离线缓存，已完成。
- Task 6：资源预加载提示，已完成。
- Task 7：HTTP 缓存头，已完成。
- Task 8：ZEGO SDK 延迟加载和预加载验证，已完成。
- Task 9：全面验证，已完成。

#### 压缩效果归档

- ZEGO SDK 原始体积约 1,887.46 KB。
- gzip 压缩后约 574.99 KB，压缩率约 69.5%。
- brotli 压缩后约 441.78 KB，压缩率约 76.6%。

#### 验收结果归档

- 骨架屏、预加载队列、构建分析、资源压缩、Service Worker、资源预加载、缓存头、ZEGO 延迟加载均已完成验证。
- 构建成功，生产服务器启动成功。
- 首页无白屏，创建/加入房间、游戏流程、语音功能、断线重连、离线访问均正常。
- 所有优化均不影响 WebSocket 连接和核心游戏逻辑。

---

## 扩展开发指南

### 添加新角色

1. **shared/types.ts**：在 `RoleId` 中添加新 ID，在 `ROLE_META` 中添加元数据。
2. **server/GameEngine.ts**：在夜间行动逻辑中添加 `case 'new_role'`。
3. **client/**：创建对应角色面板组件（如 `NewRolePanel.tsx`），在 `NightPhase.tsx` 中注册。
4. **shared/types.ts**：更新 `NightActionExtra` 接口添加新角色的 action 字段。

### 添加新村规

1. **shared/types.ts**：在 `RuleConfig` 接口中添加字段，更新 `createDefaultRuleConfig`。
2. **server/models.ts**：在 Schema 中添加对应字段。
3. **server/GameEngine.ts**：在相关方法中实现新规则逻辑。
4. **client/src/components/HomeView.tsx**：在房间配置界面添加 UI 控件。

### 添加新 WebSocket 消息

1. **shared/types.ts**：定义消息接口，添加到 `ClientMessageType`/`ServerMessageType` 和联合类型。
2. **server/src/server.ts**：添加 `case` 分支和处理器函数。
3. **client/src/useGameStore.ts**：添加发送方法和消息处理逻辑。

---

## 常见问题

### Q: 如何修改游戏规则？
A: 法官在 `HomeView` 创建房间时通过配置面板修改 `RuleConfig`，支持角色分布、超时、警长投票权重、夜间顺序、投票规则等 20+ 项设置。

### Q: 语音功能如何调试？
A: 检查 `ZEGO_APP_ID` 和 `ZEGO_SERVER_SECRET` 是否正确配置，浏览器控制台查看 `[ZegoVoice]` 前缀日志，并通过 `VoiceInfoPanel` 查看连接状态、连接时长、网络质量和权限状态。

### Q: 如何部署到公网？
A: 在 `.env` 中配置 `MEFRP_ARGS` 后，服务启动时会自动使用内置 `server/bin/mefrpc.exe` 启动 ME Frp 端口映射。

### Q: 游戏日志有什么用？
A: 用于复盘每步操作、Admin 后台审计、追溯夜间顺序对结果的影响、排查玩家争议，以及确认法官操作和系统自动操作。

### Q: 如何清理 MongoDB 的旧数据？
A: 通过 `AdminDashboard` 发送 `ADMIN_CLEANUP_CONFIG` 消息，清理 `RuleConfig` 中的废弃字段或历史兼容数据。

### Q: 为什么 `.trae/skills/langrensha-project-manager/SKILL.md` 没有合并删除？
A: 该文件是项目管理技能的运行定义文件，不属于项目说明性文档。删除它会影响本地技能可用性，因此保留。

---

## 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| v1.0.0 | 2026-06-08 | 初始版本：13 种角色、20+ 村规、ZEGO 语音、防作弊、断线重连 |
| v1.1.0 | 2026-06-09 | 合并所有说明性文档，归档语音时长修复、前端性能优化、法官警长分离、ZEGO 语音集成资料 |
| v1.2.0 | 2026-06-09 | 完整系统复核修订：同步当前仓库结构、脚本、环境变量、运行端口、ZEGO Token、FRP、静态资源服务、重连实现差异，并明确后续所有说明性文档只维护在本文件 |

---

**文档更新时间**：2026-06-09
