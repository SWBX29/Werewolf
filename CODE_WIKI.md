# 狼人杀联机游戏 — Code Wiki

## 项目概述

**狼人杀联机游戏** 是一个商业级联机狼人杀游戏引擎，支持多人在线实时对战。项目采用前后端分离架构，使用 WebSocket 实现实时通信，集成 ZEGO 实时语音服务，支持完整的狼人杀游戏流程和丰富的村规配置。

### 核心特性

- **完整游戏流程**：支持从大厅到游戏结束的全流程
- **动态村规配置**：支持 20+ 种村规规则，法官可自定义
- **实时语音**：集成 ZEGO 实时语音，支持白天全局语音、夜晚狼人专属语音、死亡玩家语音
- **防作弊机制**：零信任架构，服务端强制校验，DTO 脱敏广播
- **断线重连**：支持玩家断线后恢复会话
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
└────────────────────────────┼─────────────────────────────────┘
                             │ WebSocket
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
| **服务端层** (server/) | WebSocket 服务器、游戏引擎、大厅管理、数据持久化 |
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
| **二维码** | qrcode.react | 3.1.0 |
| **服务端** | Node.js + WebSocket (ws) | 8.16.0 |
| **数据库** | MongoDB (Mongoose) | 8.3.2 |
| **环境变量** | dotenv | 16.4.5 |
| **语言** | TypeScript | 5.4.5 |
| **包管理** | npm workspaces | — |

---

## 目录结构

```
langrensha/
├── client/                          # 前端应用
│   ├── src/
│   │   ├── components/
│   │   │   ├── game/                # 游戏相关组件
│   │   │   │   ├── day/             # 白天阶段
│   │   │   │   │   ├── DayAnnounce.tsx        # 天亮公告
│   │   │   │   │   ├── SheriffElection.tsx    # 警长选举
│   │   │   │   │   ├── SheriffTransfer.tsx    # 警徽移交
│   │   │   │   │   ├── SpeechPhase.tsx        # 发言阶段
│   │   │   │   │   └── VotePhase.tsx          # 投票阶段
│   │   │   │   ├── night/           # 夜间阶段
│   │   │   │   │   ├── NightPhase.tsx         # 夜间行动主容器
│   │   │   │   │   ├── NightWaiting.tsx       # 夜间等待
│   │   │   │   │   ├── WolfChat.tsx           # 狼人聊天
│   │   │   │   │   ├── WolfVotePanel.tsx      # 狼人投票
│   │   │   │   │   ├── SeerPanel.tsx          # 预言家
│   │   │   │   │   ├── WitchPanel.tsx         # 女巫
│   │   │   │   │   ├── GuardPanel.tsx         # 守卫
│   │   │   │   │   ├── NightmarePanel.tsx     # 噩梦之影
│   │   │   │   │   └── MechanicalWolfPanel.tsx# 机械狼
│   │   │   │   ├── skills/           # 特殊技能
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
│   │   │   │   ├── PlayerList.tsx
│   │   │   │   ├── RoleReveal.tsx
│   │   │   │   ├── SpectatorMode.tsx
│   │   │   │   ├── StatusBar.tsx
│   │   │   │   ├── TargetSelector.tsx
│   │   │   │   └── VoiceControlBar.tsx        # 语音控制栏
│   │   │   ├── AdminDashboard.tsx    # 管理员后台
│   │   │   ├── HomeView.tsx          # 主页/大厅
│   │   │   └── JudgeConsole.tsx      # 法官控制台
│   │   ├── hooks/
│   │   │   └── useZegoVoice.ts       # 语音 React Hook
│   │   ├── services/
│   │   │   └── zego.ts               # ZEGO 语音服务封装
│   │   ├── store/
│   │   │   └── useVoiceStore.ts      # 语音状态管理
│   │   ├── utils/
│   │   │   └── gameUtils.ts          # 游戏工具函数
│   │   ├── App.tsx                   # 根组件
│   │   ├── main.tsx                  # 入口
│   │   ├── useGameStore.ts           # 游戏全局状态
│   │   └── index.css
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
│   │   ├── GameEngine.ts             # 游戏引擎核心 (~3500行)
│   │   ├── LobbyManager.ts           # 大厅/房间管理器
│   │   ├── models.ts                 # MongoDB 数据模型
│   │   └── server.ts                 # 服务端入口 + WebSocket 路由
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                           # 共享类型
│   ├── types.ts                      # 全局类型定义 (~1900行)
│   ├── types/
│   │   └── zego.ts                   # ZEGO 语音类型
│   ├── package.json
│   └── tsconfig.json
│
├── tests/
│   └── run-game-sim.ts               # 游戏模拟测试
├── docs/superpowers/plans/
│   └── 2026-06-07-judge-sheriff-separation.md
├── test_screenshots/                 # E2E 测试截图
├── .trae/                            # AI 辅助开发文档
│   ├── documents/
│   │   └── zego_voice_integration_plan.md
│   └── specs/zego_voice_integration/
│       ├── spec.md                   # ZEGO 集成 PRD
│       ├── checklist.md              # 验收清单
│       └── tasks.md                  # 任务拆解
├── .env.example                      # 环境变量模板
├── start.bat                         # Windows 启动脚本
├── test_diag.py                      # 连接诊断脚本
├── test_e2e_full.py                  # E2E 测试脚本
├── test_recon.py                     # 复盘工具脚本
└── CHANGELOG_2026-06-08.md           # 近期变更日志
```

---

## 核心模块详解

### 1. 共享层 (shared/)

**类型系统** 定义在 [shared/types.ts](file:///e:/GitHub/langrensha/shared/types.ts) 中，是整个项目的类型基石。

#### 1.1 角色系统 (13 种角色)

| 角色 ID | 阵营 | 说明 |
|----------|------|------|
| `villager` | 好人 | 无特殊技能，靠投票 |
| `seer` | 好人 | 每晚查验一人阵营 |
| `witch` | 好人 | 解药/毒药各一 |
| `hunter` | 好人 | 死亡可开枪带走一人 |
| `guard` | 好人 | 每晚守护一人（不可重复） |
| `idiot` | 好人 | 被票出可翻牌免死 |
| `knight` | 好人 | 白天可决斗验狼 |
| `werewolf` | 狼人 | 每晚共同刀人 |
| `white_wolf_king` | 狼人 | 白天自爆带走一人 |
| `wolf_king` | 狼人 | 死亡可开枪带走一人 |
| `nightmare_shadow` | 狼人 | 每晚恐惧一人封印技能 |
| `hidden_wolf` | 狼人 | 隐狼，被查为好人 |
| `mechanical_wolf` | 狼人 | 模仿目标技能 |

#### 1.2 游戏状态机

完整的阶段流转：

```
LOBBY → ROLE_REVEAL → PRE_NIGHT → NIGHT → NIGHT_SETTLEMENT
→ DAY_ANNOUNCE → [SHERIFF_ELECTION] → [SHERIFF_TRANSFER]
→ DAY_SPEECH → DAY_VOTE → DAY_SETTLEMENT → NIGHT → ...
                                            → GAME_OVER
```

**中断机制**：DAY_SPEECH/VOTE 阶段可被 `KNIGHT_DUEL`（骑士决斗）或 `WHITE_WOLF_EXPLODE`（白狼王自爆）中断，进入 `DAY_INTERRUPT` 处理连锁事件。

#### 1.3 规则配置 (RuleConfig)

[RuleConfig](file:///e:/GitHub/langrensha/shared/types.ts#L286) 接口定义了完整的村规配置体系，支持 20+ 项可调参数：

- **角色分布**：`roleDistribution` — 灵活配置每种角色数量
- **夜间顺序**：`nightActionOrder` — 可手动调整或使用预置模板
- **女巫规则**：自救策略、双药同夜、同守同救冲突
- **骑士规则**：决斗狼王开枪、决斗好人翻车
- **投票规则**：平票处理、票出身份显示、警长投票权重
- **获胜条件**：屠边/屠城
- **狼人规则**：共群策略、共同睁眼角色
- **超时配置**：夜间/发言/投票超时

#### 1.4 WebSocket 消息协议

完整的消息协议定义在 [shared/types.ts](file:///e:/GitHub/langrensha/shared/types.ts#L881-1717) 中。

**客户端→服务端 (ClientMessage)**：

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

**服务端→客户端 (ServerMessage)**：ROOM_CREATED, ROOM_STATE, PHASE_CHANGE, ROOM_DISSOLVED, NIGHT_ACTION_REQUEST, DAY_ANNOUNCE, VOTE_RESULT, KNIGHT_DUEL_RESULT, WHITE_WOLF_EXPLODE_RESULT, GAME_OVER, ERROR 等 30+ 种消息类型。

#### 1.5 防作弊 DTO

- **PlayerDTO**：[普通玩家视角](file:///e:/GitHub/langrensha/shared/types.ts#L706) — 其他玩家的 `role` 为 null，不包含夜间目标
- **JudgeRoomStateDTO**：[法官视角](file:///e:/GitHub/langrensha/shared/types.ts#L793) — 明文全量数据
- **NightActionRequestDTO**：[夜间行动请求](file:///e:/GitHub/langrensha/shared/types.ts#L829) — 角色专属的可用目标和禁用原因

---

### 2. 服务端 (server/)

#### 2.1 server.ts — 服务端入口

路径：[server/src/server.ts](file:///e:/GitHub/langrensha/server/src/server.ts)

**职责**：WebSocket 服务器启动、消息路由、DTO 脱敏广播、HTTP 接口（健康检查 + ZEGO Token）。

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
- `GET /api/zego/token?userId=xxx` — 生成 ZEGO 实时语音 Token

#### 2.2 LobbyManager — 大厅管理器

路径：[server/src/LobbyManager.ts](file:///e:/GitHub/langrensha/server/src/LobbyManager.ts)

**职责**：房间生命周期管理、玩家连接映射、断线重连。

**核心功能**：

| 方法 | 说明 |
|------|------|
| `registerConnection(ws)` | 注册 WebSocket 连接，分配 playerId |
| `unregisterConnection(ws)` | 标记断连，启动重连宽限期定时器 |
| `createRoom(nickname, mode, config, ws, publicUrl)` | 生成 6 位房间码并创建 GameEngine |
| `joinRoom(nickname, roomCode, ws)` | 玩家加入房间 |
| `leaveRoom(playerId)` | 玩家离开房间 |
| `dissolveRoom(playerId)` | 法官解散房间 |
| `reconnectPlayer(playerId, roomCode, ws)` | 重连恢复会话 |
| `checkLobbyDisconnectedPlayers()` | 定期清理 LOBBY 阶段断连玩家 |

**断线重连策略**：
- 游戏进行中断连：宽限期 120 秒
- LOBBY 阶段断连：每 1.5 秒检查，立即移除

#### 2.3 GameEngine — 游戏引擎

路径：[server/src/GameEngine.ts](file:///e:/GitHub/langrensha/server/src/GameEngine.ts)

**职责**：游戏逻辑核心，约 3500 行，负责完整的游戏状态机。

**核心接口**：

```typescript
class GameEngine {
  getState(): RoomState
  startGame(): GameResult           // 分配角色，开始游戏
  submitNightAction(id, role, target, extra): NightActionResult  // 夜间行动
  submitVote(id, target): VoteResult           // 白天投票
  finishSpeech(id): { success, error? }        // 结束发言
  handleKnightDuel(id, target): DuelResult     // 骑士决斗
  handleWhiteWolfExplode(id, target): Result   // 白狼王自爆
  triggerHunterGun(id, target): GunResult      // 猎人开枪
  triggerWolfKingGun(id, target): GunResult    // 狼王开枪
  submitWolfChat(id, content): ChatResult      // 狼人聊天
  submitSheriffElectionVote(id, target): Result// 警长选举投票
  overrideSettlement(id, seat, status, reason): OverrideResult  // 法官改判
  forceNextPhase(id): ForceResult              // 法官强制推进
}
```

**夜间行动子阶段**：
按 `nightActionOrder` 数组遍历（默认：噩梦之影→狼人→女巫→预言家→守卫→机械狼），每个角色有超时时间。被噩梦之影恐惧的角色显示标准倒计时，5-15 秒后自动提交空操作（防止信息泄露）。

**胜利条件**：
- 屠边：消灭某一阵营全部成员
- 屠城：消灭所有好人

#### 2.4 models.ts — 数据模型

路径：[server/src/models.ts](file:///e:/GitHub/langrensha/server/src/models.ts)

**两个 MongoDB 集合**：

**Room 集合** — 房间状态持久化：
- 字段完全对应 `RoomState` 接口
- 用于断线重连和服务重启恢复
- 索引：`phase + createdAt`

**GameLog 集合** — 操作日志：
- 记录每项操作的详细信息
- 包含 `nightActionOrderSnapshot` 用于复盘追溯
- 复合索引：`roomCode + timestamp`、`gameId`、`actionType`

**MongoDB 连接管理**：
- 支持断线自动重连，指数退避（1s→2s→4s→最大 30s）
- 连接状态通过 `isMongoConnected()` 查询

#### 2.5 ZegoTokenService — Token 生成

路径：[server/src/services/zegoTokenService.ts](file:///e:/GitHub/langrensha/server/src/services/zegoTokenService.ts)

实现 `generateToken04` 算法（AES-256-GCM 加密），从环境变量读取 `ZEGO_APP_ID` 和 `ZEGO_SERVER_SECRET`，生成有效期 1 小时的 Token。延迟初始化避免启动时因缺少配置崩溃。

---

### 3. 客户端 (client/)

#### 3.1 useGameStore.ts — 全局状态

路径：[client/src/useGameStore.ts](file:///e:/GitHub/langrensha/client/src/useGameStore.ts)

Zustand Store，前端的单一数据源。状态完全由服务端推送驱动，前端不做自主计算。

**核心状态**：

| 状态字段 | 类型 | 说明 |
|----------|------|------|
| `ws` | WebSocket | WebSocket 连接实例 |
| `isConnected` | boolean | 连接状态 |
| `currentView` | 'home'\|'game'\|'admin' | 视图路由 |
| `roomCode` | string | 当前房间码 |
| `playerState` | PlayerRoomStateDTO | 脱敏的玩家视角状态 |
| `judgeState` | JudgeRoomStateDTO | 法官视角全量状态 |
| `isJudge` | boolean | 当前是否法官 |
| `gameOverData` | GameOverMessage | 游戏结束数据 |
| `error` | string | 错误信息 |

**重连机制**：断连后尝试重连，最多 5 次，间隔递增（1s→2s→4s→8s→16s）。

#### 3.2 App.tsx — 根组件

路径：[client/src/App.tsx](file:///e:/GitHub/langrensha/client/src/App.tsx)

根据 `currentView` 路由渲染：`HomeView` / `GameView` / `AdminDashboard` / `JudgeConsole`。初始化 WebSocket 连接和 ZEGO 语音引擎，监听房间状态自动加入/退出语音房间。

#### 3.3 GameView.tsx — 游戏主界面

路径：[client/src/components/game/GameView.tsx](file:///e:/GitHub/langrensha/client/src/components/game/GameView.tsx)

根据游戏阶段动态切换主面板：

```typescript
// 阶段路由
switch (phase) {
  case 'LOBBY':      → <PlayerList /> + 法官开始按钮
  case 'ROLE_REVEAL':→ <RoleReveal />
  case 'NIGHT':      → <NightPhase /> | <NightWaiting />
  case 'DAY_ANNOUNCE':→ <DayAnnounce />
  case 'SHERIFF_ELECTION':→ <SheriffElection />
  case 'DAY_SPEECH': → <SpeechPhase />
  case 'DAY_VOTE':   → <VotePhase />
  case 'GAME_OVER':  → <GameOver />
}
```

布局结构：`StatusBar(顶栏)` → `主面板(中)` → `PlayerList(底栏)` + `VoiceControlBar(浮动)`。

#### 3.4 夜晚组件体系

**NightPhase.tsx** — 夜间行动主容器，根据 `nightActionRequest.roleId` 渲染对应角色面板：
- **SeerPanel**：选择查验目标
- **WitchPanel**：解药/毒药选择（显示被杀目标、守卫目标）
- **GuardPanel**：守护选择（不可重复）
- **NightmarePanel**：恐惧目标选择（不可重复）
- **MechanicalWolfPanel**：模仿目标选择 / 技能释放
- **WolfChat**：狼人聊天界面
- **WolfVotePanel**：狼人刀人投票

被恐惧封印的玩家显示专用 UI（😱表情、紫色标题、技能封印提示）。

#### 3.5 白天组件体系

- **DayAnnounce**：公布昨晚死讯和禁言名单
- **SheriffElection**：警长选举投票
- **SheriffTransfer**：警长死亡时选择移交对象
- **SpeechPhase**：轮流发言，含结束发言按钮
- **VotePhase**：投票出人
- **KnightDuel**：骑士决斗目标选择

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
         └─────────────────────┘
```

#### 4.2 核心文件

| 文件 | 说明 |
|------|------|
| [shared/types/zego.ts](file:///e:/GitHub/langrensha/shared/types/zego.ts) | 语音类型定义：连接状态、麦克风状态、事件回调、语音房间类型等 |
| [client/src/services/zego.ts](file:///e:/GitHub/langrensha/client/src/services/zego.ts) | ZegoVoiceService 单例封装：引擎初始化、登录房间、推拉流、麦克风/扬声器控制 |
| [client/src/hooks/useZegoVoice.ts](file:///e:/GitHub/langrensha/client/src/hooks/useZegoVoice.ts) | React Hook：封装语音操作的 React 接口 |
| [client/src/store/useVoiceStore.ts](file:///e:/GitHub/langrensha/client/src/store/useVoiceStore.ts) | 语音状态管理：连接状态、设备状态、说话用户映射 |
| [client/src/components/game/VoiceControlBar.tsx](file:///e:/GitHub/langrensha/client/src/components/game/VoiceControlBar.tsx) | 语音控制栏 UI：麦克风/扬声器开关、音量调节 |
| [server/src/services/zegoTokenService.ts](file:///e:/GitHub/langrensha/server/src/services/zegoTokenService.ts) | 服务端 Token 生成（generateToken04 算法） |

#### 4.3 ZegoVoiceService 核心 API

```typescript
class ZegoVoiceService {
  // 初始化引擎
  init(appID: number): void

  // 登录/退出语音房间
  loginRoom(roomID, userID, userName): Promise<boolean>
  logoutRoom(): Promise<void>

  // 设备控制
  muteMicrophone(muted: boolean): void
  muteSpeaker(muted: boolean): void

  // 游戏阶段语音控制
  muteAllRemoteAudio(): void           // 静音所有远程流
  unmuteAllRemoteAudio(): void         // 恢复所有远程流
  setAllowedSpeakers(userIDs: string[]): void  // 仅允许指定用户
  muteRemoteAudioByUserID(userID): void       // 静音指定用户
  resetRemoteAudio(): void                    // 重置音频

  // 事件回调注册
  on(callbacks: ZegoEventCallbacks): void
  offAll(): void

  destroy(): Promise<void>
}
```

#### 4.4 语音房间切换策略

| 游戏阶段 | 语音房间 | 可发言者 |
|----------|----------|----------|
| 白天发言 | MAIN 主房间 | 当前发言者 |
| 夜晚（狼人行动） | WOLF 狼人房间 | 狼人阵营 |
| 白天自由讨论 | MAIN 主房间 | 所有存活玩家 |
| 死后 | DEAD 死亡房间 | 死亡玩家 |
| 大厅 | 不加入 | — |

#### 4.5 功能需求与验收

参考 [.trae/specs/zego_voice_integration/spec.md](file:///e:/GitHub/langrensha/.trae/specs/zego_voice_integration/spec.md)：

| 编号 | 功能 | 验收标准 |
|------|------|----------|
| FR-1 | 语音房间自动加入 | 进入游戏视图自动连接语音房间 |
| FR-2 | 麦克风控制 | 开关切换，状态反馈明确 |
| FR-3 | 音量调节 | 调节范围 0-100 |
| FR-4 | 白天轮流发言 | 仅当前发言者可发送语音 |
| FR-5 | 夜晚狼人语音 | 仅狼人可沟通，好人听不到 |
| FR-6 | 法官语音控制台 | 全局/单独控制玩家语音 |
| FR-7 | 语音状态显示 | 显示发言者、麦克风状态 |
| FR-8 | Token 认证 | 后端生成安全 Token |

---

## 环境配置

### 环境变量模板

```bash
# 服务端口
PORT=3001

# MongoDB 连接字符串
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/langrensha

# 公网地址（内网穿透，可选）
PUBLIC_URL=

# 管理员密钥
ADMIN_SECRET=your_strong_random_string

# ZEGO 实时语音
ZEGO_APP_ID=0              # 控制台获取（数字格式）
ZEGO_APP_SIGN=              # 控制台获取（已废弃，仅作兼容）
ZEGO_SERVER_SECRET=         # 控制台获取的 ServerSecret（32字节）
```

### ZEGO 配置步骤

1. 登录 [ZEGO 控制台](https://console.zego.im)
2. 创建应用，获取 AppID 和 ServerSecret
3. 配置 `ZEGO_APP_ID` 和 `ZEGO_SERVER_SECRET`

---

## 运行方式

### 开发模式

```bash
# 并发启动前后端
npm run dev

# 分别启动
npm run dev:server   # → ws://localhost:3001
npm run dev:client   # → http://localhost:5173
```

### 生产构建

```bash
npm run build              # 构建所有模块
npm run server             # 启动服务端
```

### Windows 快速启动

```bash
start.bat          # 启动
start.bat stop     # 停止
start.bat restart  # 重启
```

脚本自动设置 UTF-8 编码，显示前端地址 `http://localhost:5173` 和后端地址 `ws://localhost:3001`。

### 测试

```bash
# 游戏模拟测试
cd tests && npx tsx run-game-sim.ts

# E2E 测试
python test_e2e_full.py

# 连接诊断
python test_diag.py

# 复盘
python test_recon.py
```

---

## 数据库设计

### Room 集合

```typescript
{
  roomCode: string,                    // 6位大写字母+数字
  gameMode: 'HUMAN' | 'SYSTEM',
  phase: GamePhase,                    // 当前阶段
  nightSubPhase: NightSubPhase | null, // 夜间子阶段
  round: number,                       // 轮次
  config: RuleConfig,                  // 完整规则配置
  players: Player[],                   // 玩家数组
  speechOrder: number[],               // 发言顺序（座位号）
  votes: Map<number, number>,          // 投票记录
  nightActions: Map<string, NightActionData>,  // 夜间行动
  wolfVotes: Map<number, number>,      // 狼人投票
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

### GameLog 集合

```typescript
{
  roomCode: string,                    // 房间码
  gameId: string,                      // 游戏局ID (roomCode_timestamp)
  timestamp: number,                   // 时间戳
  actorSeat: number,                   // 操作人座位号
  actorNickname: string,               // 操作人昵称
  actionType: ActionType,              // 动作类型（50+ 种）
  targetSeat: number | null,           // 目标座位号
  targetNickname: string | null,       // 目标昵称
  phase: GamePhase,                    // 当前阶段
  round: number,                       // 当前轮次
  detail: Map<string, unknown>,        // 动作详情
  overridden: boolean,                 // 是否被法官改判
  overrideReason: string | null,       // 改判原因
  nightActionOrderSnapshot: RoleId[]   // 夜间顺序快照
}
```

**索引**：`roomCode+timestamp`, `gameId`, `actionType`, `timestamp`, `roomCode+round+phase`

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

### 狼人聊天

- 共同睁眼的狼人在夜间可通过 `WOLF_CHAT` 消息在专属聊天区沟通
- 聊天消息持久化到 MongoDB
- 噩梦之影可查看全部历史；隐狼仅当唯一存活狼人时可回溯

---

## 近期变更 (2026-06-08)

完整变更日志见 [CHANGELOG_2026-06-08.md](file:///e:/GitHub/langrensha/CHANGELOG_2026-06-08.md)。

### 1. 噩梦之影恐惧技能优化
- 被恐惧狼人显示标准倒计时 + 随机延时（5-15 秒）自动提交空操作
- 新增 `isBlockedByNightmare` 字段到 `NightActionRequestDTO`
- 客户端新增被恐惧封印 UI（紫色标题、😱表情、脉冲动画）

### 2. 移除 SYSTEM 模式判断
- 所有游戏模式统一使用超时机制
- 简化代码逻辑，减少配置复杂度

### 3. 新增玩家主动结束发言功能
- 新增 `FINISH_SPEECH` 消息类型
- 发言阶段新增"结束发言"按钮（琥珀色主题）

### 4. 投票操作锁定
- 警长选举投票和白天投票确认后锁定操作，防止重复提交

### 5. 法官强制推进逻辑优化
- 发言阶段从"直接跳转到投票"改为"推进到下一位发言者"

---

## 扩展开发指南

### 添加新角色

1. **shared/types.ts**：在 `RoleId` 中添加新 ID，在 `ROLE_META` 中添加元数据
2. **server/GameEngine.ts**：在夜间行动逻辑中添加 `case 'new_role'`
3. **client/**：创建对应角色面板组件（如 `NewRolePanel.tsx`），在 `NightPhase.tsx` 中注册
4. **shared/types.ts**：更新 `NightActionExtra` 接口添加新角色的 action 字段

### 添加新村规

1. **shared/types.ts**：在 `RuleConfig` 接口中添加字段，更新 `createDefaultRuleConfig`
2. **server/models.ts**：在 `RuleConfigSubSchema` 中添加对应字段
3. **server/GameEngine.ts**：在相关方法中实现新规则逻辑
4. **client/src/components/HomeView.tsx**：在房间配置界面添加 UI 控件

### 添加新 WebSocket 消息

1. **shared/types.ts**：定义消息接口，添加到 `ClientMessageType`/`ServerMessageType` 和联合类型
2. **server/src/server.ts**：添加 `case` 分支和处理器函数
3. **client/src/useGameStore.ts**：添加发送方法和消息处理逻辑

---

## 常见问题

### Q: 如何修改游戏规则？
A: 法官在 `HomeView` 创建房间时通过 `JudgeConsole` 配置面板修改 `RuleConfig`，支持 20+ 项规则设置。

### Q: 语音功能如何调试？
A: 检查 `ZEGO_APP_ID` 和 `ZEGO_SERVER_SECRET` 是否正确配置，浏览器控制台查看 `[ZegoVoice]` 前缀日志。

### Q: 如何部署到公网？
A: 使用 chmlfrp 内网穿透获取公网地址，配置 `PUBLIC_URL` 环境变量。前端通过 Nginx 代理或 Vite 的 `--host` 选项暴露。

### Q: 游戏日志有什么用？
A: 用于复盘分析每步操作、Admin 后台审计、追溯夜间顺序对结果的影响、排查玩家争议。

### Q: 如何清理 MongoDB 的旧数据？
A: 通过 AdminDashboard 发送 `ADMIN_CLEANUP_CONFIG` 消息，自动清除 `RuleConfig` 中的废弃字段（如 `nightmareBlockMode`、`nightmareBlockSpeech`、`nightmareBlockSkill`）。

---

## 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| v1.0.0 | 2026-06-08 | 初始版本：13 种角色、20+ 村规、ZEGO 语音、防作弊、断线重连 |

---

## 相关文档

- [ZEGO 语音集成 PRD](file:///e:/GitHub/langrensha/.trae/specs/zego_voice_integration/spec.md) — 产品需求文档
- [ZEGO 语音集成计划](file:///e:/GitHub/langrensha/.trae/documents/zego_voice_integration_plan.md) — 技术方案设计
- [ZEGO 语音验收清单](file:///e:/GitHub/langrensha/.trae/specs/zego_voice_integration/checklist.md) — 35 个验收检查点
- [法官与警长分离实施计划](file:///e:/GitHub/langrensha/docs/superpowers/plans/2026-06-07-judge-sheriff-separation.md) — 8 个任务的重构方案
- [近期变更日志](file:///e:/GitHub/langrensha/CHANGELOG_2026-06-08.md) — 5 项核心变更详情

---

**文档更新时间**：2026-06-08