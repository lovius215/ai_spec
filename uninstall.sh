#!/usr/bin/env bash
set -e

PACKAGE_NAME="@loviusc/sa-spec"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[sa-spec] 開始解除安裝 (${OSTYPE:-macOS/Linux})..."

if [ -f "${SCRIPT_DIR}/package.json" ] && grep -q '"@loviusc/sa-spec"' "${SCRIPT_DIR}/package.json" 2>/dev/null; then
  (cd "${SCRIPT_DIR}" && npm unlink -g 2>/dev/null) || true
fi

npm uninstall -g "${PACKAGE_NAME}" || true

echo "[完成] 已解除安裝 sa-spec！"
