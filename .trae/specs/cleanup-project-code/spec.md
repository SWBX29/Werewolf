# 项目代码整理与优化 Spec

## Why
项目经过多次迭代开发，代码库中可能存在冗余、重复、未使用或逻辑冲突的内容。整理代码可以提高可维护性、减少潜在bug、优化性能，并为后续开发提供更清晰的基础。

## What Changes
- 检查并清理废弃字段和代码（如 nightmareBlockMode 等已移除的配置项）
- 检查并优化重复的组件结构和样式模式
- 检查并整理冗余的类型定义
- 检查并优化 LobbyManager 中的回调机制
- 检查 GameEngine.ts 是否需要拆分优化
- 检查并清理未使用的导入

## Impact
- Affected specs: 无直接影响其他规范
- Affected code:
  - `server/src/server.ts` - 废弃字段清理
  - `server/src/GameEngine.ts` - 废弃方法标记、文件结构优化
  - `server/src/LobbyManager.ts` - 回调机制优化
  - `client/src/components/game/` - 组件结构优化
  - `shared/types.ts` - 类型定义检查
  - `client/src/useGameStore.ts` - 类型定义检查

## ADDED Requirements

### Requirement: 废弃代码清理
系统 SHALL 清理所有已标记为废弃的代码和配置项，确保代码库整洁。

#### Scenario: 清理废弃配置字段
- **WHEN** 服务端处理 ADMIN_CLEANUP_CONFIG 操作时
- **THEN** 应正确识别并清理 deprecatedFields（nightmareBlockMode、nightmareBlockSpeech、nightmareBlockSkill）

#### Scenario: 清理废弃方法
- **WHEN** 发现 GameEngine.ts 中有 @deprecated 标记的方法时
- **THEN** 应评估是否可以移除或重构

### Requirement: 重复代码优化
系统 SHALL 检查并优化重复的代码模式，提高代码复用率。

#### Scenario: 技能组件结构优化
- **WHEN** 检查 HunterGun、WolfKingGun、KnightDuel 等技能组件时
- **THEN** 应识别可复用的结构模式（确认对话框、目标选择器等）

#### Scenario: 夜间面板组件优化
- **WHEN** 检查 NightmarePanel、WitchPanel、SeerPanel 等夜间面板时
- **THEN** 应识别可复用的布局和样式模式

### Requirement: 类型定义检查
系统 SHALL 检查类型定义是否存在重复或冗余。

#### Scenario: 共享类型与本地类型检查
- **WHEN** 比较 shared/types.ts 和 client/src/useGameStore.ts 的类型定义时
- **THEN** 应确保类型定义一致且无重复

### Requirement: 未使用导入检查
系统 SHALL 检查并清理未使用的导入。

#### Scenario: 导入语句检查
- **WHEN** 检查各文件的导入语句时
- **THEN** 应识别并清理未使用的导入

### Requirement: 大文件结构优化
系统 SHALL 检查大文件是否需要拆分优化。

#### Scenario: GameEngine.ts 结构检查
- **WHEN** GameEngine.ts 文件超过 128KB 时
- **THEN** 应评估是否需要拆分为多个模块

### Requirement: 回调机制优化
系统 SHALL 检查 LobbyManager 的回调机制是否可以简化。

#### Scenario: 回调占位方法检查
- **WHEN** 检查 LobbyManager.ts 中的回调占位方法和转发方法时
- **THEN** 应评估是否可以简化或合并

## MODIFIED Requirements
无修改的需求

## REMOVED Requirements
无移除的需求