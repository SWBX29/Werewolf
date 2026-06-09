# 语音时长异常消耗诊断与修复 - 验证清单

## 夜晚阶段语音连接管理验证
- [ ] Checkpoint 1: 夜晚阶段普通玩家自动断开语音连接
- [ ] Checkpoint 2: 共同睁眼的狼人保持语音连接并可交流
- [ ] Checkpoint 3: 法官可与当前行动玩家语音交流
- [ ] Checkpoint 4: 死亡玩家在夜晚阶段断开语音连接
- [ ] Checkpoint 5: 白天阶段开始时自动恢复语音连接
- [ ] Checkpoint 6: 显示"夜晚休息"状态提示（普通玩家）
- [ ] Checkpoint 7: 显示"狼人密谋"状态提示（狼人玩家）
- [ ] Checkpoint 8: 显示"法官指导"状态提示（法官和当前行动玩家）
- [ ] Checkpoint 9: 夜晚阶段语音时长消耗减少（对比之前）

## 重复连接问题验证
- [ ] Checkpoint 10: App.tsx 中 Zego 初始化不会重复执行
- [ ] Checkpoint 11: joinVoiceRoom 使用互斥锁确保串行执行
- [ ] Checkpoint 12: 用户快速切换视图不会触发重复连接
- [ ] Checkpoint 13: 多个组件同时调用 joinVoiceRoom 只执行一次
- [ ] Checkpoint 14: loginRoom 失败时正确清理已创建的资源

## 连接关闭问题验证
- [ ] Checkpoint 15: 用户点击"离开"按钮时语音连接正确关闭
- [ ] Checkpoint 16: 游戏结束时语音连接正确关闭
- [ ] Checkpoint 17: 房间解散时语音连接正确关闭
- [ ] Checkpoint 18: 页面刷新时触发 beforeunload 事件处理
- [ ] Checkpoint 19: logoutRoom 执行完整性检查
- [ ] Checkpoint 20: 异常情况下有强制清理机制可用

## 连接状态监控验证
- [ ] Checkpoint 21: 所有语音连接事件都有详细日志（包含时间戳、房间 ID、事件类型）
- [ ] Checkpoint 22: 用户可以看到当前连接时长
- [ ] Checkpoint 23: 用户可以看到网络质量状态
- [ ] Checkpoint 24: 连接时长实时更新

## UI 反馈验证
- [ ] Checkpoint 25: 用户可以清楚看到麦克风权限状态
- [ ] Checkpoint 26: 错误信息包含具体原因和解决方法
- [ ] Checkpoint 27: 操作成功有明确的视觉反馈（按钮变化、动画效果）
- [ ] Checkpoint 28: 状态变化有文字提示
- [ ] Checkpoint 29: 麦克风/扬声器按钮状态清晰可见

## 信息面板验证
- [ ] Checkpoint 30: VoiceInfoPanel 组件正确渲染
- [ ] Checkpoint 31: 信息面板包含连接状态、房间 ID、连接时长、网络质量
- [ ] Checkpoint 32: 信息面板包含麦克风权限状态和设备信息
- [ ] Checkpoint 33: 信息面板信息实时更新

## 集成测试验证
- [ ] Checkpoint 34: 夜晚阶段语音连接管理测试通过（狼人保持连接、其他玩家断开）
- [ ] Checkpoint 35: 快速切换视图场景测试通过（无重复连接）
- [ ] Checkpoint 36: 离开房间场景测试通过（语音正确关闭）
- [ ] Checkpoint 37: 游戏结束场景测试通过（语音正确关闭）
- [ ] Checkpoint 38: 页面刷新场景测试通过（资源尽可能释放）
- [ ] Checkpoint 39: 网络断连重连场景测试通过（语音状态正确处理）
- [ ] Checkpoint 40: 麦克风权限场景测试通过（权限状态正确显示）
- [ ] Checkpoint 41: 无资源泄漏（内存、流、连接）
- [ ] Checkpoint 42: 计费正常（无重复计费、夜晚阶段节省时长）