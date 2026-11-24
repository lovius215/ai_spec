---
name: system-analysis
description: 用 init、propose、analyze、commit、pdf 五個指令流程整理需求，並產出 SRS、UML、OpenAPI、DB Schema、PDF。
---

# System Analysis Skill

## 任務執行與雙重檢查原則

- **做事前先說明任務**：開始任何階段工作前，先向使用者簡要說明本次任務目標、執行範圍與預期產出。
- **建立並依任務清單工作**：列出具體的任務清單（Task Checklist），嚴格依照清單順序逐項執行並回報進度。
- **雙重檢查清單（流程上＋業務上）**：任務完成或請求使用者確認前，必須分別核對以下兩份檢查清單：
  1. **流程上檢查清單（Process Checklist）**：Git 分支與 remote 同步、既有需求衝突檢查前置、檔案結構與 `{{REQ_ID}}` 佔位符、`uml/` 單檔單圖原則、鎖定語言純淨度、`sa-spec check` 驗證等流程面規範。
  2. **業務上檢查清單（Business Checklist）**：需求目標與範圍清晰度、角色與權限邊界、主要與例外流程完整性、SRS/UML/OpenAPI/DB Schema 契約一致性、驗收條件可測試性、未擅自幻想未確認業務規則。

## 核心交付物

- `srs.md`：需求規格。
- `uml/`：UML 圖目錄（依圖型與面向拆分為獨立 `.puml` 檔，如 `sequence.puml`、`activity.puml`、`state.puml` 等，禁止單檔混放多圖）。
- `openapi.yaml`：OpenAPI 草稿。
- `db-schema.md`：DB Schema 草稿。
- `handoff.md`：給 OpenSpec 或其他 AI 開發工具的開發交接摘要。
- `history.md`：版本歷程。

## 指令流程

使用五個核心指令，並支援簡寫別名（兩者等價）：

| 指令 | 簡寫 | 用途 | 執行規則 |
|---|---|---|---|
| `spec:init` | `sci` | 初始化 | 載入並遵守 `AGENTS.md` 與 `sa-spec` CLI 內建完整規範（`sa-spec instructions` / `sa-spec rules`），確認 `project/` 結構是否存在。 |
| `spec:propose` | `scp` | 提出需求 | 新需求自動建立並切換至專屬 feature 分支（`feat/<slug>`，非 ASCII 名稱搭配 `--slug <ascii-slug>`）並建立草稿目錄 `project/<slug>/`（內部使用 `{{REQ_ID}}` 佔位）；若為修改已歸檔需求則執行 `sa-spec revise --id REQ-xxx` 建立 `feat/REQ-xxx-<slug>` 分支直接修訂該目錄（保留原編號，不另建新資料夾）。若有設定 Git remote 則自動將新分支推上 remote，整理摘要、目標、初步流程與待確認事項。 |
| `spec:analyze` | `sca` | 分析與起草 | 先透過 `sa-spec impact` 過濾相關需求並檢查是否與 `project/` 內既有需求衝突；無衝突才產出 SRS、UML、OpenAPI、DB Schema 草稿；有衝突則只列出衝突與待釐清問題，待使用者釐清後再次執行 `spec:analyze`（或 `sca`）。 |
| `spec:commit` | `scc` | 確認歸檔 | 只把使用者已確認的版本歸檔到該需求資料夾；執行 `sa-spec finalize --name <slug-or-REQ-xxx> [--auto-merge \| --pr \| --no-merge] [--keep-branch]`：若有 Git remote 先推分支並同步遠端狀態，向主分支（`master`/`main`）查詢最新可用序號定號（`REQ-xxx`；若為主分支既有 `REQ-xxx` 修訂則保留原編號）、替換佔位符並更新 `project/index.md`、`project/system-spec.md` 與 `history.md`。預設為 `auto-merge` 模式：自動切回主分支合併、推送主分支至 remote，並自動刪除已合併的本機與遠端 feature 分支（若遇遠端主分支受保護推送失敗，自動退回並保留 feature 分支改走 PR；若需強制 PR 模式可加 `--pr` 或設 `合併策略：pr`）。 |
| `spec:pdf` | `spd` | 匯出 PDF | 呼叫 `sa-spec pdf <target> [--split] [--online-uml \| --no-uml-render] [--output <path>]`（或 `--all`），將指定 `.md` 或需求目錄/編號（如 `REQ-001`）匯出 PDF（預設不將 `.puml` 傳送至公開 PlantUML 網路伺服器；僅使用本機 `plantuml` 或加 `--online-uml` / 自建 `SA_SPEC_PLANTUML_SERVER` 轉繪 SVG）。 |

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
- **鐵律（Git Remote 自動推送與合併清分支規範）**：只要 Git repository 有設定 remote（例如 `origin`），`spec:propose` 建立的分支與 `spec:commit` 歸檔變更**都必須自動推送（`git push`）到 remote**，無需等待使用者額外指示；預設 `auto-merge` 模式下合併回主分支並推送成功後，自動刪除本機與遠端已合併的 feature 分支（若遠端主分支受保護導致推送失敗，則自動退回並保留 feature 分支供建立 PR；若指定 `--pr` 或 `合併策略：pr` 則只推 feature 分支不動主分支）。
- `spec:commit` 完成文件歸檔後，必須自動建立本機 Git commit；commit message 以需求編號與需求名稱為主，並加上簡短需求說明，格式為 `docs(REQ-001): 需求名稱 - 簡短需求說明`。
- `spec:commit` 歸檔與合併閉環流程（含 Remote 同步順序）：
  1. **先推分支至 Remote**：執行 `spec:commit`（或 `scc`）時，若檢查到 Git 有設定 remote，必須**先將目前分支推送至 remote**（`git push -u <remote> <branch>`）並同步遠端最新狀態（`git fetch <remote>`）。
  2. **再查主分支最新版號（既有修訂保留原號）**：向主分支（`main` / `master` 及遠端主分支）查詢最新已使用序號定號 `REQ-xxx`；若該 `REQ-xxx-<slug>` 已存在於主分支（屬於 `scc` 後再次開分支修訂），則保留原編號不跳號。
  3. **定號歸檔與提交**：將草稿目錄重命名為正式 `project/REQ-xxx-<name>`、替換內部 `{{REQ_ID}}` 佔位符、更新索引與規格後，在 feature 分支建立 commit；若有 remote 則同步推送該 feature 分支至 remote。
  4. **自動合併回主分支並刪除 feature 分支（預設 `auto-merge`）**：預設在工作區乾淨後自動切換回主分支（`main` / `master`）、合併該 feature 分支、更新 `project/index.md` 索引並推送主分支至 remote，成功後自動刪除本機與遠端 feature 分支（若遇遠端主分支受保護推送失敗，則自動退回保留 feature 分支；若設為 `pr` 模式則停留在 feature 分支等待 PR）。
- 多人協作與一人一分支模式（延遲綁定序號＋修訂重開分支）：每位 SA 負責一顆需求獨立分支。新需求執行 `spec:propose`（`scp`）建立 `feat/<name>` 與 `project/<name>/` 草稿（`{{REQ_ID}}` 佔位）；若 `scc` 歸檔後需再次修改既有需求，則執行 `sa-spec revise --id REQ-xxx` 從最新主分支新開 `feat/REQ-xxx-<slug>` 分支直接修訂該需求；執行 `spec:analyze` 前先用 `sa-spec impact` 過濾相關需求檢查衝突；執行 `spec:commit` 歸檔合併回主分支後自動刪除暫存 feature 分支，確保下次修訂永遠從最新主分支乾淨切出。
- 文件未經使用者確認，不得標示為 `已審核`。
- `uml/` 內的 UML 圖不限單一 UML 圖型；`spec:analyze` 必須依需求選擇最能說明流程、互動、狀態、資料關係或介面佈局的圖表，例如活動圖、循序圖、使用案例圖、狀態圖、類別圖；**若需求涉及前端 UI 或使用者操作畫面，必須在 `uml/wireframe.puml` 產出線框圖（使用 PlantUML Salt 語法：`@startsalt ... @endsalt`）**；純後端需求則在 `handoff.md` 明確標記「無 UI 介面需求」。**嚴禁將多張圖混在同一個檔案中**，必須在需求資料夾下的 `uml/` 目錄拆分成獨立的 `.puml` 檔案（例如 `uml/sequence.puml`、`uml/activity.puml`、`uml/wireframe.puml`），且每個檔案只能包含一組 `@start...` 與 `@end...`，以避免 PlantUML 渲染或預覽失敗。
- 一次最多問 3 個待確認問題，優先詢問會影響範圍、資料、權限、API、DB 或驗收的問題。

## analyze 衝突檢查

執行 `spec:analyze` 時，先執行 `sa-spec instructions analyze`（或 `sa-spec impact`）取得「跨需求輕量影響索引」，過濾出 API Paths、DB Tables 重疊或領域相關的 `REQ-*` 目錄，再讀取以下檔案進行語意衝突檢查（避免無差別全量讀取）：

- `project/index.md`
- `project/system-spec.md`
- 相關 `project/REQ-*/srs.md`
- 相關 `project/REQ-*/openapi.yaml`
- 相關 `project/REQ-*/db-schema.md`
- 相關 `project/REQ-*/handoff.md`
- 必要時讀取相關 `project/REQ-*/uml/*.puml`

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
      sequence.puml
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
- UI / 畫面規格。
- 驗收條件。
- 開發限制。
- 建議實作範圍。

若需求不需要 API 或 DB，必須明確標示「無 API 需求」或「無 DB 需求」。不得在 `handoff.md` 中新增未經使用者確認的角色、權限、資料、流程、狀態、API 或 DB 欄位。

交給 OpenSpec 或其他 AI 開發工具時，應要求它先閱讀 `handoff.md`，並以 `handoff.md` 作為本次開發入口與限制摘要。若需要完整細節，再查閱同需求資料夾內的 `srs.md`、`uml/`、`openapi.yaml`、`db-schema.md` 與 `history.md`。

歸檔完成後，必須只 stage 本次歸檔相關檔案，並建立本機 Git commit。commit message 格式：

```text
docs(REQ-001): 需求名稱 - 簡短需求說明
```

只要 Git repository 有設定 remote（例如 `origin`），在 `spec:commit` 歸檔時必須先將目前分支推送至 remote 並同步遠端狀態，接著查詢主分支最新版號（既有修訂保留原號）並完成定號歸檔。預設為 `auto-merge` 模式：自動合併回主分支、推送至 remote 並刪除已合併的 feature 分支；若遠端主分支受保護導致推送失敗，則自動退回並保留 feature 分支供建立 PR（若指定 `--pr` 或 `合併策略：pr` 則不直接動主分支）。

## 狀態機

```text
init (sci) -> propose (scp: 新需求 feat/<slug> 或既有修訂 feat/REQ-xxx-<slug>，推至 remote) -> analyze (sca, impact 過濾)

analyze 無衝突 -> 產出待確認版本 -> commit (scc)
analyze 有衝突 -> 釐清問題 -> analyze (sca)

commit (scc) -> 先推分支至 remote -> 定號（既有修訂保留 REQ-xxx） -> 預設合併回主分支並 push -> 自動刪除 feature 分支（主分支受保護時退回保留分支）
```
