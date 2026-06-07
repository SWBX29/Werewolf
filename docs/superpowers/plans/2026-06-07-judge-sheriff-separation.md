# 法官与警长概念分离 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将"法官（上帝/房主）"和"警长（选举产生的玩家角色）"两个概念彻底分离，重命名所有 JUDGE_ELECTION 相关标识符为 SHERIFF_ELECTION，新增 isSheriff 字段和 sheriffVoteWeight 配置。

**Architecture:** 从共享类型层开始自底向上修改：shared/types.ts → server/models.ts → server/GameEngine.ts → server/server.ts → server/LobbyManager.ts → client/useGameStore.ts → client 组件。每层修改后确保类型一致。

**Tech Stack:** TypeScript, React, Node.js, WebSocket, MongoDB/Mongoose

---

### Task 1: 修改 shared/types.ts — 类型定义重命名与新增

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: 在 Player 接口中新增 isSheriff 字段**

在 `isJudge: boolean;` 之后（约 L487）新增：

```typescript
  /** 是否为警长（选举产生的玩家角色） */
  isSheriff: boolean;
```

- [ ] **Step 2: 在 PlayerDTO 接口中新增 isSheriff 字段**

在 `isJudge: boolean;` 之后（约 L695）新增：

```typescript
  isSheriff: boolean;
```

- [ ] **Step 3: 修改 RuleConfig 接口**

将 `judgeElectionEnabled` 重命名并新增 `sheriffVoteWeight`：

```typescript
  /** 是否启用警长选举 */
  sheriffElectionEnabled: boolean;

  /** 警长投票权重（1 / 1.5 / 2），默认 1.5 */
  sheriffVoteWeight: 1 | 1.5 | 2;
```

- [ ] **Step 4: 修改 createDefaultRuleConfig 函数**

将 `judgeElectionEnabled: false` 改为：

```typescript
    sheriffElectionEnabled: false,
    sheriffVoteWeight: 1.5,
```

- [ ] **Step 5: 修改 GamePhase 类型**

将 `'JUDGE_ELECTION'` 改为 `'SHERIFF_ELECTION'`：

```typescript
  | 'SHERIFF_ELECTION'   // 警长选举
```

- [ ] **Step 6: 修改 RoomState 接口**

将 `judgeElectionVotes` 重命名：

```typescript
  /** 警长选举投票记录：key 为投票者座位号，value 为目标座位号 */
  sheriffElectionVotes: Record<number, number>;
```

- [ ] **Step 7: 修改 PlayerRoomStateDTO 接口**

在 `pkCandidates` 字段之后新增：

```typescript
  /** 警长投票权重 */
  sheriffVoteWeight: 1 | 1.5 | 2;
```

- [ ] **Step 8: 重命名消息接口**

将 `JudgeElectionVoteMessage` 重命名为 `SheriffElectionVoteMessage`：

```typescript
/**
 * 警长选举投票 — 玩家投票选举警长
 */
export interface SheriffElectionVoteMessage {
  type: 'SHERIFF_ELECTION_VOTE';
  /** 投票目标座位号，null 表示弃权 */
  targetSeat: number | null;
}
```

将 `JudgeElectedMessage` 重命名为 `SheriffElectedMessage`：

```typescript
/** 警长选举结果 */
export interface SheriffElectedMessage {
  type: 'SHERIFF_ELECTED';
  seatNumber: number;
  nickname: string;
  votes: Record<number, number>;
}
```

将 `JudgeElectionTieMessage` 重命名为 `SheriffElectionTieMessage`：

```typescript
/** 警长选举平票 */
export interface SheriffElectionTieMessage {
  type: 'SHERIFF_ELECTION_TIE';
  tieCandidates: number[];
  votes: Record<number, number>;
}
```

- [ ] **Step 9: 修改 ClientMessageType**

将 `'JUDGE_ELECTION_VOTE'` 改为 `'SHERIFF_ELECTION_VOTE'`

- [ ] **Step 10: 修改 ServerMessageType**

将 `'JUDGE_ELECTED'` 改为 `'SHERIFF_ELECTED'`，`'JUDGE_ELECTION_TIE'` 改为 `'SHERIFF_ELECTION_TIE'`

- [ ] **Step 11: 修改 ClientMessage 联合类型**

将 `JudgeElectionVoteMessage` 改为 `SheriffElectionVoteMessage`

- [ ] **Step 12: 修改 ServerMessage 联合类型**

将 `JudgeElectedMessage` 改为 `SheriffElectedMessage`，`JudgeElectionTieMessage` 改为 `SheriffElectionTieMessage`

- [ ] **Step 13: 修改 ActionType 类型**

将法官选举部分改为：

```typescript
  // 警长选举
  | 'SHERIFF_ELECTION_START'
  | 'SHERIFF_ELECTION_VOTE'
  | 'SHERIFF_ELECTED'
  | 'SHERIFF_ELECTION_TIE'
```

- [ ] **Step 14: 编译验证**

Run: `cd e:\GitHub\langrensha\shared && npx tsc --noEmit`
Expected: 可能有其他文件报错（因为引用了旧名称），但 shared 本身不应有内部类型错误

---

### Task 2: 修改 server/src/models.ts — 数据模型更新

**Files:**
- Modify: `server/src/models.ts`

- [ ] **Step 1: 在 PlayerSubSchema 中新增 isSheriff 字段**

在 `isJudge` 之后（约 L76）新增：

```typescript
  isSheriff: { type: Boolean, required: true, default: false },
```

- [ ] **Step 2: 修改 RuleConfigSubSchema**

将 `judgeElectionEnabled` 改为 `sheriffElectionEnabled`，新增 `sheriffVoteWeight`：

```typescript
  // ---- 警长选举 ----
  sheriffElectionEnabled: { type: Boolean, required: true, default: false },
  sheriffVoteWeight: { type: Number, required: true, default: 1.5, enum: [1, 1.5, 2] },
```

- [ ] **Step 3: 修改 RoomDocument 接口**

将 `judgeElectionVotes` 改为 `sheriffElectionVotes`

- [ ] **Step 4: 修改 RoomSchema**

将 `judgeElectionVotes` 改为 `sheriffElectionVotes`，将 phase enum 中的 `'JUDGE_ELECTION'` 改为 `'SHERIFF_ELECTION'`

- [ ] **Step 5: 修改 GameLogSchema 的 actionType enum**

将法官选举部分改为：

```typescript
      'SHERIFF_ELECTION_START', 'SHERIFF_ELECTION_VOTE', 'SHERIFF_ELECTED', 'SHERIFF_ELECTION_TIE',
```

将 phase enum 中的 `'JUDGE_ELECTION'` 改为 `'SHERIFF_ELECTION'`（如果存在的话，当前 GameLogSchema 的 phase enum 中没有 JUDGE_ELECTION，需新增）

- [ ] **Step 6: 编译验证**

Run: `cd e:\GitHub\langrensha\server && npx tsc --noEmit`

---

### Task 3: 修改 server/src/GameEngine.ts — 游戏引擎逻辑更新

**Files:**
- Modify: `server/src/GameEngine.ts`

- [ ] **Step 1: 修改 enterDayAnnounce 方法**

将 `judgeElectionEnabled` 改为 `sheriffElectionEnabled`，将 `enterJudgeElection()` 改为 `enterSheriffElection()`：

```typescript
    // SYSTEM 模式：5秒后自动过渡到下一阶段（警长选举或发言阶段）
    if (this.state.gameMode === 'SYSTEM') {
      this.setTimer('day_announce', 5, () => {
        if (this.state.round === 1 && this.state.config.sheriffElectionEnabled) {
          this.enterSheriffElection();
        } else {
          this.enterDaySpeech();
        }
      });
    }
```

- [ ] **Step 2: 重命名 enterJudgeElection 为 enterSheriffElection**

修改方法名和内部逻辑：
- `this.state.phase = 'SHERIFF_ELECTION'`
- `this.state.sheriffElectionVotes = {}`
- `actionType: 'SHERIFF_ELECTION_START'`
- 候选人过滤：`!p.isJudge` 改为 `!p.isSheriff`（警长不参与选举，法官本身就不在玩家列表中）
- `this.onPhaseChange('SHERIFF_ELECTION', ...)`
- timer key 改为 `'sheriff_election'`
- `this.resolveSheriffElection()`

- [ ] **Step 3: 重命名 submitJudgeElectionVote 为 submitSheriffElectionVote**

修改方法名和内部逻辑：
- `this.state.phase !== 'SHERIFF_ELECTION'`
- 错误消息：`'当前不在警长选举阶段'`
- `player.isJudge` 的校验保留（法官不参与选举投票），但改为：`if (player.isJudge) return { success: false, error: '法官（上帝）不参与选举投票' }`
- `target.isJudge` 的校验改为 `target.isSheriff`：`if (target.isSheriff) return { success: false, error: '不能投给现任警长' }`
- `this.state.sheriffElectionVotes[player.seatNumber] = targetSeat ?? -1`
- `actionType: 'SHERIFF_ELECTION_VOTE'`
- `this.state.sheriffElectionVotes[p.seatNumber] !== undefined`
- timer key 改为 `'sheriff_election'`
- `this.resolveSheriffElection()`

- [ ] **Step 4: 重命名 resolveJudgeElection 为 resolveSheriffElection**

修改方法名和内部逻辑：
- `const votes = this.state.sheriffElectionVotes`
- 当选者设置 `isSheriff = true`（而非 `isJudge = true`）
- 清除旧警长标记（而非旧法官标记）：

```typescript
        // 清除旧警长标记
        for (const p of this.state.players) {
          if (p.isSheriff) {
            p.isSheriff = false;
          }
        }
        winnerPlayer.isSheriff = true;
```

- `actionType: 'SHERIFF_ELECTED'`
- `this.onGameEvent(this.state.roomCode, 'SHERIFF_ELECTED', ...)`
- `actionType: 'SHERIFF_ELECTION_TIE'`
- `this.onGameEvent(this.state.roomCode, 'SHERIFF_ELECTION_TIE', ...)`

- [ ] **Step 5: 修改投票结算逻辑以支持警长投票权重**

在 `resolveDayVote` 方法中，修改票数统计逻辑：

```typescript
    // 统计票数（警长按权重计票）
    const voteCount: Record<number, number> = {};
    for (const [voter, target] of Object.entries(this.state.votes)) {
      const targetSeat = Number(target);
      if (targetSeat > 0) {
        const voterPlayer = this.getPlayerBySeat(Number(voter));
        const weight = voterPlayer?.isSheriff ? this.state.config.sheriffVoteWeight : 1;
        voteCount[targetSeat] = (voteCount[targetSeat] || 0) + weight;
      }
    }
```

同样修改 `resolvePKVote` 方法中的票数统计逻辑（如果存在类似的统计代码）。

- [ ] **Step 6: 修改注释**

将所有 `法官（警长）选举` 注释改为 `警长选举`，将 `法官选举` 改为 `警长选举`

- [ ] **Step 7: 编译验证**

Run: `cd e:\GitHub\langrensha\server && npx tsc --noEmit`

---

### Task 4: 修改 server/src/LobbyManager.ts — 房间管理更新

**Files:**
- Modify: `server/src/LobbyManager.ts`

- [ ] **Step 1: 修改初始化字段**

将 `judgeElectionVotes: {}` 改为 `sheriffElectionVotes: {}`

- [ ] **Step 2: 编译验证**

Run: `cd e:\GitHub\langrensha\server && npx tsc --noEmit`

---

### Task 5: 修改 server/src/server.ts — 消息处理更新

**Files:**
- Modify: `server/src/server.ts`

- [ ] **Step 1: 修改消息路由**

将 `case 'JUDGE_ELECTION_VOTE'` 改为 `case 'SHERIFF_ELECTION_VOTE'`，将 `handleJudgeElectionVote` 改为 `handleSheriffElectionVote`

- [ ] **Step 2: 重命名 handleJudgeElectionVote 为 handleSheriffElectionVote**

修改函数名和内部逻辑：
- `engine.submitSheriffElectionVote(client.playerId, message.targetSeat)`
- 错误码：`'SHERIFF_ELECTION_VOTE_FAILED'`

- [ ] **Step 3: 修改游戏事件回调**

将 `case 'JUDGE_ELECTED'` 改为 `case 'SHERIFF_ELECTED'`，消息类型改为 `'SHERIFF_ELECTED'`
将 `case 'JUDGE_ELECTION_TIE'` 改为 `case 'SHERIFF_ELECTION_TIE'`，消息类型改为 `'SHERIFF_ELECTION_TIE'`

- [ ] **Step 4: 修改 PlayerRoomStateDTO 构建逻辑**

在构建 PlayerRoomStateDTO 时新增 `sheriffVoteWeight` 字段和 `isSheriff` 字段。找到构建 PlayerDTO 的位置，添加 `isSheriff: player.isSheriff`。找到构建 PlayerRoomStateDTO 的位置，添加 `sheriffVoteWeight: state.config.sheriffVoteWeight`。

- [ ] **Step 5: 编译验证**

Run: `cd e:\GitHub\langrensha\server && npx tsc --noEmit`

---

### Task 6: 修改 client/src/useGameStore.ts — 状态管理更新

**Files:**
- Modify: `client/src/useGameStore.ts`

- [ ] **Step 1: 重命名 submitJudgeElectionVote 为 submitSheriffElectionVote**

将方法名和消息类型改为：

```typescript
  submitSheriffElectionVote: (targetSeat: number | null) => {
    get().sendMessage({
      type: 'SHERIFF_ELECTION_VOTE',
      targetSeat,
    });
  },
```

- [ ] **Step 2: 修改 PHASE_CHANGE 处理中的阶段名映射**

将 `JUDGE_ELECTION: '法官选举'` 改为 `SHERIFF_ELECTION: '警长选举'`

- [ ] **Step 3: 修改服务端消息处理**

将 `case 'JUDGE_ELECTED'` 改为 `case 'SHERIFF_ELECTED'`，文案改为 `'当选警长'`
将 `case 'JUDGE_ELECTION_TIE'` 改为 `case 'SHERIFF_ELECTION_TIE'`，文案改为 `'警长选举平票'`

- [ ] **Step 4: 编译验证**

Run: `cd e:\GitHub\langrensha\client && npx tsc --noEmit`

---

### Task 7: 修改客户端组件 — UI 文案与逻辑更新

**Files:**
- Rename: `client/src/components/game/day/JudgeElection.tsx` → `client/src/components/game/day/SheriffElection.tsx`
- Modify: `client/src/components/game/day/SheriffElection.tsx`
- Modify: `client/src/components/AdminDashboard.tsx`
- Modify: `client/src/components/HomeView.tsx`
- Modify: `client/src/components/JudgeConsole.tsx`
- Modify: `client/src/components/game/GameView.tsx`
- Modify: `client/src/components/game/PlayerList.tsx`
- Modify: `client/src/components/game/StatusBar.tsx`

- [ ] **Step 1: 重命名 JudgeElection.tsx 为 SheriffElection.tsx 并修改内容**

删除旧文件，创建新文件，修改所有内容：
- 组件名改为 `SheriffElection`
- 注释改为 `选举警长界面组件`
- `submitJudgeElectionVote` 改为 `submitSheriffElectionVote`
- 候选人过滤：`!p.isJudge` 改为 `!p.isSheriff`
- 标题：`选举法官` → `选举警长`
- 说明：`当选法官后，发言顺序可由法官决定` → `当选警长后，发言顺序可由警长决定`
- 确认文案：`当选法官吗` → `当选警长吗`

- [ ] **Step 2: 修改 AdminDashboard.tsx**

将操作类型名称映射中的法官选举部分改为：

```typescript
  SHERIFF_ELECTION_START: '警长选举开始',
  SHERIFF_ELECTION_VOTE: '警长选举投票',
  SHERIFF_ELECTED: '警长当选',
  SHERIFF_ELECTION_TIE: '警长选举平票',
```

将阶段名映射中的 `JUDGE_ELECTION: '法官选举'` 改为 `SHERIFF_ELECTION: '警长选举'`

- [ ] **Step 3: 修改 HomeView.tsx**

将 `启用法官（警长）选举` 改为 `启用警长选举`
将 `ruleConfig.judgeElectionEnabled` 改为 `ruleConfig.sheriffElectionEnabled`
将 `updateRuleConfig({ judgeElectionEnabled: e.target.checked })` 改为 `updateRuleConfig({ sheriffElectionEnabled: e.target.checked })`

在警长选举复选框之后新增警长投票权重选择：

```tsx
{/* 警长投票权重 */}
{ruleConfig.sheriffElectionEnabled && (
  <div className="flex items-center justify-between">
    <span className="text-sm">警长投票权重</span>
    <select
      value={ruleConfig.sheriffVoteWeight}
      onChange={(e) => updateRuleConfig({ sheriffVoteWeight: Number(e.target.value) as 1 | 1.5 | 2 })}
      className="bg-gray-800 text-sm rounded px-2 py-1 border border-gray-600"
    >
      <option value={1}>1票</option>
      <option value={1.5}>1.5票</option>
      <option value={2}>2票</option>
    </select>
  </div>
)}
```

- [ ] **Step 4: 修改 JudgeConsole.tsx**

将阶段名映射中的 `JUDGE_ELECTION: '法官选举'` 改为 `SHERIFF_ELECTION: '警长选举'`

- [ ] **Step 5: 修改 GameView.tsx**

将 `JUDGE_ELECTION` 阶段的引用改为 `SHERIFF_ELECTION`
将 `JudgeElection` 组件导入改为 `SheriffElection`
将渲染 `<JudgeElection />` 改为 `<SheriffElection />`

- [ ] **Step 6: 修改 PlayerList.tsx**

在状态图标区域，为警长添加标识：

```tsx
{p.isSheriff && !isDead && <span className="text-xs">⭐</span>}
```

- [ ] **Step 7: 修改 StatusBar.tsx**

将阶段名映射中的 `JUDGE_ELECTION: '法官选举'` 改为 `SHERIFF_ELECTION: '警长选举'`

- [ ] **Step 8: 编译验证**

Run: `cd e:\GitHub\langrensha\client && npx tsc --noEmit`

---

### Task 8: 全量编译与最终验证

**Files:**
- All modified files

- [ ] **Step 1: 全量编译 shared**

Run: `cd e:\GitHub\langrensha\shared && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: 全量编译 server**

Run: `cd e:\GitHub\langrensha\server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 全量编译 client**

Run: `cd e:\GitHub\langrensha\client && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: 全局搜索确认无遗漏**

搜索以下关键词确认项目中不再存在旧命名：
- `JUDGE_ELECTION`（除了设计文档和本计划文件外不应存在）
- `judgeElection`（同上）
- `JudgeElection`（同上）
- `法官选举`（同上）
- `当选法官`（同上）
