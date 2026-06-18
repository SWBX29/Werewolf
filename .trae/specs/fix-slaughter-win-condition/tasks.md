# Tasks

- [x] Task 1: 在 shared/types.ts 中添加角色分类辅助函数
  - [x] SubTask 1.1: 添加 `isGodRole(roleId: RoleId): boolean` 函数，判断角色是否为神职（预言家、女巫、猎人、守卫、白痴、骑士）
  - [x] SubTask 1.2: 添加 `isVillagerRole(roleId: RoleId): boolean` 函数，判断角色是否为平民（仅村民）
  - [x] SubTask 1.3: 导出这两个函数供服务端使用

- [x] Task 2: 修复 SettlementEngine.ts 中的 checkWinCondition 函数
  - [x] SubTask 2.1: 修改函数签名，新增 `winCondition: WinCondition` 参数
  - [x] SubTask 2.2: 实现狼人数量优势判定：`aliveEvil.length > aliveGood.length` → 狼人获胜（所有模式通用）
  - [x] SubTask 2.3: 实现屠边逻辑：检查神职全灭或平民全灭
  - [x] SubTask 2.4: 保持屠城逻辑：检查所有好人死亡
  - [x] SubTask 2.5: 修正隐狼阵营判定：隐狼始终属于狼人阵营（不计入好人）
  - [x] SubTask 2.6: 修正机械狼阵营判定：机械狼始终属于狼人阵营

- [x] Task 3: 修复 GameEngine.ts 中的 checkWinCondition 方法
  - [x] SubTask 3.1: 从 `this.state.config.winCondition` 获取获胜条件配置
  - [x] SubTask 3.2: 调用修复后的 `checkWinConditionUtil` 函数，传入正确的参数
  - [x] SubTask 3.3: 确保所有调用点正确处理返回结果

- [x] Task 4: 更新所有调用 checkWinCondition 的地方
  - [x] SubTask 4.1: 检查夜间结算后的调用（enterNightSettlement）
  - [x] SubTask 4.2: 检查白天结算后的调用（enterDaySettlement）
  - [x] SubTask 4.3: 检查骑士决斗后的调用（resolveKnightDuel）
  - [x] SubTask 4.4: 检查白狼王自爆后的调用（resolveWhiteWolfExplode）
  - [x] SubTask 4.5: 检查猎人/狼王开枪后的调用

- [x] Task 5: 编写测试验证修复
  - [x] SubTask 5.1: 测试狼人数量大于好人数量时狼人获胜（所有模式通用）
  - [x] SubTask 5.2: 测试屠边模式下神职全灭狼人获胜
  - [x] SubTask 5.3: 测试屠边模式下平民全灭狼人获胜
  - [x] SubTask 5.4: 测试屠边模式下神职和平民均存活游戏继续
  - [x] SubTask 5.5: 测试屠城模式下所有好人死亡狼人获胜
  - [x] SubTask 5.6: 测试隐狼始终计入狼人阵营（无论是否已行动）
  - [x] SubTask 5.7: 测试机械狼始终计入狼人阵营

# Task Dependencies

- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]
- [Task 5] depends on [Task 4]