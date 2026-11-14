# 檔案格式

## 檔案編碼
- 所有檔案都是以 UTF-8 編碼。

## 需求文件格式
- 所有需求文件都使用 Markdown、YAML 或 PlantUML 格式。
- 文件內容依 `project/system-spec.md` 鎖定之主要語言撰寫（支援 `zh-TW`、`en`、`zh-CN`、`ja`、`ko`），同一專案內維持 100% 單一語言，業界標準英文技術術語保留原文。
- 文件狀態需明確標示（例如繁體中文為 `草稿`、`待確認`、`已審核`，或對應鎖定語言之狀態標籤）。

## 索引檔案
- 檔名為 `project/index.md`。
- 內容格式（繁體中文為例）：`| 編號 | 標題 | 敘述 | 狀態 | 建立時間 | 更新時間 |`（隨專案鎖定語言對應表頭）。
- 依需求編號排序，由 `sa-spec reindex` 或歸檔流程維持同步。
- 需求狀態或標題異動時，必須同步更新索引。

## 新需求格式
- 每個需求使用獨立資料夾，放入 `project/`。
- 草稿階段位於 `project/<slug>/`，定號歸檔後為 `REQ-流水號-需求短名`，例如 `REQ-001-login`。
- 每個需求資料夾固定包含：
  - `srs.md`：需求規格（含畫面與行為規格，涉及畫面時搭配 `uml/wireframe.puml`）。
  - `history.md`：需求歷程。
  - `uml/`：UML 圖目錄，依面向拆分為獨立 `.puml` 檔（如 `main.puml`、`sequence.puml`、`wireframe.puml`，單檔單圖，禁止單檔混放多圖）。
  - `openapi.yaml`：OpenAPI 3.0.3 介面契約草稿。
  - `db-schema.md`：DB Schema 草稿。
  - `handoff.md`：給 OpenSpec 或其他 AI 開發工具的開發交接摘要。

## 建議目錄結構
```text
project/
  index.md
  system-spec.md
  REQ-001-login/
    srs.md
    history.md
    uml/
      main.puml
      sequence.puml
      wireframe.puml
    openapi.yaml
    db-schema.md
    handoff.md
```
