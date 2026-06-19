# 狼人杀联机游戏

> 支持 6-18 人在线对战的狼人杀游戏，内置法官控制台、动态村规配置、实时语音通话、断线重连等功能。

---

## 特性

- **多人在线对战** — 支持 6-18 人，法官上帝模式或系统跑团模式
- **13 种角色** — 村民、预言家、女巫、猎人、守卫、白痴、骑士、狼人、白狼王、狼王、噩梦之影、隐狼、机械狼
- **动态村规配置** — 女巫自救、同守同救、平票处理、获胜条件等全部可配
- **实时语音通话** — 集成 ZEGO SDK，支持房间语音、夜间自动静音
- **断线重连** — WebSocket 断线自动重连，60 秒宽限期
- **警长系统** — 支持警长选举、警徽移交、投票权重配置
- **观战模式** — 死亡玩家可观战，身份按时间逐步暴露
- **操作日志** — 全量操作记录，支持管理员后台查询与复盘

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Zustand + Vite |
| 后端 | Node.js + 原生 http 模块 + WebSocket |
| 数据库 | MongoDB (Mongoose) |
| 语音 | ZEGO Express WebRTC SDK |
| 部署 | Monorepo (npm workspaces) |

## 项目结构

```
langrensha/
├── client/          # 前端 React 应用
│   └── src/
│       ├── components/   # UI 组件（游戏面板、技能面板、语音控制等）
│       ├── store/        # Zustand 语音状态
│       ├── hooks/        # 自定义 Hooks
│       ├── useGameStore.ts  # 全局状态仓库
│       └── App.tsx       # 入口组件
├── server/          # 后端 Node.js 服务
│   └── src/
│       ├── server.ts          # HTTP + WebSocket 入口
│       ├── GameEngine.ts      # 游戏状态机引擎
│       ├── LobbyManager.ts    # 大厅与房间管理
│       ├── SettlementEngine.ts # 结算引擎
│       ├── TimerManager.ts    # 定时器管理
│       └── models.ts          # MongoDB 数据模型
├── shared/          # 前后端共享类型与常量
│   ├── types.ts     # 角色、规则、状态、消息类型定义
│   └── types/
│       └── zego.ts  # ZEGO 语音相关类型
└── package.json     # Monorepo 根配置
```

## 快速开始

### 环境要求

- Node.js >= 18
- MongoDB >= 5.0

### 安装

```bash
git clone https://github.com/xxx/langrensha.git
cd langrensha
npm install
```

### 配置环境变量

在 `server/` 目录下创建 `.env` 文件：

```env
MONGODB_URI=mongodb://localhost:27017/langrensha
ZEGO_APP_ID=your_zego_app_id
ZEGO_APP_SECRET=your_zego_app_secret
ADMIN_SECRET=your_admin_secret
```

### 启动开发服务器

```bash
npm run dev
```

- 前端：`http://localhost:5173`
- 后端：`ws://localhost:3001`

### 生产部署

```bash
# 构建
cd client && npm run build
cd ../server && npm run build

# 启动
node dist/server.js
# 或使用 PM2
pm2 start dist/server.js --name langrensha-server
```

## 架构概览

```
┌─────────────────────────────────────────────────┐
│              客户端 (React + Zustand)             │
│   UI 组件 ← Zustand Store ← WebSocket Client    │
└──────────────────────┬──────────────────────────┘
                       │ WebSocket (JSON)
                       ▼
┌─────────────────────────────────────────────────┐
│              服务端 (HTTP + WebSocket)              │
│   LobbyManager → GameEngine → SettlementEngine  │
│                     ↕ TimerManager               │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│              MongoDB (Mongoose)                   │
│   Room | GameLog | WolfChatLog                   │
└─────────────────────────────────────────────────┘
```

**核心模块**：

| 模块 | 职责 |
|------|------|
| [GameEngine](server/src/GameEngine.ts) | 游戏状态机，驱动阶段流转（LOBBY → NIGHT → DAY → GAME_OVER） |
| [LobbyManager](server/src/LobbyManager.ts) | 房间生命周期管理，密码学安全随机房间码，断线重连 |
| [SettlementEngine](server/src/SettlementEngine.ts) | 纯函数结算逻辑（获胜条件、死亡连锁） |
| [TimerManager](server/src/TimerManager.ts) | 阶段超时控制，支持暂停/恢复 |
| [useGameStore](client/src/useGameStore.ts) | 前端状态仓库，WebSocket 连接与消息处理 |
| [shared/types](shared/types.ts) | 前后端共享类型契约（角色、规则、DTO、消息） |

## 角色一览

| 角色 | 阵营 | 技能 |
|------|------|------|
| 村民 | 好人 | 无特殊技能，依靠逻辑推理和投票 |
| 预言家 | 好人 | 每晚查验一名玩家的阵营 |
| 女巫 | 好人 | 解药和毒药各限用一次 |
| 猎人 | 好人 | 死亡时可开枪带走一名玩家 |
| 守卫 | 好人 | 每晚守护一名玩家（不可重复守护同一人） |
| 白痴 | 好人 | 被投票出局时翻牌免死，此后失去投票权 |
| 骑士 | 好人 | 白天发言阶段可发动决斗 |
| 狼人 | 狼人 | 每晚与同伴商议击杀一名玩家 |
| 白狼王 | 狼人 | 白天发言阶段可自爆带走一人并强制入夜 |
| 狼王 | 狼人 | 被票出或被杀出局时可开枪带走一人 |
| 噩梦之影 | 狼人 | 每晚恐惧一人使其技能失效，不可重复恐惧同一人 |
| 隐狼 | 狼人 | 夜晚不睁眼，未行动时被查验为好人 |
| 机械狼 | 狼人 | 第一晚模仿目标，第二晚释放模仿技能 |

## 游戏流程

```
LOBBY → ROLE_REVEAL → PRE_NIGHT → NIGHT → NIGHT_SETTLEMENT →
DAY_ANNOUNCE → [SHERIFF_ELECTION] → DAY_SPEECH → PRE_VOTE_WAIT →
DAY_VOTE → DAY_SETTLEMENT → [DAY_INTERRUPT] → NIGHT → ...
                                                              ↓
                                                          GAME_OVER
```

夜间子阶段按 `nightActionOrder` 配置顺序遍历，不存在于本局游戏中的角色自动跳过。白天阶段可被骑士决斗或白狼王自爆中断。

## 村规配置

法官在建房时可配置所有规则参数：

- **女巫自救**：不可 / 仅首夜 / 始终
- **同守同救**：死亡 / 存活
- **平票处理**：无人出局 / PK 投票 / 随机处决
- **获胜条件**：屠边 / 屠城
- **骑士决斗**：可带狼王 / 封印狼王；决斗好人自尽 / 仅暴露
- **夜间行动超时**、**发言超时**、**投票超时** 等时间参数
- **发言顺序策略**：死者左/右、警长左/右、法官自定义
- **警长选举**：启用/关闭，投票权重 1/1.5/2
- **夜间行动顺序**：预置模板或手动拖拽排序

## 开发规范

- **提交规范**：Conventional Commits — `feat|fix|refactor|docs|chore(scope): description`
- **代码风格**：TypeScript strict mode
- **注释语言**：中文

## 详细文档

完整的 Code Wiki 文档请参阅 [CODE_WIKI.md](CODE_WIKI.md)，包含：

- 关键类与函数详细说明
- WebSocket 通信协议完整消息类型表
- 数据流图与依赖关系图
- 状态机完整流转图
- RuleConfig 完整字段说明

## License

MIT
