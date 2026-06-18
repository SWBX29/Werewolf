# 首日双轮发言配置 Spec

## Why
狼人杀游戏中，第一晚后的第一个白天信息量最少，单轮发言往往不足以让玩家充分表达和推理。部分村规要求首日进行两轮发言，以增加信息密度和游戏体验。目前系统不支持此功能，需要新增房间自定义配置。

## What Changes
- RuleConfig 新增 `firstDayDoubleSpeech: boolean` 配置项，默认 `false`
- GameEngine 在首日（round === 1）发言阶段结束时，若该配置为 `true`，则进入第二轮发言而非投票前等待
- 游戏状态新增 `currentSpeechRound: number` 字段，追踪当前是第几轮发言（1 或 2）
- 客户端发言阶段 UI 显示当前发言轮次（"第1轮发言" / "第2轮发言"）
- 创建房间 UI 新增"首日双轮发言"开关

## Impact
- Affected specs: RuleConfig、GameState、GameEngine 白天阶段流转
- Affected code:
  - `shared/types.ts` — RuleConfig 接口、GameState 类型、createDefaultRuleConfig
  - `server/src/GameEngine.ts` — enterDaySpeech、nextSpeaker、enterPreVoteWait 流程
  - `server/src/models.ts` — RoomState Schema
  - `client/src/components/HomeView.tsx` — 创建房间配置面板
  - `client/src/components/game/day/SpeechPhase.tsx` — 发言阶段 UI

## ADDED Requirements

### Requirement: 首日双轮发言配置
系统 SHALL 在 RuleConfig 中提供 `firstDayDoubleSpeech` 布尔配置项，允许法官在建房时选择是否在第一晚后的第一个白天进行两轮发言，默认为 `false`。

#### Scenario: 配置关闭（默认行为）
- **WHEN** `firstDayDoubleSpeech` 为 `false`
- **THEN** 首日发言阶段与后续天数一致，单轮发言结束后进入投票前等待阶段

#### Scenario: 配置开启
- **WHEN** `firstDayDoubleSpeech` 为 `true` 且当前为第一晚后的第一个白天（round === 1）
- **THEN** 第一轮发言结束后，系统自动进入第二轮发言，第二轮发言结束后才进入投票前等待阶段

### Requirement: 发言轮次状态追踪
系统 SHALL 在游戏状态中维护 `currentSpeechRound` 字段（1 或 2），记录当前白天阶段处于第几轮发言。

#### Scenario: 首日双轮发言 - 第一轮
- **WHEN** 首日双轮发言开启，进入首日发言阶段
- **THEN** `currentSpeechRound` 为 1，发言顺序与配置的 speechOrderStrategy 一致

#### Scenario: 首日双轮发言 - 进入第二轮
- **WHEN** 首日第一轮发言结束（所有玩家发言完毕）且 `firstDayDoubleSpeech` 为 `true` 且 `currentSpeechRound` 为 1
- **THEN** `currentSpeechRound` 变为 2，重新计算发言顺序（基于同一策略），重置 `currentSpeakerIndex` 为 0，进入第二轮发言

#### Scenario: 非首日或配置关闭
- **WHEN** 非首日（round > 1）或 `firstDayDoubleSpeech` 为 `false`
- **THEN** `currentSpeechRound` 始终为 1，单轮发言结束后直接进入投票前等待阶段

### Requirement: 第二轮发言顺序
第二轮发言 SHALL 使用与第一轮相同的发言顺序策略重新计算发言顺序（因为发言顺序基于死亡者位置等动态因素，重新计算可确保一致性）。

#### Scenario: 第二轮发言顺序计算
- **WHEN** 进入第二轮发言
- **THEN** 系统重新调用 calculateSpeechOrder()，基于当前存活玩家和配置的 speechOrderStrategy 计算新的发言顺序

### Requirement: 客户端发言轮次显示
客户端 SHALL 在发言阶段 UI 中显示当前发言轮次信息。

#### Scenario: 首日双轮发言 - 显示轮次
- **WHEN** `firstDayDoubleSpeech` 为 `true` 且处于首日发言阶段
- **THEN** 发言阶段标题显示"第1轮发言"或"第2轮发言"

#### Scenario: 普通发言 - 不显示轮次
- **WHEN** `firstDayDoubleSpeech` 为 `false` 或非首日
- **THEN** 发言阶段标题显示"发言阶段"（与现有行为一致）

### Requirement: 创建房间 UI 配置
创建房间面板 SHALL 提供"首日双轮发言"开关，位于村规配置区域。

#### Scenario: 法官开启首日双轮发言
- **WHEN** 法官在创建房间时勾选"首日双轮发言"
- **THEN** RuleConfig 的 `firstDayDoubleSpeech` 设为 `true`

#### Scenario: 法官关闭首日双轮发言
- **WHEN** 法官未勾选"首日双轮发言"
- **THEN** RuleConfig 的 `firstDayDoubleSpeech` 设为 `false`（默认）

### Requirement: 游戏日志记录
系统 SHALL 在进入第二轮发言时写入游戏日志。

#### Scenario: 第二轮发言开始日志
- **WHEN** 首日第一轮发言结束，进入第二轮发言
- **THEN** 系统记录 `SECOND_SPEECH_ROUND_START` 类型的日志，包含 round 和 speechRound 信息

### Requirement: 法官控制台显示
法官控制台 SHALL 在首日双轮发言时显示当前轮次信息，并允许法官正常操作（跳过发言、结束发言等）。

#### Scenario: 法官跳过/结束第二轮发言
- **WHEN** 法官在第二轮发言中执行跳过或结束操作
- **THEN** 行为与第一轮一致，所有玩家发言完毕后进入投票前等待阶段
