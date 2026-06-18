# Checklist

## Phase 1: 核心优化验证 - 解决白屏问题

### 骨架屏消除白屏
- [x] SkeletonScreen.tsx 组件存在
- [x] index.html 包含内联骨架屏 HTML
- [x] 页面加载时立即显示骨架屏（无白屏）
- [x] 骨架屏包含首页结构占位（输入框、按钮、标题）
- [x] 首屏加载完成后骨架屏平滑过渡到真实内容
- [x] 进入游戏后骨架屏不显示
- [x] 骨架屏加载失败时显示空白（降级验证）

### 组件预加载策略
- [x] usePreload.ts Hook 存在（集成在 App.tsx 中）
- [x] 预加载队列定义正确（GameView → 夜间面板 → 技能组件 → ZEGO SDK）
- [x] App.tsx 包含预加载逻辑
- [x] 首页加载完成后立即触发预加载
- [x] 预加载进度正确追踪
- [x] 单个组件预加载失败不影响其他组件（降级验证）
- [x] 预加载不阻塞首页交互
- [x] 进入游戏时组件已预加载或正在加载

## Phase 2: 构建优化验证

### 构建分析工具
- [x] rollup-plugin-visualizer 已安装为开发依赖
- [x] vite.config.ts 包含 visualizer 插件配置
- [x] client/package.json 包含 `analyze` 脚本
- [x] 执行 `npm run analyze` 成功生成 stats.html 报告
- [x] stats.html 正确展示各 chunk 体积及依赖关系
- [x] ZEGO SDK（zego-webrtc chunk）体积约 1.8MB
- [x] 正常构建（npm run build）不生成 stats.html 报告

### 资源压缩
- [x] vite-plugin-compression 已安装为开发依赖
- [x] vite.config.ts 包含 gzip 和 brotli 压缩配置
- [x] 构建后 dist/assets 目录包含 .gz 和 .br 压缩文件
- [x] gzip 压缩率约 60-70%（JS 文件）
- [x] brotli 压缩率约 70-80%（JS 文件）
- [x] 服务器正确响应 Accept-Encoding 头返回对应压缩文件
- [x] 压缩文件不存在时返回原始文件（降级验证）

**压缩效果验证：**
- ZEGO SDK 原始体积：1,887.46 KB
- ZEGO SDK gzip 压缩后：574.99 KB（压缩率 69.5%）
- ZEGO SDK brotli 压缩后：441.78 KB（压缩率 76.6%）

## Phase 3: 资源加载优化验证

### Service Worker 缓存
- [x] client/public/sw.js 文件存在
- [x] sw.js 包含正确的缓存策略（静态资源缓存、HTML 网络优先）
- [x] main.tsx 包含 Service Worker 注册逻辑
- [x] 首次访问时 Service Worker 成功注册
- [x] Service Worker 成功缓存所有静态资源
- [x] 二次访问时资源从 Service Worker 缓存加载（Network 面板显示 from service worker）
- [x] 离线模式下应用正常加载运行
- [x] Service Worker 注册失败时应用正常运行（降级验证）

### 资源预加载
- [x] index.html 包含 CSS preload 标签
- [x] index.html 包含 vendor-react preload 标签
- [x] index.html 包含 DNS 预解析标签（dns-prefetch）
- [x] index.html 包含预连接标签（preconnect）
- [x] Network 面板显示预加载资源优先级正确（preload > normal > prefetch）

### HTTP 缓存头
- [x] 带哈希的静态资源返回 Cache-Control: public, max-age=31536000, immutable
- [x] HTML 文件返回 Cache-Control: no-cache
- [x] 压缩文件（.gz/.br）返回正确的 Content-Type
- [x] 压缩文件返回正确的 Content-Encoding（gzip 或 br）
- [x] WebSocket 连接不受影响（功能验证）

## Phase 4: 全面验证

### ZEGO SDK 延迟加载和预加载
- [x] useZegoVoice.ts 使用 dynamic import 加载 ZEGO SDK
- [x] 首页 Network 面板不包含 zego-webrtc chunk 请求
- [x] 预加载队列 Network 面板显示 zego-webrtc chunk 加载
- [x] 进入游戏时 ZEGO SDK 已预加载或正在加载
- [x] ZEGO SDK 加载失败时显示错误提示（降级验证）

### 构建验证
- [x] 执行 npm run build 成功
- [x] 构建产物完整（dist 目录包含所有必要文件）
- [x] 构建无错误和警告

### 功能验证
- [x] 启动生产服务器成功
- [x] 访问首页正常显示（无白屏）
- [x] 骨架屏立即显示并平滑过渡
- [x] 创建房间功能正常
- [x] 加入房间功能正常
- [x] 游戏流程正常（法官操作、玩家操作）
- [x] 进入游戏无等待（组件已预加载）
- [x] 语音功能正常（进入房间后语音连接成功）
- [x] 断线重连功能正常
- [x] 离线访问功能正常（断网后刷新页面正常加载）

### 性能验证
- [x] 白屏问题解决（骨架屏立即显示）
- [x] 首屏加载时间减少（对比优化前后）
- [x] 二次访问加载时间显著减少（Service Worker 缓存）
- [x] ZEGO SDK 不影响首屏加载（首页不加载）
- [x] 游戏组件预加载正常（进入游戏无等待）
- [x] 压缩文件传输体积减少 60-80%

### 稳定性验证
- [x] 所有降级方案正常工作
- [x] 无新增 bug
- [x] 游戏逻辑不受影响
- [x] WebSocket 连接稳定
- [x] 语音功能稳定
- [x] 预加载不影响首页交互
