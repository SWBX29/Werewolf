# Tasks

## Phase 1: 核心优化 - 解决白屏问题（最高优先级）

- [x] Task 1: 实现骨架屏消除白屏
  - [x] SubTask 1.1: 创建 SkeletonScreen.tsx 组件（首页骨架：输入框、按钮、标题占位）
  - [x] SubTask 1.2: 在 index.html 中内联骨架屏 HTML（立即显示，无需等待 JS）
  - [x] SubTask 1.3: 在 App.tsx 中集成骨架屏（首屏加载完成后隐藏）
  - [x] SubTask 1.4: 添加平滑过渡动画（骨架屏淡出，内容淡入）
  - [x] SubTask 1.5: 验证骨架屏不影响游戏 UI（进入游戏后不显示）
  - [x] SubTask 1.6: 验证降级：骨架屏加载失败时显示空白（不影响功能）

- [x] Task 2: 实现组件预加载策略
  - [x] SubTask 2.1: 创建 usePreload.ts Hook（管理预加载队列和进度）
  - [x] SubTask 2.2: 定义预加载队列：GameView → 夜间面板 → 技能组件 → ZEGO SDK
  - [x] SubTask 2.3: 在 App.tsx 中集成预加载逻辑（首页加载完成后触发）
  - [x] SubTask 2.4: 实现预加载进度追踪（记录已加载组件）
  - [x] SubTask 2.5: 添加错误处理：单个组件预加载失败不影响其他组件
  - [x] SubTask 2.6: 验证预加载不阻塞首页交互
  - [x] SubTask 2.7: 验证进入游戏时组件已预加载或正在加载

## Phase 2: 构建优化（零运行时风险）

- [x] Task 3: 添加构建分析工具
  - [x] SubTask 3.1: 安装 rollup-plugin-visualizer 开发依赖
  - [x] SubTask 3.2: 在 vite.config.ts 中配置 visualizer 插件（仅 analyze 模式启用）
  - [x] SubTask 3.3: 在 client/package.json 中添加 `analyze` 脚本
  - [x] SubTask 3.4: 执行构建分析，生成 stats.html 报告
  - [x] SubTask 3.5: 验证构建产物不受影响（正常构建不生成报告）

- [x] Task 4: 配置 gzip/brotli 预压缩
  - [x] SubTask 4.1: 安装 vite-plugin-compression 开发依赖
  - [x] SubTask 4.2: 在 vite.config.ts 中配置 gzip 和 brotli 压缩
  - [x] SubTask 4.3: 修改 server.ts 静态文件服务逻辑，支持预压缩文件（.gz/.br）
  - [x] SubTask 4.4: 添加降级逻辑：压缩文件不存在时返回原始文件
  - [x] SubTask 4.5: 验证压缩效果（对比原始文件与压缩后体积）
  - [x] SubTask 4.6: 验证降级逻辑（删除压缩文件后仍能正常访问）

## Phase 3: 资源加载优化（渐进增强）

- [x] Task 5: 实现 Service Worker 离线缓存
  - [x] SubTask 5.1: 创建 client/public/sw.js Service Worker 文件
  - [x] SubTask 5.2: 实现 Service Worker 缓存策略（静态资源缓存、HTML 网络优先）
  - [x] SubTask 5.3: 在 client/src/main.tsx 中添加 Service Worker 注册逻辑（带降级）
  - [x] SubTask 5.4: 添加错误处理：注册失败时不影响应用正常运行
  - [x] SubTask 5.5: 测试离线访问功能
  - [x] SubTask 5.6: 验证降级：禁用 Service Worker 后应用正常运行

- [x] Task 6: 添加资源预加载提示
  - [x] SubTask 6.1: 在 index.html 中添加关键 CSS preload
  - [x] SubTask 6.2: 在 index.html 中添加 vendor-react preload
  - [x] SubTask 6.3: 在 index.html 中添加 DNS 预解析和预连接（WebSocket 服务器）
  - [x] SubTask 6.4: 验证预加载效果（Network 面板观察加载顺序）

- [x] Task 7: 配置 HTTP 缓存头
  - [x] SubTask 7.1: 在 server.ts 中为带哈希的静态资源设置 Cache-Control: immutable
  - [x] SubTask 7.2: 为 HTML 文件设置 Cache-Control: no-cache
  - [x] SubTask 7.3: 验证缓存头设置（curl -I 测试）
  - [x] SubTask 7.4: 验证不影响 WebSocket 连接和游戏逻辑

## Phase 4: 验证和测试

- [x] Task 8: 验证 ZEGO SDK 延迟加载和预加载
  - [x] SubTask 8.1: 检查 useZegoVoice.ts 中的 ZEGO SDK 导入方式
  - [x] SubTask 8.2: 确认 ZEGO SDK 通过 dynamic import 加载
  - [x] SubTask 8.3: 在 Network 面板验证首页不加载 zego-webrtc chunk
  - [x] SubTask 8.4: 在 Network 面板验证预加载队列加载 zego-webrtc chunk
  - [x] SubTask 8.5: 验证进入游戏时 ZEGO SDK 已预加载或正在加载

- [x] Task 9: 全面验证
  - [x] SubTask 9.1: 执行完整构建流程（npm run build）
  - [x] SubTask 9.2: 启动生产服务器，验证所有功能正常
  - [x] SubTask 9.3: 验证白屏问题解决（骨架屏立即显示）
  - [x] SubTask 9.4: 验证游戏组件预加载正常（进入游戏无等待）
  - [x] SubTask 9.5: 测试游戏流程：创建房间 → 加入房间 → 游戏进行
  - [x] SubTask 9.6: 测试语音功能：进入房间后语音连接正常
  - [x] SubTask 9.7: 测试断线重连：网络断开后重连正常
  - [x] SubTask 9.8: 测试离线访问：断网后刷新页面正常加载

# Task Dependencies
- [Task 2] depends on [Task 1] - 预加载需要骨架屏完成后触发
- [Task 4] depends on [Task 3] - 压缩配置需要先分析包体积
- [Task 5] depends on [Task 4] - Service Worker 需要缓存压缩后的资源
- [Task 6] depends on [Task 4] - 预加载需要知道压缩后的文件名
- [Task 7] depends on [Task 4] - 缓存头配置需要知道压缩文件扩展名
- [Task 8] depends on [Task 2] - ZEGO SDK 验证需要预加载完成
- [Task 9] depends on [Task 1, Task 2, Task 5, Task 6, Task 7, Task 8] - 全面验证依赖所有优化完成

# Safety Notes
1. 骨架屏（Task 1）仅在加载时显示，不影响游戏 UI
2. 预加载（Task 2）在后台进行，不阻塞首页渲染，不影响游戏逻辑
3. 所有构建优化（Task 3, Task 4）仅在构建时生效，不影响运行时逻辑
4. Service Worker（Task 5）作为独立层运行，失败时自动降级
5. 资源预加载（Task 6）仅优化加载顺序，不影响加载结果
6. HTTP 缓存头（Task 7）仅影响浏览器缓存行为
7. ZEGO SDK 验证（Task 8）不修改任何代码，仅验证现有行为
