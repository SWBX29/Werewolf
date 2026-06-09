# Zego 实时语音集成 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: 安装依赖和环境配置
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 安装 Zego 实时语音 Web SDK
  - 配置环境变量（ZEGO_APP_ID, ZEGO_APP_SIGN）
  - 更新 package.json
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `programmatic` TR-1.1: npm install 成功执行，依赖正确安装
  - `programmatic` TR-1.2: 环境变量配置文件正确更新
- **Notes**: 需要在根目录和 client 目录分别安装依赖

## [x] Task 2: 创建共享类型定义
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 创建 shared/types/zego.ts
  - 定义 Zego 相关的类型接口
  - 定义语音状态的类型
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-7
- **Test Requirements**:
  - `programmatic` TR-2.1: TypeScript 编译通过，无类型错误
  - `human-judgement` TR-2.2: 类型定义清晰完整，符合 Zego SDK 文档
- **Notes**: 参考 Zego 官方文档的类型定义

## [x] Task 3: 实现后端 Token 生成服务
- **Priority**: P0
- **Depends On**: Task 2
- **Description**: 
  - 创建 server/src/services/zegoTokenService.ts
  - 实现 Zego Token 生成逻辑
  - 在 server.ts 中添加 Token 生成 API 接口
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `programmatic` TR-3.1: Token 生成接口正常响应
  - `programmatic` TR-3.2: 生成的 Token 格式符合 Zego 规范
  - `human-judgement` TR-3.3: 错误处理完善
- **Notes**: 使用 Zego 官方提供的 Token 生成算法

## [x] Task 4: 创建 Zego 服务封装
- **Priority**: P0
- **Depends On**: Task 2
- **Description**: 
  - 创建 client/src/services/zego.ts
  - 封装 Zego SDK 的初始化、连接、销毁等核心功能
  - 实现事件监听和回调处理
- **Acceptance Criteria Addressed**: AC-1, AC-6, AC-7
- **Test Requirements**:
  - `programmatic` TR-4.1: Zego 服务类完整实现
  - `human-judgement` TR-4.2: 封装代码结构清晰，易于维护
- **Notes**: 实现懒加载，避免页面启动时加载 SDK

## [x] Task 5: 创建 Zustand 语音状态管理
- **Priority**: P0
- **Depends On**: Task 4
- **Description**: 
  - 创建 client/src/store/useVoiceStore.ts
  - 管理语音连接状态、麦克风状态、音量等
  - 与游戏状态联动
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-6
- **Test Requirements**:
  - `programmatic` TR-5.1: 状态管理完整实现
  - `programmatic` TR-5.2: 与 useGameStore 正确集成
- **Notes**: 保持与现有 useGameStore 的风格一致

## [x] Task 6: 实现语音 Hook
- **Priority**: P1
- **Depends On**: Task 5
- **Description**: 
  - 创建 client/src/hooks/useZegoVoice.ts
  - 封装常用的语音操作逻辑
  - 处理语音权限请求
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-7
- **Test Requirements**:
  - `programmatic` TR-6.1: Hook 完整实现并可正常使用
  - `human-judgement` TR-6.2: 错误处理完善
- **Notes**: Hook 应该处理浏览器权限请求的提示

## [x] Task 7: 创建语音控制 UI 组件
- **Priority**: P1
- **Depends On**: Task 6
- **Description**: 
  - 创建 client/src/components/game/VoiceControlBar.tsx
  - 实现麦克风开关按钮
  - 实现音量调节滑动条
  - 显示连接状态和当前发言者
- **Acceptance Criteria Addressed**: AC-2, AC-8
- **Test Requirements**:
  - `programmatic` TR-7.1: 组件正确渲染，无报错
  - `human-judgement` TR-7.2: UI 美观，操作流畅
  - `human-judgement` TR-7.3: 与现有界面风格一致
- **Notes**: 使用 Tailwind CSS，保持与现有组件风格一致

## [ ] Task 8: 集成到游戏视图
- **Priority**: P1
- **Depends On**: Task 7
- **Description**: 
  - 修改 client/src/components/game/GameView.tsx，添加语音控制组件
  - 修改 client/src/components/JudgeConsole.tsx，添加法官语音控制台
  - 修改 client/src/App.tsx，初始化 Zego 服务
- **Acceptance Criteria Addressed**: AC-1, AC-8
- **Test Requirements**:
  - `programmatic` TR-8.1: 修改后的文件编译通过
  - `human-judgement` TR-8.2: 界面布局合理，无显示问题
- **Notes**: 确保不破坏现有功能

## [ ] Task 9: 实现白天发言阶段语音控制
- **Priority**: P1
- **Depends On**: Task 8
- **Description**: 
  - 修改 client/src/components/game/day/SpeechPhase.tsx
  - 实现仅当前发言者可以发言的控制逻辑
  - 显示当前发言者的状态
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-9.1: 发言控制逻辑正确实现
  - `human-judgement` TR-9.2: 功能符合游戏规则
- **Notes**: 要考虑法官手动控制发言顺序的情况

## [ ] Task 10: 实现夜晚狼人专属语音
- **Priority**: P1
- **Depends On**: Task 9
- **Description**: 
  - 实现夜晚阶段的语音权限控制
  - 仅狼人阵营可以语音沟通
  - 好人阵营无法听到狼人语音
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgement` TR-10.1: 狼人可以正常语音
  - `human-judgement` TR-10.2: 好人无法听到狼人语音
- **Notes**: 需要使用 Zego 的流权限控制功能

## [ ] Task 11: 实现法官语音控制台
- **Priority**: P2
- **Depends On**: Task 10
- **Description**: 
  - 在法官控制台添加语音控制功能
  - 可以全局静音/开启所有玩家
  - 可以单独控制某位玩家的麦克风
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-11.1: 法官控制台功能完整
  - `human-judgement` TR-11.2: 操作直观，反馈清晰
- **Notes**: 确保只有法官可以看到这些控制功能

## [ ] Task 12: 实现自动重连机制
- **Priority**: P1
- **Depends On**: Task 5
- **Description**: 
  - 在 Zego 服务中实现断线检测
  - 实现自动重连逻辑
  - 显示重连状态提示
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-12.1: 断线检测正确触发
  - `programmatic` TR-12.2: 重连在 5 秒内完成
- **Notes**: 参考现有 WebSocket 重连机制的实现

## [ ] Task 13: 完善错误处理和提示
- **Priority**: P1
- **Depends On**: Task 12
- **Description**: 
  - 添加完善的错误边界
  - 实现友好的错误提示
  - 处理权限被拒绝的情况
- **Acceptance Criteria Addressed**: NFR-5
- **Test Requirements**:
  - `programmatic` TR-13.1: 错误处理完整
  - `human-judgement` TR-13.2: 错误提示清晰友好
- **Notes**: 考虑用户没有麦克风、权限被拒绝等各种情况

## [ ] Task 14: 集成测试和优化
- **Priority**: P2
- **Depends On**: Task 13
- **Description**: 
  - 全流程测试
  - 性能优化
  - 代码审查和优化
- **Acceptance Criteria Addressed**: NFR-1, NFR-2, NFR-3, NFR-4
- **Test Requirements**:
  - `human-judgement` TR-14.1: 全流程测试通过
  - `human-judgement` TR-14.2: 性能符合要求
  - `programmatic` TR-14.3: 无严重 bug
- **Notes**: 需要在多种浏览器环境下测试
