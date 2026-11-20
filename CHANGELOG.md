# Changelog (`@loviusc/sa-spec`)

### v0.2.12
- **主分支 `pr` 防護、純後端 `--no-ui` 旗標與 OpenAPI / DB 解析精度強化**：
  - **主分支 `finalize` 安全防護**：在 `main`/`master` 上執行 `sa-spec finalize` 時，非 `--auto-merge`（預設 `pr` 模式）會略過直接 commit 與 push 主分支；尚未建立首次 commit 的 unborn branch 亦安全略過遠端推送。
  - **純後端需求建檔旗標 (`--no-ui`)**：`sa-spec new --no-ui` 支援全 5 語系，建立時自動略過 `uml/wireframe.puml` 並於 `srs.md` 與 `handoff.md` 標記無 UI 介面需求。
  - **OpenAPI / DB 解析與 JSON 輸出修正**：支援含冒號自訂動詞路徑（如 `/api/v1/orders/{id}:cancel`）、PathItem 同層欄位接在 HTTP method 後方、巢狀 `components.<section>.<name>` 與引號 schema 名稱檢查；`extractDbTables` 支援章節編號並排除多字英文說明標題誤判；修正非 `--strict` 模式下 `check --json` 的 `SCOPE_LOCK_MULTI_REQ` 一致性。

### v0.2.11
- **預設安全 PR 合併、`已審核` 佔位閘門與 `sequence.puml` 語意命名**：
  - **預設合併策略改為 `pr`**：`sa-spec finalize` 預設只推送 feature 分支，不再未經 `--auto-merge`（或 `合併策略：auto-merge`）直接動主分支。
  - **`已審核` 佔位內容完整度閘門**：`sa-spec check`（`APPROVED_HAS_PLACEHOLDER`）在需求標示為 `已審核` / `Approved` 時，自動阻擋仍殘留「待補充 / TBD」的交付物。
  - **影響索引過濾與誠實邊界說明**：`sa-spec instructions analyze` 與 `SKILL.md` / `AGENTS.md` 同步改為先透過 `impactIndex`（`sa-spec impact`）過濾相關 `REQ-*` 再細讀；README 明確區分 CLI 確定性保證與 AI 規範約束。
  - **預設 UML 範本語意化**：預設圖檔由 `uml/main.puml` 更名為 `uml/sequence.puml`（保留 `uml-main` 向下相容別名）。
  - **完整範例專案**：新增 [`examples/basic-login/`](examples/basic-login/)（含完整已審核 `REQ-001-user-login` 規格套件、`passwordless-login` 碰撞草稿與 `CONFLICT-DEMO.md` 衝突示範）。

### v0.2.10
- **語法層預檢、跨需求影響矩陣與無瀏覽器 HTML 匯出**：
  - **OpenAPI 3.0.3 & PlantUML 語法預檢**：`sa-spec check` 新增檢查 `paths` 路徑前綴、HTTP method `responses` 必填、內部 `$ref` 存在性（`OPENAPI_CONTRACT_INVALID`），以及 `.puml` 空圖與大括號配對檢查（`PLANTUML_SYNTAX_INVALID`）。
  - **跨需求輕量影響矩陣 (`sa-spec impact`)**：自動萃取各需求的 API Endpoints 與 DB Tables、偵測重疊碰撞，並自動注入 `sa-spec instructions analyze`，大幅降低多需求時的 AI Context 成本與漏檢率。
  - **無頭／CI 環境支援**：新增 `sa-spec pdf <target> --html` 輸出獨立 HTML，並在 `sa-spec doctor` 主動回報本機 PDF 瀏覽器與 PlantUML CLI 可用狀態。

### v0.2.9
- **任務雙重檢查規範與 Harness Engineering 硬護欄升級**：
  - **事前說明與雙重檢查清單**：`sa-spec instructions`、`SKILL.md`、`rules review` 與 5 語系 `AGENTS.md` 全面強制「做事前先說明任務＋任務清單（Task Checklist）＋流程檢查清單（Process Checklist）＋業務檢查清單（Business Checklist）」。
  - **跨文件矛盾與 OpenAPI YAML 結構檢查**：`sa-spec check` 新增 UI / 審核狀態（含 5 語系狀態詞）/ API 契約跨文件矛盾偵測，以及 OpenAPI YAML 縮排與必要欄位驗證。
  - **結構化回饋與範圍鎖定**：新增 `sa-spec check --json`（輸出結構化 `rule` 與 `fixHint`）與多 `REQ-*` 範圍鎖定檢查（`--strict` 阻擋跨需求誤改，必要時可用 `--allow-multi-req` 放行）。
  - **Git `pre-commit` Hook 與多項邊界防護**：新增 `sa-spec init --hooks` 與 `sa-spec hooks [install|remove|status]`；強化 PDF 暫存渲染與 `--browser` 驗證、合併衝突自動 `git merge --abort` 復原，以及全專案檔案／目錄型別（`EISDIR`/`ENOTDIR`）與大小寫 `REQ-*` 防撞檢查。

### v0.2.8
- **OpenSpec 風格 CLI 內建規範架構（隱藏工作區 `skills/` 與 `rules/`）**：
  - **乾淨初始化架構**：執行 `sa-spec init`（含 `--full` 向下相容參數）建立的工作區不再產生 `skills/` 與 `rules/` 資料夾，僅保留 `AGENTS.md`、`readme.md` 與 `project/`，保持規格專案整潔並避免規範副本與套件更新脫鉤。
  - **新增動態規範與範本指令**：新增 `sa-spec instructions [init|propose|analyze|commit|pdf] [--with-rules] [--json]`、`sa-spec rules [name|all] [--list] [--json]` 與 `sa-spec templates [name] [--list] [--json]`，即時由全域套件輸出工作區上下文、系統分析技能與補充規則。
  - **舊版工作區升級自動清理**：執行 `sa-spec upgrade`（新增別名 `sa-spec update`）時，會更新 `AGENTS.md`（保留既有 `<claude-mem-context>`）、自動刪除舊版由套件產生的 `skills/` 與 `rules/`（自訂檔案會保留並發出 `WARNING` 提示，亦支援 `--dry-run` 與 `--keep-legacy`），並保護套件原始碼主目錄不被誤刪。

### v0.2.7
- **新增 Markdown 轉 PDF 指令（`spec:pdf` / `spd` / `sa-spec pdf`）與跨平台獨立安裝腳本**：
  - **Markdown 轉 PDF 支援**：新增 AI 指令 `spec:pdf`（簡寫 `spd`）與 CLI 指令 `sa-spec pdf <target> [--split] [--output out.pdf]`（及 `--all`），支援單一 `.md` 轉換、需求目錄整包合併匯出成一份完整規格書 PDF，或加 `--split` 各檔獨立匯出。
  - **跨平台獨立管理腳本**：新增 macOS / Linux（`install.sh`、`update.sh`、`uninstall.sh`）與 Windows（`install.bat`、`update.bat`、`uninstall.bat`）6 個獨立執行腳本，一鍵完成安裝、更新與解除安裝。

### v0.2.6
- **Git Remote 自動推送鐵律（Remote Auto-Push）**：
  - **`scp` 建立分支自動推上遠端**：執行 `spec:propose`（`scp`）或 `sa-spec new --branch` 建立 feature 分支後，自動偵測是否有設定 Git remote；若有則立即將新分支推送至遠端（`git push -u <remote> feat/<name>`）。
  - **`scc` 先推分支再領號與主分支自動推送**：執行 `spec:commit`（`scc`）或 `sa-spec finalize` 時，若有設定 Git remote，會**先將目前分支推送至 remote 並同步遠端狀態**，接著才查詢主分支（`master`/`main`）最新可用序號定號，完成 feature 分支提交與推送；自動合併回主分支後，**自動將主分支推送至 remote**。

### v0.2.5
- **支援前端 UI 線框圖（PlantUML Salt Code-as-Wireframe）**：
  - **純文字代碼化線框圖**：在 `uml/` 目錄新增標準 `uml/wireframe.puml`，使用 PlantUML Salt 語法（`@startsalt ... @endsalt`）以純文字定義頁面排版、輸入欄位、選項與按鈕，可直接在 VS Code 渲染預覽，並可納入 Git 版本追蹤。
  - **AI 開發交接前後閉環**：`srs.md` 與 `handoff.md` 新增「UI / 畫面規格」區塊，前端需求直接引用 `uml/wireframe.puml`，供 OpenSpec / Claude Code 精準產出前端元件；純後端需求則標示「無 UI 介面需求」。
  - **版本升級（`sa-spec upgrade`）既有需求防護**：升級時主動掃描既有需求，若偵測到前端介面描述且缺少 wireframe 則發出補齊提示；已標記無 UI 之純後端需求則略過，不盲目覆蓋既有規格。

### v0.2.4
- **序號重複主動告警與重新定號自癒支援**：
  - **唯一性主動檢驗**：`sa-spec check` 與 `sa-spec reindex` 加入重複序號檢測，遇到衝突時即時發出 WARNING 告警並列出衝突目錄與修復建議。
  - **重新定號（Re-number）自癒**：`sa-spec finalize` 智慧支援既有 `REQ-xxx` 目錄重新定號，自動計算最新序號並批次更新目錄內所有檔案的舊編號，零手動修復負擔。
  - **Quick Start 精簡**：移除頂部容易引起誤解的手動建立分支指令，聚焦 AI 工作流。

### v0.2.3
- **自動領號與合併至主分支（Git-Flow 自動化閉環）**：
  - **自動從主分支取新號**：執行 `spec:commit`（`scc`）或 `sa-spec finalize` 時，自動向主分支（`master`/`main`）查詢最新已使用最大序號並定號（`REQ-xxx`），自動置換內部佔位符 `{{REQ_ID}}`，徹底防止多人協作時在 feature 分支發生的號碼撞車與落後問題。
  - **合併支援**：完成 feature 分支 commit 後，支援自動或手動合併回主分支並重新整理 `project/index.md`。

### v0.2.2
- **npm 首頁與專案文件全多語系化（Multi-Language Documentation on npm）**：
  - 新增 `README.en.md`、`README.zh-CN.md`、`README.ja.md`、`README.ko.md` 與 `README.zh-TW.md`。
  - 在 `package.json` 補充 `repository`、`homepage` 與 `bugs` 欄位。

### v0.2.1
- **5 國語言與國際化支援（i18n）**：支援 `zh-TW`、`en`、`zh-CN`、`ja`、`ko`，初始化鎖定語言，技術專有名詞保留英文原文。

### v0.2.0
- **多人協作 Git-Flow 解決方案（延遲綁定序號與零衝突索引）**：引入 `{{REQ_ID}}` 延遲定號與 `sa-spec reindex`。

### v0.1.3
- **支援指令簡寫別名**：`sci` / `scp` / `sca` / `scc`（以及後續的 `spd`）。

### v0.1.2
- **新增 `sa-spec upgrade` 版本升級指令**：同步 `AGENTS.md`、遷移舊版 `uml.puml` 與 `--dry-run` 預覽。

### v0.1.1
- **PlantUML 檔案架構重構**：由單一 `uml.puml` 改為 `uml/` 目錄化結構並強制單檔單圖原則。
