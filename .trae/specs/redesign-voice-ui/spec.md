# 语音UI重设计 Spec

## Why
当前语音控制UI分散且功能不直观：法官界面语音控制区域简陋（仅有全体静音/取消静音按钮和简单列表），玩家界面语音控制栏占据独立空间且与底部玩家UI割裂。需要将语音控制与玩家信息融合，提供更直观的操作体验。

## What Changes
- **法官界面**：新增玩家语音控制台，仿照 PlayerList 底部UI布局，每个玩家方框下方有发言控制按钮，控制台下方有全局控制按钮；夜晚操作需二次确认
- **玩家界面**：移除独立 VoiceControlBar，将语音控制融合进底部玩家UI栏，仅保留两个按钮（开关发言推流、开关其他玩家拉流）
- **手动重连**：当连接断开且SDK自动重连失败时，在界面提供手动重连按钮
- **移除 VoiceInfoPanel**：语音详细信息面板不再需要独立组件，关键信息内联显示

## Impact
- Affected code:
  - `client/src/components/JudgeConsole.tsx` — 重写语音控制区域
  - `client/src/components/game/VoiceControlBar.tsx` — 重构为玩家界面底部融合组件
  - `client/src/components/game/VoiceInfoPanel.tsx` — 移除
  - `client/src/components/game/GameView.tsx` — 调整底部栏布局，融合语音按钮
  - `client/src/components/game/PlayerList.tsx` — 可能需要调整以适配融合布局
  - `client/src/store/useVoiceStore.ts` — 新增手动重连状态和操作
  - `client/src/hooks/useZegoVoice.ts` — 可能需要新增手动重连方法

## ADDED Requirements

### Requirement: 法官语音控制台

法官界面 SHALL 提供一个包含全部玩家的语音控制台，布局仿照 PlayerList 底部UI（grid 布局，seat-cell 样式），每个玩家方框下方有一个控制按钮用于开关该玩家的发言（推流）能力。

#### Scenario: 法官控制单个玩家发言
- **WHEN** 法官点击某个玩家方框下方的控制按钮
- **AND** 当前为白天阶段
- **THEN** 该玩家的推流被静音/取消静音，按钮状态即时更新

#### Scenario: 法官在夜晚控制玩家发言需二次确认
- **WHEN** 法官点击某个玩家方框下方的控制按钮
- **AND** 当前为夜晚阶段（NIGHT / NIGHT_SETTLEMENT / PRE_NIGHT）
- **THEN** 弹出二次确认弹窗，提示"当前为夜晚阶段，确认修改玩家发言状态？"
- **AND** 法官确认后才执行操作，取消则不执行

#### Scenario: 全局控制按钮
- **WHEN** 法官点击控制台下方的全局控制按钮（全体静音/全体取消静音）
- **AND** 当前为白天阶段
- **THEN** 所有玩家的推流被静音/取消静音

#### Scenario: 全局控制按钮在夜晚需二次确认
- **WHEN** 法官点击全局控制按钮
- **AND** 当前为夜晚阶段
- **THEN** 弹出二次确认弹窗

#### Scenario: 玩家方框颜色与PlayerList一致
- **WHEN** 控制台渲染玩家方框
- **THEN** 存活玩家使用 seat-alive 样式，死亡玩家使用 seat-dead 样式，自己使用 seat-self 样式，被静音玩家使用 seat-muted 样式，正在说话玩家使用 seat-speaking 样式

### Requirement: 玩家界面语音融合

玩家界面 SHALL 将语音控制融合进底部玩家UI栏，移除独立的 VoiceControlBar，仅在底部栏下方设置两个按钮。

#### Scenario: 开关发言推流按钮
- **WHEN** 玩家点击"发言推流"按钮
- **THEN** 麦克风静音/取消静音状态切换，按钮视觉状态即时更新（开启为绿色，关闭为红色）

#### Scenario: 开关其他玩家拉流按钮
- **WHEN** 玩家点击"拉流"按钮
- **THEN** 扬声器静音/取消静音状态切换，按钮视觉状态即时更新

#### Scenario: 语音连接状态指示
- **WHEN** 语音连接状态变化
- **THEN** 在两个按钮旁显示连接状态指示点（绿色=已连接，黄色闪烁=连接/重连中，红色=断开）

### Requirement: 手动重连按钮

当语音连接断开且SDK自动重连失败时，界面 SHALL 提供手动重连按钮。

#### Scenario: SDK自动重连失败后显示手动重连
- **WHEN** 语音连接状态为 DISCONNECTED
- **AND** 不处于 CONNECTING 或 RECONNECTING 状态
- **THEN** 在语音控制区域显示"手动重连"按钮

#### Scenario: 点击手动重连
- **WHEN** 用户点击"手动重连"按钮
- **THEN** 执行手动重连流程（退出当前房间 → 重新加入），按钮显示加载状态

#### Scenario: 重连成功后隐藏按钮
- **WHEN** 手动重连成功
- **THEN** 连接状态变为 CONNECTED，手动重连按钮隐藏

### Requirement: 连接失败显示逻辑保持不变

当连接失败时，显示逻辑 SHALL 与现有逻辑保持一致（红色状态点 + 错误提示文字）。

#### Scenario: 连接失败显示
- **WHEN** 语音连接失败
- **THEN** 显示红色状态点和错误提示文字，与当前实现一致

## REMOVED Requirements

### Requirement: VoiceInfoPanel 独立组件
**Reason**: 语音详细信息面板功能过于复杂，与简化后的UI设计不符。关键信息（连接状态、网络质量）已内联到融合后的UI中。
**Migration**: 移除 VoiceInfoPanel 组件，不再提供独立语音信息面板入口。
