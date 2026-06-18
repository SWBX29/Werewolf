---
name: "langrensha-project-manager"
description: "Manages the langrensha project lifecycle: start, stop, and restart. Invoke when user asks to start, stop, restart, close, open, or relaunch the project, or when port conflicts occur."
---

# 狼人杀项目管理器

管理狼人杀项目的启动、关闭和重启流程，自动处理端口冲突和进程清理。

## 项目信息

- **工作目录**: `E:\GitHub\langrensha`
- **客户端端口**: 5180
- **服务端端口**: 3001
- **启动命令**: `npm run dev` (同时启动客户端和服务端)
- **公网地址**: `119.28.238.67:59316`

## 启动流程

按顺序执行以下步骤：

### 1. 检查并释放端口

```powershell
# 检查端口占用
netstat -ano | findstr ":3001"
netstat -ano | findstr ":5180"

# 如果端口被占用，提取PID并强制终止
taskkill /F /PID <PID1> /PID <PID2>
```

### 2. 停止现有进程

如果有正在运行的开发服务器命令，先调用 `StopCommand` 停止。

### 3. 启动项目

```powershell
cd E:\GitHub\langrensha
npm run dev
```

使用 `RunCommand` 执行，设置为：
- `blocking: false` (非阻塞)
- `command_type: web_server`
- `cwd: E:\GitHub\langrensha`
- `wait_ms_before_async: 5000` (等待5秒观察启动状态)

### 4. 验证启动状态

等待3秒后检查命令状态，确认：
- Vite客户端在 http://localhost:5180/ 启动成功
- 服务端在 ws://localhost:3001 启动成功
- MongoDB 已连接
- FRP隧道已建立

### 5. 打开预览

调用 `OpenPreview` 打开 http://localhost:5180/

## 关闭流程

### 1. 停止开发服务器

调用 `StopCommand` 停止当前运行的开发服务器命令。

### 2. 确认端口已释放（可选）

```powershell
netstat -ano | findstr ":3001"
netstat -ano | findstr ":5180"
```

如果仍有进程占用，询问用户是否需要强制终止。

## 重启流程

先执行关闭流程，再执行启动流程。

## 注意事项

1. **不要使用 `cmd.exe`**：PowerShell环境下使用PowerShell兼容命令
2. **端口清理**：启动前必须检查端口，避免 EADDRINUSE 错误
3. **等待时间**：启动后等待足够时间让所有服务就绪（MongoDB、FRP、Vite、Server）
4. **PID提取**：从 `netstat` 输出中提取最后一列的PID
5. **不要自动提交代码**：除非用户明确要求

## 常见问题

### 端口被占用但找不到进程

可能是僵尸进程，使用 `taskkill /F /PID <PID>` 强制终止。

### 启动后部分服务未就绪

检查终端输出，确认所有服务都成功启动：
- `[MongoDB] 已连接`
- `VITE ... ready`
- `服务已启动` 横幅
- FRP隧道登录成功

### FRP隧道连接失败

网络问题导致，不影响本地开发。可以继续使用 localhost 地址测试。
