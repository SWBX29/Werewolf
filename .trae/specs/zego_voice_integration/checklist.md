# Zego 实时语音集成 - Verification Checklist

## 基础功能验证
- [ ] Checkpoint 1: 依赖安装成功，项目可以正常编译和运行
- [ ] Checkpoint 2: Zego SDK 可以正确初始化
- [ ] Checkpoint 3: 环境变量配置正确（ZEGO_APP_ID, ZEGO_APP_SIGN）

## 后端功能验证
- [ ] Checkpoint 4: Token 生成接口可以正常调用
- [ ] Checkpoint 5: 生成的 Token 格式符合 Zego 规范
- [ ] Checkpoint 6: Token 生成的错误处理完善

## 前端服务验证
- [ ] Checkpoint 7: Zego 服务封装完整，核心功能实现
- [ ] Checkpoint 8: Zustand 语音状态管理正确实现
- [ ] Checkpoint 9: 语音 Hook 可以正常使用
- [ ] Checkpoint 10: 语音连接自动建立，断开自动重连（5秒内）

## UI 组件验证
- [ ] Checkpoint 11: 语音控制栏组件正确渲染
- [ ] Checkpoint 12: 麦克风开关按钮功能正常
- [ ] Checkpoint 13: 音量调节功能正常
- [ ] Checkpoint 14: 语音状态显示清晰（连接状态、发言状态）
- [ ] Checkpoint 15: UI 风格与现有游戏界面一致

## 游戏场景验证
- [ ] Checkpoint 16: 玩家加入游戏房间时自动连接语音房间
- [ ] Checkpoint 17: 白天发言阶段只有当前发言者可以发言
- [ ] Checkpoint 18: 夜晚阶段只有狼人可以语音沟通
- [ ] Checkpoint 19: 好人阵营在夜晚无法听到狼人语音
- [ ] Checkpoint 20: 法官控制台可以全局控制玩家语音
- [ ] Checkpoint 21: 法官可以单独控制某位玩家的麦克风

## 安全和权限验证
- [ ] Checkpoint 22: 浏览器麦克风权限请求提示正常
- [ ] Checkpoint 23: Token 认证机制正确实现
- [ ] Checkpoint 24: 权限被拒绝时有友好的错误提示

## 性能和兼容性验证
- [ ] Checkpoint 25: 语音延迟不超过 300ms
- [ ] Checkpoint 26: 语音功能开启后 CPU 使用率增加不超过 20%
- [ ] Checkpoint 27: Chrome 58+ 浏览器兼容性正常
- [ ] Checkpoint 28: Firefox 56+ 浏览器兼容性正常
- [ ] Checkpoint 29: Safari 11+ 浏览器兼容性正常

## 错误处理验证
- [ ] Checkpoint 30: 网络断线时有明确的错误提示
- [ ] Checkpoint 31: 设备不可用时有友好的提示
- [ ] Checkpoint 32: 错误边界处理完善，不会导致整个应用崩溃

## 集成验证
- [ ] Checkpoint 33: 与现有游戏流程无缝集成，不破坏现有功能
- [ ] Checkpoint 34: 语音功能可以正常开关，不影响游戏体验
- [ ] Checkpoint 35: 全流程测试通过（从创建房间到游戏结束）
