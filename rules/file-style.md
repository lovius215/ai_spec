# 檔案格式

## 檔案編碼
- 所有檔案都是以 UTF-8 編碼。

## 需求文件格式
- 所有需求文件都使用 Markdown 格式。
- 文件內容以繁體中文為主，並採用台灣常用語。
- 文件狀態需明確標示為：`草稿`、`待確認`、`已審核`。

## 索引檔案
- 檔名為 `project/index.md`。
- 內容格式為：`| 編號 | 標題 | 敘述 | 狀態 | 建立時間 | 更新時間 |`。
- 依需求編號排序，新需求加在最後一列。
- 需求狀態或標題異動時，必須同步更新索引。

## 新需求格式
- 每個需求使用獨立資料夾，放入 `project/`。
- 資料夾命名格式：`REQ-流水號-需求短名`，例如 `REQ-001-login`。
- 每個需求資料夾至少包含：
  - `srs.md`：需求規格。
  - `history.md`：需求歷程。
  - `uml/`：UML 圖目錄，依面向拆分為獨立 `.puml` 檔（如 `main.puml`、`sequence.puml` 等，單檔單圖，禁止單檔混放多圖）。
  - `openapi.yaml`：OpenAPI 草稿。
  - `db-schema.md`：DB Schema 草稿。
  - `handoff.md`：給 OpenSpec 或其他 AI 開發工具的開發交接摘要。
- 若需求涉及畫面，使用 `wireframe.md`。
- 若需求需要 API 或資料模型，使用 `api.md` 或獨立資料模型文件。
- 若需求需要 DB Table 設計，使用 `db-table.md`。

## 建議目錄結構
```text
project/
  index.md
  REQ-001-login/
    srs.md
    wireframe.md
    history.md
    uml/
      main.puml
      sequence.puml
    openapi.yaml
    db-schema.md
    handoff.md
    api.md
    db-table.md
```
