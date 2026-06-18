# 游戏逻辑模拟器 — 技术规格书 (spec.md)

## 1. 项目概述

### 1.1 项目名称

狼人杀游戏逻辑模拟器（Game Logic Simulator）

### 1.2 项目目标

构建一个集成在主项目客户端中的游戏逻辑模拟器界面，通过真实 WebSocket 连接到服务端，模拟多个玩家加入房间并操控其行动，在单一网页内实现从房间创建、模拟所有玩家、操控每个玩家的技能、显示触发逻辑和结果的完整测试能力。

### 1.3 核心价值

- **真实逻辑验证**：所有游戏逻辑在服务端 GameEngine 中运行，模拟器仅通过标准 WebSocket 协议操控玩家，确保测试的是真实逻辑而非模拟逻辑
- **主程序同步**：服务端 GameEngine 更新后，模拟器自动测试新逻辑，无需额外维护
- **全流程覆盖**：从房间创建到游戏结束，覆盖所有阶段和角色的操作
- **调试友好**：全局视角展示所有信息，事件日志实时记录所有触发逻辑

### 1.4 范围界定

**包含**：
- 房间创建与 RuleConfig 配置
- 模拟玩家加入、准备、开始游戏
- 所有角色的夜间行动操控
- 白天发言、投票、PK 投票
- 技能触发（骑士决斗、白狼王自爆、猎人开枪、狼王开枪、白痴翻牌）
- 警长选举与警徽移交
- 法官控制操作（强制推进、改判、暂停等）
- 事件日志与结算结果展示
- 自动操作辅助（建议模式与自动执行模式）
- 自动策略实时配置

**不包含**：
- 语音功能（ZEGO SDK 不初始化，RuleConfig 中 enableVoice 强制设为 false）
- 游戏复盘/回放功能
- 多房间并行模拟
- 移动端适配（仅桌面端使用）

### 1.5 工作树标识

本工作树命名为 "work1"。

---

## 2. 系统架构

### 2.1 整体架构

模拟器作为主项目客户端的一个新视图（`simulator`），从 HomeView 入口进入。模拟器拥有独立的状态管理（`useSimulatorStore`），同时通过**状态注入机制**复用现有 `useGameStore` 和所有游戏面板组件。

#### 核心设计：状态注入（Store Injection）

现有游戏组件（SeerPanel、WitchPanel、VotePhase 等）全部直接从 `useGameStore` 读取状态和调用操作方法。为使这些组件在模拟器中无需修改即可工作，采用以下方案：

1. **`useSimulatorStore`** 是模拟器的"真实"状态管理器，管理多个 WebSocket 连接和各连接的状态
2. **`useGameStore`** 在模拟器模式下成为"视图层镜像"——当选中某玩家时，将该玩家的状态同步到 `useGameStore`
3. **消息路由拦截**——覆盖 `useGameStore.sendMessage`，将操作消息路由到选中玩家的 WebSocket 连接
4. **现有组件无感知**——SeerPanel、WitchPanel 等组件照常从 `useGameStore` 读取和操作，不知道背后是模拟器

```
用户切换选中玩家
    ↓
useSimulatorStore.selectPlayer(playerId)
    ↓
将该玩家的 PlayerRoomStateDTO 注入 useGameStore
    ↓
现有游戏组件（SeerPanel 等）自动更新
    ↓
用户在面板中操作 → useGameStore.sendMessage()
    ↓
被拦截 → 路由到选中玩家的 WebSocket 连接
    ↓
服务端处理 → 推送结果
    ↓
useSimulatorStore 接收 → 更新该玩家状态 → 重新注入 useGameStore
```

**注入映射表**（PlayerRoomStateDTO → useGameStore 字段）：

| PlayerRoomStateDTO 字段 | useGameStore 字段 |
|------------------------|-------------------|
| phase | playerState.phase |
| round | playerState.round |
| nightActionRequest | playerState.nightActionRequest |
| myPlayerId | playerId |
| players | playerState.players |
| wolfChatMessages | playerState.wolfChatMessages |
| isNightmared | playerState.isNightmared |
| pkCandidates | playerState.pkCandidates |
| winner | playerState.winner |

同时从法官视角（JudgeRoomStateDTO）提取全局信息注入：
- `judgeState`：完整法官视角状态
- `isJudge`：设为 true（模拟器始终以法官+玩家双视角运行）

**消息发送拦截**：
- `useGameStore.sendMessage` 被替换为路由函数
- 根据消息类型和当前选中玩家，通过对应的 WebSocket 连接发送
- 法官操作（JUDGE_*）通过法官连接发送
- 玩家操作（NIGHT_ACTION, DAY_VOTE 等）通过选中玩家连接发送

```
┌─────────────────────────────────────────────────────────────┐
│                     浏览器 (单个标签页)                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              SimulatorView (React)                   │   │
│  │                                                     │   │
│  │  ┌─────────────────┐  ┌──────────────────────────┐ │   │
│  │  │   SeatMap        │  │   ActionPanel            │ │   │
│  │  │   (座位图)       │  │   (操作面板)              │ │   │
│  │  └─────────────────┘  └──────────────────────────┘ │   │
│  │  ┌─────────────────┐  ┌──────────────────────────┐ │   │
│  │  │   JudgePanel     │  │   AutoStrategyPanel      │ │   │
│  │  │   (法官控制)     │  │   (自动策略)              │ │   │
│  │  └─────────────────┘  └──────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │   EventLog (事件日志)                        │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           useSimulatorStore (Zustand)                │   │
│  │                                                     │   │
│  │  connections: Map<string, SimConnection>             │   │
│  │  judgeConnection: SimConnection | null               │   │
│  │  judgeState: JudgeRoomStateDTO | null                │   │
│  │  eventLog: SimEvent[]                                │   │
│  │  autoStrategies: AutoStrategies                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐    ┌────────┐ │
│  │ WS: 法官  │ │ WS: 玩家1 │ │ WS: 玩家2 │ ...│WS:玩家N│ │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘    └───┬────┘ │
└────────┼─────────────┼─────────────┼───────────────┼──────┘
         │             │             │               │
         └─────────────┴─────────────┴───────────────┘
                          WebSocket
                            │
                   ┌────────┴────────┐
                   │   Game Server   │
                   │  (GameEngine)   │
                   └─────────────────┘
```

### 2.2 连接架构

模拟器管理多个并行的 WebSocket 连接：

| 连接 | 角色 | 发送消息类型 | 接收消息类型 |
|------|------|-------------|-------------|
| Connection #0 | 法官 | CREATE_ROOM, START_GAME, JUDGE_FORCE_NEXT_PHASE, JUDGE_PAUSE, JUDGE_RESUME, JUDGE_OVERRIDE_SETTLEMENT, JUDGE_MODIFY_SPEECH_ORDER, UPDATE_NIGHT_ORDER, JUDGE_TRIGGER_KNIGHT_DUEL, JUDGE_TRIGGER_WHITE_WOLF, JUDGE_SKIP_SPEECH, DISSOLVE_ROOM | JudgeRoomStateDTO, 所有服务端消息 |
| Connection #1~N | 玩家 | JOIN_ROOM, READY, NIGHT_ACTION, DAY_VOTE, KNIGHT_DUEL, WHITE_WOLF_EXPLODE, HUNTER_GUN, WOLF_KING_GUN, WOLF_VOTE, WOLF_CHAT, SHERIFF_ELECTION_VOTE, SHERIFF_TRANSFER, FINISH_SPEECH | PlayerRoomStateDTO, NIGHT_ACTION_REQUEST, NIGHT_ACTION_RESULT 等 |

**关键设计决策**：
- 法官连接创建房间后获得 `JudgeRoomStateDTO`，包含全量信息（所有角色、所有行动、所有投票）
- 全局信息展示以法官视角为准，确保测试时能看到所有数据
- 玩家操作通过各自的 WebSocket 连接提交，确保服务端按标准协议处理
- 每个连接独立管理心跳（PING/PONG），防止超时断连

### 2.3 状态管理

#### 2.3.1 useSimulatorStore 完整接口

```typescript
interface SimulatorStore {
  // ==================== 连接管理 ====================
  /** 所有玩家连接（不含法官），key 为 playerId */
  connections: Map<string, SimConnection>;
  /** 法官连接 */
  judgeConnection: SimConnection | null;
  /** WebSocket 服务器地址 */
  serverUrl: string;

  // ==================== 房间状态 ====================
  /** 房间码 */
  roomCode: string | null;
  /** 法官视角全局状态 */
  judgeState: JudgeRoomStateDTO | null;
  /** 各玩家视角状态，key 为 playerId */
  playerStates: Map<string, PlayerRoomStateDTO>;
  /** 当前游戏阶段 */
  currentPhase: GamePhase;
  /** 当前轮次 */
  currentRound: number;
  /** 夜间子阶段 */
  nightSubPhase: NightSubPhase | null;

  // ==================== UI 状态 ====================
  /** 当前选中的玩家 playerId */
  selectedPlayerId: string | null;
  /** 事件日志 */
  eventLog: SimEvent[];
  /** 自动操作策略配置 */
  autoStrategies: AutoStrategies;
  /** 自动模式：off=关闭 / suggest=仅建议 / auto=自动执行 */
  autoMode: 'off' | 'suggest' | 'auto';
  /** 模拟器是否已初始化（房间已创建） */
  isInitialized: boolean;
  /** 全局错误信息 */
  error: string | null;

  // ==================== 操作方法 ====================
  /** 设置服务器地址 */
  setServerUrl: (url: string) => void;
  /** 创建房间（建立法官连接并发送 CREATE_ROOM） */
  createRoom: (nickname: string, gameMode: GameMode, config: RuleConfig) => void;
  /** 添加模拟玩家（建立新连接并发送 JOIN_ROOM） */
  addPlayer: (nickname: string) => void;
  /** 移除模拟玩家（断开连接并发送 LEAVE_ROOM） */
  removePlayer: (playerId: string) => void;
  /** 让指定玩家发送准备 */
  readyPlayer: (playerId: string, ready: boolean) => void;
  /** 让所有玩家准备 */
  readyAllPlayers: () => void;
  /** 开始游戏（法官发送 START_GAME） */
  startGame: () => void;
  /** 通过指定玩家连接提交操作 */
  submitAction: (playerId: string, message: ClientMessage) => void;
  /** 通过法官连接提交操作 */
  submitJudgeAction: (message: ClientMessage) => void;
  /** 选中某个玩家 */
  selectPlayer: (playerId: string) => void;
  /** 设置自动模式 */
  setAutoMode: (mode: 'off' | 'suggest' | 'auto') => void;
  /** 设置某角色的自动策略 */
  setAutoStrategy: (roleId: RoleId, strategy: Partial<RoleStrategy>) => void;
  /** 执行指定玩家的建议操作 */
  executeSuggestedAction: (playerId: string) => void;
  /** 执行所有待行动玩家的建议操作 */
  executeAllSuggested: () => void;
  /** 为指定玩家生成建议操作 */
  generateSuggestion: (playerId: string) => ClientMessage | null;
  /** 断开所有连接并重置状态 */
  disconnectAll: () => void;
  /** 清除错误 */
  clearError: () => void;
  /** 添加事件日志 */
  addEvent: (event: Omit<SimEvent, 'timestamp'>) => void;
}
```

#### 2.3.2 SimConnection 数据结构

```typescript
interface SimConnection {
  /** 玩家唯一ID（由服务端 WebSocket 分配） */
  playerId: string;
  /** 昵称 */
  nickname: string;
  /** 座位号（1-based，加入房间后由服务端分配） */
  seatNumber: number | null;
  /** 庒牌角色（从法官视角获取） */
  role: RoleId | null;
  /** WebSocket 实例 */
  ws: WebSocket | null;
  /** 连接状态 */
  isConnected: boolean;
  /** 是否为法官 */
  isJudge: boolean;
  /** 是否已准备 */
  isReady: boolean;
  /** 该连接的房间状态（法官为 JudgeRoomStateDTO，玩家为 PlayerRoomStateDTO） */
  state: PlayerRoomStateDTO | JudgeRoomStateDTO | null;
  /** 自动建议的操作（由 autoActions 生成） */
  suggestedAction: ClientMessage | null;
  /** 连接创建时间 */
  connectedAt: number;
}
```

### 2.4 WebSocket 消息处理

#### 2.4.1 法官连接消息处理

法官连接接收到的服务端消息处理逻辑：

| 服务端消息类型 | 处理方式 |
|--------------|---------|
| ROOM_CREATED | 提取 roomCode，更新 store，触发玩家自动加入流程 |
| ROOM_STATE (JudgeRoomStateDTO) | 更新 judgeState，同步所有玩家角色信息到对应 SimConnection |
| PHASE_CHANGE | 更新 currentPhase, currentRound, nightSubPhase，添加事件日志 |
| NIGHT_ACTION_REQUEST | 识别行动玩家，生成建议操作（如自动模式开启） |
| NIGHT_ACTION_RESULT | 添加事件日志（查验结果、行动成功/失败） |
| DAY_ANNOUNCE | 添加事件日志（死亡公告、禁言信息） |
| VOTE_RESULT | 添加事件日志（投票结果、出局信息） |
| KNIGHT_DUEL_RESULT | 添加事件日志（决斗结果） |
| WHITE_WOLF_EXPLODE_RESULT | 添加事件日志（自爆结果） |
| HUNTER_GUN_RESULT | 添加事件日志（开枪结果） |
| WOLF_KING_GUN_RESULT | 添加事件日志（开枪结果） |
| IDIOT_REVEAL | 添加事件日志（白痴翻牌） |
| SHERIFF_ELECTED | 添加事件日志（警长选举结果） |
| SHERIFF_TRANSFER_REQUEST | 通知需要移交警徽 |
| SHERIFF_TRANSFER_RESULT | 添加事件日志（移交结果） |
| GAME_OVER | 添加事件日志（获胜阵营、最终统计） |
| ERROR | 添加错误事件日志，设置 store error |
| JUDGE_WARNING | 添加法官警告事件日志 |
| WOLF_VOTE_UPDATE | 添加狼人投票更新事件日志 |
| WOLF_CHAT_HISTORY | 添加狼人聊天事件日志 |
| DAY_VOTE_REVEAL | 添加身份揭示事件日志 |

#### 2.4.2 玩家连接消息处理

玩家连接接收到的服务端消息处理逻辑：

| 服务端消息类型 | 处理方式 |
|--------------|---------|
| ROOM_STATE (PlayerRoomStateDTO) | 更新对应 playerState，同步角色信息 |
| NIGHT_ACTION_REQUEST | 识别该玩家需要行动，生成建议操作（如自动模式开启），更新 suggestedAction |
| NIGHT_ACTION_RESULT | 更新事件日志（该玩家视角的查验结果等） |
| PHASE_CHANGE | 更新阶段信息 |
| 其他 | 转发到法官连接处理（避免重复记录） |

#### 2.4.3 消息去重策略

- 阶段变更（PHASE_CHANGE）：仅从法官连接处理，玩家连接忽略
- 事件类消息：仅从法官连接记录到事件日志，避免重复
- NIGHT_ACTION_REQUEST：从玩家连接处理（因为包含该玩家的具体可用目标列表）

---

## 3. UI 详细设计

### 3.1 整体布局

模拟器采用左右分栏布局，底部为事件日志区域：

```
+------------------------------------------------------------------+
| 工具栏                                                             |
| [🏠返回] 狼人杀模拟器 | 服务器: [ws://localhost:3001] |           |
| [连接: 13/13 ✅] | 自动模式: [关闭▼] | [断开全部]                  |
+------------------------------------------------------------------+
| 左侧面板 (320px固定)      | 右侧面板 (flex-1)                      |
|                           |                                        |
| ┌─ 房间信息 ─────────┐   | ┌─ 主操作区 ──────────────────────┐   |
| │ 房间码: ABC123      │   | │                                  │   |
| │ 阶段: 第2夜         │   | │  (根据当前阶段和选中玩家           │   |
| │ 子阶段: 女巫行动    │   | │   动态渲染操作面板)               │   |
| │ 轮次: 2             │   | │                                  │   |
| └────────────────────┘   | │  LOBBY → RoomSetupPanel          │   |
|                           | │  NIGHT → NightActionPanel        │   |
| ┌─ 座位图 ───────────┐   | │  DAY_SPEECH → SpeechPanel        │   |
| │                     │   | │  DAY_VOTE → VotePanel            │   |
| │    [2]  [3]        │   | │  DAY_INTERRUPT → SkillPanel      │   |
| │  [1]      [4]      │   | │  PK_VOTE → VotePanel(PK)         │   |
| │  [12]     [5]      │   | │  SHERIFF_* → SheriffPanel        │   │
| │  [11]     [6]      │   | │  GAME_OVER → GameOverPanel       │   |
| │    [10] [9] [8][7] │   | │                                  │   |
| │                     │   | └──────────────────────────────────┘   |
| │  👑 法官            │   |                                        |
| └────────────────────┘   | ┌─ 法官控制面板 (可折叠) ───────────┐   |
|                           | │ [强制下一阶段] [暂停] [恢复]       │   |
| ┌─ 全局统计 ─────────┐   | │ [改判] [修改顺序] [触发技能]       │   |
| │ 存活: 8  死亡: 4    │   | └──────────────────────────────────┘   |
| │ 好人: 5  狼人: 3    │   |                                        |
| │ 警长: 3号           │   | ┌─ 自动策略配置 (可折叠) ───────────┐   |
| └────────────────────┘   | │ 预言家: [随机查验▼]               │   |
|                           | │ 女巫: [自动救人✅] [自动毒人❌]    │   |
|                           | │ 守卫: [保护神职▼]                 │   |
|                           | │ 狼人: [随机刀人▼]                 │   |
|                           | │ 投票: [随机投票▼]                 │   |
|                           | └──────────────────────────────────┘   |
+------------------------------------------------------------------+
| 事件日志 (高度 200px，可拖拽调整，可折叠)                           |
| ┌──────────────────────────────────────────────────────────────┐ |
| │ 🔵 21:30:15 | 第2夜 | 噩梦之影恐惧了4号玩家                   │ |
| │ 🔴 21:30:20 | 第2夜 | 狼人击杀2号玩家                         │ |
| │ 🟢 21:30:25 | 第2夜 | 女巫使用解药救活2号玩家                 │ |
| │ 🔵 21:30:30 | 第2夜 | 预言家查验5号 → 好人                    │ |
| │ 🔵 21:30:35 | 第2夜 | 守卫守护7号                             │ |
| │ 👑 21:30:40 | 系统  | 夜间结算完成，2号被救活                  │ |
| └──────────────────────────────────────────────────────────────┘ |
+------------------------------------------------------------------+
```

### 3.2 工具栏

工具栏始终固定在顶部，包含：

| 元素 | 说明 |
|------|------|
| 返回按钮 | 点击返回 HomeView，同时断开所有连接 |
| 标题 | "狼人杀模拟器" |
| 服务器地址 | 可编辑的输入框，修改后新连接使用新地址 |
| 连接状态 | 显示 "已连接: N/M"，N为已连接数，M为总连接数 |
| 自动模式下拉 | 三选一：关闭 / 仅建议 / 自动执行 |
| 断开全部按钮 | 断开所有 WebSocket 连接，重置模拟器状态 |

### 3.3 座位图组件 (SeatMap)

#### 3.3.1 布局

- 12人局标准圆形排列，座位号按顺时针递增
- 法官单独显示在圆形下方，标注"法官"和昵称
- 座位数量根据 RuleConfig.playerCount 动态调整

#### 3.3.2 每个座位的信息展示

```
┌─────────────┐
│   ③ 预言家   │  ← 座位号 + 角色名
│   ═══════   │  ← 阵营色条（好人=蓝/绿，狼人=红）
│   "小明"    │  ← 昵称
│   ✅ 存活    │  ← 状态标记
│   🎯 当前    │  ← 当前行动者标记（闪烁动画）
└─────────────┘
```

死亡玩家：
```
┌─────────────┐
│   ④ 猎人    │  ← 灰显
│   ═══════   │
│   "小红"    │
│   💀 狼杀    │  ← 死亡原因
└─────────────┘
```

#### 3.3.3 交互

- 点击座位 → 选中该玩家，右侧操作面板切换到该玩家视角
- 当前行动者座位边框闪烁（CSS animation: pulse）
- 选中玩家座位边框加粗（border-2 border-yellow-400）
- 悬停显示 tooltip：角色技能描述

### 3.4 操作面板（复用现有游戏组件）

操作面板**直接复用现有游戏组件**，通过状态注入机制使其在模拟器中正常工作。选中不同玩家时，`useGameStore` 被注入该玩家的状态，现有组件自动渲染对应内容。

#### 3.4.1 组件复用映射

| 游戏阶段 | 复用的现有组件 | 说明 |
|---------|--------------|------|
| NIGHT | `NightPhase` | 自动根据角色切换 SeerPanel/WitchPanel/GuardPanel/WolfVotePanel/NightmarePanel/MechanicalWolfPanel |
| NIGHT（等待） | `NightWaiting` | 非行动玩家等待界面 |
| DAY_SPEECH | `SpeechPhase` | 发言阶段 |
| DAY_VOTE | `VotePhase` | 投票阶段 |
| DAY_INTERRUPT | `HunterGun` / `WolfKingGun` / `WhiteWolfExplode` / `IdiotReveal` | 技能触发 |
| PK_VOTE | `VotePhase`（PK模式） | PK投票 |
| SHERIFF_ELECTION | `SheriffElection` | 警长选举 |
| SHERIFF_TRANSFER | `SheriffTransfer` | 警徽移交 |
| DAY_ANNOUNCE | `DayAnnounce` | 天亮公告 |
| GAME_OVER | `GameOver` | 游戏结束 |
| ROLE_REVEAL | `RoleReveal` | 角色展示 |

#### 3.4.2 模拟器专属包装

在复用现有组件的基础上，模拟器添加以下专属 UI 元素：

1. **建议操作提示条**：在现有面板上方显示"建议操作：查验3号"，可一键执行或修改
2. **自动执行按钮**：全局"执行所有建议"按钮
3. **玩家切换指示**：显示当前操控的玩家信息
4. **法官控制面板**：独立的法官操作区域（不与玩家面板冲突）

#### 3.4.3 LOBBY 阶段 — RoomSetupPanel（模拟器专属）

LOBBY 阶段没有可复用的现有组件，需要新建配置面板：

房间创建前的配置面板，复用 HomeView 的 RuleConfig 配置逻辑：

1. **法官昵称输入**
2. **游戏模式选择**（HUMAN / SYSTEM）
3. **角色配置**（与 HomeView 相同的角色数量调整器）
4. **夜间行动顺序配置**（与 HomeView 相同的预置模板和手动排序）
5. **村规配置**（与 HomeView 相同的所有村规选项）
6. **模拟玩家列表**：
   - 显示将要加入的玩家昵称列表
   - 可添加/删除/修改昵称
   - 玩家数量需与 RuleConfig.playerCount 匹配
   - 默认昵称：模拟1号、模拟2号、...
7. **创建房间按钮**：点击后依次建立法官连接和所有玩家连接
8. enableVoice 强制设为 false

#### 3.4.4 其他阶段

NIGHT、DAY_SPEECH、DAY_VOTE、DAY_INTERRUPT、PK_VOTE、SHERIFF_ELECTION、SHERIFF_TRANSFER、GAME_OVER 等阶段均直接复用现有游戏组件（见 3.4.1 映射表），通过状态注入机制自动工作。

### 3.5 法官控制面板 (JudgePanel)

始终可见的可折叠面板，提供法官专属操作：

| 操作 | 消息类型 | 说明 |
|------|---------|------|
| 强制下一阶段 | JUDGE_FORCE_NEXT_PHASE | 跳过当前阶段等待 |
| 暂停游戏 | JUDGE_PAUSE | 暂停所有定时器 |
| 恢复游戏 | JUDGE_RESUME | 恢复暂停的游戏 |
| 修改发言顺序 | JUDGE_MODIFY_SPEECH_ORDER | 弹出顺序编辑器 |
| 修改夜间顺序 | UPDATE_NIGHT_ORDER | 弹出顺序编辑器（下一晚生效） |
| 触发骑士决斗 | JUDGE_TRIGGER_KNIGHT_DUEL | 选择骑士和目标 |
| 触发白狼王自爆 | JUDGE_TRIGGER_WHITE_WOLF | 选择白狼王和目标 |
| 跳过某玩家发言 | JUDGE_SKIP_SPEECH | 选择要跳过的玩家 |
| 改判 | JUDGE_OVERRIDE_SETTLEMENT | 选择玩家和新状态 |
| 解散房间 | DISSOLVE_ROOM | 解散当前房间 |

### 3.6 自动策略配置面板 (AutoStrategyPanel)

可折叠面板，为每个角色类型配置自动操作策略。策略修改立即生效，影响下一次该角色行动时的建议/自动操作。

#### 3.6.1 全局设置

- 自动模式下拉：关闭 / 仅建议 / 自动执行
- [执行所有建议] 按钮：一键让所有待行动玩家执行建议操作

#### 3.6.2 各角色策略配置

**预言家策略**：
- 查验策略：随机查验 / 优先查验可疑玩家 / 自定义顺序
- 自定义顺序：可拖拽排列的座位号列表

**女巫策略**：
- 自动救人：开/关
- 自动毒人：开/关
- 毒人优先级：随机 / 优先毒狼人 / 自定义目标
- 自定义毒人目标：座位号列表

**守卫策略**：
- 守护策略：随机 / 保护神职 / 自定义顺序
- 自定义顺序：可拖拽排列的座位号列表

**狼人策略**：
- 刀人策略：随机 / 优先刀神职 / 自定义目标
- 自定义目标：选择座位号

**噩梦之影策略**：
- 恐惧策略：随机 / 优先恐惧神职 / 自定义顺序
- 自定义顺序：可拖拽排列的座位号列表

**机械狼策略**：
- 模仿策略：随机 / 自定义目标
- 自定义模仿目标：选择座位号

**投票策略**（白天投票通用）：
- 投票策略：随机 / 跟票 / 自定义目标
- 自定义目标：选择座位号

**猎人开枪策略**：
- 开枪策略：随机 / 优先射狼人 / 自定义目标

**狼王开枪策略**：
- 开枪策略：随机 / 优先射好人 / 自定义目标

**白狼王自爆策略**：
- 是否自动自爆：开/关
- 自爆目标策略：随机 / 自定义目标

**骑士决斗策略**：
- 是否自动决斗：开/关
- 决斗目标策略：随机 / 优先可疑 / 自定义目标

### 3.7 事件日志组件 (EventLog)

#### 3.7.1 布局

- 固定在底部，默认高度 200px，可拖拽调整高度
- 可折叠/展开
- 新事件自动滚动到底部
- 支持按分类筛选（system/action/result/judge/error）

#### 3.7.2 事件展示格式

```
{icon} {HH:mm:ss} | {阶段} | {事件描述}
```

示例：
```
🔵 21:30:15 | 第2夜 | 噩梦之影恐惧了4号玩家
🔴 21:30:20 | 第2夜 | 狼人击杀2号玩家(预言家)
🟢 21:30:25 | 第2夜 | 女巫使用解药救活2号玩家
🔵 21:30:30 | 第2夜 | 预言家查验5号 → 好人阵营
🔵 21:30:35 | 第2夜 | 守卫守护7号玩家
👑 21:30:40 | 系统  | 夜间结算：2号被救活，无人死亡
🔵 21:30:45 | 第2天 | 天亮了，昨晚是平安夜
🟡 21:31:00 | 第2天 | 3号玩家投票给5号
🔴 21:31:30 | 第2天 | 投票结果：5号出局(狼人)
🔵 21:31:35 | 第2天 | 游戏继续
```

#### 3.7.3 事件日志数据结构

```typescript
interface SimEvent {
  /** 时间戳 */
  timestamp: number;
  /** 游戏阶段 */
  phase: GamePhase;
  /** 游戏轮次 */
  round: number;
  /** 事件分类 */
  category: 'system' | 'action' | 'result' | 'judge' | 'error';
  /** 显示图标 */
  icon: string;
  /** 事件描述（中文） */
  message: string;
  /** 附加数据（可选，用于详情展开） */
  detail?: Record<string, unknown>;
}
```

---

## 4. 自动操作引擎

### 4.1 建议操作生成流程

```
1. 收到 NIGHT_ACTION_REQUEST 或进入投票阶段
2. 检查 autoMode：
   - off: 不生成建议
   - suggest/auto: 继续步骤3
3. 根据当前角色和阶段，调用对应的策略生成函数
4. 将生成的操作存入 SimConnection.suggestedAction
5. 如果 autoMode === 'auto'，自动执行
6. 如果 autoMode === 'suggest'，在操作面板中预填并高亮
```

### 4.2 各角色建议生成逻辑

#### 4.2.1 预言家

```typescript
function generateSeerSuggestion(
  connection: SimConnection,
  state: PlayerRoomStateDTO,
  strategy: SeerStrategy,
  judgeState: JudgeRoomStateDTO | null
): NightActionMessage | null {
  const availableTargets = state.nightActionRequest?.availableTargets ?? [];
  if (availableTargets.length === 0) return null;

  let target: number;
  switch (strategy.strategy) {
    case 'random':
      target = availableTargets[Math.floor(Math.random() * availableTargets.length)];
      break;
    case 'suspicious_first':
      // 优先查验未查验过的玩家（需要维护查验历史）
      target = availableTargets[Math.floor(Math.random() * availableTargets.length)];
      break;
    case 'custom_list':
      // 按自定义顺序找到第一个可用目标
      target = strategy.customTargets?.find(t => availableTargets.includes(t))
        ?? availableTargets[Math.floor(Math.random() * availableTargets.length)];
      break;
  }

  return {
    type: 'NIGHT_ACTION',
    roleId: 'seer',
    targetSeat: target,
    extra: { checkTarget: target },
  };
}
```

#### 4.2.2 女巫

```typescript
function generateWitchSuggestion(
  connection: SimConnection,
  state: PlayerRoomStateDTO,
  strategy: WitchStrategy,
  judgeState: JudgeRoomStateDTO | null
): NightActionMessage | null {
  const request = state.nightActionRequest;
  if (!request) return null;

  let useAntidote = false;
  let usePoison = false;
  let poisonTarget: number | null = null;

  // 解药逻辑
  if (strategy.autoSave && request.werewolfKillTarget !== null && !connection.state?.witchAntidoteUsed) {
    // 检查自救规则
    const saveSelfRule = request.witchSaveSelfRule ?? 'ALWAYS';
    const isSelf = request.werewolfKillTarget === state.myPlayerId; // 需要转换
    if (!isSelf || saveSelfRule === 'ALWAYS' || (saveSelfRule === 'FIRST_NIGHT' && judgeState?.round === 1)) {
      useAntidote = true;
    }
  }

  // 毒药逻辑
  if (strategy.autoPoison && !connection.state?.witchPoisonUsed) {
    const availableTargets = request.availableTargets.filter(t => t !== request.werewolfKillTarget);
    if (availableTargets.length > 0) {
      switch (strategy.poisonPriority) {
        case 'random':
          poisonTarget = availableTargets[Math.floor(Math.random() * availableTargets.length)];
          break;
        case 'evil_first':
          // 从法官视角找狼人目标
          poisonTarget = findEvilTarget(availableTargets, judgeState)
            ?? availableTargets[Math.floor(Math.random() * availableTargets.length)];
          break;
        case 'custom':
          poisonTarget = strategy.customPoisonTargets?.find(t => availableTargets.includes(t)) ?? null;
          break;
      }
      if (poisonTarget !== null) usePoison = true;
    }
  }

  // 同晚双药检查
  if (useAntidote && usePoison && !state.witchCanUseBothPotions) {
    usePoison = false;
    poisonTarget = null;
  }

  return {
    type: 'NIGHT_ACTION',
    roleId: 'witch',
    targetSeat: useAntidote ? request.werewolfKillTarget : null,
    extra: {
      useAntidote,
      usePoison,
      poisonTarget,
    },
  };
}
```

#### 4.2.3 其他角色

守卫、狼人、噩梦之影、机械狼的建议生成逻辑类似，根据策略配置选择目标。

### 4.3 投票建议生成

```typescript
function generateVoteSuggestion(
  connection: SimConnection,
  state: PlayerRoomStateDTO,
  strategy: VoteStrategy,
  judgeState: JudgeRoomStateDTO | null
): DayVoteMessage {
  const availableTargets = state.players
    .filter(p => p.status === 'alive' && !p.isJudge && p.seatNumber !== /* self seat */)
    .map(p => p.seatNumber);

  switch (strategy.strategy) {
    case 'random':
      return { type: 'DAY_VOTE', targetSeat: availableTargets[Math.floor(Math.random() * availableTargets.length)] };
    case 'follow_majority':
      // 跟票：选择当前票数最多的目标
      return { type: 'DAY_VOTE', targetSeat: findLeadingTarget(judgeState) };
    case 'custom':
      return { type: 'DAY_VOTE', targetSeat: strategy.customTarget ?? null };
  }
}
```

---

## 5. 集成方案

### 5.1 ViewType 扩展

在 `client/src/useGameStore.ts` 中：

```typescript
// 修改前
export type ViewType = 'home' | 'game' | 'admin';
// 修改后
export type ViewType = 'home' | 'game' | 'admin' | 'simulator';
```

新增 `setView('simulator')` 的调用入口。

### 5.2 HomeView 入口

在 `HomeView.tsx` 底部管理员入口旁新增：

```tsx
<button
  onClick={() => useGameStore.getState().setView('simulator')}
  className="text-sm text-gray-500 hover:text-gray-300"
>
  游戏模拟器
</button>
```

### 5.3 App.tsx 路由

```typescript
const SimulatorView = lazy(() => import('./components/SimulatorView'));

// 在 Suspense 内新增:
{currentView === 'simulator' && <SimulatorView />}
```

### 5.4 服务器地址配置

优先级：
1. 模拟器界面手动输入的地址
2. 环境变量 `VITE_WS_URL`
3. 默认值 `ws://localhost:3001`（开发环境 Vite 代理后的地址为 `ws://localhost:5180/ws`）

实际 WebSocket URL 构建逻辑：
```typescript
function getSimulatorWsUrl(): string {
  // 从 store 获取用户设置的地址，或使用默认值
  const customUrl = useSimulatorStore.getState().serverUrl;
  if (customUrl) return customUrl;
  // 默认使用当前页面的 host + /ws 路径（利用 Vite 代理）
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
```

---

## 6. 错误处理

### 6.1 连接错误

| 场景 | 处理方式 |
|------|---------|
| WebSocket 连接失败 | 在事件日志中记录错误，该连接标记为断开，提供重试按钮 |
| 连接中途断开 | 标记为断开状态，自动尝试重连（最多3次），超过后提示用户 |
| 所有连接断开 | 显示全局错误提示，提供"重新连接"和"返回首页"选项 |

### 6.2 操作错误

| 场景 | 处理方式 |
|------|---------|
| 服务端返回 ERROR 消息 | 在事件日志中记录，操作面板显示错误原因 |
| 操作超时（服务端已推进阶段） | 忽略该操作，更新到新阶段状态 |
| 无效操作（如已死亡的玩家行动） | 操作按钮禁用，显示"该玩家已死亡" |

### 6.3 状态不一致

| 场景 | 处理方式 |
|------|---------|
| 法官状态与玩家状态不一致 | 以法官状态为准，记录警告到事件日志 |
| 连接顺序异常 | 不影响功能，按实际连接顺序处理 |

---

## 7. 性能考虑

### 7.1 WebSocket 连接数

- 12人局 + 1法官 = 13个 WebSocket 连接
- 浏览器对同一域名的 WebSocket 连接限制通常为 255+，13个连接完全可承受
- 每个连接独立心跳（每30秒 PING），总流量极小

### 7.2 事件日志

- 最大保留 500 条事件，超出时移除最早的记录
- 使用 React.memo 或 useMemo 避免日志渲染影响其他组件

### 7.3 状态更新优化

- useSimulatorStore 使用 Zustand 的 selector 机制，组件仅订阅需要的状态切片
- 座位图组件仅在玩家状态变化时重渲染
- 操作面板仅在阶段或选中玩家变化时重渲染

---

## 8. 文件结构

```
client/src/
  components/
    SimulatorView.tsx                    — 模拟器主视图（路由入口组件）
    simulator/
      useSimulatorStore.ts              — 模拟器状态管理（Zustand store + 状态注入逻辑）
      types.ts                          — 模拟器专用类型定义
      websocket.ts                      — WebSocket 连接管理工具函数
      storeInjector.ts                  — 状态注入引擎（将模拟器状态同步到 useGameStore）
      SeatMap.tsx                       — 座位图组件
      GamePanelWrapper.tsx              — 游戏面板包装器（根据阶段渲染现有组件 + 建议提示条）
      JudgePanel.tsx                    — 法官控制面板
      EventLog.tsx                      — 事件日志组件
      AutoStrategyPanel.tsx             — 自动策略配置面板
      RoomSetupPanel.tsx                — 房间创建/配置面板（LOBBY阶段，模拟器专属）
      autoActions.ts                    — 自动操作建议生成逻辑
      constants.ts                      — 模拟器常量

  复用的现有组件（无需修改）：
    components/game/night/NightPhase.tsx
    components/game/night/SeerPanel.tsx
    components/game/night/WitchPanel.tsx
    components/game/night/GuardPanel.tsx
    components/game/night/WolfVotePanel.tsx
    components/game/night/NightmarePanel.tsx
    components/game/night/MechanicalWolfPanel.tsx
    components/game/night/NightWaiting.tsx
    components/game/day/VotePhase.tsx
    components/game/day/SpeechPhase.tsx
    components/game/day/DayAnnounce.tsx
    components/game/day/SheriffElection.tsx
    components/game/day/SheriffTransfer.tsx
    components/game/skills/HunterGun.tsx
    components/game/skills/KnightDuel.tsx
    components/game/skills/WhiteWolfExplode.tsx
    components/game/skills/WolfKingGun.tsx
    components/game/skills/IdiotReveal.tsx
    components/game/GameOver.tsx
    components/game/RoleReveal.tsx
    components/game/TargetSelector.tsx
    components/game/NightPanelLayout.tsx
```

---

## 9. 依赖关系

### 9.1 新增依赖

无。模拟器仅使用项目现有依赖（React, Zustand, @langrensha/shared, Tailwind CSS）。

### 9.2 共享类型依赖

模拟器大量使用 `@langrensha/shared` 中的类型：
- `RuleConfig`, `GamePhase`, `NightSubPhase`, `RoleId`, `Faction`
- `Player`, `PlayerDTO`, `JudgeRoomStateDTO`, `PlayerRoomStateDTO`
- `ClientMessage`, `ServerMessage` 及其所有子类型
- `NightActionRequestDTO`, `NightActionExtra`
- `ROLE_META`, `PHASE_NAMES`, `DEATH_CAUSE_NAMES`
- `createDefaultRuleConfig`, `NIGHT_ACTION_ORDER_PRESETS`

---

## 10. 测试策略

### 10.1 手动测试场景

1. **完整游戏流程**：创建12人局 → 所有玩家加入 → 开始游戏 → 完成一整局
2. **各角色夜间行动**：逐一测试每个角色的夜间操作
3. **技能触发**：骑士决斗、白狼王自爆、猎人开枪、狼王开枪、白痴翻牌
4. **投票与PK**：正常投票、平票PK、警长选举
5. **法官操作**：强制推进、改判、暂停/恢复
6. **自动模式**：开启自动执行，观察一整局自动运行
7. **连接异常**：中途断开某玩家连接，观察重连
8. **村规变体**：修改不同村规配置，测试对应逻辑

### 10.2 关键验证点

- 夜间结算结果是否正确（同守同救、毒封技能等）
- 白天中断连锁是否正确处理
- 获胜条件判定是否正确（屠边/屠城）
- 噩梦之影恐惧效果是否正确
- 机械狼模仿逻辑是否正确
- 隐狼查验结果是否正确
- 警长选举和移交流程是否正确
