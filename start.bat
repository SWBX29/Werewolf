@echo off
chcp 65001 >nul 2>&1
title 狼人杀服务器

if "%1"=="stop" goto :stop
if "%1"=="restart" goto :restart
goto :start

:start
echo [启动] 正在启动狼人杀服务器...
echo.
echo   前端: http://localhost:5173
echo   后端: ws://localhost:3001
echo.
echo   按 Ctrl+C 停止服务器
echo ========================================
cd /d "%~dp0"
npx concurrently "npm run dev:server" "npm run dev:client"
goto :eof

:stop
echo [停止] 正在停止狼人杀服务器...
taskkill /f /im node.exe 2>nul
if %errorlevel%==0 (
    echo [停止] 服务器已停止
) else (
    echo [停止] 没有找到运行中的 Node 进程
)
goto :eof

:restart
echo [重启] 正在重启狼人杀服务器...
call %0 stop
timeout /t 2 /nobreak >nul
call %0 start
goto :eof
