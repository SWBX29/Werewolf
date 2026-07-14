# 狼人杀联机游戏 — Code Wiki

> 本文档提供项目完整的架构说明、模块职责、关键类与函数说明、依赖关系以及运行方式。

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [主要模块职责](#4-主要模块职责)
5. [关键类与函数说明](#5-关键类与函数说明)
6. [数据流与通信协议](#6-数据流与通信协议)
7. [依赖关系图](#7-依赖关系图)
8. [项目运行方式](#8-项目运行方式)
9. [核心设计原则](#9-核心设计原则)
10. [角色系统](#10-角色系统)
11. [游戏状态机](#11-游戏状态机)
12. [村规配置系统](#12-村规配置系统)

---

## 1. 项目概述

本项目是一个**狼人杀联机游戏**，支持多人在线对战，包含完整的角色系统、法官控制台、语音通话等功能。

### 核心特性

- **多人在线对战**：支持 6-18 人游戏
- **法官/上帝模式**：法官可手动控制游戏流程
- **系统跑团模式**：依据 RuleConfig 自动推进游戏
- **动态村规配置**：法官可精细化设置所有规则参数
- **语音通话**：集成 ZEGO SDK 实现实时语音
- **断线重连**：支持 WebSocket 断线自动重连
- **观战模式**：死亡玩家可观战并查看身份暴露
- **警长选举**：支持警长选举和警徽移交
- **游戏模拟器**：多连接测试工具，支持自动策略执行
- **错误日志系统**：独立数据库存储，支持错误去重与查询

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 状态管理 | Zustand |
| 样式框架 | Tailwind CSS |
| 后端框架 | Node.js + 原生 http 模块 |
| 数据库 | MongoDB (Mongoose) |
| 实时通信 | WebSocket (ws 库) |
| 语音服务 | ZEGO SDK |
| 构建工具 | Vite |

---

## 2. 整体架构

### 架构分层图

```
┌─────────────────────────────────────────────────────────────────┐
│                        客户端 (Client)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  React UI   │  │  Zustand    │  │    WebSocket Client     │  │
│  │  Components │──│  Store      │──│    (useGameStore)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                    │                  │
│         ▼                ▼                    ▼                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              @langrensha/shared (共享类型层)                 ││
│  │   types.ts, types/zego.ts, ROLE_META, RuleConfig            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (JSON Messages)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        服务端 (Server)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  HTTP       │  │ WebSocket   │  │      LobbyManager       │  │
│  │  Server     │──│  Handler    │──│   (房间生命周期管理)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                    │                  │
│         ▼                ▼                    ▼                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ GameEngine  │  │ Settlement  │  │      TimerManager       │  │
│  │ (状态机)    │──│  Engine     │──│    (超时控制)            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                    │                  │
│         ▼                ▼                    ▼                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    MongoDB (Mongoose)                        ││
│  │   RoomModel (房间状态) | GameLogModel (操作日志)              ││
│  │   WolfChatLogModel (狼人聊天)                                ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ REST API / Token
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ZEGO 语音服务                                │
│            实时语音通话、房间管理、Token 鉴权                     │
└─────────────────────────────────────────────────────────────────┘
```

### 核心设计原则

1. **零硬编码**：所有游戏规则通过 `RuleConfig` 动态配置
2. **防作弊 DTO**：`PlayerDTO` 仅暴露当前玩家可见信息
3. **动态夜间顺序**：`nightActionOrder` 为数组，状态机按序遍历
4. **白天中断协议**：骑士决斗/白狼王自爆可随时中断白天流程
5. **状态机驱动**：游戏流程由 `GameEngine` 状态机控制

---

## 3. 目录结构

```
langrensha/
├── client/                     # 前端应用
│   ├── src/
│   │   ├── components/         # React 组件
│   │   │   ├── HomeView.tsx    # 首页视图
│   │   │   ├── JudgeConsole.tsx # 法官控制台
│   │   │   ├── AdminDashboard.tsx # 管理员后台
│   │   │   ├── SimulatorView.tsx # 游戏模拟器主视图
│   │   │   ├── RoomConfigPanel.tsx # 房间配置面板（复用）
│   │   │   └── game/           # 游戏组件
│   │   │       ├── GameView.tsx    # 玩家游戏主界面
│   │   │       ├── StatusBar.tsx   # 状态栏
│   │   │       ├── PlayerList.tsx  # 玩家列表
│   │   │       ├── RoleReveal.tsx  # 角色揭示
│   │   │       ├── night/          # 夜间阶段组件
│   │   │       │   ├── NightPhase.tsx
│   │   │       │   ├── NightWaiting.tsx
│   │   │       │   ├── SeerPanel.tsx
│   │   │       │   ├── WitchPanel.tsx
│   │   │       │   ├── GuardPanel.tsx
│   │   │       │   ├── NightmarePanel.tsx
│   │   │       │   ├── WolfVotePanel.tsx
│   │   │       │   ├── WolfChat.tsx
│   │   │       │   └── MechanicalWolfPanel.tsx
│   │   │       ├── day/            # 白天阶段组件
│   │   │       │   ├── SpeechPhase.tsx
│   │   │       │   ├── VotePhase.tsx
│   │   │       │   ├── DayAnnounce.tsx
│   │   │       │   ├── SheriffElection.tsx
│   │   │       │   └── SheriffTransfer.tsx
│   │   │       ├── skills/         # 技能组件
│   │   │       │   ├── KnightDuel.tsx
│   │   │       │   ├── HunterGun.tsx
│   │   │       │   ├── WolfKingGun.tsx
│   │   │       │   ├── WhiteWolfExplode.tsx
│   │   │       │   └── IdiotReveal.tsx
│   │   │       ├── VoiceControlBar.tsx # 语音控制栏
│   │   │       ├── VoiceInfoPanel.tsx  # 语音信息面板
│   │   │       ├── SpectatorMode.tsx   # 观战模式
│   │   │       ├── DeadChat.tsx        # 死亡玩家聊天
│   │   │       └── GameOver.tsx        # 游戏结束
│   │   │   └── simulator/       # 模拟器组件
│   │   │       ├── useSimulatorStore.ts # 模拟器状态仓库
│   │   │       ├── SimulatorView.tsx    # 模拟器主视图
│   │   │       ├── RoomSetupPanel.tsx   # 房间设置面板
│   │   │       ├── SeatMap.tsx          # 座位图
│   │   │       ├── EventLog.tsx         # 事件日志
│   │   │       ├── AutoStrategyPanel.tsx # 自动策略面板
│   │   │       ├── GamePanelWrapper.tsx # 游戏面板包装器
│   │   │       ├── storeInjector.ts     # 状态注入器
│   │   │       └── websocket.ts         # WebSocket 管理
│   │   ├── store/
│   │   │   └── useVoiceStore.ts    # 语音状态管理
│   │   ├── hooks/
│   │   │   └── useZegoVoice.ts     # ZEGO 语音 Hook
│   │   ├── services/
│   │   │   └── zego.ts             # ZEGO 服务封装
│   │   ├── useGameStore.ts         # Zustand 全局状态仓库
│   │   ├── App.tsx                 # 入口组件
│   │   └── main.tsx                # 应用入口
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── server/                     # 后端应用
│   ├── src/
│   │   ├── server.ts           # HTTP + WebSocket 服务器入口
│   │   ├── GameEngine.ts       # 游戏状态机引擎
│   │   ├── LobbyManager.ts     # 大厅与房间管理器
│   │   ├── SettlementEngine.ts # 结算引擎
│   │   ├── TimerManager.ts     # 定时器管理器
│   │   ├── errorLogger.ts      # 错误日志管理器
│   │   ├── models.ts           # Mongoose 数据模型
│   │   ├── services/
│   │   │   └── zegoTokenService.ts # ZEGO Token 服务
│   │   ├── migrations/
│   │   │   ├── migrate-log-database.ts
│   │   │   └── run-migration.ts
│   │   └── scripts/
│   │       └── query-errors.ts # 错误查询脚本
│   ├── bin/
│   │   └── mefrpc.exe          # ME Frp 内网穿透工具
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                     # 共享类型定义
│   ├── types.ts                # 全局类型定义（角色、规则、状态、常量）
│   ├── types/
│   │   └── zego.ts             # ZEGO 语音相关类型
│   └── package.json
│
├── package.json                # Monorepo 根配置
├── CODE_WIKI.md                # 本文档
└── README.md                   # 项目说明
```

---

## 4. 主要模块职责

### 4.1 服务端模块

#### [server.ts](file:///e:/GitHub/langrensha/server/src/server.ts)

**职责**：HTTP + WebSocket 服务器入口，消息路由

**核心功能**：
- 初始化 HTTP 服务器和 WebSocket
- 连接 MongoDB 数据库
- 处理客户端消息路由
- 广播服务端消息到房间
- 提供 ZEGO Token API

#### [GameEngine.ts](file:///e:/GitHub/langrensha/server/src/GameEngine.ts)

**职责**：游戏状态机引擎，控制游戏流程

**核心功能**：
- 管理 `RoomState` 状态
- 驱动游戏阶段流转（LOBBY → NIGHT → DAY → GAME_OVER）
- 处理夜间子阶段遍历
- 处理白天发言、投票、结算
- 处理特殊技能（骑士决斗、白狼王自爆、猎人开枪等）
- 调用 `SettlementEngine` 进行结算
- 记录游戏日志

**状态流转**：
```
LOBBY → ROLE_REVEAL → PRE_NIGHT → NIGHT → NIGHT_SETTLEMENT → 
DAY_ANNOUNCE → [SHERIFF_ELECTION] → DAY_SPEECH → PRE_VOTE_WAIT → 
DAY_VOTE → DAY_SETTLEMENT → [DAY_INTERRUPT] → NIGHT → ...
                                                              ↓
                                                          GAME_OVER
```

#### [LobbyManager.ts](file:///e:/GitHub/langrensha/server/src/LobbyManager.ts)

**职责**：大厅与房间生命周期管理

**核心功能**：
- 密码学安全随机生成 6 位房间码
- 创建/销毁房间
- 加入/离开房间握手逻辑
- 玩家连接映射（WebSocket → 房间 + 玩家）
- 断线重连处理（60 秒宽限期）
- 房间码唯一性校验

**关键类型**：
```typescript
interface ClientContext {
  ws: WebSocket;
  playerId: string;
  nickname: string;
  roomCode: string | null;
  isJudge: boolean;
  connectedAt: number;
  disconnected: boolean;
  disconnectedAt: number | null;
  gracePeriodTimer: ReturnType<typeof setTimeout> | null;
  origin: string;
}
```

#### [SettlementEngine.ts](file:///e:/GitHub/langrensha/server/src/SettlementEngine.ts)

**职责**：独立的结算逻辑函数，纯函数设计

**核心功能**：
- `checkWinCondition()` - 检查游戏获胜条件（屠边/屠城）
- `resolveDeathChain()` - 解析死亡连锁（猎人/狼王开枪）
- `calculateSpeechOrder()` - 计算发言顺序
- `resolveVoteResult()` - 解析投票结果
- `canMechanicalWolfActAsWolf()` - 判断机械狼是否可作为狼人行动
- `isMechanicalWolfImitationFailed()` - 判断机械狼模仿是否失败
- `getMechanicalWolfSeerResult()` - 获取机械狼被预言家查验结果

**设计原则**：
- 纯函数：无副作用，便于测试
- 可复用：可被 GameEngine 和其他模块调用

#### [TimerManager.ts](file:///e:/GitHub/langrensha/server/src/TimerManager.ts)

**职责**：游戏阶段超时控制

**核心功能**：
- 设置/清除定时器
- 支持暂停/恢复（配合法官暂停功能）
- 每秒回调（倒计时广播）
- 获取剩余时间

**定时器类型**：
```typescript
const TIMER_NAMES = {
  NIGHT_ACTION: 'night_action',
  WOLF_VOTE: 'wolf_vote',
  SPEECH: 'speech',
  VOTE: 'vote',
  SHERIFF_ELECTION: 'sheriff_election',
  SHERIFF_TRANSFER: 'sheriff_transfer',
  KNIGHT_DUEL: 'knight_duel',
  HUNTER_GUN: 'hunter_gun',
  WHITE_WOLF_EXPLODE: 'white_wolf_explode',
};
```

#### [models.ts](file:///e:/GitHub/langrensha/server/src/models.ts)

**职责**：Mongoose 数据模型定义

**核心集合**：
- `RoomModel` - 房间状态持久化（断线重连、服务重启后恢复）
- `GameLogModel` - 全局操作日志（复盘、审计、Admin 后台查询）
- `WolfChatLogModel` - 狼人聊天日志独立集合

**索引设计**：
- 房间码 + 时间范围查询
- 动作类型查询
- 游戏局 ID 查询

#### [errorLogger.ts](file:///e:/GitHub/langrensha/server/src/errorLogger.ts)

**职责**：错误日志独立数据库连接与记录管理

**核心功能**：
- 独立 MongoDB 连接（langrensha_errors 数据库）
- 错误日志持久化（服务端和客户端错误）
- 相同错误通过 fingerprint 去重，累加计数
- 错误级别分类（error / warn / fatal）
- 支持错误查询脚本（scripts/query-errors.ts）

**设计原则**：
- 错误日志与游戏数据物理隔离
- 连接失败不影响主游戏流程
- 去重机制避免重复插入相同错误

### 4.2 前端模块

#### [useGameStore.ts](file:///e:/GitHub/langrensha/client/src/useGameStore.ts)

**职责**：Zustand 全局状态仓库，前端单一状态源

**核心功能**：
- WebSocket 连接管理（断线自动重连）
- 服务端消息接收与状态同步
- 客户端消息发送
- 视图路由状态管理

**状态分类**：
```typescript
interface GameState {
  // 连接状态
  ws: WebSocket | null;
  isConnected: boolean;
  isReconnecting: boolean;
  playerId: string | null;
  
  // 视图路由
  currentView: 'home' | 'game' | 'admin';
  
  // 房间状态
  roomCode: string | null;
  playerState: PlayerRoomStateDTO | null;
  judgeState: JudgeRoomStateDTO | null;
  
  // UI 状态
  error: string | null;
  phaseAnnouncement: string | null;
  roleConfirmed: boolean;
  
  // 游戏扩展状态
  speechMessages: Array<{...}>;
  nightActionResult: NightActionResultMessage | null;
  gameOverData: GameOverMessage | null;
  
  // RuleConfig 编辑
  ruleConfig: RuleConfig;
}
```

**重连策略**：
- 固定间隔 2.5 秒
- 最大重连次数 50 次（约 2 分钟）
- 竞速连接：同时发起 3 个 WebSocket，第一个连通的胜出

#### [App.tsx](file:///e:/GitHub/langrensha/client/src/App.tsx)

**职责**：前端入口组件

**核心功能**：
- 根据路由状态渲染不同视图组件
- 初始化 WebSocket 连接
- 全局错误提示和连接状态指示
- 骨架屏管理
- 组件预加载（首页加载后自动预加载游戏组件）
- ZEGO 语音服务初始化

#### [GameView.tsx](file:///e:/GitHub/langrensha/client/src/components/game/GameView.tsx)

**职责**：玩家游戏主界面容器

**核心功能**：
- 根据游戏阶段动态切换主面板内容
- 渲染通用布局（状态栏 + 主面板 + 底部信息栏）
- 管理角色揭示、观战模式、申诉等全局覆盖层
- 语音连接状态管理

**布局结构**：
```
┌──────────────────────────────────────────┐
│  [StatusBar]  阶段名 | 倒计时 | 行动提示  │
├──────────────────────────────────────────┤
│   [主面板]  根据阶段动态切换              │
├──────────────────────────────────────────┤
│  [底部栏]  存活人数 | 座位表 | 设置       │
└──────────────────────────────────────────┘
```

### 4.3 共享模块

#### [types.ts](file:///e:/GitHub/langrensha/shared/types.ts)

**职责**：全局共享类型定义，前后端类型契约

**核心内容**：
- `RoleId` - 角色唯一标识符
- `Faction` - 阵营枚举（good/evil）
- `ROLE_META` - 全角色元数据表
- `RuleConfig` - 动态村规配置接口
- `GamePhase` - 游戏主阶段枚举
- `NightSubPhase` - 夜间子阶段信息
- `Player` - 完整玩家数据
- `PlayerDTO` / `JudgeRoomStateDTO` - 防作弊 DTO
- `ClientMessage` / `ServerMessage` - WebSocket 消息类型

### 4.4 模拟器模块

#### [useSimulatorStore.ts](file:///e:/GitHub/langrensha/client/src/components/simulator/useSimulatorStore.ts)

**职责**：模拟器 Zustand 全局状态仓库

**核心功能**：
- 多连接 WebSocket 生命周期管理
- 服务端消息接收与状态同步
- 自动策略建议与执行
- 事件日志记录

**设计原则**：
- 单一 store 管理所有模拟器连接和状态
- 通过 storeInjector 将状态桥接到 useGameStore 复用游戏组件

#### [SimulatorView.tsx](file:///e:/GitHub/langrensha/client/src/components/SimulatorView.tsx)

**职责**：游戏模拟器主视图

**核心功能**：
- 管理 Setup / Lobby / Playing / GameOver 四个模拟器阶段
- 左侧面板：房间信息 + 座位图 + 大厅控制
- 右侧面板：玩家操作 / 法官控制 Tab 切换 + 自动策略折叠面板
- 底部：可折叠事件日志

**布局结构**：
```
┌──────────────────────────────────────────────────────────────┐
│  [左侧面板]  房间信息 | 座位图 | 大厅控制（可拖拽调整宽度）    │
├──────────────────────────────────────────────────────────────┤
│  [右侧面板]  玩家操作 / 法官控制 Tab | 自动策略面板           │
├──────────────────────────────────────────────────────────────┤
│  [底部]  可折叠事件日志                                       │
└──────────────────────────────────────────────────────────────┘
```

#### [storeInjector.ts](file:///e:/GitHub/langrensha/client/src/components/simulator/storeInjector.ts)

**职责**：将模拟器状态注入 useGameStore

**核心功能**：
- 将选中玩家的 PlayerRoomStateDTO 注入到 useGameStore
- 拦截消息发送并路由到正确的 WebSocket 连接
- 组件卸载时自动断开所有模拟器连接

---

## 5. 关键类与函数说明

### 5.1 服务端核心类

#### `GameEngine` 类

```typescript
class GameEngine {
  // 状态管理
  private state: RoomState;
  private timerManager: TimerManager;
  
  // 核心方法
  getState(): RoomState;
  startGame(): void;
  
  // 夜间阶段
  advanceNightSubPhase(): void;
  processNightAction(roleId: RoleId, actorSeat: number, targetSeat: number | null, extra: NightActionExtra): void;
  
  // 白天阶段
  startSpeechPhase(): void;
  processSpeech(seatNumber: number, content: string): void;
  processVote(voterSeat: number, targetSeat: number | null): void;
  
  // 特殊技能
  processKnightDuel(knightSeat: number, targetSeat: number): void;
  processWhiteWolfExplode(wolfSeat: number, targetSeat: number): void;
  processHunterGun(hunterSeat: number, targetSeat: number): void;
  
  // 法官操作
  judgeOverrideSettlement(targetSeat: number, newStatus: PlayerStatus, reason: string): void;
  judgeForceNextPhase(): void;
  
  // 定时器
  setNightActionTimer(roleId: RoleId, timeout: number): void;
  clearAllTimers(): void;
  
  // 销毁
  destroy(): void;
}
```

#### `LobbyManager` 类

```typescript
class LobbyManager {
  // 数据结构
  private rooms: Map<string, GameEngine>;
  private clients: Map<string, ClientContext>;
  private wsToPlayerId: Map<WebSocket, string>;
  private roomClientsIndex: Map<string, Set<string>>;
  
  // 连接管理
  registerConnection(ws: WebSocket, origin: string): ClientContext;
  unregisterConnection(ws: WebSocket): { roomCode: string | null; playerId: string };
  reconnectPlayer(playerId: string, roomCode: string, newWs: WebSocket): { success: boolean; context?: ClientContext };
  
  // 房间操作
  createRoom(hostNickname: string, gameMode: GameMode, config: RuleConfig, hostWs: WebSocket, origin: string): { success: boolean; roomCode?: string };
  joinRoom(nickname: string, roomCode: string, playerWs: WebSocket): { success: boolean; playerId?: string; seatNumber?: number };
  leaveRoom(playerId: string): { success: boolean; roomCode?: string };
  dissolveRoom(playerId: string): { success: boolean; roomCode?: string; players?: Array<{...}> };
  
  // 查询
  getRoom(roomCode: string): GameEngine | undefined;
  getRoomClients(roomCode: string): ClientContext[];
  getRoomCount(): number;
  getOnlineCount(): number;
}
```

### 5.2 结算引擎函数

```typescript
// 检查获胜条件
function checkWinCondition(
  players: Player[],
  winCondition: WinCondition
): Faction | null;

// 解析死亡连锁
function resolveDeathChain(deadPlayer: Player): DeathChainResult;

// 计算发言顺序
function calculateSpeechOrder(
  players: Player[],
  strategy: SpeechOrderStrategy,
  ...
): number[];

// 解析投票结果
function resolveVoteResult(
  votes: Record<number, number>,
  ...
): VoteResult;

// 判断机械狼是否可作为狼人行动
function canMechanicalWolfActAsWolf(player: Player): boolean;

// 判断机械狼模仿是否失败
function isMechanicalWolfImitationFailed(player: Player): boolean;

// 获取机械狼被预言家查验结果
function getMechanicalWolfSeerResult(player: Player): Faction;
```

### 5.3 共享类型函数

```typescript
// 判断角色阵营
function isEvilRole(roleId: RoleId): boolean;

// 判断是否为隐狼
function isHiddenWolf(roleId: RoleId): boolean;

// 判断是否为共同睁眼的狼人
function isSharedWolfRole(roleId: RoleId, sharedWolfRoles?: string[]): boolean;

// 判断是否有夜间行动能力
function hasNightAction(roleId: RoleId): boolean;

// 判断是否为模仿失败角色
function isImitationFailRole(roleId: RoleId): boolean;

// 创建默认 RuleConfig
function createDefaultRuleConfig(playerCount?: number): RuleConfig;
```

---

## 6. 数据流与通信协议

### 6.1 WebSocket 消息类型

#### 客户端消息 (`ClientMessage`)

| 类型 | 说明 | 参数 |
|------|------|------|
| `CREATE_ROOM` | 创建房间 | nickname, gameMode, config |
| `JOIN_ROOM` | 加入房间 | nickname, roomCode |
| `LEAVE_ROOM` | 离开房间 | - |
| `DISSOLVE_ROOM` | 解散房间（法官） | - |
| `READY` | 准备/取消准备 | ready |
| `START_GAME` | 开始游戏 | - |
| `RECONNECT` | 断线重连 | playerId, roomCode |
| `NIGHT_ACTION` | 提交夜间行动 | roleId, targetSeat, extra |
| `DAY_VOTE` | 提交投票 | targetSeat |
| `SPEECH` | 发言 | content |
| `FINISH_SPEECH` | 结束发言 | - |
| `WOLF_CHAT` | 狼人聊天 | content |
| `WOLF_VOTE` | 狼人投票 | targetSeat |
| `KNIGHT_DUEL` | 骑士决斗 | targetSeat |
| `HUNTER_GUN` | 猎人开枪 | targetSeat |
| `WOLF_KING_GUN` | 狼王开枪 | targetSeat |
| `WHITE_WOLF_EXPLODE` | 白狼王自爆 | targetSeat |
| `SHERIFF_ELECTION_VOTE` | 警长选举投票 | targetSeat |
| `SHERIFF_TRANSFER` | 警徽移交 | targetSeat |
| `JUDGE_OVERRIDE_SETTLEMENT` | 法官修改结算 | targetSeat, newStatus, reason |
| `JUDGE_FORCE_NEXT_PHASE` | 法官强制推进阶段 | - |
| `JUDGE_PAUSE` | 法官暂停游戏 | - |
| `JUDGE_RESUME` | 法官恢复游戏 | - |
| `JUDGE_MODIFY_SPEECH_ORDER` | 法官修改发言顺序 | order |
| `JUDGE_TRIGGER_KNIGHT_DUEL` | 法官代操作：触发骑士决斗 | knightSeat, targetSeat |
| `JUDGE_TRIGGER_WHITE_WOLF` | 法官代操作：触发白狼王自爆 | wolfSeat, targetSeat |
| `JUDGE_SKIP_SPEECH` | 法官跳过某玩家发言 | seatNumber |
| `UPDATE_NIGHT_ORDER` | 法官修改夜间顺序 | newOrder |
| `DEAD_CHAT` | 死亡玩家聊天 | content |
| `APPEAL` | 玩家申诉仲裁 | eventId |
| `ARBITRATION_VOTE` | 仲裁投票 | eventId, support |
| `ADMIN_FETCH_LOGS` | 管理员查询日志 | secret, roomCode, fromTime, toTime, ... |
| `ADMIN_CLEANUP_CONFIG` | 管理员清除旧配置 | secret |
| `PING` | 心跳消息 | - |

#### 服务端消息 (`ServerMessage`)

| 类型 | 说明 | 参数 |
|------|------|------|
| `ROOM_CREATED` | 房间创建成功 | roomCode, inviteLink, qrCodeDataUrl |
| `ROOM_STATE` | 房间状态推送 | state (PlayerRoomStateDTO / JudgeRoomStateDTO) |
| `PHASE_CHANGE` | 阶段变更 | phase, nightSubPhase, round |
| `NIGHT_ACTION_REQUEST` | 夜间行动请求 | request |
| `NIGHT_ACTION_RESULT` | 夜间行动结果 | seerResult, ... |
| `DAY_ANNOUNCE` | 天亮公告 | deaths, mutedSeats |
| `VOTE_RESULT` | 投票结果 | votes, eliminated, isPK, pkCandidates |
| `KNIGHT_DUEL_RESULT` | 骑士决斗结果 | targetIsWolf, knightDied, ... |
| `WHITE_WOLF_EXPLODE_RESULT` | 白狼王自爆结果 | wolfSeat, targetSeat, ... |
| `HUNTER_GUN_RESULT` | 猎人开枪结果 | hunterSeat, targetSeat, ... |
| `WOLF_KING_GUN_RESULT` | 狼王开枪结果 | wolfKingSeat, targetSeat, ... |
| `IDIOT_REVEAL` | 白痴翻牌 | seatNumber, ... |
| `GAME_OVER` | 游戏结束 | winner, round, players |
| `ROOM_DISSOLVED` | 房间解散 | reason, players |
| `RECONNECT_SUCCESS` | 重连成功 | playerId, roomCode |
| `ERROR` | 错误消息 | code, message |
| `JUDGE_WARNING` | 法官警告 | warningType, message, data |
| `JUDGE_ACTION` | 法官操作通知 | action, ... |
| `SPEECH_ORDER_UPDATE` | 发言顺序更新 | order |
| `PLAYER_JOINED` | 玩家加入房间 | player |
| `PLAYER_LEFT` | 玩家离开房间 | seatNumber, nickname |
| `PLAYER_READY` | 玩家准备状态变更 | seatNumber, isReady |
| `PHASE_REMINDER` | 阶段提醒 | message |
| `WOLF_CHAT_HISTORY` | 狼人聊天历史 | messages |
| `WOLF_VOTE_UPDATE` | 狼人投票更新 | votes, consensus, lockedTarget |
| `WOLF_PHASE_SKIPPED` | 狼人阶段跳过 | reason |
| `NIGHT_COUNTDOWN` | 夜间倒计时 | roleId, remaining |
| `SPEECH_COUNTDOWN` | 发言倒计时 | seatNumber, remaining |
| `SPEECH_CONTENT` | 发言内容 | seatNumber, content |
| `DAY_VOTE_REVEAL` | 白天投票揭示 | votes |
| `SHERIFF_ELECTED` | 警长当选 | seatNumber, nickname |
| `SHERIFF_ELECTION_TIE` | 警长选举平票 | tiedSeats |
| `SHERIFF_TRANSFER_REQUEST` | 警徽移交请求 | deadSheriffSeat, availableTargets, timeout |
| `SHERIFF_TRANSFER_RESULT` | 警徽移交结果 | fromSeat, toSeat, isTimeout |
| `DEAD_CHAT` | 死亡玩家聊天消息 | messages |
| `APPEAL_EVENT` | 申诉事件 | eventId, ... |
| `ARBITRATION_VOTE` | 仲裁投票结果 | eventId, ... |
| `ADMIN_LOGS_RESULT` | 管理员日志结果 | logs, total, page |
| `ADMIN_CLEANUP_RESULT` | 管理员清理结果 | success, message |
| `PONG` | 心跳响应 | - |

### 6.2 数据流图

```
┌─────────────┐     ClientMessage      ┌─────────────┐
│   Client    │ ───────────────────────▶│   Server    │
│ (React UI)  │                         │ (GameEngine)│
│             │     ServerMessage       │             │
│             │ ◀───────────────────────│             │
└─────────────┘                         └─────────────┘
      │                                       │
      │ 更新 Zustand Store                    │ 写入 MongoDB
      ▼                                       ▼
┌─────────────┐                         ┌─────────────┐
│  UI 渲染    │                         │  GameLog    │
│  (重渲染)   │                         │  RoomState  │
└─────────────┘                         └─────────────┘
```

---

## 7. 依赖关系图

### 7.1 模块依赖

```
                    ┌─────────────────────────────────────┐
                    │       @langrensha/shared            │
                    │  (types.ts, types/zego.ts, ROLE_META)    │
                    └─────────────────────────────────────┘
                              │           │
              ┌───────────────┼───────────┼───────────────┐
              │               │           │               │
              ▼               ▼           ▼               ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    client/      │ │   server/   │ │  GameEngine │ │ Settlement  │
│  useGameStore   │ │ LobbyManager│ │             │ │   Engine    │
└─────────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
        │                 │               │               │
        │                 │               │               │
        ▼                 ▼               ▼               ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  React UI       │ │  WebSocket  │ │TimerManager │ │   纯函数    │
│  Components     │ │   Handler   │ │             │ │             │
└─────────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
        │                 │               │
        │                 │               │
        ▼                 ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MongoDB                                  │
│  RoomModel | GameLogModel | WolfChatLogModel                    │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 包依赖

#### 前端依赖 (`client/package.json`)

| 包名 | 用途 |
|------|------|
| `react` | UI 框架 |
| `zustand` | 状态管理 |
| `vite` | 构建工具 |
| `typescript` | 类型系统 |
| `zego-express-engine-webrtc` | ZEGO 语音 SDK |

#### 后端依赖 (`server/package.json`)

| 包名 | 用途 |
|------|------|
| `ws` | WebSocket 库 |
| `mongoose` | MongoDB ODM |
| `compression` | HTTP 响应压缩 |
| `qrcode` | 二维码生成（房间邀请） |
| `dotenv` | 环境变量管理 |
| `tsx` | TypeScript 开发运行 |
| `typescript` | 类型系统 |

---

## 8. 项目运行方式

### 8.1 环境要求

- Node.js >= 18
- MongoDB >= 5.0
- npm >= 9

### 8.2 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/xxx/langrensha.git
cd langrensha

# 2. 安装依赖（Monorepo）
npm install

# 3. 配置环境变量
# server/.env
MONGODB_URI=mongodb://localhost:27017/langrensha
ZEGO_APP_ID=xxx
ZEGO_APP_SECRET=xxx
ADMIN_SECRET=xxx

# 4. 启动开发服务器
npm run dev

# 前端: http://localhost:5173
# 后端: ws://localhost:3001
```

### 8.3 生产部署

```bash
# 1. 构建前端
cd client
npm run build

# 2. 构建后端
cd server
npm run build

# 3. 启动后端服务
node dist/server.js

# 或使用 PM2
pm2 start dist/server.js --name langrensha-server
```

### 8.4 MongoDB 连接

服务端支持断线自动重连，重连间隔指数退避（1s → 2s → 4s → 最大 30s）。

```typescript
// models.ts
await connectMongoDB(uri);
```

---

## 9. 核心设计原则

### 9.1 零硬编码

所有游戏规则通过 `RuleConfig` 动态配置，法官在建房时可精细化设置所有参数。

```typescript
interface RuleConfig {
  playerCount: number;
  roleDistribution: Partial<Record<RoleId, number>>;
  nightActionOrder: RoleId[];
  witchSaveSelf: WitchSaveSelfRule;
  guardWitchConflict: GuardWitchConflictRule;
  // ... 更多配置
}
```

### 9.2 防作弊 DTO

`PlayerDTO` 仅暴露当前玩家可见信息，服务端脱敏层依赖此结构。

```typescript
interface PlayerRoomStateDTO {
  roomCode: string;
  myPlayerId: string;
  phase: GamePhase;
  players: PlayerDTO[];  // 脱敏后的玩家信息
  // ... 仅当前玩家可见的信息
}

interface JudgeRoomStateDTO {
  roomCode: string;
  phase: GamePhase;
  players: Player[];  // 法官可见完整信息
  // ... 法官专属信息
}
```

### 9.3 动态夜间顺序

`nightActionOrder` 为数组，状态机按序遍历，不存在于本局游戏中的角色会被自动跳过。

```typescript
// RuleConfig.nightActionOrder
['nightmare_shadow', 'werewolf', 'witch', 'seer', 'guard', 'mechanical_wolf']
```

### 9.4 白天中断协议

骑士决斗 / 白狼王自爆可随时中断白天流程，进入 `DAY_INTERRUPT` 子阶段处理连锁事件。

---

## 10. 角色系统

### 10.1 角色列表

| RoleId | 名称 | 阵营 | 技能描述 |
|--------|------|------|----------|
| `villager` | 村民 | 好人 | 无特殊技能，依靠逻辑推理和投票 |
| `seer` | 预言家 | 好人 | 每晚可查验一名玩家的阵营 |
| `witch` | 女巫 | 好人 | 拥有解药和毒药，各限用一次 |
| `hunter` | 猎人 | 好人 | 死亡时可开枪带走一名玩家 |
| `guard` | 守卫 | 好人 | 每晚可守护一名玩家（不可重复） |
| `idiot` | 白痴 | 好人 | 被投票出局时可翻牌免死，失去投票权 |
| `knight` | 骑士 | 好人 | 白天发言阶段可发动决斗 |
| `werewolf` | 狼人 | 狼人 | 每晚与同伴商议击杀一名玩家 |
| `white_wolf_king` | 白狼王 | 狼人 | 白天发言阶段可自爆带走一人 |
| `wolf_king` | 狼王 | 狼人 | 被票出或被杀出局时可开枪带走一人 |
| `nightmare_shadow` | 噩梦之影 | 狼人 | 每晚恐惧一人，使其当夜技能失效 |
| `hidden_wolf` | 隐狼 | 狼人 | 夜晚不睁眼，未行动时被查验为好人 |
| `mechanical_wolf` | 机械狼 | 狼人 | 第一晚选择模仿目标，第二晚释放技能 |

### 10.2 角色判断函数

```typescript
// 判断阵营
function isEvilRole(roleId: RoleId): boolean;

// 判断是否为神职角色
function isGodRole(roleId: RoleId): boolean;

// 判断是否为共同睁眼的狼人
function isSharedWolfRole(roleId: RoleId, sharedWolfRoles?: string[]): boolean;
```

---

## 11. 游戏状态机

### 11.1 游戏阶段 (`GamePhase`)

```typescript
type GamePhase =
  | 'LOBBY'             // 大厅等待
  | 'ROLE_REVEAL'       // 角色展示环节
  | 'PRE_NIGHT'         // 入夜前等待
  | 'NIGHT'             // 夜间行动（含子阶段）
  | 'NIGHT_SETTLEMENT'  // 夜间结算
  | 'DAY_ANNOUNCE'      // 白天公布死讯
  | 'SHERIFF_ELECTION'  // 警长选举
  | 'SHERIFF_TRANSFER'  // 警徽移交
  | 'DAY_SPEECH'        // 白天发言
  | 'PRE_VOTE_WAIT'     // 发言结束→投票前等待
  | 'DAY_VOTE'          // 白天投票
  | 'DAY_SETTLEMENT'    // 白天结算
  | 'DAY_INTERRUPT'     // 白天中断
  | 'PK_VOTE'           // 平票PK投票
  | 'GAME_OVER';        // 游戏结束
```

### 11.2 夜间子阶段 (`NightSubPhase`)

```typescript
interface NightSubPhase {
  currentRole: RoleId;        // 当前行动角色
  currentRoleIndex: number;   // 在 nightActionOrder 中的索引
  isBlockedByNightmare: boolean; // 是否被恐惧封印
}
```

### 11.3 状态流转图

```
LOBBY
  │
  ▼ (法官点击开始)
ROLE_REVEAL
  │
  ▼ (玩家确认角色)
PRE_NIGHT
  │
  ▼ (入夜)
NIGHT
  │ ├─ nightmare_shadow 子阶段
  │ ├─ werewolf 子阶段（狼人投票）
  │ ├─ witch 子阶段
  │ ├─ seer 子阶段
  │ ├─ guard 子阶段
  │ └─ mechanical_wolf 子阶段
  ▼
NIGHT_SETTLEMENT
  │
  ▼ (结算完成)
DAY_ANNOUNCE
  │
  ├─ (如有警长选举) → SHERIFF_ELECTION → SHERIFF_TRANSFER
  │
  ▼
DAY_SPEECH
  │
  ▼ (发言结束)
PRE_VOTE_WAIT
  │ ├─ 骑士可发动决斗
  │
  ▼
DAY_VOTE
  │
  ├─ (平票) → PK_VOTE
  │
  ▼
DAY_SETTLEMENT
  │ ├─ 猎人/狼王可开枪
  │ ├─ 白痴可翻牌
  │ ├─ (触发中断) → DAY_INTERRUPT
  │
  ▼ (检查获胜条件)
GAME_OVER 或 NIGHT (下一轮)
```

---

## 12. 村规配置系统

### 12.1 RuleConfig 完整字段

```typescript
interface RuleConfig {
  // 基础配置
  playerCount: number;
  roleDistribution: Partial<Record<RoleId, number>>;
  
  // 夜间行动顺序
  nightActionOrder: RoleId[];
  nightActionOrderPreset: NightActionOrderPreset;
  
  // 村规配置
  witchSaveSelf: WitchSaveSelfRule;           // 女巫自救规则
  witchCanUseBothPotions: boolean;            // 同晚双药
  guardWitchConflict: GuardWitchConflictRule; // 同守同救
  poisonBlockGun: boolean;                    // 吃毒封印技能
  hunterDeathShootCauses: HunterDeathShootCause[]; // 猎人开枪死因
  knightDuelWolfKing: KnightDuelWolfKingRule; // 骑士决斗狼王
  knightDuelSuicide: KnightDuelSuicideRule;   // 骑士决斗好人
  tieVoteResolution: TieVoteResolution;       // 平票处理
  winCondition: WinCondition;                 // 获胜条件
  daytimeKillSequence: DaytimeKillSequence;   // 白天死亡连锁
  werewolfSharedVision: WerewolfSharedVision; // 狼人共群
  sharedWolfRoles: RoleId[];                  // 共同睁眼的狼人
  
  // 发言顺序
  speechOrderStrategy: SpeechOrderStrategy;
  
  // 超时配置
  nightActionTimeout: number;
  speechTimeout: number;
  voteTimeout: number;
  preVoteWaitTime: number;
  skillActivationTimeout: number;
  
  // 身份揭示
  revealIdentityOnDayVote: RevealIdentityOnDayVote;
  
  // 长选举
  sheriffElectionEnabled: boolean;
  sheriffVoteWeight: 1 | 1.5 | 2;
  
  // 语音功能
  enableVoice: boolean;
  
  // 首日发言
  firstDayDoubleSpeech: boolean;
}
```

### 12.2 夜间行动顺序预置模板

```typescript
const NIGHT_ACTION_ORDER_PRESETS = {
  classic: ['nightmare_shadow', 'werewolf', 'witch', 'seer', 'guard', 'mechanical_wolf'],
  seer_first: ['nightmare_shadow', 'seer', 'werewolf', 'witch', 'guard', 'mechanical_wolf'],
  witch_first: ['nightmare_shadow', 'werewolf', 'witch', 'seer', 'guard', 'mechanical_wolf'],
  // chaos: 法官手动拖拽排序
};
```

---

## 附录

### A. 常见问题

#### Q1: 断线重连如何工作？

客户端 WebSocket 断线后，会自动以固定 2.5 秒间隔尝试重连。重连成功后，发送 `RECONNECT` 消息恢复会话。服务端保留 60 秒宽限期，宽限期内玩家数据不丢失。

#### Q2: 法官和警长有什么区别？

- **法官**：房间创建者，拥有上帝视角，可控制游戏流程
- **警长**：玩家选举产生，拥有投票权重加成（1/1.5/2票），死亡时需移交警徽

#### Q3: 隐狼被预言家查验的结果？

隐狼未参与狼人刀人投票时被查验为好人，参与后永久显示为狼人。

#### Q4: 机械狼如何模仿？

机械狼第一晚选择模仿目标，第二晚释放模仿技能。模仿平民/骑士/白痴时模仿失败，后续再无技能。

### B. 约定与规范

- **提交规范**：遵循 Conventional Commits (`feat|fix|refactor|docs|chore(scope): description`)
- **代码风格**：TypeScript strict mode，ESLint + Prettier
- **注释规范**：
  - 所有文件顶部统一添加文件头注释块（架构描述 + 设计原则）
  - 所有导出符号（函数、类、接口、类型、常量）必须添加中文 JSDoc 注释
  - 注释语言统一使用中文，与用户语言保持一致
  - 禁止使用 bug fix 注释，改用功能性描述说明代码意图
  - 保留技术术语的英文原文（如 WebSocket、MongoDB、React 等）

---

> 文档版本：2026-06-20
> 项目仓库：[langrensha](https://github.com/xxx/langrensha)