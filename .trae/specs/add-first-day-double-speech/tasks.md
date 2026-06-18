# Tasks

- [x] Task 1: 在 shared/types.ts 中新增 RuleConfig 字段和状态字段
  - [x] SubTask 1.1: RuleConfig 接口新增 `firstDayDoubleSpeech: boolean` 字段，默认 `false`
  - [x] SubTask 1.2: createDefaultRuleConfig 函数中添加 `firstDayDoubleSpeech: false` 默认值
  - [x] SubTask 1.3: GameState 相关类型新增 `currentSpeechRound: number` 字段

- [x] Task 2: 在 server/src/models.ts 中更新 RoomState Schema
  - [x] SubTask 2.1: RuleConfig Schema 新增 `firstDayDoubleSpeech` 字段
  - [x] SubTask 2.2: RoomState Schema 新增 `currentSpeechRound` 字段，默认 1

- [x] Task 3: 在 server/src/GameEngine.ts 中实现双轮发言逻辑
  - [x] SubTask 3.1: enterDaySpeech 方法中初始化 `currentSpeechRound` 为 1
  - [x] SubTask 3.2: nextSpeaker 方法中，当首日第一轮发言结束且 `firstDayDoubleSpeech` 为 true 时，进入第二轮发言而非投票前等待
  - [x] SubTask 3.3: 新增 enterSecondSpeechRound 私有方法：设置 `currentSpeechRound` 为 2，重新计算发言顺序，重置 `currentSpeakerIndex`，记录日志，触发阶段变更
  - [x] SubTask 3.4: 确保第二轮发言结束后正常进入投票前等待阶段

- [x] Task 4: 更新服务端状态广播，确保 currentSpeechRound 和 firstDayDoubleSpeech 包含在推送的状态中
  - [x] SubTask 4.1: 检查 server.ts 中的状态映射，确保 currentSpeechRound 包含在 PlayerStateDTO 和 JudgeStateDTO 中

- [x] Task 5: 在 client/src/components/HomeView.tsx 中添加"首日双轮发言"配置开关
  - [x] SubTask 5.1: 在村规配置区域添加"首日双轮发言"开关，位于发言顺序策略配置附近

- [x] Task 6: 在 client/src/components/game/day/SpeechPhase.tsx 中显示发言轮次
  - [x] SubTask 6.1: 当 firstDayDoubleSpeech 为 true 且为首日时，标题显示"第N轮发言"

- [x] Task 7: 更新客户端 useGameStore 中的状态类型定义
  - [x] SubTask 7.1: 确保 playerState 和 judgeState 中包含 currentSpeechRound 字段

# Task Dependencies
- Task 1 是所有后续任务的基础
- Task 2 依赖 Task 1
- Task 3 依赖 Task 1 和 Task 2
- Task 4 依赖 Task 3
- Task 5 依赖 Task 1
- Task 6 依赖 Task 4 和 Task 7
- Task 7 依赖 Task 1
