# Zego 实时语音集成 - Product Requirement Document

## Overview
- **Summary**: 将 Zego 实时语音 SDK 集成到狼人杀游戏中，为游戏添加实时语音通话功能，包括白天发言、夜晚狼人专属语音、全局语音控制等功能。
- **Purpose**: 提升狼人杀游戏的沉浸感和交互体验，让玩家可以通过语音进行更便捷的沟通。
- **Target Users**: 狼人杀游戏的所有玩家和法官。

## Goals
- 为狼人杀游戏提供稳定的实时语音通话功能
- 实现白天发言阶段的轮流发言控制
- 实现夜晚阶段的狼人专属语音通道
- 提供麦克风开关、音量调节等基础控制功能
- 与现有游戏流程无缝集成

## Non-Goals (Out of Scope)
- 不实现视频通话功能
- 不实现语音录制和回放
- 不实现语音转文字功能
- 不实现自定义音效和变声
- 不实现移动端原生应用的开发（仅 Web 端）

## Background & Context
- 当前项目使用 React + TypeScript + Zustand 作为前端技术栈
- 后端使用 Node.js + TypeScript + WebSocket
- 游戏已有完整的房间管理、玩家状态管理、游戏阶段控制机制
- Zego 实时语音 Web SDK 完全兼容现代浏览器和当前技术栈

## Functional Requirements
- **FR-1**: 语音房间管理 - 玩家加入/离开游戏房间时自动创建/加入语音房间
- **FR-2**: 麦克风控制 - 玩家可以随时开关麦克风
- **FR-3**: 音量调节 - 玩家可以调节自己和其他玩家的音量
- **FR-4**: 白天发言阶段控制 - 仅当前发言者可以发言，其他玩家静音
- **FR-5**: 夜晚狼人语音 - 仅狼人阵营可以在夜晚语音沟通
- **FR-6**: 法官语音控制台 - 法官可以全局控制所有玩家的语音权限
- **FR-7**: 语音状态显示 - 界面显示当前发言状态和麦克风状态
- **FR-8**: Token 认证 - 通过后端生成 Zego Token 进行安全认证

## Non-Functional Requirements
- **NFR-1**: 语音延迟 - 端到端语音延迟不超过 300ms
- **NFR-2**: 连接稳定性 - 语音连接断开时能在 5s 内自动重连
- **NFR-3**: 性能影响 - 语音功能开启后，浏览器 CPU 使用率增加不超过 20%
- **NFR-4**: 浏览器兼容性 - 支持 Chrome 58+、Firefox 56+、Safari 11+ 等主流浏览器
- **NFR-5**: 错误提示 - 语音功能异常时提供清晰的错误提示

## Constraints
- **Technical**: 必须使用 Zego 实时语音 Web SDK，不能使用其他语音服务
- **Business**: 需要在 Zego 控制台注册应用并获取 AppID 和 AppSign
- **Dependencies**: 依赖游戏后端提供 Token 生成接口

## Assumptions
- 用户的浏览器支持 WebRTC 和麦克风设备
- 用户的网络环境稳定，支持实时语音传输
- 游戏服务端与 Zego 服务端网络通畅
- 用户愿意授权麦克风权限

## Acceptance Criteria

### AC-1: 语音房间自动加入
- **Given**: 玩家成功加入游戏房间
- **When**: 玩家进入游戏视图
- **Then**: 自动创建/加入对应语音房间，连接状态显示为已连接
- **Verification**: `programmatic`

### AC-2: 麦克风开关控制
- **Given**: 玩家已连接到语音房间
- **When**: 玩家点击麦克风开关按钮
- **Then**: 麦克风状态切换，并在界面上有明确的状态反馈
- **Verification**: `programmatic`

### AC-3: 白天发言轮流控制
- **Given**: 游戏处于白天发言阶段
- **When**: 轮到某玩家发言
- **Then**: 只有当前发言者的麦克风可以发送语音，其他玩家只能收听
- **Verification**: `human-judgment`

### AC-4: 夜晚狼人专属语音
- **Given**: 游戏处于夜晚阶段
- **When**: 夜晚阶段开始
- **Then**: 只有狼人阵营的玩家可以语音沟通，好人阵营玩家无法听到狼人的语音
- **Verification**: `human-judgment`

### AC-5: 法官语音控制
- **Given**: 用户是游戏法官
- **When**: 法官在控制台操作语音控制
- **Then**: 可以全局静音/开启所有玩家的麦克风，或单独控制某位玩家
- **Verification**: `human-judgment`

### AC-6: 语音连接自动重连
- **Given**: 语音连接因网络波动断开
- **When**: 网络恢复后
- **Then**: 语音连接在 5 秒内自动恢复，无需用户手动操作
- **Verification**: `programmatic`

### AC-7: Token 安全认证
- **Given**: 玩家需要连接语音房间
- **When**: 玩家请求连接语音
- **Then**: 从后端获取有效 Zego Token 并完成身份认证
- **Verification**: `programmatic`

### AC-8: 语音状态界面显示
- **Given**: 游戏正在进行
- **When**: 玩家查看游戏界面
- **Then**: 清晰显示当前发言者、麦克风状态、连接状态等语音相关信息
- **Verification**: `human-judgment`

## Open Questions
- [ ] 是否需要实现玩家主动请求发言的功能？
- [ ] 是否需要实现死亡玩家之间的专属语音通道？
- [ ] 语音房间的命名规则是什么？（例如：使用游戏房间码作为语音房间 ID）
