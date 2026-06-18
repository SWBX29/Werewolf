# 屠边/屠城判定逻辑修复 Spec

## Why

当前游戏获胜条件判定逻辑存在严重bug：
1. `checkWinCondition` 函数只实现了"所有好人死亡 → 狼人获胜"的逻辑
2. 没有区分**屠边**和**屠城**两种不同的获胜条件
3. 用户反馈：场上只剩一狼人阵营一好人阵营角色时，游戏仍没有判定结束（屠边模式下应该判定狼人胜利）

**屠边规则**：狼人杀死所有**神职**或杀死所有**平民**即可获胜
**屠城规则**：狼人杀死所有**好人阵营玩家**才能获胜

## What Changes

- **BREAKING**: 重构 `checkWinCondition` 函数，根据 `RuleConfig.winCondition` 配置执行不同的判定逻辑
- 新增角色分类辅助函数：`isGodRole()`（判断神职角色）、`isVillagerRole()`（判断平民角色）
- 屠边模式 (`SLAUGHTER_SIDE`)：检查神职全灭或平民全灭
- 屠城模式 (`SLAUGHTER_ALL`)：检查所有好人全灭（保持现有逻辑）
- 同步修复 `SettlementEngine.ts` 中的 `checkWinCondition` 函数

## Impact

- Affected specs: 游戏结算逻辑、获胜条件判定
- Affected code:
  - `server/src/GameEngine.ts` - `checkWinCondition()` 方法
  - `server/src/SettlementEngine.ts` - `checkWinCondition()` 函数
  - `shared/types.ts` - 新增角色分类辅助函数

## ADDED Requirements

### Requirement: 角色分类辅助函数

系统 SHALL 提供角色分类辅助函数，用于区分神职和平民角色。

#### Scenario: 神职角色判定
- **WHEN** 调用 `isGodRole(roleId)` 判断角色是否为神职
- **THEN** 对于预言家、女巫、猎人、守卫、白痴、骑士返回 `true`
- **AND** 对于村民、狼人阵营角色返回 `false`

#### Scenario: 平民角色判定
- **WHEN** 调用 `isVillagerRole(roleId)` 判断角色是否为平民
- **THEN** 对于村民返回 `true`
- **AND** 对于神职角色、狼人阵营角色返回 `false`

### Requirement: 屠边获胜条件判定

系统 SHALL 根据屠边规则判定狼人阵营获胜条件。

#### Scenario: 神职全灭狼人获胜
- **WHEN** `winCondition` 为 `SLAUGHTER_SIDE`
- **AND** 所有存活好人中神职角色数量为 0
- **AND** 存活狼人阵营角色数量 >= 1
- **THEN** 系统判定狼人阵营获胜

#### Scenario: 平民全灭狼人获胜
- **WHEN** `winCondition` 为 `SLAUGHTER_SIDE`
- **AND** 所有存活好人中平民角色数量为 0
- **AND** 存活狼人阵营角色数量 >= 1
- **THEN** 系统判定狼人阵营获胜

#### Scenario: 神职和平民均存活游戏继续
- **WHEN** `winCondition` 为 `SLAUGHTER_SIDE`
- **AND** 存活神职角色数量 >= 1
- **AND** 存活平民角色数量 >= 1
- **THEN** 游戏继续

#### Scenario: 屠边模式下狼人全灭好人获胜
- **WHEN** `winCondition` 为 `SLAUGHTER_SIDE`
- **AND** 存活狼人阵营角色数量为 0
- **THEN** 系统判定好人阵营获胜

### Requirement: 屠城获胜条件判定

系统 SHALL 根据屠城规则判定狼人阵营获胜条件。

#### Scenario: 所有好人死亡狼人获胜
- **WHEN** `winCondition` 为 `SLAUGHTER_ALL`
- **AND** 所有存活好人数量为 0
- **AND** 存活狼人阵营角色数量 >= 1
- **THEN** 系统判定狼人阵营获胜

#### Scenario: 屠城模式下狼人全灭好人获胜
- **WHEN** `winCondition` 为 `SLAUGHTER_ALL`
- **AND** 存活狼人阵营角色数量为 0
- **THEN** 系统判定好人阵营获胜

### Requirement: 隐狼和机械狼阵营归属

系统 SHALL 在获胜条件判定中正确处理隐狼和机械狼的阵营归属。

#### Scenario: 隐狼始终属于狼人阵营
- **WHEN** 隐狼存活
- **THEN** 隐狼始终计入狼人阵营存活人数
- **AND** 隐狼不计入好人阵营存活人数
- **NOTE** 隐狼被预言家查验为好人只是显示效果，不影响实际阵营归属

#### Scenario: 机械狼始终为狼人阵营
- **WHEN** 机械狼存活
- **THEN** 机械狼始终计入狼人阵营存活人数
- **AND** 机械狼不计入好人阵营存活人数
- **NOTE** 机械狼无论模仿什么角色，阵营始终为狼人

### Requirement: 狼人数量优势获胜条件

系统 SHALL 在所有模式下检查狼人数量优势获胜条件。

#### Scenario: 狼人数量大于好人数量狼人获胜
- **WHEN** 存活狼人阵营角色数量 > 存活好人阵营角色数量
- **THEN** 系统判定狼人阵营获胜
- **NOTE** 此规则适用于所有模式（屠边和屠城），是狼人阵营的基础获胜条件

## MODIFIED Requirements

### Requirement: 获胜条件检查函数

原函数只检查"所有好人死亡"和"所有狼人死亡"，现需根据配置区分屠边和屠城。

**修改前**：
```typescript
// 只检查阵营存活人数
if (aliveEvil.length === 0) return 'good';
if (aliveGood.length === 0) return 'evil';
```

**修改后**：
```typescript
// 1. 狼人全灭 → 好人获胜
if (aliveEvil.length === 0) return 'good';

// 2. 狼人数量 > 好人数量 → 狼人获胜（所有模式通用）
if (aliveEvil.length > aliveGood.length) return 'evil';

// 3. 根据配置区分屠边和屠城
if (config.winCondition === 'SLAUGHTER_SIDE') {
  // 屠边：神职全灭或平民全灭 → 狼人获胜
  const aliveGods = aliveGood.filter(p => isGodRole(p.role));
  const aliveVillagers = aliveGood.filter(p => isVillagerRole(p.role));
  if (aliveGods.length === 0 || aliveVillagers.length === 0) {
    return 'evil';
  }
} else {
  // 屠城：所有好人死亡 → 缏人获胜
  if (aliveGood.length === 0) return 'evil';
}

// 游戏继续
return null;
```

**关键修正**：
- 隐狼始终计入 `aliveEvil`（狼人阵营），不计入 `aliveGood`
- 机械狼始终计入 `aliveEvil`（狼人阵营），不计入 `aliveGood`
- 新增狼人数量优势判定：`aliveEvil.length > aliveGood.length` → 狼人获胜

## REMOVED Requirements

无移除的需求。