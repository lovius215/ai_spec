@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

set "PACKAGE_NAME=@loviusc/sa-spec"
set "SCRIPT_DIR=%~dp0"

echo [sa-spec] 開始解除安裝 (Windows)...

if exist "%SCRIPT_DIR%package.json" (
    findstr /C:"@loviusc/sa-spec" "%SCRIPT_DIR%package.json" >nul 2>&1
    if !errorlevel! equ 0 (
        pushd "%SCRIPT_DIR%"
        call npm unlink -g >nul 2>&1
        popd
    )
)

call npm uninstall -g %PACKAGE_NAME%

echo [完成] 已解除安裝 sa-spec！
pause
