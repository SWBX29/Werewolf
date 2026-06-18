# Checklist

- [x] SettlementEngine.ts 中 getMechanicalWolfSeerResult 函数逻辑与 GameEngine.ts 一致
- [x] 机械狼尚未选择模仿目标时查验结果为 evil
- [x] 机械狼模仿村民时查验结果为 good（模仿失败但目标为好人）
- [x] 机械狼模仿骑士时查验结果为 good（模仿失败但目标为好人）
- [x] 机械狼模仿白痴时查验结果为 good（模仿失败但目标为好人）
- [x] 机械狼模仿预言家成功时查验结果为 good
- [x] 机械狼模仿女巫成功时查验结果为 good
- [x] 机械狼模仿狼王成功时查验结果为 evil
- [x] 函数正确处理 learning/active/silent/failed 阶段