# 游戏逻辑模拟器 — 实施任务清单 (tasks.md)

## 阶段一：基础架构与核心状态管理

### Task 1.1: 创建模拟器类型定义

**文件**: `client/src/components/simulator/types.ts`

**内容**:
- `SimConnection` 接口：单个连接的数据结构（playerId, nickname, seatNumber, role, ws, isConnected, isJudge, isReady, state, suggestedAction, connectedAt）
- `SimEvent` 接口：事件日志条目（timestamp, phase, round, category, icon, message, detail）
- `AutoStrategies` 接口：自动策略配置（全局 mode + 各角色策略）
- `SeerStrategy`, `WitchStrategy`, `GuardStrategy`, `WerewolfStrategy`, `NightmareStrategy`, `MechanicalWolfStrategy`, `VoteStrategy`, `HunterGunStrategy`, `WolfKingGunStrategy`, `WhiteWolfExplodeStrategy`, `KnightDuelStrategy` 等子接口
- `SimulatorPhase` 类型：模拟器自身阶段（'setup' | 'lobby' | 'playing' | 'gameover'）

**依赖**: @langrensha/shared

**验证**: TypeScript 编译无错误

---

### Task 1.2: 创建模拟器常量

**文件**: `client/src/components/simulator/constants.ts`

**内容**:
- `DEFAULT_AUTO_STRATEGIES`：默认自动策略配置
- `EVENT_ICONS`：事件分类图标映射
- `MAX_EVENT_LOG_SIZE`：事件日志最大条数（500）
- `DEFAULT_PLAYER_NAMES`：默认玩家昵称模板（模拟1号~模拟18号）
- `WS_RECONNECT_MAX_ATTEMPTS`：重连最大尝试次数（3）

**依赖**: types.ts

**验证**: 常量值合理，TypeScript 编译无错误

---

### Task 1.3: 实现 WebSocket 连接管理工具

**文件**: `client/src/components/simulator/websocket.ts`

**内容**:
- `createConnection(serverUrl: string): WebSocket`：创建 WebSocket 连接
- `sendMessage(ws: WebSocket, message: ClientMessage): void`：发送客户端消息
- `setupMessageHandler(ws: WebSocket, handler: (msg: ServerMessage) => void): void`：设置消息处理器
- `setupHeartbeat(ws: WebSocket): ReturnType<typeof setInterval>`：设置心跳（每30秒 PING）
- `closeConnection(ws: WebSocket): void`：关闭连接
- `getSimulatorWsUrl(): string`：获取 WebSocket 服务器地址

**依赖**: @langrensha/shared

**验证**: 单元测试或手动验证连接建立和消息收发

---

### Task 1.4: 实现 useSimulatorStore

**文件**: `client/src/components/simulator/useSimulatorStore.ts`

**内容**:
- Zustand store 完整实现
- 连接管理：createRoom, addPlayer, removePlayer, disconnectAll
- 状态同步：处理法官和玩家的 ROOM_STATE 消息
- 操作提交：submitAction, submitJudgeAction, readyPlayer, readyAllPlayers, startGame
- 事件日志：addEvent, 消息处理时自动记录
- 自动操作：generateSuggestion, executeSuggestedAction, executeAllSuggested
- UI 状态：selectPlayer, setAutoMode, setAutoStrategy, clearError
- WebSocket 消息路由：法官消息处理、玩家消息处理、去重逻辑
- 连接生命周期管理：建立、断开、重连
- **状态注入**：selectPlayer 时将选中玩家状态同步到 useGameStore
- **消息拦截**：覆盖 useGameStore.sendMessage，路由到正确的 WebSocket 连接

**依赖**: types.ts, constants.ts, websocket.ts, @langrensha/shared

**验证**: 
- 创建房间后 judgeConnection 和 connections 正确建立
- 玩家加入后 seatNumber 和 role 正确同步
- 消息发送和接收正确
- 状态更新触发 React 重渲染

---

## 阶段二：自动操作引擎

### Task 2.1: 实现自动操作建议生成

**文件**: `client/src/components/simulator/autoActions.ts`

**内容**:
- `generateSuggestion(connection, state, strategy, judgeState)`：通用建议生成入口
- `generateSeerSuggestion(...)`：预言家建议
- `generateWitchSuggestion(...)`：女巫建议（考虑自救规则、双药配置）
- `generateGuardSuggestion(...)`：守卫建议（排除上次守护目标）
- `generateWerewolfSuggestion(...)`：狼人建议
- `generateNightmareSuggestion(...)`：噩梦之影建议（排除已恐惧目标）
- `generateMechanicalWolfSuggestion(...)`：机械狼建议
- `generateVoteSuggestion(...)`：投票建议
- `generateHunterGunSuggestion(...)`：猎人开枪建议
- `generateWolfKingGunSuggestion(...)`：狼王开枪建议
- `generateWhiteWolfExplodeSuggestion(...)`：白狼王自爆建议
- `generateKnightDuelSuggestion(...)`：骑士决斗建议
- 辅助函数：`findEvilTarget`, `findGodTarget`, `getRandomTarget` 等

**依赖**: types.ts, @langrensha/shared

**验证**: 
- 各角色建议操作消息格式正确
- 策略配置正确影响建议结果
- 边界情况处理（无可用目标、已使用技能等）

---

## 阶段三：UI 组件实现

### Task 3.1: 实现座位图组件

**文件**: `client/src/components/simulator/SeatMap.tsx`

**内容**:
- 圆形排列的座位图
- 每个座位显示：座位号、角色名、阵营色条、昵称、存活状态
- 当前行动者高亮闪烁动画
- 选中玩家边框加粗
- 死亡玩家灰显 + 死亡原因标签
- 法官单独标注
- 点击座位切换选中玩家
- 悬停 tooltip 显示角色技能描述
- 全局统计区域（存活/死亡、好人/狼人、警长）

**依赖**: useSimulatorStore, @langrensha/shared

**验证**: 
- 12人局圆形排列正确
- 点击交互正确
- 视觉状态正确（存活/死亡/当前行动/选中）

---

### Task 3.2: 实现房间创建配置面板

**文件**: `client/src/components/simulator/RoomSetupPanel.tsx`

**内容**:
- 法官昵称输入
- 游戏模式选择
- 角色配置（复用 HomeView 的角色数量调整器逻辑）
- 夜间行动顺序配置（复用 HomeView 的逻辑）
- 村规配置（复用 HomeView 的所有选项）
- 模拟玩家列表管理（添加/删除/修改昵称）
- 玩家数量校验
- 创建房间按钮
- enableVoice 强制设为 false

**依赖**: useSimulatorStore, @langrensha/shared

**验证**: 
- 配置功能与 HomeView 一致
- 创建房间后连接正确建立
- 玩家自动加入

---

### Task 3.3: 实现状态注入引擎

**文件**: `client/src/components/simulator/storeInjector.ts`

**内容**:
- `injectPlayerState(playerState: PlayerRoomStateDTO, judgeState: JudgeRoomStateDTO)`：将选中玩家的状态注入 useGameStore
- `injectJudgeState(judgeState: JudgeRoomStateDTO)`：将法官全局状态注入 useGameStore
- `interceptSendMessage(connections: Map<string, SimConnection>, selectedPlayerId: string | null, judgeConnection: SimConnection | null)`：拦截 useGameStore.sendMessage，路由到正确的 WebSocket 连接
- `restoreOriginalSendMessage()`：恢复原始 sendMessage（退出模拟器时）
- `clearInjectedState()`：清除注入的状态（退出模拟器时）
- 注入映射：PlayerRoomStateDTO → useGameStore 字段映射
- 消息路由：根据消息类型判断通过法官连接还是玩家连接发送

**依赖**: useGameStore, types.ts, @langrensha/shared

**验证**: 
- 选中玩家后现有游戏组件正确渲染
- 操作提交通过正确的 WebSocket 连接发送
- 切换玩家后状态正确更新
- 退出模拟器后 useGameStore 恢复正常

---

### Task 3.4: 实现游戏面板包装器

**文件**: `client/src/components/simulator/GamePanelWrapper.tsx`

**内容**:
- 根据当前游戏阶段渲染对应的现有游戏组件：
  - NIGHT → NightPhase
  - NIGHT（等待） → NightWaiting
  - DAY_SPEECH → SpeechPhase
  - DAY_VOTE → VotePhase
  - DAY_INTERRUPT → HunterGun / WolfKingGun / WhiteWolfExplode / IdiotReveal
  - PK_VOTE → VotePhase（PK模式）
  - SHERIFF_ELECTION → SheriffElection
  - SHERIFF_TRANSFER → SheriffTransfer
  - DAY_ANNOUNCE → DayAnnounce
  - GAME_OVER → GameOver
  - ROLE_REVEAL → RoleReveal
- 在现有组件上方渲染建议操作提示条
- 显示当前操控玩家信息
- 自动执行按钮

**依赖**: useSimulatorStore, 现有游戏组件, @langrensha/shared

**验证**: 
- 各阶段正确渲染对应组件
- 建议操作提示条正确显示
- 现有组件交互正常

---

### Task 3.5: 实现法官控制面板

**文件**: `client/src/components/simulator/JudgePanel.tsx`

**内容**:
- 强制下一阶段按钮
- 暂停/恢复按钮
- 修改发言顺序（弹出编辑器）
- 修改夜间行动顺序（弹出编辑器，下一晚生效）
- 触发骑士决斗（选择骑士和目标）
- 触发白狼王自爆（选择白狼王和目标）
- 跳过某玩家发言（选择玩家）
- 改判（选择玩家和新状态 + 原因）
- 解散房间按钮
- 可折叠面板

**依赖**: useSimulatorStore, @langrensha/shared

**验证**: 
- 所有法官操作正确发送消息
- 操作结果正确反馈

---

### Task 3.6: 实现自动策略配置面板

**文件**: `client/src/components/simulator/AutoStrategyPanel.tsx`

**内容**:
- 全局自动模式下拉（关闭/仅建议/自动执行）
- 执行所有建议按钮
- 各角色策略配置区域：
  - 预言家：查验策略选择 + 自定义目标列表
  - 女巫：自动救人开关 + 自动毒人开关 + 毒人优先级
  - 守卫：守护策略 + 自定义目标列表
  - 狼人：刀人策略 + 自定义目标
  - 噩梦之影：恐惧策略 + 自定义目标列表
  - 机械狼：模仿策略 + 自定义目标
  - 投票：投票策略 + 自定义目标
  - 猎人/狼王开枪策略
  - 白狼王自爆策略
  - 骑士决斗策略
- 可折叠面板
- 策略修改即时生效

**依赖**: useSimulatorStore, types.ts

**验证**: 
- 策略修改后下次行动使用新策略
- 自定义目标列表正确使用

---

### Task 3.7: 实现事件日志组件

**文件**: `client/src/components/simulator/EventLog.tsx`

**内容**:
- 事件列表渲染（时间戳 + 阶段 + 描述）
- 事件分类图标
- 分类筛选按钮（全部/系统/行动/结果/法官/错误）
- 自动滚动到底部
- 可折叠/展开
- 可拖拽调整高度
- 超过500条自动移除最早记录

**依赖**: useSimulatorStore, types.ts

**验证**: 
- 事件正确显示
- 筛选功能正常
- 自动滚动正常

---

### Task 3.8: 实现模拟器主视图

**文件**: `client/src/components/SimulatorView.tsx`

**内容**:
- 整体布局：工具栏 + 左侧面板 + 右侧面板 + 底部事件日志
- 工具栏：返回按钮、标题、服务器地址、连接状态、自动模式、断开全部
- 左侧面板：房间信息 + SeatMap + 全局统计
- 右侧面板：GamePanelWrapper + JudgePanel + AutoStrategyPanel
- 底部：EventLog
- 退出时断开所有连接并恢复 useGameStore

**依赖**: useSimulatorStore, SeatMap, GamePanelWrapper, JudgePanel, AutoStrategyPanel, EventLog

**验证**:
- 布局正确
- 所有子组件正确渲染
- 退出时连接正确关闭
- useGameStore 正确恢复

---

## 阶段四：集成到主项目

### Task 4.1: 扩展 ViewType

**文件**: `client/src/useGameStore.ts`

**修改**:
- `ViewType` 新增 `'simulator'`

**验证**: TypeScript 编译无错误

---

### Task 4.2: HomeView 新增入口

**文件**: `client/src/components/HomeView.tsx`

**修改**:
- 在管理员入口旁新增"游戏模拟器"按钮
- 点击调用 `useGameStore.getState().setView('simulator')`

**验证**: 
- 按钮正确显示
- 点击后切换到模拟器视图

---

### Task 4.3: App.tsx 新增路由

**文件**: `client/src/App.tsx`

**修改**:
- 新增 `const SimulatorView = lazy(() => import('./components/SimulatorView'));`
- 在 Suspense 内新增 `{currentView === 'simulator' && <SimulatorView />}`

**验证**: 
- 懒加载正确工作
- 视图切换正确

---

## 阶段五：测试与验证

### Task 5.1: 完整游戏流程测试

**步骤**:
1. 启动服务端
2. 启动客户端开发服务器
3. 进入模拟器
4. 创建12人局（经典配置）
5. 所有玩家自动加入并准备
6. 开始游戏
7. 手动操控所有夜间行动
8. 手动操控白天投票
9. 完成一整局游戏

**验证**: 游戏流程完整，无报错

---

### Task 5.2: 各角色技能测试

**步骤**:
1. 创建包含所有角色的配置
2. 逐一测试每个角色的夜间行动
3. 测试技能触发（骑士决斗、白狼王自爆、猎人开枪、狼王开枪、白痴翻牌）

**验证**: 所有角色技能正确触发和结算

---

### Task 5.3: 自动模式测试

**步骤**:
1. 创建房间后开启自动执行模式
2. 观察一整局自动运行
3. 中途修改策略配置
4. 观察策略变更是否生效

**验证**: 自动模式正确运行，策略修改即时生效

---

### Task 5.4: 法官操作测试

**步骤**:
1. 测试强制下一阶段
2. 测试暂停/恢复
3. 测试改判
4. 测试修改顺序

**验证**: 法官操作正确执行

---

### Task 5.5: 错误处理测试

**步骤**:
1. 测试连接断开后的重连
2. 测试无效操作的错误提示
3. 测试退出模拟器时的连接清理

**验证**: 错误处理正确，无内存泄漏
