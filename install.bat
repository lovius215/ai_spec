@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

set "PACKAGE_NAME=@loviusc/sa-spec"
set "SCRIPT_DIR=%~dp0"

echo [sa-spec] 開始安裝 (Windows)...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 未偵測到 Node.js，請先安裝 Node.js 18 或以上版本: https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 未偵測到 npm，請確認 Node.js 安裝是否完整。
    pause
    exit /b 1
)

set "IS_SOURCE=0"
if exist "%SCRIPT_DIR%package.json" (
    findstr /C:"@loviusc/sa-spec" "%SCRIPT_DIR%package.json" >nul 2>&1
    if !errorlevel! equ 0 set "IS_SOURCE=1"
)

if "%IS_SOURCE%"=="1" (
    echo [安裝] 偵測到 sa-spec 原始碼目錄，執行 npm install 與 npm link...
    pushd "%SCRIPT_DIR%"
    call npm install
    call npm link
    popd
) else (
    echo [安裝] 從 npm 全域安裝 %PACKAGE_NAME%...
    call npm install -g %PACKAGE_NAME%
)

echo [完成] sa-spec 安裝完成！
call sa-spec --version 2>nul
pause
