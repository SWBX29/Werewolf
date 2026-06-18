# 机械狼预言家查验结果修正 Spec

## Why
当前 `SettlementEngine.ts` 中的 `getMechanicalWolfSeerResult` 函数逻辑不完整：仅考虑模仿预言家的情况返回好人，其他情况一律返回狼人。这导致机械狼模仿其他好人角色（如女巫、猎人、守卫、村民、骑士、白痴等）时被预言家查验仍显示为狼人，与游戏规则不符。

正确规则应为：机械狼被预言家查验的结果由其模仿目标的角色阵营决定，无论模仿成功与否。

## What Changes
- 修正 `SettlementEngine.ts` 中 `getMechanicalWolfSeerResult` 函数的逻辑，使其与 `GameEngine.ts` 中同名方法保持一致

## Impact
- Affected code: `server/src/SettlementEngine.ts`
- 预言家查验机械狼的结果将正确反映模仿目标角色的阵营

## MODIFIED Requirements
### Requirement: 机械狼预言家查验结果
机械狼被预言家查验的结果 SHALL 由其模仿目标角色的阵营决定：

#### Scenario: 尚未选择模仿目标
- **WHEN** 机械狼处于 `selecting` 阶段或 `mechanicalWolfPhase` 为 null
- **THEN** 查验结果为狼人（evil）

#### Scenario: 已选择模仿目标（无论模仿成功或失败）
- **WHEN** 机械狼已选择模仿目标，处于 `learning`/`active`/`failed`/`silent` 阶段
- **THEN** 查验结果由模仿目标角色的阵营决定：
  - 模仿好人角色（预言家、女巫、猎人、守卫、村民、骑士、白痴等） → 查验结果为好人（good）
  - 模仿狼人角色（狼王、白狼王、噩梦之影、隐狼等） → 查验结果为狼人（evil）

#### Scenario: 模仿村民/骑士/白痴（模仿失败但查验为好人）
- **WHEN** 机械狼模仿村民、骑士、白痴导致模仿失败，处于 `failed` 阶段
- **THEN** 查验结果仍为好人（good），因为模仿目标角色属于好人阵营