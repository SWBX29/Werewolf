# 狼人杀联机游戏 — Code Wiki

> 商业级联机狼人杀游戏引擎，支持动态村规配置、多角色技能系统、零信任防作弊架构。

---

## 目录

- [1. 项目概览](#1-项目概览)
- [2. 整体架构](#2-整体架构)
- [3. 目录结构](#3-目录结构)
- [4. 模块职责详解](#4-模块职责详解)
  - [4.1 shared — 共享类型基石](#41-shared--共享类型基石)
  - [4.2 server — 服务端](#42-server--服务端)
  - [4.3 client — 前端](#43-client--前端)
- [5. 核心类与函数说明](#5-核心类与函数说明)
  - [5.1 GameEngine 核心状态机](#51-gameengine-核心状态机)
  - [5.2 LobbyManager 大厅管理器](#52-lobbymanager-大厅管理器)
  - [5.3 shared 工具函数](#53-shared-工具函数)
- [6. 游戏状态机流转](#6-游戏状态机流转)
- [7. WebSocket 消息协议](#7-websocket-消息协议)
- [8. 防作弊 DTO 脱敏层](#8-防作弊-dto-脱敏层)
- [9. 角色系统](#9-角色系统)
- [10. 动态村规引擎 (RuleConfig)](#10-动态村规引擎-ruleconfig)
- [11. 前端组件架构](#11-前端组件架构)
- [12. 依赖关系](#12-依赖关系)
- [13. 项目运行方式](#13-项目运行方式)
- [14. 环境变量配置](#14-环境变量配置)
- [15. 数据库设计](#15-数据库设计)

---

## 1. 项目概览

| 属性 | 说明 |
|------|------|
| 项目名称 | langrensha（狼人杀联机游戏） |
| 版本 | 1.0.0 |
| 技术栈 | TypeScript + Node.js + React + WebSocket + MongoDB |
| 构建工具 | npm workspaces + Vite + tsc |
| 核心特性 | 动态村规引擎、零信任防作弊、多角色技能系统、狼人共群聊天、法官上帝模式、申诉仲裁、亡灵聊天、观战模式 |

**设计原则：**

- **零硬编码** — 所有规则从 `RuleConfig` 动态读取，法官可自由配置
- **零信任** — 所有客户端操作在服务端重新校验，前端仅做展示
- **防作弊 DTO** — 广播时根据接收者身份脱敏，普通玩家无法看到他人底牌
- **可中断** — 白天阶段支持骑士决斗/白狼王自爆等突发中断
- **可覆盖** — 法官拥有最高裁决权，可随时改判
- **可申诉** — 玩家可对法官操作提出申诉，触发全员仲裁投票

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         Client (React)                           │
│  ┌──────────┐  ┌──────────────────────────┐  ┌───────────────┐  │
│  │ HomeView │  │ GameView (玩家游戏主界面) │  │ JudgeConsole  │  │
│  │ (大厅)   │  │  ├─ StatusBar            │  │ (法官控制台)  │  │
│  │          │  │  ├─ PlayerList           │  │               │  │
│  │          │  │  ├─ NightPhase           │  │               │  │
│  │          │  │  │   ├─ NightmarePanel   │  │               │  │
│  │          │  │  │   ├─ WolfVotePanel    │  │               │  │
│  │          │  │  │   ├─ WitchPanel       │  │               │  │
│  │          │  │  │   ├─ SeerPanel        │  │               │  │
│  │          │  │  │   ├─ GuardPanel       │  │               │  │
│  │          │  │  │   └─ MechanicalWolf…  │  │               │  │
│  │          │  │  ├─ DayAnnounce          │  │               │  │
│  │          │  │  ├─ SpeechPhase          │  │               │  │
│  │          │  │  ├─ VotePhase            │  │               │  │
│  │          │  │  ├─ RoleReveal           │  │               │  │
│  │          │  │  ├─ GameOver             │  │               │  │
│  │          │  │  ├─ SpectatorMode        │  │               │  │
│  │          │  │  └─ AppealButton         │  │               │  │
│  │          │  └──────────────────────────┘  └───────────────┘  │
│  └────┬─────┘                                                    │
│       │        ┌──────────────────────────────────────────────┐  │
│       └────────┤         useGameStore (Zustand)               │  │
│                │   WebSocket 连接管理 + 状态同步               │  │
│                └──────────────────┬───────────────────────────┘  │
│                                   │ WebSocket                     │
└───────────────────────────────────┼──────────────────────────────┘
                                    │
┌───────────────────────────────────┼──────────────────────────────┐
│                              Server (Node.js)                    │
│                                   │                              │
│  ┌────────────────────────────────┴──────────────────────────┐  │
│  │                server.ts (消息路由 & DTO 脱敏)              │  │
│  │  ┌─────────────────┐  ┌────────────────────────────────┐  │  │
│  │  │ LobbyManager    │  │ DTO 脱敏层                      │  │  │
│  │  │ (房间生命周期)  │  │ stripPlayerToDTO()              │  │  │
│  │  └────────┬────────┘  │ buildPlayerRoomStateDTO()       │  │  │
│  │           │           │ buildJudgeRoomStateDTO()        │  │  │
│  │  ┌────────┴────────┐  │ buildNightActionRequestDTO()   │  │  │
│  │  │  GameEngine     │  └────────────────────────────────┘  │  │
│  │  │  (核心状态机)   │                                      │  │
│  │  └────────┬────────┘                                      │  │
│  └───────────┼───────────────────────────────────────────────┘  │
│              │                                                  │
│  ┌───────────┴───────────────────────────────────────────────┐  │
│  │                models.ts (Mongoose ODM)                    │  │
│  │          RoomModel + GameLogModel + MongoDB 连接管理       │  │
│  └──────────────────────┬────────────────────────────────────┘  │
│                         │                                        │
└─────────────────────────┼────────────────────────────────────────┘
                          │
                ┌─────────┴─────────┐
                │    MongoDB         │
                │  rooms / game_logs │
                └───────────────────┘
```

**数据流：**

1. 客户端通过 WebSocket 发送 `ClientMessage`
2. `server.ts` 路由分发到对应处理器
3. 处理器调用 `GameEngine` 方法执行逻辑
4. `GameEngine` 通过回调通知状态变更
5. `server.ts` 构建 DTO（脱敏/全量），广播给房间内各客户端
6. 日志异步写入 MongoDB

---

## 3. 目录结构

```
langrensha/
├── .env                          # 环境变量（不提交）
├── .env.example                  # 环境变量模板
├── .gitignore
├── package.json                  # 根 package.json (workspaces)
├── start.bat                     # Windows 一键启动脚本
│
├── shared/                       # 共享类型包
│   ├── package.json
│   ├── tsconfig.json
│   ├── types.ts                  # 全局共享类型定义（核心）
│   └── dist/                     # 编译输出
│
├── server/                       # 服务端
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts             # 服务端入口 + WebSocket 路由 + DTO 脱敏
│       ├── GameEngine.ts         # 核心游戏状态机
│       ├── LobbyManager.ts       # 大厅与房间管理器
│       └── models.ts             # Mongoose 数据模型 + MongoDB 连接管理
│
└── client/                       # 前端
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.tsx              # React 入口
        ├── App.tsx               # 根组件 + PlayerGameView
        ├── useGameStore.ts       # Zustand 全局状态仓库
        ├── index.css             # Tailwind CSS 入口
        └── components/
            ├── HomeView.tsx      # 首页（加入/创建房间 + 村规配置）
            ├── JudgeConsole.tsx  # 法官上帝控制台
            ├── AdminDashboard.tsx # 管理员日志复盘面板
            └── game/             # 游戏主界面组件树
                ├── GameView.tsx          # 游戏主视图容器
                ├── StatusBar.tsx         # 顶部状态栏
                ├── PlayerList.tsx        # 玩家列表
                ├── RoleReveal.tsx        # 角色揭示覆盖层
                ├── GameOver.tsx          # 游戏结束面板
                ├── CountdownTimer.tsx    # 可复用倒计时组件
                ├── TargetSelector.tsx    # 可复用目标选择网格
                ├── AppealButton.tsx      # 申诉仲裁按钮
                ├── DeadChat.tsx          # 亡灵聊天
                ├── SpectatorMode.tsx     # 观战模式（死亡玩家）
                ├── night/               # 夜间阶段组件
                │   ├── NightPhase.tsx    # 夜间阶段容器
                │   ├── NightWaiting.tsx  # 夜间等待动画
                │   ├── WolfVotePanel.tsx # 狼人投票面板
                │   ├── WolfChat.tsx      # 狼人专属聊天
                │   ├── NightmarePanel.tsx # 噩梦之影面板
                │   ├── WitchPanel.tsx    # 女巫面板
                │   ├── SeerPanel.tsx     # 预言家面板
                │   ├── GuardPanel.tsx    # 守卫面板
                │   └── MechanicalWolfPanel.tsx # 机械狼面板
                ├── day/                # 白天阶段组件
                │   ├── DayAnnounce.tsx  # 白天死讯公布
                │   ├── SpeechPhase.tsx  # 发言阶段
                │   └── VotePhase.tsx    # 投票阶段
                └── skills/             # 技能释放组件
                    ├── HunterGun.tsx    # 猎人开枪
                    └── KnightDuel.tsx   # 骑士决斗
```

---

## 4. 模块职责详解

### 4.1 shared — 共享类型基石

**文件：** [types.ts](file:///e:/GitHub/langrensha/shared/types.ts)

整个系统的类型契约，被服务端和前端共同引用。包含七大模块：

| 模块 | 内容 |
|------|------|
| 角色系统 | `RoleId`, `Faction`, `RoleMeta`, `ROLE_META` 常量表, `DeathCause` |
| 动态规则配置 | `RuleConfig`, 各种村规枚举类型, `createDefaultRuleConfig()`, `NIGHT_ACTION_ORDER_PRESETS` |
| 游戏状态机 | `GamePhase`, `NightSubPhase`, `RoomState`, `Player`, `NightActionData` |
| 防作弊 DTO | `PlayerDTO`, `PlayerRoomStateDTO`, `JudgeRoomStateDTO`, `NightActionRequestDTO` |
| WebSocket 消息协议 | `ClientMessage`, `ServerMessage` 及所有子类型（28种客户端 + 27种服务端） |
| 全局日志 | `ActionLog`, `ActionLogDTO`, `ActionType` 枚举（37种动作类型） |
| 环境与配置 | `EnvConfig`, `ROOM_CODE_PATTERN`, `ROOM_CODE_CHARSET`, `ROOM_CODE_LENGTH` |

### 4.2 server — 服务端

#### server.ts — 入口 & 网络层

**文件：** [server.ts](file:///e:/GitHub/langrensha/server/src/server.ts)

职责：
- 启动 HTTP + WebSocket 服务器
- 读取环境变量并连接 MongoDB
- WebSocket 消息路由与分发（`handleMessage` 函数）
- DTO 脱敏广播（`broadcastRoomState` 函数）
- 夜间行动请求构建（`buildNightActionRequestDTO` 函数）
- 日志持久化（`persistLog` 函数）
- 回调注入（日志、法官警告、阶段变更、狼人聊天、阶段提醒、狼人投票更新等）

#### GameEngine.ts — 核心状态机

**文件：** [GameEngine.ts](file:///e:/GitHub/langrensha/server/src/GameEngine.ts)

职责：驱动游戏全流程，详见 [5.1 节](#51-gameengine-核心状态机)。

#### LobbyManager.ts — 大厅管理器

**文件：** [LobbyManager.ts](file:///e:/GitHub/langrensha/server/src/LobbyManager.ts)

职责：详见 [5.2 节](#52-lobbymanager-大厅管理器)。

#### models.ts — 数据模型

**文件：** [models.ts](file:///e:/GitHub/langrensha/server/src/models.ts)

职责：
- 定义 Mongoose Schema（`RoomSchema`, `GameLogSchema`）
- 导出 Model（`RoomModel`, `GameLogModel`）
- MongoDB 连接管理（`connectMongoDB`, `disconnectMongoDB`, `isMongoConnected`）
- 断线自动重连（指数退避策略）

### 4.3 client — 前端

#### useGameStore.ts — Zustand 状态仓库

**文件：** [useGameStore.ts](file:///e:/GitHub/langrensha/client/src/useGameStore.ts)

职责：
- WebSocket 连接管理（自动重连）
- 服务端消息接收与状态同步
- 客户端消息发送封装（`sendMessage`, `submitNightAction`, `submitVote`, `knightDuel`, `hunterGun`, `sendWolfChat`, `sendWolfVote`, `sendSpeech`, `sendDeadChat` 等）
- 视图路由状态管理（`currentView`, `isJudge`）
- RuleConfig 本地编辑
- 游戏局部状态管理（`isActionLocked`, `roleConfirmed`, `nightActionResult`, `knightDuelResult`, `voteResult`, `dayAnnouncement`, `gameOverData` 等）
- 申诉仲裁状态（`appealEvent`, `arbitrationEvent`, `showArbitration`）
- 观战模式状态（`spectatorIdentities`, `deadNightsElapsed`）

#### App.tsx — 根组件

**文件：** [App.tsx](file:///e:/GitHub/langrensha/client/src/App.tsx)

包含 `PlayerGameView`（玩家游戏界面）和根路由逻辑。根据 `currentView` 和 `isJudge` 渲染不同视图。

#### HomeView.tsx — 首页

**文件：** [HomeView.tsx](file:///e:/GitHub/langrensha/client/src/components/HomeView.tsx)

- 加入房间（昵称 + 房间码）
- 创建房间（完整的村规配置面板：角色池、夜间顺序、村规开关、超时配置）

#### JudgeConsole.tsx — 法官控制台

**文件：** [JudgeConsole.tsx](file:///e:/GitHub/langrensha/client/src/components/JudgeConsole.tsx)

- 全员明牌面板
- 夜间行动顺序实时编辑
- 发言顺序拖拽
- 流程控制（暂停/强制下一阶段/改判）
- 特殊技能触发
- 法官警告提示区

#### AdminDashboard.tsx — 管理员后台

**文件：** [AdminDashboard.tsx](file:///e:/GitHub/langrensha/client/src/components/AdminDashboard.tsx)

- 从 MongoDB 拉取全局日志
- 时间轴复盘展示
- 每条日志高亮 `nightActionOrderSnapshot`
- 按房间码、条数筛选

---

## 5. 核心类与函数说明

### 5.1 GameEngine 核心状态机

**文件：** [GameEngine.ts](file:///e:/GitHub/langrensha/server/src/GameEngine.ts)

`GameEngine` 是整个游戏的核心，负责驱动游戏阶段流转、夜间行动处理、结算判定、法官覆盖等全部游戏逻辑。

#### 构造函数

```typescript
constructor(
  initialState: RoomState,
  onLog: LogCallback,
  onJudgeWarning: JudgeWarningCallback,
  onPhaseChange: PhaseChangeCallback,
  onWolfChat?: WolfChatCallback,
  onPhaseReminder?: PhaseReminderCallback,
  onWolfVoteUpdate?: WolfVoteUpdateCallback,
)
```

通过回调模式与外层 Server 解耦，GameEngine 不直接依赖 MongoDB 或 WebSocket。

#### 核心方法一览

| 方法 | 说明 |
|------|------|
| `startGame()` | 启动游戏：校验玩家数、Fisher-Yates 洗牌分配角色、进入第一个夜间 |
| `submitNightAction(playerId, roleId, targetSeat, extra)` | 处理夜间行动提交（含零信任校验、狼人投票一致性判定） |
| `submitVote(playerId, targetSeat)` | 提交白天投票 |
| `handleKnightDuel(knightPlayerId, targetSeat)` | 处理骑士决斗（可中断白天流程） |
| `handleWhiteWolfExplode(wolfPlayerId, targetSeat)` | 处理白狼王自爆（可中断白天流程） |
| `triggerHunterGun(hunterPlayerId, targetSeat)` | 触发猎人开枪 |
| `triggerWolfKingGun(wolfKingPlayerId, targetSeat)` | 触发狼王开枪 |
| `overrideSettlement(judgeId, targetSeat, newStatus, reason)` | 法官强制改判 |
| `overrideNightOrder(judgeId, newOrder)` | 法官修改夜间行动顺序 |
| `forceNextPhase(judgeId)` | 法官强制进入下一阶段 |
| `togglePause(judgeId)` | 法官暂停/恢复游戏 |
| `modifySpeechOrder(judgeId, order)` | 法官修改发言顺序 |
| `skipPlayerSpeech(judgeId, seatNumber)` | 法官跳过某玩家发言 |
| `submitWolfChat(playerId, content)` | 狼人聊天消息提交 |
| `getWolfChatHistory(playerId)` | 获取狼人聊天历史（含隐狼权限判断） |
| `canHiddenWolfViewChat(playerId)` | 判断隐狼是否可查看狼人聊天历史 |
| `getWerewolfVision(playerId)` | 获取狼人阵营可见同伴信息 |
| `destroy()` | 销毁引擎，清理所有定时器 |

#### 内部流转方法

| 方法 | 说明 |
|------|------|
| `enterNightPhase()` | 进入夜间阶段，处理延期恐惧，启动子阶段 |
| `advanceNightSubPhase(startIndex)` | 推进夜间子阶段（核心调度器） |
| `enterWolfSubPhase()` | 进入狼人子阶段，初始化投票状态 |
| `submitWolfVote(player, targetSeat, extra)` | 处理狼人投票（一致性判定 + 超时随机） |
| `enterNightSettlement()` | 夜间结算（同守同救/毒封技能/胜负判定） |
| `enterDayAnnounce()` | 进入白天公布死讯 |
| `enterDaySpeech()` | 进入白天发言阶段 |
| `enterDayVote()` | 进入白天投票阶段 |
| `resolveDayVote()` | 结算白天投票（平票处理） |
| `executeDaySettlement(eliminated, cause)` | 执行白天结算（白痴翻牌/亡语触发） |
| `interruptDayPhase()` | 中断白天流程 |
| `resolveDeathChain(deadPlayer)` | 结算死亡连锁（亡语触发） |
| `checkWinCondition()` | 检查胜负条件 |
| `endGame(winner)` | 结束游戏 |

#### 超时处理方法

| 方法 | 说明 |
|------|------|
| `handleWolfVoteTimeout()` | 狼人投票超时：系统随机选择目标 |
| `handleWitchTimeout()` | 女巫超时：放弃操作 |
| `handleGuardTimeout()` | 守卫超时：放弃操作 |
| `handleNightmareTimeout()` | 噩梦之影超时：系统随机选择恐惧目标 |
| `handleSeerTimeout()` | 预言家超时：系统随机选择查验目标 |

#### 关键设计

- **法官夜间权限守卫** — `guardNightJudgeOperation()`：夜晚阶段禁止法官执行写操作（强制推进、改判、暂停等）
- **噩梦之影顺序冲突检测** — `checkNightmareOrderConflict()`：当噩梦之影排在末尾且 `SAME_NIGHT_SUBSEQUENT` 模式时，自动降级为 `NEXT_NIGHT`
- **狼人投票一致性** — `submitWolfVote()`：所有共同睁眼的狼人必须投同一目标才能推进，超时则系统随机选择
- **机械狼模仿系统** — 首夜选择模仿目标 → 次夜得知模仿结果 → 之后可使用模仿技能 → 进入静默

### 5.2 LobbyManager 大厅管理器

**文件：** [LobbyManager.ts](file:///e:/GitHub/langrensha/server/src/LobbyManager.ts)

#### 核心方法

| 方法 | 说明 |
|------|------|
| `registerConnection(ws)` | 注册新的 WebSocket 连接 |
| `unregisterConnection(ws)` | 注销连接（自动离开房间） |
| `createRoom(hostNickname, gameMode, config, hostWs, publicUrl)` | 创建房间（生成房间码、初始化 GameEngine、注册房主） |
| `joinRoom(nickname, roomCode, playerWs)` | 加入房间（校验房间存在/未满/昵称唯一） |
| `leaveRoom(playerId)` | 离开房间（大厅阶段移除，游戏中仅断线） |
| `setReady(playerId, ready)` | 玩家准备/取消准备 |
| `getRoom(roomCode)` | 获取房间引擎 |
| `getRoomClients(roomCode)` | 获取房间内所有客户端 |
| `getRoomCount()` / `getOnlineCount()` | 统计信息 |
| `destroyAll()` | 销毁所有房间 |

#### 回调注入方法

| 方法 | 说明 |
|------|------|
| `setLogCallback(cb)` | 设置日志回调 |
| `setJudgeWarningCallback(cb)` | 设置法官警告回调 |
| `setPhaseChangeCallback(cb)` | 设置阶段变更回调 |
| `setWolfChatCallback(cb)` | 设置狼人聊天回调 |
| `setPhaseReminderCallback(cb)` | 设置阶段提醒回调 |
| `setWolfVoteUpdateCallback(cb)` | 设置狼人投票更新回调 |

#### 房间码生成

`generateRoomCode()` 使用 Node.js `crypto.randomBytes` 作为熵源，字符集排除易混淆字符（0/O, 1/I/L），生成6位大写字母+数字组合。

### 5.3 shared 工具函数

**文件：** [types.ts](file:///e:/GitHub/langrensha/shared/types.ts)

| 函数 | 说明 |
|------|------|
| `isEvilRole(roleId)` | 判断角色是否属于狼人阵营 |
| `isHiddenWolf(roleId)` | 判断角色是否为隐狼 |
| `isSharedWolfRole(roleId, sharedWolfRoles?)` | 判断角色是否属于"共同睁眼的狼人" |
| `hasNightAction(roleId)` | 判断角色是否拥有夜间行动能力 |
| `isImitationFailRole(roleId)` | 判断角色是否为模仿失败角色（村民/骑士/白痴） |
| `createDefaultRuleConfig(playerCount?)` | 创建默认 RuleConfig 模板 |

---

## 6. 游戏状态机流转

```
LOBBY ──startGame()──→ NIGHT ──advanceNightSubPhase()──→ ... ──→ NIGHT_SETTLEMENT
                                                                    │
                                              ┌─────────────────────┘
                                              ↓
                                    DAY_ANNOUNCE ──→ DAY_SPEECH ──→ DAY_VOTE ──→ DAY_SETTLEMENT
                                          │              │              │               │
                                          │              │              │               │
                                          │         ┌────┴────┐   ┌───┴───┐           │
                                          │         ↓         ↓   ↓       ↓           │
                                          │    KNIGHT_DUEL  WHITE_WOLF_EXPLODE         │
                                          │         │              │                   │
                                          │         ↓              ↓                   │
                                          │      DAY_INTERRUPT ←────────               │
                                          │         │                                  │
                                          │         ↓                                  │
                                          │    forceNight? ──YES──→ NIGHT (下一轮)     │
                                          │         │                                  │
                                          │         NO                                 │
                                          │         ↓                                  │
                                          │    继续白天流程                              │
                                          │                                              │
                                          └──────────────────────────────────────────────┘
                                                          ↓ (下一轮)
                                                        NIGHT

任意阶段 ──checkWinCondition()──→ GAME_OVER
```

**白天中断机制：**

- `DAY_SPEECH` / `DAY_VOTE` / `PK_VOTE` 阶段可被骑士决斗或白狼王自爆中断
- 中断后进入 `DAY_INTERRUPT` 子阶段
- 骑士决斗出狼 → 强制入夜
- 白狼王自爆 → 强制入夜
- 骑士决斗好人（REVEAL_ONLY 模式）→ 继续白天流程

**夜间子阶段：**

按 `RuleConfig.nightActionOrder` 数组顺序遍历，每个角色依次行动。默认经典顺序：
1. 噩梦之影 → 恐惧目标
2. 狼人（集体阶段）→ 共同睁眼的狼人投票选择击杀目标
3. 女巫 → 解药/毒药
4. 预言家 → 查验目标
5. 守卫 → 守护目标
6. 机械狼 → 模仿/技能使用

不存在的角色自动跳过，被噩梦封印的角色自动跳过。

**死亡连锁机制：**

- 猎人/狼王死亡时触发开枪亡语
- 白痴被票出时触发翻牌免死
- 白狼王自爆可带走一人
- 连锁按 `RuleConfig.daytimeKillSequence` 策略结算（立即/延期）

---

## 7. WebSocket 消息协议

### 客户端 → 服务端 (ClientMessageType)

| 消息类型 | 说明 | 对应接口 |
|---------|------|---------|
| `CREATE_ROOM` | 创建房间 | `CreateRoomMessage` |
| `JOIN_ROOM` | 加入房间 | `JoinRoomMessage` |
| `LEAVE_ROOM` | 离开房间 | `LeaveRoomMessage` |
| `READY` | 准备/取消准备 | `ReadyMessage` |
| `START_GAME` | 开始游戏 | `StartGameMessage` |
| `NIGHT_ACTION` | 提交夜间行动 | `NightActionMessage` |
| `DAY_VOTE` | 白天投票 | `DayVoteMessage` |
| `KNIGHT_DUEL` | 骑士决斗 | `KnightDuelMessage` |
| `WHITE_WOLF_EXPLODE` | 白狼王自爆 | `WhiteWolfExplodeMessage` |
| `HUNTER_GUN` | 猎人开枪 | `HunterGunMessage` |
| `WOLF_KING_GUN` | 狼王开枪 | `WolfKingGunMessage` |
| `SPEECH` | 发言 | `SpeechMessage` |
| `UPDATE_NIGHT_ORDER` | 法官修改夜间顺序 | `UpdateNightOrderMessage` |
| `JUDGE_OVERRIDE_SETTLEMENT` | 法官改判 | `JudgeOverrideSettlementMessage` |
| `JUDGE_FORCE_NEXT_PHASE` | 法官强制下一阶段 | `JudgeForceNextPhaseMessage` |
| `JUDGE_PAUSE` | 法官暂停 | `JudgePauseMessage` |
| `JUDGE_RESUME` | 法官恢复 | `JudgeResumeMessage` |
| `JUDGE_MODIFY_SPEECH_ORDER` | 法官修改发言顺序 | `JudgeModifySpeechOrderMessage` |
| `JUDGE_TRIGGER_KNIGHT_DUEL` | 法官触发骑士决斗 | `JudgeTriggerKnightDuelMessage` |
| `JUDGE_TRIGGER_WHITE_WOLF` | 法官触发白狼王自爆 | `JudgeTriggerWhiteWolfMessage` |
| `JUDGE_SKIP_SPEECH` | 法官跳过发言 | `JudgeSkipSpeechMessage` |
| `WOLF_CHAT` | 狼人聊天 | `WolfChatClientMessage` |
| `WOLF_VOTE` | 狼人投票 | `WolfVoteClientMessage` |
| `DEAD_CHAT` | 亡灵聊天 | `DeadChatClientMessage` |
| `APPEAL` | 申诉仲裁 | `AppealClientMessage` |
| `ARBITRATION_VOTE` | 仲裁投票 | `ArbitrationVoteClientMessage` |
| `ADMIN_FETCH_LOGS` | 管理员拉取日志 | `AdminFetchLogsMessage` |
| `ADMIN_CLEANUP_CONFIG` | 管理员清除旧配置 | `AdminCleanupConfigMessage` |

### 服务端 → 客户端 (ServerMessageType)

| 消息类型 | 说明 | 对应接口 |
|---------|------|---------|
| `ROOM_CREATED` | 房间创建成功 | `RoomCreatedMessage` |
| `ROOM_STATE` | 房间状态推送（自动脱敏） | `RoomStateMessage` |
| `PHASE_CHANGE` | 阶段变更通知 | `PhaseChangeMessage` |
| `NIGHT_ACTION_REQUEST` | 夜间行动请求 | `NightActionRequestMessage` |
| `NIGHT_ACTION_RESULT` | 夜间行动结果 | `NightActionResultMessage` |
| `DAY_ANNOUNCE` | 白天公布死讯 | `DayAnnounceMessage` |
| `VOTE_RESULT` | 投票结果 | `VoteResultMessage` |
| `KNIGHT_DUEL_RESULT` | 骑士决斗结果 | `KnightDuelResultMessage` |
| `WHITE_WOLF_EXPLODE_RESULT` | 白狼王自爆结果 | `WhiteWolfExplodeResultMessage` |
| `HUNTER_GUN_RESULT` | 猎人开枪结果 | `HunterGunResultMessage` |
| `WOLF_KING_GUN_RESULT` | 狼王开枪结果 | `WolfKingGunResultMessage` |
| `IDIOT_REVEAL` | 白痴翻牌免死 | `IdiotRevealMessage` |
| `GAME_OVER` | 游戏结束 | `GameOverMessage` |
| `ERROR` | 错误消息 | `ErrorMessage` |
| `JUDGE_WARNING` | 法官警告 | `JudgeWarningMessage` |
| `SPEECH_ORDER_UPDATE` | 发言顺序更新 | `SpeechOrderUpdateMessage` |
| `PLAYER_JOINED` | 玩家加入 | `PlayerJoinedMessage` |
| `PLAYER_LEFT` | 玩家离开 | `PlayerLeftMessage` |
| `PLAYER_READY` | 玩家准备 | `PlayerReadyMessage` |
| `PHASE_REMINDER` | 阶段提醒 | `PhaseReminderMessage` |
| `WOLF_VOTE_UPDATE` | 狼人投票更新 | `WolfVoteUpdateMessage` |
| `WOLF_CHAT_HISTORY` | 狼人聊天历史 | `WolfChatHistoryMessage` |
| `WOLF_PHASE_SKIPPED` | 狼人阶段被跳过 | `WolfPhaseSkippedMessage` |
| `DEAD_CHAT` | 亡灵聊天消息 | `DeadChatMessage` |
| `DAY_VOTE_REVEAL` | 白天票出身份揭示 | `DayVoteRevealMessage` |
| `SPEECH_CONTENT` | 白天发言内容广播 | `SpeechContentMessage` |
| `APPEAL_EVENT` | 申诉事件通知 | `AppealEventMessage` |
| `ARBITRATION_VOTE` | 仲裁投票通知 | `ArbitrationVoteMessage` |
| `ADMIN_LOGS_RESULT` | 管理员日志结果 | `AdminLogsResultMessage` |

---

## 8. 防作弊 DTO 脱敏层

**核心函数：** `stripPlayerToDTO()`、`buildPlayerRoomStateDTO()`、`buildJudgeRoomStateDTO()`、`buildNightActionRequestDTO()`

**安全准则：**

1. 普通玩家收到的 `PlayerDTO` 中，只有自己的 `role` 字段有值，其他玩家均为 `null`
2. 女巫/守卫/白痴/机械狼的专属状态仅自己可见
3. 隐狼的 `canViewWolfChatHistory` 仅当唯一存活狼人时为 `true`
4. 法官收到 `JudgeRoomStateDTO`，包含明文全量数据（所有底牌、夜间行动、投票详情等）
5. 广播时遍历房间内所有客户端，为每个客户端独立构建 DTO
6. `NightActionRequestDTO` 仅下发给当前应行动的玩家，含 `disabledTargets` 和 `disabledReasons`

```
broadcastRoomState()
  ├── 法官 → JudgeRoomStateDTO (全量数据)
  └── 玩家A → PlayerRoomStateDTO (A的视角，只有A的role有值)
  └── 玩家B → PlayerRoomStateDTO (B的视角，只有B的role有值)
  └── ...
```

**NightActionRequestDTO 脱敏规则：**

| 字段 | 可见性 |
|------|--------|
| `roleId`, `availableTargets`, `timeout`, `hint` | 当前行动玩家 |
| `werewolfKillTarget` | 仅女巫（且女巫在守卫之后行动时可见） |
| `guardProtectTarget` | 仅女巫（且女巫在守卫之后行动时可见） |
| `wolfVotes`, `wolfVoteConsensus` | 仅狼人子阶段的共同睁眼狼人 |
| `disabledTargets`, `disabledReasons` | 当前行动玩家 |

---

## 9. 角色系统

### 好人阵营 (good)

| RoleId | 名称 | 技能 |
|--------|------|------|
| `villager` | 村民 | 无特殊技能 |
| `seer` | 预言家 | 每晚查验一名玩家的阵营 |
| `witch` | 女巫 | 一瓶解药 + 一瓶毒药，各限用一次 |
| `hunter` | 猎人 | 死亡时可开枪带走一名玩家（被毒死时视村规） |
| `guard` | 守卫 | 每晚守护一名玩家（不可连续守同一人） |
| `idiot` | 白痴 | 被投票出局时可翻牌免死，此后失去投票权 |
| `knight` | 骑士 | 白天发言阶段可发动决斗 |

### 狼人阵营 (evil)

| RoleId | 名称 | 技能 | 共同睁眼 |
|--------|------|------|---------|
| `werewolf` | 狼人 | 每晚与同伴商议击杀一名玩家 | 是 |
| `white_wolf_king` | 白狼王 | 白天发言阶段可自爆带走一人并强制入夜 | 否 |
| `wolf_king` | 狼王 | 被票出或被杀出局时可开枪带走一人（非自爆） | 是 |
| `nightmare_shadow` | 噩梦之影 | 每晚恐惧一人，使其当夜技能失效+次日禁言。不可恐惧自己，不可重复恐惧同一人 | 是 |
| `hidden_wolf` | 隐狼 | 夜晚不睁眼、不参与刀人投票。未以狼人身份行动时被查验为好人，行动后显示为狼人。骑士决斗隐狼时骑士获胜 | 否 |
| `mechanical_wolf` | 机械狼 | 第一晚选择模仿目标，第二晚释放模仿技能后进入静默。模仿村民/骑士/白痴则失败。所有其他狼人阵营死亡后可参与刀人投票 | 否 |

**机械狼模仿阶段流转：**

```
selecting (首夜选目标) → learning (次夜得知结果) → active (可使用模仿技能) → silent (静默)
                                                                    ↘ failed (模仿失败)
```

**共同睁眼规则：**
- 默认共同睁眼的狼人：普通狼人、狼王、噩梦之影
- 隐狼不属于共同睁眼的狼人
- 可通过 `RuleConfig.sharedWolfRoles` 自定义

**隐狼特殊权限：**
- 当狼人阵营其他成员全部死亡时，隐狼可回溯查看狼人聊天历史
- 隐狼未以狼人身份行动时被预言家查验为好人

**死亡原因 (DeathCause)：**

| DeathCause | 说明 |
|------------|------|
| `werewolf_kill` | 被狼人击杀 |
| `witch_poison` | 被女巫毒杀 |
| `vote_out` | 被投票出局 |
| `hunter_gun` | 被猎人开枪带走 |
| `wolf_king_gun` | 被狼王开枪带走 |
| `white_wolf_explode` | 被白狼王自爆带走 |
| `knight_duel` | 被骑士决斗带走（狼人） |
| `knight_suicide` | 骑士决斗好人翻车自尽 |
| `guard_witch_conflict` | 同守同救冲突死亡 |
| `judge_override` | 法官强制改判 |

---

## 10. 动态村规引擎 (RuleConfig)

`RuleConfig` 是整个游戏规则的核心配置对象，法官在建房时可精细化设置所有参数。

### 夜间行动顺序

| 预置模板 | 顺序 |
|---------|------|
| `classic` | 噩梦之影 → 狼人 → 女巫 → 预言家 → 守卫 → 机械狼 |
| `seer_first` | 噩梦之影 → 预言家 → 狼人 → 女巫 → 守卫 → 机械狼 |
| `witch_first` | 噩梦之影 → 狼人 → 女巫 → 预言家 → 守卫 → 机械狼 |
| `chaos` | 法官手动拖拽排序 |

### 村规配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `playerCount` | `number` | `9` | 游戏总人数 |
| `roleDistribution` | `Partial<Record<RoleId, number>>` | `{werewolf:3, seer:1, witch:1, hunter:1, guard:1, villager:2}` | 角色分配表 |
| `nightActionOrder` | `RoleId[]` | classic 模板 | 夜间行动顺序数组 |
| `nightActionOrderPreset` | `NightActionOrderPreset` | `'classic'` | 当前使用的预置模板 |
| `witchSaveSelf` | `WitchSaveSelfRule` | `'FIRST_NIGHT'` | 女巫自救规则（NEVER / FIRST_NIGHT / ALWAYS） |
| `guardWitchConflict` | `GuardWitchConflictRule` | `'DEATH'` | 同守同救冲突结算（DEATH / ALIVE） |
| `poisonBlockGun` | `boolean` | `true` | 吃毒是否封印技能（同时作用于猎人和狼王） |
| `knightDuelWolfKing` | `KnightDuelWolfKingRule` | `'SILENCED'` | 骑士决斗狼王冲突（CAN_SHOOT / SILENCED） |
| `knightDuelSuicide` | `KnightDuelSuicideRule` | `'SUICIDE'` | 骑士决斗好人翻车（SUICIDE / REVEAL_ONLY） |
| `tieVoteResolution` | `TieVoteResolution` | `'PK_VOTE'` | 平票处理策略（SKIP / PK_VOTE / RANDOM） |
| `winCondition` | `WinCondition` | `'SLAUGHTER_SIDE'` | 获胜条件（SLAUGHTER_SIDE / SLAUGHTER_ALL） |
| `daytimeKillSequence` | `DaytimeKillSequence` | `'TRIGGER_ALL'` | 白天死亡连锁结算（TRIGGER_ALL / TRIGGER_DEFERRED） |
| `werewolfSharedVision` | `WerewolfSharedVision` | `'ALL_SHARE'` | 狼人共群规则（ALL_SHARE / LEADER_ONLY / NONE） |
| `sharedWolfRoles` | `RoleId[]` | `['werewolf', 'wolf_king', 'nightmare_shadow']` | 共同睁眼的狼人列表 |
| `speechOrderStrategy` | `SpeechOrderStrategy` | `'DEATH_LEFT'` | 发言顺序策略（DEATH_LEFT / DEATH_RIGHT / SHERIFF_LEFT / SHERIFF_RIGHT / JUDGE_CUSTOM） |
| `nightActionTimeout` | `number` | `30` | 夜间行动超时（秒），0 表示无限等待 |
| `speechTimeout` | `number` | `60` | 白天发言每人超时（秒），0 表示无限等待 |
| `voteTimeout` | `number` | `20` | 投票超时（秒），0 表示无限等待 |
| `revealIdentityOnDayVote` | `RevealIdentityOnDayVote` | `'FACTION'` | 白天票出身份显示方式（NONE / FACTION / ROLE） |

---

## 11. 前端组件架构

前端游戏界面采用分层组件架构，按游戏阶段和功能职责组织：

### 通用组件

| 组件 | 文件 | 说明 |
|------|------|------|
| `GameView` | [GameView.tsx](file:///e:/GitHub/langrensha/client/src/components/game/GameView.tsx) | 游戏主视图容器，根据 phase 切换子组件 |
| `StatusBar` | [StatusBar.tsx](file:///e:/GitHub/langrensha/client/src/components/game/StatusBar.tsx) | 顶部状态栏（阶段/轮次/暂停状态） |
| `PlayerList` | [PlayerList.tsx](file:///e:/GitHub/langrensha/client/src/components/game/PlayerList.tsx) | 玩家列表（座位号/昵称/存活状态） |
| `RoleReveal` | [RoleReveal.tsx](file:///e:/GitHub/langrensha/client/src/components/game/RoleReveal.tsx) | 角色揭示覆盖层（游戏开始时显示一次） |
| `GameOver` | [GameOver.tsx](file:///e:/GitHub/langrensha/client/src/components/game/GameOver.tsx) | 游戏结束面板（获胜阵营/全场身份/返回大厅） |
| `CountdownTimer` | [CountdownTimer.tsx](file:///e:/GitHub/langrensha/client/src/components/game/CountdownTimer.tsx) | 可复用倒计时组件（进度条 + 秒数 + 紧急变色） |
| `TargetSelector` | [TargetSelector.tsx](file:///e:/GitHub/langrensha/client/src/components/game/TargetSelector.tsx) | 可复用目标选择网格（支持禁用/自选/原因提示） |
| `AppealButton` | [AppealButton.tsx](file:///e:/GitHub/langrensha/client/src/components/game/AppealButton.tsx) | 申诉仲裁按钮（提交申诉 + 仲裁投票面板） |
| `DeadChat` | [DeadChat.tsx](file:///e:/GitHub/langrensha/client/src/components/game/DeadChat.tsx) | 亡灵聊天（死亡玩家专属聊天区） |
| `SpectatorMode` | [SpectatorMode.tsx](file:///e:/GitHub/langrensha/client/src/components/game/SpectatorMode.tsx) | 观战模式（渐进式身份揭示 + 亡灵聊天） |

### 夜间阶段组件 (`night/`)

| 组件 | 文件 | 说明 |
|------|------|------|
| `NightPhase` | [NightPhase.tsx](file:///e:/GitHub/langrensha/client/src/components/game/night/NightPhase.tsx) | 夜间阶段容器，根据 `nightActionRequest.roleId` 切换面板 |
| `NightWaiting` | [NightWaiting.tsx](file:///e:/GitHub/langrensha/client/src/components/game/night/NightWaiting.tsx) | 夜间等待动画（月亮/星星/沙漏 + 当前行动角色名） |
| `WolfVotePanel` | [WolfVotePanel.tsx](file:///e:/GitHub/langrensha/client/src/components/game/night/WolfVotePanel.tsx) | 狼人投票面板（目标选择 + 投票进度 + 共识状态 + 狼群聊天） |
| `WolfChat` | [WolfChat.tsx](file:///e:/GitHub/langrensha/client/src/components/game/night/WolfChat.tsx) | 狼人专属聊天区域 |
| `NightmarePanel` | [NightmarePanel.tsx](file:///e:/GitHub/langrensha/client/src/components/game/night/NightmarePanel.tsx) | 噩梦之影恐惧目标选择 |
| `WitchPanel` | [WitchPanel.tsx](file:///e:/GitHub/langrensha/client/src/components/game/night/WitchPanel.tsx) | 女巫面板（解药/毒药两步操作 + 守卫信息 + 自救判断） |
| `SeerPanel` | [SeerPanel.tsx](file:///e:/GitHub/langrensha/client/src/components/game/night/SeerPanel.tsx) | 预言家面板（查验选择 + 结果展示） |
| `GuardPanel` | [GuardPanel.tsx](file:///e:/GitHub/langrensha/client/src/components/game/night/GuardPanel.tsx) | 守卫面板（守护选择 + 空守 + 首夜自守） |
| `MechanicalWolfPanel` | [MechanicalWolfPanel.tsx](file:///e:/GitHub/langrensha/client/src/components/game/night/MechanicalWolfPanel.tsx) | 机械狼面板（模仿选择/技能使用/静默/失败/封印 多状态切换） |

### 白天阶段组件 (`day/`)

| 组件 | 文件 | 说明 |
|------|------|------|
| `DayAnnounce` | [DayAnnounce.tsx](file:///e:/GitHub/langrensha/client/src/components/game/day/DayAnnounce.tsx) | 白天死讯公布（5秒自动关闭/点击关闭） |
| `SpeechPhase` | [SpeechPhase.tsx](file:///e:/GitHub/langrensha/client/src/components/game/day/SpeechPhase.tsx) | 发言阶段（发言顺序条 + 消息列表 + 骑士决斗入口 + 禁言提示） |
| `VotePhase` | [VotePhase.tsx](file:///e:/GitHub/langrensha/client/src/components/game/day/VotePhase.tsx) | 投票阶段（目标选择 + 弃权 + 确认对话框 + 结果展示 + PK信息） |

### 技能释放组件 (`skills/`)

| 组件 | 文件 | 说明 |
|------|------|------|
| `HunterGun` | [HunterGun.tsx](file:///e:/GitHub/langrensha/client/src/components/game/skills/HunterGun.tsx) | 猎人开枪（含被毒封印判断 + 确认对话框） |
| `KnightDuel` | [KnightDuel.tsx](file:///e:/GitHub/langrensha/client/src/components/game/skills/KnightDuel.tsx) | 骑士决斗（目标选择 + 确认 + 结果覆盖层 + 翻牌效果） |

### 观战模式身份揭示时间表

| 死亡后经过夜晚数 | 可见信息 |
|----------------|---------|
| 0 夜 | 仅公开信息 |
| 1 夜 | 可感知狼人行动迹象（狼人阵营标记 🐺） |
| 2 夜及以上 | 揭示所有存活玩家身份 |

---

## 12. 依赖关系

### 运行时依赖

```
langrensha (root)
├── concurrently (dev)          # 并行启动 server + client
└── typescript (dev)            # TypeScript 编译器

@langrensha/shared
└── (无运行时依赖，纯类型定义)

@langrensha/server
├── @langrensha/shared          # 共享类型
├── ws                          # WebSocket 服务器
├── mongoose                    # MongoDB ODM
├── dotenv                      # 环境变量加载
└── qrcode                      # 二维码生成

@langrensha/client
├── @langrensha/shared          # 共享类型
├── react / react-dom           # UI 框架
├── zustand                     # 状态管理
└── qrcode.react                # 前端二维码渲染
```

### 开发依赖

```
@langrensha/server
├── tsx                         # TypeScript 执行器 (dev watch)
├── @types/ws, @types/node, @types/qrcode

@langrensha/client
├── vite                        # 构建工具
├── @vitejs/plugin-react        # Vite React 插件
├── tailwindcss + postcss + autoprefixer  # CSS 框架
├── @types/react, @types/react-dom
```

### 包间依赖图

```
shared ←── server
shared ←── client
(root workspaces 协调三者)
```

---

## 13. 项目运行方式

### 前置条件

- Node.js >= 18
- MongoDB（本地或 Atlas）
- npm >= 9

### 安装依赖

```bash
# 在项目根目录执行
npm install
```

### 环境配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env，填写：
# - PORT=3001
# - MONGODB_URI=mongodb+srv://...
# - PUBLIC_URL=（公网部署时填写）
# - ADMIN_SECRET=（管理员密钥）
```

### 开发模式

```bash
# 方式1：使用启动脚本（Windows）
start.bat

# 方式2：npm 命令
npm run dev

# 等价于并行启动：
npm run dev:server   # tsx watch src/server.ts
npm run dev:client   # vite (http://localhost:5173)
```

### 生产构建

```bash
npm run build
# 顺序：shared → server → client

npm run server
# node dist/server.js
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端（开发） | http://localhost:5173 |
| WebSocket 服务端 | ws://localhost:3001 |
| 健康检查 | http://localhost:3001/health |

---

## 14. 环境变量配置

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | `3001` | 服务端监听端口 |
| `MONGODB_URI` | 否 | 空 | MongoDB 连接字符串，为空则日志持久化不可用 |
| `PUBLIC_URL` | 否 | `ws://localhost:{PORT}` | 公网 WebSocket 地址（chmlfrp 内网穿透） |
| `ADMIN_SECRET` | 否 | 空 | 管理员密钥，为空则管理员功能禁用 |

---

## 15. 数据库设计

### rooms 集合

存储房间完整状态，用于断线重连和服务重启后恢复。

| 字段 | 类型 | 说明 |
|------|------|------|
| `roomCode` | String (unique) | 6位房间码 |
| `gameMode` | String | HUMAN / SYSTEM |
| `phase` | String | 当前游戏阶段 |
| `nightSubPhase` | SubDocument | 夜间子阶段 |
| `round` | Number | 当前轮次 |
| `config` | SubDocument (RuleConfig) | 村规配置 |
| `configVersion` | Number | 配置版本号 |
| `players` | [SubDocument] | 玩家列表（含角色/状态/专属字段） |
| `speechOrder` | [Number] | 发言顺序 |
| `currentSpeakerIndex` | Number | 当前发言者索引 |
| `votes` | Map<Number, Number> | 投票记录 |
| `nightActions` | Map<String, NightActionData> | 夜间行动记录 |
| `werewolfTarget` | Number | 当晚狼人击杀目标 |
| `witchSaveTarget` | Number | 当晚女巫解药目标 |
| `witchPoisonTarget` | Number | 当晚女巫毒药目标 |
| `guardProtectTarget` | Number | 当晚守卫守护目标 |
| `nightmareTarget` | Number | 当晚噩梦恐惧目标 |
| `nightmareDeferred` | Boolean | 恐惧是否延期 |
| `wolfVotes` | Map<Number, Number> | 狼人投票记录 |
| `wolfVoteConsensus` | Boolean | 狼人投票是否一致 |
| `wolfChatMessages` | [SubDocument] | 狼人聊天消息 |
| `nightDeaths` | [SubDocument] | 夜间死亡记录 |
| `dayDeaths` | [SubDocument] | 白天死亡记录 |
| `isPaused` | Boolean | 是否暂停 |
| `winner` | String | 获胜阵营 |
| `createdAt` | Number | 创建时间戳 |
| `startedAt` | Number | 开始时间戳 |
| `endedAt` | Number | 结束时间戳 |

**索引：** `{ phase: 1, createdAt: -1 }`

### game_logs 集合

存储全局操作日志，用于复盘和审计。

| 字段 | 类型 | 说明 |
|------|------|------|
| `roomCode` | String | 房间码 |
| `timestamp` | Number | 时间戳 |
| `actorSeat` | Number | 操作人座位号 |
| `actorNickname` | String | 操作人昵称 |
| `actionType` | String (enum) | 动作类型（37种） |
| `targetSeat` | Number | 目标座位号 |
| `targetNickname` | String | 目标昵称 |
| `phase` | String (enum) | 当前游戏阶段 |
| `round` | Number | 当前轮次 |
| `detail` | Map<String, Mixed> | 动作详细数据 |
| `overridden` | Boolean | 是否被法官改判 |
| `overrideReason` | String | 改判原因 |
| `nightActionOrderSnapshot` | [String] | 当时的夜间行动顺序快照 |

**索引：**
- `{ roomCode: 1, timestamp: -1 }` — 按房间+时间查询
- `{ actionType: 1, timestamp: -1 }` — 按动作类型查询
- `{ timestamp: -1 }` — 全局时间范围查询
- `{ roomCode: 1, round: 1, phase: 1 }` — 按房间+轮次+阶段查询

### ActionType 完整枚举

| 分类 | 动作类型 |
|------|---------|
| 大厅操作 | `PLAYER_JOIN`, `PLAYER_LEAVE`, `PLAYER_READY`, `GAME_START` |
| 夜间操作 | `NIGHT_PHASE_START`, `NIGHT_ACTION_SUBMIT`, `NIGHT_ACTION_BLOCKED`, `NIGHT_SETTLEMENT`, `NIGHTMARE_DEFER`, `NIGHTMARE_BLOCK_MODE_DOWNGRADE`, `WOLF_CHAT_MESSAGE`, `WOLF_VOTE_CAST`, `WOLF_VOTE_CONSENSUS`, `WOLF_VOTE_TIMEOUT_RANDOM` |
| 白天操作 | `DAY_ANNOUNCE`, `SPEECH_START`, `SPEECH_CONTENT`, `SPEECH_SKIP`, `VOTE_CAST`, `VOTE_RESULT`, `PK_VOTE_START` |
| 特殊技能 | `KNIGHT_DUEL`, `WHITE_WOLF_EXPLODE`, `HUNTER_GUN`, `WOLF_KING_GUN`, `IDIOT_REVEAL` |
| 法官操作 | `JUDGE_OVERRIDE_SETTLEMENT`, `JUDGE_FORCE_NEXT_PHASE`, `JUDGE_PAUSE`, `JUDGE_RESUME`, `JUDGE_MODIFY_SPEECH_ORDER`, `JUDGE_MODIFY_NIGHT_ORDER`, `JUDGE_TRIGGER_KNIGHT_DUEL`, `JUDGE_TRIGGER_WHITE_WOLF`, `JUDGE_SKIP_SPEECH` |
| 系统 | `GAME_OVER`, `PHASE_CHANGE`, `TIMER_EXPIRED` |
| V10 新增 | `WOLF_PHASE_SKIPPED`, `GUARD_NO_VALID_TARGET`, `MECHANICAL_WOLF_SKILL_DEFERRED`, `DEAD_CHAT_MESSAGE`, `DAY_VOTE_IDENTITY_REVEAL` |
