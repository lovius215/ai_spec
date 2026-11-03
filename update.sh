#!/usr/bin/env bash
set -e

PACKAGE_NAME="@loviusc/sa-spec"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[sa-spec] 開始更新 (${OSTYPE:-macOS/Linux})..."

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "[錯誤] 未偵測到 Node.js 或 npm，請先執行 ./install.sh。"
  exit 1
fi

if [ -f "${SCRIPT_DIR}/package.json" ] && grep -q '"@loviusc/sa-spec"' "${SCRIPT_DIR}/package.json" 2>/dev/null; then
  echo "[更新] 偵測到 sa-spec 原始碼目錄 (${SCRIPT_DIR})..."
  if [ -d "${SCRIPT_DIR}/.git" ] && command -v git >/dev/null 2>&1; then
    if (cd "${SCRIPT_DIR}" && git remote | grep -q .); then
      echo "[Git] 拉取最新原始碼 (git pull --ff-only)..."
      (cd "${SCRIPT_DIR}" && git pull --ff-only) || echo "[提示] git pull 略過，請確認本地是否有未提交修改。"
    fi
  fi
  cd "${SCRIPT_DIR}"
  npm install
  npm link
else
  echo "[更新] 從 npm 更新 ${PACKAGE_NAME}@latest..."
  npm install -g "${PACKAGE_NAME}@latest"
fi

echo "[完成] sa-spec 已更新至最新版本: $(sa-spec --version 2>/dev/null || echo '未知')"
