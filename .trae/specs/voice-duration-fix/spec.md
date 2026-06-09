# 语音时长异常消耗诊断与修复 Spec

## Why
语音时长被大量异常消耗，可能存在以下问题：
1. 服务端或客户端重复连接音频服务器
2. 音频服务器连接未被正确关闭
3. 语音模块 UI 反馈不清晰，用户无法感知连接状态

## What Changes
- **诊断并修复重复连接问题**：检查所有可能触发语音连接的入口，防止重复登录语音房间
- **修复连接未正确关闭问题**：确保所有退出场景（离开房间、游戏结束、页面关闭、网络断连）都正确退出语音房间
- **优化语音模块 UI**：提供清晰明了、内容完整、有反馈的语音控制界面
- **添加连接状态监控**：记录语音连接时长、网络质量、计费相关信息

## Impact
- Affected specs: zego_voice_integration
- Affected code:
  - `client/src/App.tsx` - 语音服务初始化和生命周期管理
  - `client/src/store/useVoiceStore.ts` - 语音状态管理
  - `client/src/services/zego.ts` - Zego SDK 封装
  - `client/src/components/game/VoiceControlBar.tsx` - 语音控制 UI
  - `client/src/components/game/GameView.tsx` - 游戏视图语音控制
  - `server/src/server.ts` - Token 生成服务（可能需要添加连接状态追踪）

## ADDED Requirements

### Requirement: 夜晚阶段语音连接管理（节省时长）
系统 SHALL 在夜晚阶段根据玩家角色动态管理语音连接，仅保持必要的语音连接以节省时长。

#### Scenario: 夜晚阶段普通玩家断开连接
- **WHEN** 游戏进入夜晚阶段（NIGHT 或 NIGHT_SETTLEMENT）
- **AND** 玩家不是共同睁眼的狼人成员
- **AND** 玩家不是法官
- **AND** 玩家不是当前正在行动的玩家（如女巫、预言家、守卫等）
- **THEN** 系统断开该玩家的语音连接
- **AND** 显示"夜晚休息"状态提示
- **AND** 不消耗语音时长

#### Scenario: 共同睁眼的狼人保持连接
- **WHEN** 游戏进入夜晚阶段
- **AND** 玩家是共同睁眼的狼人成员（普通狼人、狼王、噩梦之影等）
- **THEN** 系统保持语音连接
- **AND** 仅狼人阵营可以彼此交流
- **AND** 好人阵营玩家无法听到狼人语音
- **AND** 显示"狼人密谋"状态提示

#### Scenario: 法官与当前行动玩家保持连接
- **WHEN** 游戏进入夜晚阶段
- **AND** 当前有玩家正在执行行动（如女巫救人、预言家查验、守卫守护等）
- **THEN** 法官可以与当前行动的玩家语音交流
- **AND** 其他玩家断开连接
- **AND** 显示"法官指导"状态提示（仅法官和当前行动玩家可见）

#### Scenario: 夜晚阶段结束恢复连接
- **WHEN** 游戏从夜晚阶段切换到白天阶段（DAY_ANNOUNCE 等）
- **THEN** 系统自动恢复所有存活玩家的语音连接
- **AND** 显示"天亮了"状态提示
- **AND** 语音连接恢复正常

#### Scenario: 玩家死亡后夜晚断开连接
- **WHEN** 玩家已死亡
- **AND** 游戏进入夜晚阶段
- **THEN** 系统断开该玩家的语音连接（无论角色）
- **AND** 死亡玩家进入观战模式，无语音功能

### Requirement: 防止重复连接语音服务器
系统 SHALL 确保不会重复登录同一语音房间，避免产生多次计费。

#### Scenario: 用户进入游戏视图时防止重复加入
- **WHEN** 用户从首页切换到游戏视图
- **AND** 用户已在语音房间中
- **THEN** 系统检测到当前连接状态为 CONNECTED 且房间 ID 相同
- **AND** 跳过重复加入语音房间

#### Scenario: 用户快速切换视图时防止重复连接
- **WHEN** 用户快速从游戏视图切换到首页再回到游戏视图
- **AND** 语音连接尚未完全断开
- **THEN** 系统等待前一次连接完全断开后再加入新房间
- **OR** 系统检测到连接状态为 CONNECTING/RECONNECTING 时跳过新请求

#### Scenario: 多个组件同时触发加入语音房间
- **WHEN** 多个组件（App.tsx、GameView.tsx）同时调用 joinVoiceRoom
- **THEN** 系统使用互斥锁或标志位确保只有一个请求被执行

### Requirement: 正确关闭语音连接
系统 SHALL 在所有退出场景下正确退出语音房间并释放资源。

#### Scenario: 用户主动离开游戏房间
- **WHEN** 用户点击"离开"按钮离开游戏房间
- **THEN** 系统立即退出语音房间
- **AND** 停止推流、销毁本地流、停止拉流
- **AND** 清除所有语音状态

#### Scenario: 游戏结束或房间解散
- **WHEN** 游戏结束或法官解散房间
- **THEN** 系统立即退出语音房间
- **AND** 显示语音已断开状态

#### Scenario: 页面关闭或刷新
- **WHEN** 用户关闭浏览器标签页或刷新页面
- **THEN** 系统通过 beforeunload 事件通知 Zego 服务器断开连接
- **AND** 尽可能释放资源（浏览器限制可能无法完全执行）

#### Scenario: WebSocket 断连导致游戏连接丢失
- **WHEN** WebSocket 连接断开
- **AND** 游戏进入重连状态
- **THEN** 语音连接保持（不退出语音房间）
- **AND** 显示语音重连状态
- **AND** 重连成功后恢复语音功能

#### Scenario: 语音连接异常断开
- **WHEN** Zego SDK 报告连接断开（KICKOUT、RECONNECT_FAILED 等）
- **THEN** 系统清除语音状态
- **AND** 显示语音断开提示
- **AND** 不自动重连语音（避免重复计费）

### Requirement: 清晰的语音模块 UI
系统 SHALL 提供清晰明了、内容完整、有反馈的语音控制界面。

#### Scenario: 显示完整连接信息
- **WHEN** 用户查看语音控制栏
- **THEN** 显示以下信息：
  - 连接状态（已连接/连接中/重连中/未连接）
  - 当前语音房间 ID（可选显示）
  - 连接时长（已连接时长）
  - 网络质量指示（优秀/良好/中等/较差）
  - 麦克风权限状态

#### Scenario: 显示详细错误信息
- **WHEN** 语音功能出现错误
- **THEN** 显示详细的错误信息和建议解决方案
- **AND** 提供重新连接按钮
- **AND** 提供权限设置指引（如权限被拒绝）

#### Scenario: 麦克风权限请求反馈
- **WHEN** 用户首次点击麦克风按钮
- **AND** 麦克风权限尚未授予
- **THEN** 显示权限请求提示
- **AND** 权限授予后显示成功反馈
- **AND** 权限拒绝后显示拒绝原因和解决方法

#### Scenario: 语音控制操作反馈
- **WHEN** 用户切换麦克风或扬声器状态
- **THEN** 显示操作成功的视觉反馈（按钮状态变化、动画效果）
- **AND** 显示当前状态文字提示

### Requirement: 语音连接状态监控
系统 SHALL 记录和监控语音连接状态，帮助诊断计费问题。

#### Scenario: 记录连接事件日志
- **WHEN** 语音连接状态发生变化（加入/退出/重连）
- **THEN** 记录事件日志到浏览器 console
- **AND** 包含时间戳、房间 ID、用户 ID、事件类型

#### Scenario: 显示连接时长
- **WHEN** 用户已连接语音房间
- **THEN** 实时显示连接时长
- **AND** 用户可查看当前会话的累计连接时长

#### Scenario: 网络质量实时显示
- **WHEN** 语音连接正常
- **THEN** 实时显示网络质量等级（优秀/良好/中等/较差）
- **AND** 网络质量差时显示警告提示

## MODIFIED Requirements

### Requirement: 语音房间生命周期管理（修改自 zego_voice_integration）
系统 SHALL 提供完整的语音房间生命周期管理，包括初始化、加入、退出、销毁，并确保资源正确释放。

**修改内容**：
- 增加互斥锁防止重复加入
- 增加连接时长追踪
- 增加资源释放完整性检查
- 增加异常情况下的强制清理机制

### Requirement: 语音状态显示（修改自 zego_voice_integration）
系统 SHALL 显示完整的语音状态信息，包括连接状态、麦克风状态、扬声器状态、网络质量、连接时长、错误信息。

**修改内容**：
- 增加网络质量显示
- 增加连接时长显示
- 增加麦克风权限状态显示
- 增加详细的错误信息和解决建议

## REMOVED Requirements
无移除的需求。

## Technical Analysis

### 潜在问题点

1. **App.tsx 中的语音初始化逻辑**：
   - `zegoInitPromise.current` 用于防止重复初始化，但仅检查 `currentView === 'game'`
   - 如果用户快速切换视图，可能触发多次初始化请求

2. **useVoiceStore.ts 中的 joinVoiceRoom**：
   - `isJoiningVoiceRoom` 是模块级变量，但在并发场景下可能失效
   - 检查 `connectionState === 'CONNECTED'` 时跳过，但未检查是否正在重连

3. **zego.ts 中的 loginRoom/logoutRoom**：
   - `loginRoom` 失败时可能未清理已创建的本地流
   - `logoutRoom` 在异常情况下可能未完全清理

4. **VoiceControlBar.tsx 的 UI 反馈**：
   - 缺少连接时长显示
   - 缺少网络质量显示
   - 缺少麦克风权限状态显示
   - 错误提示不够详细

### 解决方案

1. **防止重复连接**：
   - 使用 Promise 队列或互斥锁确保 joinVoiceRoom 串行执行
   - 增加 `isLeavingVoiceRoom` 标志防止退出时重复操作
   - 在 loginRoom 中增加更严格的状态检查

2. **确保正确关闭**：
   - 在 loginRoom 失败时强制清理已创建的资源
   - 在 logoutRoom 中增加完整性检查
   - 增加 beforeunload 事件处理
   - 增加异常情况下的强制清理方法

3. **优化 UI 反馈**：
   - 增加连接时长计时器
   - 增加网络质量显示组件
   - 增加麦克风权限状态指示
   - 增加详细的错误信息和解决建议

4. **增加监控日志**：
   - 记录所有连接事件到 console
   - 记录连接时长变化
   - 记录网络质量变化