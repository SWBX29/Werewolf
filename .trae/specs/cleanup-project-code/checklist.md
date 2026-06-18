# Checklist

- [x] 废弃代码清理完成
  - [x] deprecatedFields 处理逻辑正确
  - [x] @deprecated 方法已评估
  - [x] 其他废弃代码已识别

- [x] 重复代码模式分析完成
  - [x] 技能组件结构模式已分析
  - [x] 夜间面板布局模式已分析
  - [x] 确认对话框模式已分析
  - [x] 样式类名重复已分析

- [x] 类型定义检查完成
  - [x] shared/types.ts 与 useGameStore.ts 类型一致
  - [x] shared/types.ts 与 models.ts 类型一致
  - [x] 未使用类型已识别

- [x] 未使用导入检查完成
  - [x] 客户端未使用导入已识别
  - [x] 服务端未使用导入已识别
  - [x] shared 未使用导出已识别

- [x] 大文件结构分析完成
  - [x] GameEngine.ts 模块结构已分析
  - [x] 拆分建议已提出
  - [x] server.ts 结构已检查

- [x] LobbyManager 回调机制分析完成
  - [x] 回调占位方法已分析
  - [x] 转发方法必要性已评估
  - [x] 简化建议已提出

- [x] 整理报告已生成
  - [x] 问题汇总完整
  - [x] 优化建议清晰
  - [x] 优先级标记正确

---

## 实施优化验证（已完成）

- [x] 公共组件优化完成
  - [x] ConfirmDialog.tsx 已增强（支持 icon、hints、confirmVariant）
  - [x] HunterGun.tsx 已更新使用 ConfirmDialog
  - [x] WolfKingGun.tsx 已更新使用 ConfirmDialog
  - [x] KnightDuel.tsx 已更新使用 ConfirmDialog
  - [x] WhiteWolfExplode.tsx 已更新使用 ConfirmDialog

- [x] 夜间面板布局优化完成
  - [x] NightPanelLayout.tsx 已创建
  - [x] SeerPanel.tsx 已更新使用 NightPanelLayout
  - [x] WitchPanel.tsx 已更新使用 NightPanelLayout

- [x] 服务端模块拆分完成
  - [x] SettlementEngine.ts 已创建（结算逻辑纯函数）
  - [x] TimerManager.ts 已创建（定时器管理类）
  - [x] GameEngine.ts 已导入新模块

- [x] 构建验证完成
  - [x] 服务端 TypeScript 编译通过
  - [x] 客户端 Vite 构建通过