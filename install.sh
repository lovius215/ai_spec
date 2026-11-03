#!/usr/bin/env bash
set -e

PACKAGE_NAME="@loviusc/sa-spec"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[sa-spec] 開始安裝 (${OSTYPE:-macOS/Linux})..."

if ! command -v node >/dev/null 2>&1; then
  echo "[錯誤] 未偵測到 Node.js，請先安裝 Node.js 18 或以上版本: https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[錯誤] 未偵測到 npm，請確認 Node.js 與 npm 是否安裝完整。"
  exit 1
fi

# 若全域目錄無寫入權限，自動切換至 ~/.npm-global 避免 sudo 權限問題
NPM_PREFIX="$(npm prefix -g 2>/dev/null || echo "")"
if [ -n "${NPM_PREFIX}" ] && [ ! -w "${NPM_PREFIX}" ] && [ ! -w "${NPM_PREFIX}/lib" ]; then
  echo "[權限設定] 偵測到全域目錄 (${NPM_PREFIX}) 無寫入權限，自動設定 ~/.npm-global..."
  mkdir -p "${HOME}/.npm-global"
  npm config set prefix "${HOME}/.npm-global"
  export PATH="${HOME}/.npm-global/bin:${PATH}"
  for rc in "${HOME}/.zshrc" "${HOME}/.bashrc"; do
    if [ -f "${rc}" ] && ! grep -q '.npm-global/bin' "${rc}" 2>/dev/null; then
      echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "${rc}"
    fi
  done
fi

if [ -f "${SCRIPT_DIR}/package.json" ] && grep -q '"@loviusc/sa-spec"' "${SCRIPT_DIR}/package.json" 2>/dev/null; then
  echo "[安裝] 偵測到 sa-spec 原始碼目錄，執行 npm install 與 npm link..."
  cd "${SCRIPT_DIR}"
  npm install
  npm link
else
  echo "[安裝] 從 npm 全域安裝 ${PACKAGE_NAME}..."
  npm install -g "${PACKAGE_NAME}"
fi

echo "[完成] sa-spec 安裝成功！目前版本: $(sa-spec --version 2>/dev/null || echo '請重開終端機以套用 PATH')"
