# 系統分析規格專案

本專案使用 `@loviusc/sa-spec` 管理系統分析規格文件，完整分析規範與補充規則由 `sa-spec` CLI 動態提供（專案目錄不額外放置 `skills/` 與 `rules/`）。

- `AGENTS.md`：AI 協作入口與核心紅線規範。
- `project/system-spec.md`：系統總體概覽、鎖定語言與規範版本。
- `project/index.md`：需求總索引（可透過 `sa-spec reindex` 自動重建）。
- `project/REQ-xxx-<name>/`：已確認歸檔的需求規格（含 `srs.md`、`uml/`、`openapi.yaml`、`db-schema.md`、`handoff.md`、`history.md`）。

## 常用指令

- `sa-spec instructions <init|propose|analyze|commit|pdf>`：讀取對應階段流程與完整分析規範
- `sa-spec rules [name|all]`：查詢內建補充規則
- `sa-spec templates [name] [--lang <code>]`：讀取內建規格範本
- `sa-spec check`：檢查專案結構、規範版本、需求交付物完整性與重複序號
- `sa-spec pdf <REQ-001|file.md>`：匯出規格書 PDF
