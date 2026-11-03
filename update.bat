@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

set "PACKAGE_NAME=@loviusc/sa-spec"
set "SCRIPT_DIR=%~dp0"

echo [sa-spec] 開始更新 (Windows)...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 未偵測到 Node.js，請先執行 install.bat。
    pause
    exit /b 1
)

set "IS_SOURCE=0"
if exist "%SCRIPT_DIR%package.json" (
    findstr /C:"@loviusc/sa-spec" "%SCRIPT_DIR%package.json" >nul 2>&1
    if !errorlevel! equ 0 set "IS_SOURCE=1"
)

if "%IS_SOURCE%"=="1" (
    echo [更新] 偵測到 sa-spec 原始碼目錄...
    pushd "%SCRIPT_DIR%"
    if exist ".git" (
        where git >nul 2>&1
        if !errorlevel! equ 0 (
            echo [Git] 正在拉取最新原始碼 ^(git pull --ff-only^)...
            git pull --ff-only
        )
    )
    call npm install
    call npm link
    popd
) else (
    echo [更新] 從 npm 更新 %PACKAGE_NAME%@latest...
    call npm install -g %PACKAGE_NAME%@latest
)

echo [完成] sa-spec 已更新至最新版本！
call sa-spec --version 2>nul
pause
