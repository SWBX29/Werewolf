# 变更日志 - 2026-06-08

**分支**: `feat-continuous-improvement-y4agy1`  
**生成时间**: 2026-06-08  
**上次提交**: `7678513` - Merge branch 'feat-continuous-improvement-y4agy1'

---

## 变更概述

本次变更主要优化了噩梦之影恐惧技能的实现逻辑、移除了 SYSTEM 模式判断使所有游戏模式统一使用超时机制、新增玩家主动结束发言功能，并改进了多个 UI 交互细节。

---

## 变更文件列表

### 核心类型定义
- `shared/types.ts` - 新增噩梦封印标记和结束发言消息类型

### 服务端
- `server/src/GameEngine.ts` - 重构噩梦封印逻辑、移除 SYSTEM 模式判断、新增结束发言方法
- `server/src/server.ts` - 新增结束发言消息处理器

### 客户端 - 状态管理
- `client/src/useGameStore.ts` - 新增结束发言动作

### 客户端 - UI 组件
- `client/src/components/AdminDashboard.tsx` - 新增结束发言日志类型显示
- `client/src/components/game/night/NightPhase.tsx` - 新增被恐惧封印 UI 展示
- `client/src/components/game/day/SpeechPhase.tsx` - 新增结束发言按钮
- `client/src/components/game/day/SheriffElection.tsx` - 投票时添加操作锁定
- `client/src/components/game/day/VotePhase.tsx` - 投票时添加操作锁定

### 编译产物
- `client/tsconfig.tsbuildinfo` - TypeScript 编译信息更新

---

## 详细变更内容

### 1. 噩梦之影恐惧技能优化 (`server/src/GameEngine.ts`, `client/src/components/game/night/NightPhase.tsx`, `shared/types.ts`)

**变更内容**:
- 修改被恐惧狼人的处理逻辑：从"自动跳过并推进到下一子阶段"改为"显示标准倒计时 + 随机延时（5-15 秒）自动提交空操作"
- 新增 `isBlockedByNightmare` 字段到 `NightActionRequestDTO`，用于客户端显示被恐惧提示
- 客户端新增被恐惧封印 UI：显示😱表情、紫色标题"你被噩梦之影恐惧了！"、技能封印提示和倒计时器
- 所有玩家看到标准倒计时（如 30 秒），保持与正常阶段一致，避免暴露信息
- 被恐惧玩家的操作在 5-15 秒后随机时间点自动提交（不行动），模拟真实玩家操作时间

**代码变更**:
```typescript
// shared/types.ts - NightActionRequestDTO
interface NightActionRequestDTO {
  // ... 其他字段
  isBlockedByNightmare: boolean;  // 新增：是否因被噩梦之影恐惧而封印
}

// server/src/GameEngine.ts - advanceNightSubPhase
if (isBlocked) {
  // 设置标准倒计时定时器 + 倒计时广播
  if (this.state.config.nightActionTimeout > 0) {
    this.setNightActionTimer(roleId, this.state.config.nightActionTimeout);
  }
  
  // 随机 5-15 秒后自动提交空操作并推进到下一个子阶段
  const autoAdvanceDelay = Math.floor(Math.random() * 11) + 5;
  this.setTimer('blocked_auto_advance', autoAdvanceDelay, () => {
    this.clearTimer(`night_${roleId}`);
    this.clearNightCountdownTimer(roleId);
    const nextIndex = this.state.nightSubPhase!.currentRoleIndex + 1;
    this.advanceNightSubPhase(nextIndex);
  });
  
  // 发送阶段提醒并广播房间状态
  this.onPhaseReminder(...);
  this.onNightSubPhaseAdvance(this.state.roomCode);
  return true;
}
```

**影响**:
- 防止被恐惧阶段秒过暴露噩梦之影信息
- 提升游戏平衡性和策略深度
- 改善用户体验，明确告知被封印状态

---

### 2. 移除 SYSTEM 模式判断 (`server/src/GameEngine.ts`)

**变更内容**:
- 移除所有 `if (this.state.gameMode === 'SYSTEM')` 判断
- 所有游戏模式现在统一使用超时机制
- 涉及的阶段：白天宣布、发言阶段、警长选举、警徽移交、投票阶段、PK 投票、夜间行动

**变更示例**:
```typescript
// 之前
if (this.state.gameMode === 'SYSTEM' && this.state.config.speechTimeout > 0) {
  this.setSpeechTimer();
}

// 现在
if (this.state.config.speechTimeout > 0) {
  this.setSpeechTimer();
}
```

**影响**:
- 简化代码逻辑
- 所有游戏模式行为一致
- 减少配置复杂度

---

### 3. 新增玩家主动结束发言功能 (`shared/types.ts`, `server/src/GameEngine.ts`, `server/src/server.ts`, `client/src/useGameStore.ts`, `client/src/components/game/day/SpeechPhase.tsx`)

**变更内容**:
- 新增 `FINISH_SPEECH` 消息类型到 `ClientMessageType`
- 新增 `FinishSpeechMessage` 接口定义
- 新增 `SPEECH_FINISH` 行动类型到 `ActionType`
- 服务端新增 `finishSpeech()` 方法处理玩家主动结束发言
- 客户端新增 `finishSpeech()` 动作和结束发言按钮
- 发言阶段 UI 新增"结束发言"按钮（琥珀色背景）

**代码变更**:
```typescript
// shared/types.ts
export interface FinishSpeechMessage {
  type: 'FINISH_SPEECH';
}

export type ClientMessage =
  // ... 其他消息
  | FinishSpeechMessage;

// server/src/GameEngine.ts
finishSpeech(playerId: string): { success: boolean; error?: string } {
  if (this.state.phase !== 'DAY_SPEECH') {
    return { success: false, error: '当前不在发言阶段' };
  }
  
  const player = this.getPlayerById(playerId);
  const currentSpeakerSeat = this.state.speechOrder[this.state.currentSpeakerIndex] ?? null;
  
  if (player.seatNumber !== currentSpeakerSeat) {
    return { success: false, error: '当前不是你的发言回合' };
  }
  
  this.logAction({
    actorSeat: player.seatNumber,
    actionType: 'SPEECH_FINISH',
    detail: {},
  });
  
  this.nextSpeaker();
  return { success: true };
}

// client/src/components/game/day/SpeechPhase.tsx
<button
  className="w-full py-2 px-4 rounded-lg bg-amber-800 hover:bg-amber-700 text-white font-semibold
             border border-amber-600 transition-colors duration-200 text-sm"
  onClick={finishSpeech}
>
  结束发言
</button>
```

**影响**:
- 提升用户体验，允许玩家快速跳过自己的发言回合
- 加快游戏节奏
- 记录发言结束日志便于复盘

---

### 4. 投票操作锁定优化 (`client/src/components/game/day/SheriffElection.tsx`, `client/src/components/game/day/VotePhase.tsx`)

**变更内容**:
- 警长选举投票确认时调用 `setActionLocked(true)`
- 白天投票确认时调用 `setActionLocked(true)`
- 防止重复提交投票

**影响**:
- 避免网络延迟导致的重复投票
- 提升界面交互反馈

---

### 5. 法官强制推进阶段逻辑优化 (`server/src/GameEngine.ts`)

**变更内容**:
- 修改法官强制推进发言阶段的逻辑：从"直接进入投票"改为"推进到下一位发言者"
- 更符合游戏流程预期

**代码变更**:
```typescript
// server/src/GameEngine.ts - handleJudgeForceNextPhase
case 'DAY_SPEECH':
  // 发言阶段：强制推进到下一位发言者，而非直接跳到投票
  this.nextSpeaker();
  break;
```

**影响**:
- 法官操作更符合游戏逻辑
- 支持逐位推进发言流程

---

### 6. 日志类型更新 (`client/src/components/AdminDashboard.tsx`)

**变更内容**:
- 新增 `SPEECH_FINISH: '主动结束发言'` 日志类型显示

**影响**:
- 管理员面板可追踪玩家主动结束发言行为

---

## 技术细节

### 定时器管理
- 被恐惧封印时同时设置标准倒计时定时器和自动推进定时器
- 自动推进时清除两个定时器避免内存泄漏
- 使用随机延时（5-15 秒）模拟真实玩家行为

### 类型安全
- 所有新增消息类型均添加到 `ClientMessage` 联合类型
- 服务端消息处理器类型检查完善
- 错误处理统一返回 `success: boolean` 和 `error?: string`

### UI/UX 改进
- 被恐惧封印 UI 使用紫色主题和脉冲动画
- 结束发言按钮使用琥珀色主题区分于发送按钮
- 倒计时器在所有阶段统一显示

---

## 测试建议

1. **噩梦之影恐惧测试**:
   - 验证被恐惧玩家显示封印 UI
   - 验证倒计时正常显示
   - 验证 5-15 秒后自动推进
   - 验证其他玩家看不到异常

2. **结束发言测试**:
   - 验证只有当前发言者能看到结束按钮
   - 验证点击后推进到下一位
   - 验证日志记录正确

3. **SYSTEM 模式移除测试**:
   - 验证所有模式下超时机制正常工作
   - 验证配置项生效

---

## 已知问题

无

---

## 后续计划

- [ ] 添加更多游戏日志细节
- [ ] 优化被恐惧封印的视觉效果
- [ ] 增加结束发言的快捷键支持

---

**提交者**: AI Assistant  
**审核状态**: 待审核
