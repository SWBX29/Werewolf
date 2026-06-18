# Tasks

- [x] Task 1: 重构玩家界面底部栏 — 融合语音控制按钮
  - [x] SubTask 1.1: 修改 GameView.tsx 底部栏布局，移除独立 VoiceControlBar，在底部栏下方添加两个语音按钮（发言推流、拉流）和连接状态指示
  - [x] SubTask 1.2: 在底部栏添加手动重连按钮（仅 DISCONNECTED 状态且非 CONNECTING/RECONNECTING 时显示）
  - [x] SubTask 1.3: 添加连接失败时的错误提示显示（保持现有逻辑）

- [x] Task 2: 重构法官界面语音控制台
  - [x] SubTask 2.1: 在 JudgeConsole.tsx 中替换现有"语音控制"区域，改为玩家语音控制台（grid 布局，seat-cell 样式）
  - [x] SubTask 2.2: 每个玩家方框下方添加发言控制按钮（调用 muteRemoteAudioByUserID / unmuteRemoteAudioByUserID）
  - [x] SubTask 2.3: 控制台下方添加全局控制按钮（全体静音 / 全体取消静音）
  - [x] SubTask 2.4: 夜晚阶段操作添加二次确认弹窗
  - [x] SubTask 2.5: 移除法官界面底部的 VoiceControlBar compact 模式

- [x] Task 3: 清理旧组件和代码
  - [x] SubTask 3.1: 移除 VoiceInfoPanel.tsx 组件
  - [x] SubTask 3.2: 清理 VoiceControlBar.tsx 中不再需要的逻辑（保留法官控制台可复用的部分，或完全重写为简化版）
  - [x] SubTask 3.3: 清理 useVoiceStore 和 useZegoVoice 中不再需要的状态（如 operationFeedback 等 VoiceInfoPanel 专用状态可移除）

- [x] Task 4: 添加手动重连功能
  - [x] SubTask 4.1: 在 useVoiceStore 中添加 manualReconnect 操作（退出房间 → 重新加入）
  - [x] SubTask 4.2: 在 useVoiceStore 中添加 isManualReconnecting 状态
  - [x] SubTask 4.3: 在玩家界面和法官界面的语音区域添加手动重连按钮

# Task Dependencies
- [Task 2] depends on [Task 4] (法官控制台需要手动重连按钮)
- [Task 1] depends on [Task 4] (玩家界面需要手动重连按钮)
- [Task 3] depends on [Task 1] and [Task 2] (清理旧代码需在新UI完成后进行)
