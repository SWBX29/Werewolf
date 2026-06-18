@echo off
chcp 65001 >nul
echo ========================================
echo   狼人杀项目管理工具 - 打包脚本
echo ========================================
echo.

cd manager

echo [1/3] 安装依赖...
pip install -r requirements.txt
if errorlevel 1 (
    echo 依赖安装失败！
    pause
    exit /b 1
)

echo.
echo [2/3] 安装 PyInstaller...
pip install pyinstaller
if errorlevel 1 (
    echo PyInstaller 安装失败！
    pause
    exit /b 1
)

echo.
echo [3/3] 开始打包...
pyinstaller --onefile --name langrensha-manager --distpath .. --workpath build --specpath build ^
    --hidden-import=rich ^
    --hidden-import=rich._win32_console ^
    --hidden-import=rich._windows ^
    --hidden-import=rich.terminal_theme ^
    --hidden-import=rich.theme ^
    --hidden-import=rich.progress ^
    --hidden-import=rich.table ^
    --hidden-import=rich.panel ^
    --hidden-import=rich.text ^
    --hidden-import=rich.console ^
    --hidden-import=rich.prompt ^
    --hidden-import=rich.cells ^
    --hidden-import=rich._unicode_data ^
    --hidden-import=rich._unicode_data.unicode17-0-0 ^
    --hidden-import=rich._unicode_data.unicode15-0-0 ^
    --hidden-import=rich._unicode_data.unicode13-0-0 ^
    --collect-all=rich ^
    manager.py
if errorlevel 1 (
    echo 打包失败！
    pause
    exit /b 1
)

echo.
echo ========================================
echo   打包完成！
echo ========================================
echo.
echo 可执行文件位置: langrensha-manager.exe
echo.
echo 使用方法:
echo   1. 双击 langrensha-manager.exe 运行
echo   2. 通过菜单选择操作
echo.

pause