# Tasks

- [x] Task 1: 废弃代码清理
  - [x] SubTask 1.1: 检查 server.ts 中 deprecatedFields 的处理逻辑是否正确
  - [x] SubTask 1.2: 检查 GameEngine.ts 中 @deprecated 标记的方法是否可以移除
  - [x] SubTask 1.3: 检查是否有其他废弃但未标记的代码

- [x] Task 2: 重复代码模式分析
  - [x] SubTask 2.1: 分析技能组件（HunterGun、WolfKingGun、KnightDuel、WhiteWolfExplode、IdiotReveal）的结构模式
  - [x] SubTask 2.2: 分析夜间面板组件（NightmarePanel、WitchPanel、SeerPanel、GuardPanel、MechanicalWolfPanel）的布局模式
  - [x] SubTask 2.3: 分析确认对话框模式的重复使用情况
  - [x] SubTask 2.4: 分析样式类名（bg-*、border-* 等）的重复使用情况

- [x] Task 3: 类型定义检查
  - [x] SubTask 3.1: 检查 shared/types.ts 与 client/src/useGameStore.ts 的类型定义是否重复
  - [x] SubTask 3.2: 检查 shared/types.ts 与 server/src/models.ts 的类型定义是否一致
  - [x] SubTask 3.3: 检查是否有未使用或冗余的类型定义

- [x] Task 4: 未使用导入检查
  - [x] SubTask 4.1: 检查客户端组件的未使用导入
  - [x] SubTask 4.2: 检查服务端文件的未使用导入
  - [x] SubTask 4.3: 检查 shared 模块的未使用导出

- [x] Task 5: 大文件结构分析
  - [x] SubTask 5.1: 分析 GameEngine.ts 的模块结构（文件超过 128KB）
  - [x] SubTask 5.2: 评估是否需要拆分 GameEngine.ts 为多个模块
  - [x] SubTask 5.3: 检查 server.ts 的结构是否需要优化

- [x] Task 6: LobbyManager 回调机制分析
  - [x] SubTask 6.1: 分析回调占位方法的数量和用途
  - [x] SubTask 6.2: 分析转发方法的必要性
  - [x] SubTask 6.3: 评估是否可以简化回调机制

- [x] Task 7: 生成整理报告
  - [x] SubTask 7.1: 汇总所有发现的问题
  - [x] SubTask 7.2: 提出优化建议
  - [x] SubTask 7.3: 标记问题的优先级（高/中/低）

# Task Dependencies
- Task 7 依赖 Task 1-6 的完成
- Task 2、Task 3、Task 4、Task 5、Task 6 可以并行执行

---

## 实施优化任务（已完成）

- [x] 优化1: 提取公共确认对话框组件 (ConfirmDialog.tsx 增强)
- [x] 优化2: 提取公共夜间面板布局组件 (NightPanelLayout.tsx 新建)
- [x] 优化3: 拆分 GameEngine.ts - SettlementEngine.ts (结算引擎)
- [x] 优化4: 拆分 GameEngine.ts - TimerManager.ts (定时器管理)
- [x] 优化5: 更新 GameEngine.ts 导入新模块
- [x] 优化6: 构建验证（服务端和客户端均通过）