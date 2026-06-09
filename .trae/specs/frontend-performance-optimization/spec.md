# 前端加载性能优化 Spec

## Why
项目已做过大量优化（首屏 JS 从 2.47MB 降到 ~230KB），但通过 chmlfrp 端口映射到公网时，受限于映射服务器地域问题，页面打开速度仍然极慢，存在长时间白屏问题。当前构建产物中 ZEGO WebRTC SDK 占据 1.8MB（约占总大小的 80%），在网络延迟较大的情况下严重影响首屏加载速度。

## What Changes
**所有改动均为非侵入式，不影响现有游戏逻辑和业务流程。**

### 核心优化：解决白屏问题
- **骨架屏（Skeleton Screen）**：页面加载时立即显示骨架，消除白屏感知
- **关键 CSS 内联**：将关键样式内联到 HTML，避免 CSS 阻塞渲染
- **首屏组件优先加载**：确保首页组件优先于游戏组件加载

### 组件预加载策略（解决游戏模块加载缺失）
- **首页加载后自动预加载**：首页组件加载完成后，立即在后台预加载游戏组件（无需等待用户进入游戏）
- **预加载队列**：按优先级预加载组件（GameView → 夜间面板 → 技能组件 → ZEGO SDK）
- **预加载进度追踪**：记录预加载进度，进入游戏时可显示加载状态

### 构建优化（零运行时影响）
- 添加构建分析工具（rollup-plugin-visualizer），可视化分析包体积构成
- 添加 gzip/brotli 预压缩配置，减少传输体积 60-80%

### 资源加载优化（渐进增强，不影响核心功能）
- 添加 Service Worker 实现资源离线缓存，二次访问零网络请求
- 优化资源加载策略（preload/prefetch），关键资源优先加载
- 添加 HTTP 缓存头配置，利用浏览器缓存机制
- DNS 预解析、预连接到 WebSocket 服务器

## Impact
- Affected specs: 前端构建流程、资源加载策略、服务端静态文件服务
- Affected code:
  - `client/vite.config.ts` - 构建配置优化（仅构建时生效）
  - `client/package.json` - 新增构建分析脚本
  - `server/src/server.ts` - HTTP 缓存头配置（不影响 WebSocket 逻辑）
  - `client/public/sw.js` - Service Worker（新增，独立运行，不影响应用逻辑）
  - `client/index.html` - 资源预加载提示、关键 CSS 内联
  - `client/src/components/SkeletonScreen.tsx` - 骨架屏组件（新增，不影响游戏逻辑）
  - `client/src/hooks/usePreload.ts` - 预加载 Hook（新增，不影响游戏逻辑）
  - `client/src/App.tsx` - 集成骨架屏和预加载逻辑

## Safety Guarantees
1. **所有构建优化仅在构建时生效，不影响运行时逻辑**
2. **Service Worker 作为独立层运行，失败时自动降级到网络请求**
3. **资源预加载提示仅优化加载顺序，不影响资源加载结果**
4. **HTTP 缓存头仅影响浏览器缓存行为，不影响服务器逻辑**
5. **骨架屏仅在加载时显示，不影响游戏 UI 和交互**
6. **预加载在后台进行，不阻塞首页渲染，不影响游戏逻辑**
7. **所有新增代码均有错误处理和降级方案**

## ADDED Requirements

### Requirement: 骨架屏消除白屏
系统 SHALL 在页面加载时立即显示骨架屏，消除白屏感知。

#### Scenario: 页面加载开始
- **WHEN** 用户访问应用且资源未加载完成
- **THEN** 立即显示骨架屏（页面结构占位），而非空白页面

#### Scenario: 首屏加载完成
- **WHEN** 首屏资源加载完成
- **THEN** 骨架屏平滑过渡到真实内容

#### Scenario: 骨架屏不影响游戏逻辑
- **WHEN** 用户进入游戏
- **THEN** 骨架屏不显示，游戏 UI 正常渲染

#### Scenario: 骨架屏加载失败
- **WHEN** 骨架屏组件加载失败
- **THEN** 显示空白页面（降级方案，不影响功能）

### Requirement: 组件预加载策略
系统 SHALL 在首页组件加载完成后，自动在后台预加载游戏组件，无需等待用户进入游戏。

#### Scenario: 首页加载完成
- **WHEN** 首页组件加载完成
- **THEN** 立即在后台预加载游戏组件（GameView、夜间面板、技能组件等）

#### Scenario: 预加载顺序
- **WHEN** 开始预加载游戏组件
- **THEN** 按优先级预加载：GameView → 夜间面板 → 技能组件 → ZEGO SDK

#### Scenario: 用户进入游戏
- **WHEN** 用户在预加载完成前进入游戏
- **THEN** 显示加载状态，等待必要组件加载完成

#### Scenario: 预加载完成
- **WHEN** 用户在预加载完成后进入游戏
- **THEN** 立即显示游戏界面，无需等待加载

#### Scenario: 预加载失败
- **WHEN** 某个组件预加载失败
- **THEN** 不影响其他组件预加载，进入游戏时重新加载该组件（降级方案）

#### Scenario: 预加载不阻塞首页
- **WHEN** 预加载正在进行
- **THEN** 首页交互正常，不被阻塞

### Requirement: 构建分析工具
系统 SHALL 提供构建分析工具，可视化展示各模块体积占比，便于后续优化决策。

#### Scenario: 执行构建分析
- **WHEN** 开发者执行 `npm run analyze`
- **THEN** 生成可视化构建分析报告（stats.html），展示各 chunk 体积及依赖关系

#### Scenario: 构建分析不影响运行时
- **WHEN** 构建分析工具生成报告
- **THEN** 不修改任何运行时代码，仅生成分析报告文件

### Requirement: 资源预压缩
系统 SHALL 在构建时自动生成 gzip 和 brotli 压缩版本，减少传输体积 60-80%。

#### Scenario: 浏览器支持 brotli
- **WHEN** 浏览器发送 `Accept-Encoding: br` 请求头
- **THEN** 服务器返回 brotli 压缩版本（.br 文件）

#### Scenario: 浏览器支持 gzip
- **WHEN** 浏览器发送 `Accept-Encoding: gzip` 请求头且不支持 brotli
- **THEN** 服务器返回 gzip 压缩版本（.gz 文件）

#### Scenario: 浏览器不支持压缩
- **WHEN** 浏览器不发送 Accept-Encoding 头
- **THEN** 服务器返回原始文件（降级方案）

#### Scenario: 压缩文件不存在
- **WHEN** 请求的压缩文件不存在
- **THEN** 服务器返回原始文件（降级方案，不影响功能）

### Requirement: 离线缓存
系统 SHALL 使用 Service Worker 缓存静态资源，实现离线访问和二次访问加速。

#### Scenario: 首次访问
- **WHEN** 用户首次访问应用
- **THEN** Service Worker 注册并缓存所有静态资源（JS、CSS、字体等）

#### Scenario: 二次访问
- **WHEN** 用户再次访问应用且 Service Worker 已激活
- **THEN** 从 Service Worker 缓存加载资源，无需网络请求，实现秒开

#### Scenario: 离线访问
- **WHEN** 用户在无网络环境下访问已缓存的应用
- **THEN** 应用正常加载和运行

#### Scenario: Service Worker 注册失败
- **WHEN** 浏览器不支持 Service Worker 或注册失败
- **THEN** 应用正常从网络加载资源（降级方案，不影响功能）

### Requirement: 资源预加载
系统 SHALL 对关键资源添加 preload/prefetch 提示，优化加载顺序。

#### Scenario: 首屏关键资源
- **WHEN** 用户访问应用首页
- **THEN** 关键 CSS、vendor-react chunk 通过 preload 优先加载

#### Scenario: 预加载失败
- **WHEN** 预加载的资源请求失败
- **THEN** 不影响应用正常运行，资源在需要时正常请求（降级方案）

### Requirement: HTTP 缓存头
系统 SHALL 为静态资源设置合理的 HTTP 缓存头，利用浏览器缓存机制。

#### Scenario: 带哈希的静态资源
- **WHEN** 浏览器请求带哈希的静态资源（如 index-BBBPvt96.js）
- **THEN** 返回 `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: HTML 文件
- **WHEN** 浏览器请求 HTML 文件
- **THEN** 返回 `Cache-Control: no-cache`，确保获取最新版本

### Requirement: DNS 预解析和预连接
系统 SHALL 对 WebSocket 服务器进行 DNS 预解析和预连接，减少连接建立时间。

#### Scenario: 页面加载时
- **WHEN** 用户访问应用
- **THEN** 浏览器预解析和预连接到 WebSocket 服务器地址

#### Scenario: WebSocket 连接
- **WHEN** 应用建立 WebSocket 连接
- **THEN** 连接建立时间减少（DNS 解析和 TCP 连接已完成）

### Requirement: ZEGO SDK 延迟加载验证
系统 SHALL 确保 ZEGO SDK 仅在需要时加载，而非在应用初始化时加载。

#### Scenario: 首页加载
- **WHEN** 用户访问应用首页
- **THEN** 不加载 ZEGO SDK（约 1.8MB），加快首屏加载速度

#### Scenario: 预加载 ZEGO SDK
- **WHEN** 首页加载完成后，预加载队列到达 ZEGO SDK
- **THEN** 在后台加载 ZEGO SDK

#### Scenario: 进入游戏房间
- **WHEN** 用户进入游戏房间
- **THEN** ZEGO SDK 已预加载或正在加载，显示加载状态提示

#### Scenario: ZEGO SDK 加载失败
- **WHEN** ZEGO SDK 加载失败
- **THEN** 显示错误提示，用户可重试加载（不影响其他功能）

## MODIFIED Requirements
无（所有改动均为新增，不修改现有需求）

## REMOVED Requirements
无
