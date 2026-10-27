---
name: system-analysis
description: 用 init、propose、analyze、commit 四段流程整理需求，並產出 SRS、UML、OpenAPI、DB Schema。
---

# System Analysis Skill

## 核心交付物

- `srs.md`：需求規格。
- `uml/`：UML 圖目錄（依面向拆分為獨立 `.puml` 檔，如 `main.puml`、`sequence.puml` 等，禁止單檔混放多圖）。
- `openapi.yaml`：OpenAPI 草稿。
- `db-schema.md`：DB Schema 草稿。
- `handoff.md`：給 OpenSpec 或其他 AI 開發工具的開發交接摘要。
- `history.md`：版本歷程。

## 指令流程

使用四個核心指令，並支援簡寫別名（兩者等價）：

| 指令 | 簡寫 | 用途 | 執行規則 |
|---|---|---|---|
| `spec:init` | `sci` | 初始化 | 載入並遵守 `AGENTS.md`、本 skill 與必要規則，確認 `project/` 結構是否存在。 |
| `spec:propose` | `scp` | 提出需求 | 使用者提出需求後，自動依需求名稱建立並切換至專屬 feature 分支（`feat/<name>`，若已在 feature branch 則沿用），建立草稿目錄（內部使用 `{{REQ_ID}}` 佔位），整理需求摘要、目標、初步流程與待確認事項；不歸檔、不修改既有需求。 |
| `spec:analyze` | `sca` | 分析與起草 | 先檢查新需求是否與 `project/` 內所有既有需求衝突；無衝突才產出 SRS、UML、OpenAPI、DB Schema 草稿；有衝突則只列出衝突與待釐清問題，待使用者釐清後再次執行 `spec:analyze`（或 `sca`）。 |
| `spec:commit` | `scc` | 確認歸檔 | 只把使用者已確認的版本歸檔到該需求資料夾，自動向主分支確認最新可用序號定號（`REQ-xxx`）、替換佔位符，更新 `project/index.md`、`project/system-spec.md` 與 `history.md`，建立本機 Git commit 後，自動切換回主分支並完成合併。 |

## 硬性限制

- 語言與國際化規範（i18n）：
  - 支援語系：繁體中文 (`zh-TW`，台灣常用語)、英文 (`en`)、簡體中文 (`zh-CN`)、日文 (`ja`)、韓文 (`ko`) 共 5 種語言。
  - 初始化語言鎖定：執行 `spec:init` (或 `sci`) 時，若使用者未明確指定語言，AI 必須主動詢問使用者選擇上述 5 種語言之一，不得自行預設；選定後將主要語言寫入 `project/system-spec.md`。
  - 全專案語言單一純粹：後續所有需求文件（`srs.md`、`uml/`、`openapi.yaml`、`db-schema.md`、`handoff.md`、`history.md`）必須 100% 統一使用該語言，不得在同一專案內混雜多種語言。
  - 專有名詞保留原生英文：在中文、日文、韓文等非英語系模式下，業界公認標準之技術術語（如 REST API, Webhook, JWT, OAuth 2.0, Payload, Idempotency, Redis 等）強制保留原生英文，嚴禁生硬直譯。
  - 升級保護：執行 `sa-spec upgrade` 時，自動偵測並繼承現有專案語言，不變更語言設定。
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
- `handoff.md` 只能根據已確認的 SRS、UML、OpenAPI、DB Schema 與限制整理，不得新增未確認的開發假設。
- 交給 OpenSpec 或其他 AI 開發工具時，必須指定它先閱讀 `handoff.md`，並以 `handoff.md` 作為開發入口與限制摘要；其他規格文件作為詳細來源。
- `spec:commit` 完成文件歸檔後，必須自動建立本機 Git commit；commit message 以需求編號與需求名稱為主，並加上簡短需求說明，格式為 `docs(REQ-001): 需求名稱 - 簡短需求說明`。
- `spec:commit` 自動合併到主分支（Git-Flow 閉環）：完成 feature 分支 commit 後，若目前處於 feature 分支（`feat/<name>`），AI 必須自動切換回主分支（優先偵測 `main` 或 `master`），拉取/檢查最新狀態並自動合併該 feature 分支 (`git checkout master && git merge feat/<name>`)，隨後在主分支重新生成 `project/index.md` 索引，確保主分支規格清單完整且無衝突。
- `spec:commit` 只有在使用者明確要求推送 remote，或專案設定啟用 auto-push 時，才可執行 `git push`；push 失敗時只回報認證或網路問題，不得回滾已完成的文件歸檔與本機 commit。
- 多人協作與 Git-Flow 模式（延遲綁定序號與自動合併）：支援多人平行開發。執行 `spec:propose`（或 `scp`）時，若目前處於 master/main 分支，AI 必須自動依需求名稱建立並切換至專屬 feature branch（如 `feat/<name>`），並在 `project/<name>/` 建立草稿目錄，內部使用 `{{REQ_ID}}` 佔位，無需使用者手動敲 CLI；執行 `spec:analyze` 前應先確保取得 master 最新規格以防漏檢衝突；執行 `spec:commit` 歸檔時自動向 master 確認最新可用序號定號，自動將目錄定名為正式 `REQ-xxx`、替換內部佔位符、完成提交並自動合併回 master，避免多人合併時的序號競爭與索引衝突。
- 文件未經使用者確認，不得標示為 `已審核`。
- `uml/` 內的 UML 圖不限單一 UML 圖型；`spec:analyze` 必須依需求選擇最能說明流程、互動、狀態、資料關係或介面佈局的圖表，例如活動圖、循序圖、使用案例圖、狀態圖、類別圖；**若需求涉及前端 UI 或使用者操作畫面，必須在 `uml/wireframe.puml` 產出線框圖（使用 PlantUML Salt 語法：`@startsalt ... @endsalt`）**；純後端需求則在 `handoff.md` 明確標記「無 UI 介面需求」。**嚴禁將多張圖混在同一個檔案中**，必須在需求資料夾下的 `uml/` 目錄拆分成獨立的 `.puml` 檔案（例如 `uml/main.puml`、`uml/sequence.puml`、`uml/wireframe.puml`），且每個檔案只能包含一組 `@start...` 與 `@end...`，以避免 PlantUML 渲染或預覽失敗。
- 一次最多問 3 個待確認問題，優先詢問會影響範圍、資料、權限、API、DB 或驗收的問題。

## analyze 衝突檢查

執行 `spec:analyze` 時，先讀取：

- `project/index.md`
- `project/system-spec.md`
- 所有 `project/REQ-*/srs.md`
- 所有 `project/REQ-*/openapi.yaml`
- 所有 `project/REQ-*/db-schema.md`
- 所有 `project/REQ-*/handoff.md`
- 必要時讀取 `project/REQ-*/uml/*.puml`

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
- UML PlantUML 草稿（放置於 `uml/` 資料夾中，每張圖獨立檔案）。
- OpenAPI YAML 草稿。
- DB Schema 草稿。
- Handoff 交接摘要草稿。
- `project/system-spec.md` 更新建議。
- 待確認事項。
- 本次未修改其他需求的聲明。

## commit 歸檔

`spec:commit` 只能套用已由 `spec:analyze` 產出的無衝突版本。使用者明確確認後，才可歸檔：

```text
project/
  REQ-001-name/
    srs.md
    uml/
      main.puml
    openapi.yaml
    db-schema.md
    handoff.md
    history.md
```

`handoff.md` 用於交接給 OpenSpec 或其他 AI 開發工具，必須包含：

- 需求來源與相關文件。
- 要開發什麼。
- 不要開發什麼。
- 已確認規則。
- 狀態與流程。
- API 契約。
- DB 變更。
- 驗收條件。
- 開發限制。
- 建議實作範圍。

若需求不需要 API 或 DB，必須明確標示「無 API 需求」或「無 DB 需求」。不得在 `handoff.md` 中新增未經使用者確認的角色、權限、資料、流程、狀態、API 或 DB 欄位。

交給 OpenSpec 或其他 AI 開發工具時，應要求它先閱讀 `handoff.md`，並以 `handoff.md` 作為本次開發入口與限制摘要。若需要完整細節，再查閱同需求資料夾內的 `srs.md`、`uml/`、`openapi.yaml`、`db-schema.md` 與 `history.md`。

歸檔完成後，必須只 stage 本次歸檔相關檔案，並建立本機 Git commit。commit message 格式：

```text
docs(REQ-001): 需求名稱 - 簡短需求說明
```

只有在使用者明確要求推送 remote，或專案設定啟用 auto-push 時，才可執行 `git push`。若 push 失敗，只回報認證或網路問題，不得回滾已完成的文件歸檔與本機 commit。

## 狀態機

```text
init (sci) -> propose (scp) -> analyze (sca)

analyze 無衝突 -> 產出待確認版本 -> commit (scc)
analyze 有衝突 -> 釐清問題 -> analyze (sca)

commit (scc) -> 自動拿新號定號 -> feature commit -> 自動合併至主分支 (master/main)
```
