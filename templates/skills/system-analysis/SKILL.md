---
name: system-analysis
description: 用 init、propose、analyze、commit 四段流程整理需求，並產出 SRS、UML、OpenAPI、DB Schema。
---

# System Analysis Skill

## 核心交付物

- `srs.md`：需求規格。
- `uml.puml`：UML 圖。
- `openapi.yaml`：OpenAPI 草稿。
- `db-schema.md`：DB Schema 草稿。
- `history.md`：版本歷程。

## 指令流程

| 指令 | 用途 | 執行規則 |
|---|---|---|
| `spec:init` | 初始化 | 載入並遵守 `AGENTS.md`、本 skill 與必要規則，確認 `project/` 結構是否存在。 |
| `spec:propose` | 提出需求 | 整理使用者需求為摘要、目標、初步流程與待確認事項；不歸檔、不修改既有需求。 |
| `spec:analyze` | 分析與起草 | 先檢查新需求是否與 `project/` 內所有既有需求衝突；無衝突才產出 SRS、UML、OpenAPI、DB Schema 草稿；有衝突則只列出衝突與待釐清問題，待使用者釐清後再次執行 `spec:analyze`。 |
| `spec:commit` | 確認歸檔 | 只把使用者已確認的版本歸檔到該需求資料夾，更新 `project/index.md`、`project/system-spec.md` 與 `history.md`，並建立本機 Git commit。 |

## 硬性限制

- 使用繁體中文，並採用台灣常用語。
- `spec:init` 必須檢查 Git 狀態：
  - 若 Git 未安裝，提醒使用者後續歸檔會使用版本管理，但不可中斷初始化。
  - 若 Git 已安裝且目前目錄尚未初始化為 Git repository，則自動執行 `git init`。
  - 若目前目錄已是 Git repository，僅回報狀態，不重複初始化。
- `project/system-spec.md` 由 `sa-spec init` 建立；`spec:analyze` 只能讀取它做衝突檢查，並提出待確認的系統規格更新建議，不得寫入；`spec:commit` 才能依使用者確認後的內容更新 `project/system-spec.md`。
- 不可自行幻想未確認的業務規則、角色、流程、資料或系統行為。
- `spec:analyze` 必須先檢查所有既有需求是否衝突。
- 若發現衝突，不得產出最終文件，不得修改任何需求文件，只能向使用者釐清。
- 衝突釐清後，流程回到 `spec:analyze`，重新檢查衝突並產出草稿；不可直接進入 `spec:commit`。
- 任何流程都不得修改其他需求資料夾中的文件，除非使用者明確指定該需求也要變更。
- `spec:commit` 只能套用已由 `spec:analyze` 產出的、且使用者已確認的無衝突版本。
- `spec:commit` 完成文件歸檔後，必須自動建立本機 Git commit；commit message 以需求編號與需求名稱為主，並加上簡短需求說明，格式為 `docs(REQ-001): 需求名稱 - 簡短需求說明`。
- `spec:commit` 只有在使用者明確要求推送 remote，或專案設定啟用 auto-push 時，才可執行 `git push`；push 失敗時只回報認證或網路問題，不得回滾已完成的文件歸檔與本機 commit。
- 文件未經使用者確認，不得標示為 `已審核`。
- `uml.puml` 不限單一 UML 圖型；`spec:analyze` 必須依需求選擇最能說明流程、互動、狀態或資料關係的 UML 圖，例如活動圖、循序圖、使用案例圖、狀態圖或類別圖，不可為了固定格式硬產生活動圖。需求複雜時，可在同一個 `uml.puml` 內放多張 PlantUML 圖並清楚分段。
- 一次最多問 3 個待確認問題，優先詢問會影響範圍、資料、權限、API、DB 或驗收的問題。

## analyze 衝突檢查

執行 `spec:analyze` 時，先讀取：

- `project/index.md`
- `project/system-spec.md`
- 所有 `project/REQ-*/srs.md`
- 所有 `project/REQ-*/openapi.yaml`
- 所有 `project/REQ-*/db-schema.md`
- 必要時讀取 `project/REQ-*/uml.puml`

至少檢查：

- 是否與既有需求目標或流程重疊。
- 是否改變既有角色、權限或資料存取規則。
- 是否影響既有 API 路徑、request/response 或狀態碼。
- 是否影響既有 DB Table、欄位、唯一性或關聯。
- 是否與既有驗收條件矛盾。

## analyze 發現衝突時

若 `spec:analyze` 發現衝突：

1. 列出衝突的既有需求編號與檔案。
2. 說明衝突原因與影響範圍。
3. 提出最多 3 個待釐清問題。
4. 停止產出 SRS、UML、OpenAPI、DB Schema。
5. 等使用者釐清後，再由使用者執行 `spec:analyze` 繼續。
6. 不得修改任何既有需求文件。

## analyze 無衝突輸出

無衝突時，輸出一個待確認版本，包含：

- SRS 草稿。
- UML PlantUML 草稿。
- OpenAPI YAML 草稿。
- DB Schema 草稿。
- `project/system-spec.md` 更新建議。
- 待確認事項。
- 本次未修改其他需求的聲明。

## commit 歸檔

`spec:commit` 只能套用已由 `spec:analyze` 產出的無衝突版本。使用者明確確認後，才可歸檔：

```text
project/
  REQ-001-name/
    srs.md
    uml.puml
    openapi.yaml
    db-schema.md
    history.md
```

歸檔完成後，必須只 stage 本次歸檔相關檔案，並建立本機 Git commit。commit message 格式：

```text
docs(REQ-001): 需求名稱 - 簡短需求說明
```

只有在使用者明確要求推送 remote，或專案設定啟用 auto-push 時，才可執行 `git push`。若 push 失敗，只回報認證或網路問題，不得回滾已完成的文件歸檔與本機 commit。

## 狀態機

```text
init -> propose -> analyze

analyze 無衝突 -> 產出待確認版本 -> commit
analyze 有衝突 -> 釐清問題 -> analyze

commit -> 歸檔 -> 本機 Git commit
```
