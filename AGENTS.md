# 專案角色

你是一位資深系統分析協作者，負責把需求想法整理成可確認、可歸檔、可檢查的系統分析文件。

# 核心交付物

每個需求歸檔時固定包含：

- `srs.md`：需求規格。
- `uml/`：UML 圖目錄（依面向拆分為獨立 `.puml` 檔，如 `main.puml`、`sequence.puml` 等，禁止單檔混放多圖）。
- `openapi.yaml`：OpenAPI 草稿。
- `db-schema.md`：DB Schema 草稿。
- `handoff.md`：給 OpenSpec 或其他 AI 開發工具的開發交接摘要。
- `history.md`：版本歷程。

# 指令流程

使用四個指令，並支援簡寫別名（兩者等價）：

| 指令 | 簡寫 | 用途 | 規則 |
|---|---|---|---|
| `spec:init` | `sci` | 初始化 | 載入並遵守 `AGENTS.md`、`skills/system-analysis/SKILL.md` 與必要規則，確認 `project/` 結構是否存在。 |
| `spec:propose` | `scp` | 提出需求 | 使用者提出需求後，自動依需求名稱建立並切換至專屬 feature 分支（`feat/<name>`，若已在 feature branch 則沿用），建立草稿目錄（內部使用 `{{REQ_ID}}` 佔位），整理需求摘要、目標、初步流程與待確認事項，不歸檔、不修改既有需求。 |
| `spec:analyze` | `sca` | 分析與起草 | 先檢查新需求是否與 `project/` 內所有既有需求衝突；無衝突才產出 SRS、UML、OpenAPI、DB Schema 草稿；有衝突則只列出衝突與待釐清問題，待使用者釐清後再次執行 `spec:analyze`（或 `sca`）。 |
| `spec:commit` | `scc` | 確認歸檔 | 只把使用者已確認的版本歸檔到該需求資料夾，自動向主分支確認最新可用序號定號（`REQ-xxx`）、替換佔位符，更新 `project/index.md`、`project/system-spec.md` 與 `history.md`，建立本機 Git commit 後，自動切換回主分支並完成合併。 |

# 重要限制

- 語言與國際化規範（i18n）：
  - 支援語系：繁體中文 (`zh-TW`，台灣常用語)、英文 (`en`)、簡體中文 (`zh-CN`)、日文 (`ja`)、韓文 (`ko`) 共 5 種語言。
  - 初始化語言鎖定：執行 `spec:init` (或 `sci`) 時，若使用者未明確指定語言，AI 必須主動詢問使用者選擇上述 5 種語言之一，不得自行預設；選定後將主要語言寫入 `project/system-spec.md`。
  - 全專案語言單一純粹：後續所有需求文件（`srs.md`、`uml/`、`openapi.yaml`、`db-schema.md`、`handoff.md`、`history.md`）必須 100% 統一使用該語言，不得在同一專案內混雜多種語言。
  - 專有名詞保留原生英文：在中文、日文、韓文等非英語系模式下，業界公認標準之技術術語（如 REST API, Webhook, JWT, OAuth 2.0, Payload, Idempotency, Redis 等）強制保留原生英文，嚴禁生硬直譯。
  - 升級保護：執行 `sa-spec upgrade` 時，自動偵測並繼承現有專案語言，不變更語言設定。
- `spec:init` 必須檢查 Git 狀態：若 Git 未安裝，提醒使用者後續歸檔會使用版本管理但不可中斷初始化；若 Git 已安裝且目前目錄尚未初始化為 Git repository，則自動執行 `git init`；若已是 Git repository，僅回報狀態，不重複初始化。
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
- `uml/` 內的 UML 圖不限單一 UML 圖型；`spec:analyze` 必須依需求選擇最能說明流程、互動、狀態或資料關係的 UML 圖，例如活動圖、循序圖、使用案例圖、狀態圖或類別圖，不可為了固定格式硬產生活動圖。**嚴禁將多張圖混在同一個檔案中**，必須在需求資料夾下的 `uml/` 目錄拆分成獨立的 `.puml` 檔案（例如 `uml/main.puml`、`uml/sequence.puml`、`uml/state.puml`），且每個檔案只能包含一組 `@startuml` 與 `@enduml`，以避免 PlantUML 渲染或預覽失敗。
- 一次最多問 3 個待確認問題，優先詢問會影響範圍、資料、權限、API、DB 或驗收的問題。

# 衝突檢查重點

`spec:analyze` 至少檢查：

- 是否與既有需求目標或流程重疊。
- 是否改變既有角色、權限或資料存取規則。
- 是否影響既有 API 路徑、request/response 或狀態碼。
- 是否影響既有 DB Table、欄位、唯一性或關聯。
- 是否與既有驗收條件矛盾。

# 衝突處理流程

若 `spec:analyze` 發現衝突：

1. 列出衝突的既有需求編號與檔案。
2. 說明衝突原因與影響範圍。
3. 提出最多 3 個待釐清問題。
4. 停止產出 SRS、UML、OpenAPI、DB Schema。
5. 等使用者釐清後，再由使用者執行 `spec:analyze` 繼續。
6. 不得修改任何既有需求文件。

# 狀態機

```text
init (sci) -> propose (scp) -> analyze (sca)

analyze 無衝突 -> 產出待確認版本 -> commit (scc)
analyze 有衝突 -> 釐清問題 -> analyze (sca)

commit (scc) -> 歸檔 -> 本機 Git commit
```

# 歸檔結構

```text
project/
  index.md
  REQ-001-name/
    srs.md
    uml/
      main.puml
    openapi.yaml
    db-schema.md
    handoff.md
    history.md
```


<claude-mem-context>
# Memory Context

# [ai] recent context, 2026-05-25 9:41pm GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,242t read) | 491,064t work | 96% savings

### May 5, 2026
S8 SA Spec VSCode Extension — Add quick command chips, Enter-to-submit, and markdown rendering to sidebar UI (May 5 at 4:00 PM)
S9 SA Spec VSCode Extension — How to test the sidebar and use the three providers (May 5 at 4:05 PM)
S10 SA Spec Activity Bar icon not showing — fixed SVG to use currentColor for VSCode mask-image rendering (May 5 at 4:05 PM)
S11 SA Spec sidebar not rendering — fixed package.json missing "type": "webview" and SVG icon not visible in Activity Bar (May 5 at 4:08 PM)
S12 Add Anthropic Claude API provider support to the SA Spec VSCode extension sidebar chat (May 5 at 4:10 PM)
S13 Add VSCode sidebar support to /Users/lovius/ai/ project — user wants a free-form Claude chat panel in the sidebar, not just a fixed SA Spec workflow tool (May 5 at 4:16 PM)
S14 Convert VSCode SA Spec extension sidebar from SA-workflow-only tool into a general-purpose free-form Claude chat panel (May 5 at 4:20 PM)
S15 Add "claudecode" provider to VSCode sidebar extension — delegates chat to local claude CLI subprocess via stdin, no API key required (May 5 at 4:21 PM)
S17 Add VSCode sidebar support to /Users/lovius/ai project, similar to OpenSpec, with command invocation capability (May 5 at 4:25 PM)
S18 Add VSCode Chat Participant sidebar to /Users/lovius/ai (sa-spec extension), replacing old Webview sidebar with native @sa-spec Chat integration backed by Claude Code CLI (May 5 at 4:33 PM)
77 4:40p 🔵 project/ Contains Blank Template Files; .DS_Store Reveals Previous REQ-001-pomodoro-timer
79 4:42p 🟣 extension.js v2: Full WebView Workbench Added Alongside Chat Participant
80 4:43p 🟣 package.json Updated to Declare WebView Workbench in Activity Bar
81 " ✅ readme.md VS Code Extension Section Rewritten to Document v2 Workbench
82 " 🔴 extension.js: OutputChannel Leak Fixed and Artifact Button Label Corrected
83 4:46p 🔵 Codex CLI Is Available on This Machine, Bundled with OpenAI VS Code Extension
84 " ⚖️ VSCode Chat Sidebar Integration Preferred Over SA Spec Extension
85 4:54p 🟣 SA Spec VSCode Extension Rebuilt as Native Sidebar Chat with Codex/Claude Dual-Provider Support
86 " 🔵 Codex CLI `--ask-for-approval` Flag Does Not Exist; Correct Form is `-a never` at Top Level
87 " 🔄 extension.js Stripped to Pure Native VSCode Chat Participant — Custom Webview Sidebar Removed
88 4:55p ✅ package.json Cleaned Up to Match Pure Chat Participant Architecture
89 " ✅ readme.md Updated to Document Final Native VSCode Chat Integration
90 " 🔵 Final Verification Confirms All Custom Webview/Sidebar Code Fully Removed
91 " ✅ package.json activationEvents Set to `onChatParticipant:saSpec` for Explicit Extension Activation
92 " ✅ launch.json Debug Configuration Renamed to Reflect Native Chat Participant Architecture
97 " 🔵 Codex CLI Installed via VSCode ChatGPT Extension, Claude via ~/.local/bin
98 5:01p 🔄 CLI Invocation Refactored to Use `resolveProviderCommand` and `buildProcessEnv` Helpers
99 5:02p 🟣 Robust CLI Path Resolution Added for Codex and Claude Inside VSCode Extension Host
100 " ✅ package.json Gains `saSpec.codexPath` and `saSpec.claudePath` User-Configurable CLI Override Settings
101 " 🔵 VSCode Extensions Directory Scan Logic Validated — Codex Binary Correctly Auto-Discovered
102 5:05p 🔴 `--skip-git-repo-check` Added to Codex Exec Args to Support Non-Git Workspaces
103 " 🔵 `codex exec --skip-git-repo-check` Confirmed Working with `--output-last-message` Pattern
104 5:09p 🔵 openspec NPM 安裝後在 VSCode Codex 側邊欄顯示 /prompts:opsx-apply 命令
105 " 🔵 openspec 透過 ~/.codex/prompts/ 目錄向 VSCode Codex 側邊欄註冊命令
106 " 🔵 openspec NPM 套件為 @fission-ai/openspec v1.3.1，主項目為 VSCode 擴充功能
107 5:10p 🔵 opsx Codex prompt 文件結構：YAML frontmatter 的 argument-hint 欄位控制側邊欄顯示
108 " 🔵 opsx-apply 工作流程：透過 openspec CLI 讀取 contextFiles 實現 AI 驅動任務執行
109 " 🟣 新增五個 SA Spec Codex prompt 文件，實現系統分析需求管理工作流程
110 " 🔵 /Users/lovius/ai 專案結構確認：含 src/、templates/ 目錄與未追蹤的 VSCode 擴充功能文件
113 5:14p 🟣 Sidebar Multi-Provider AI Support: Claude + Gemini
114 " 🔵 Existing Gemini Provider Test Files Found in thedotmack Plugin Marketplace
115 " 🔵 Gemini CLI Fully Installed with Parallel Extension/Skills Architecture to Claude
116 5:15p 🔵 No Custom Commands or Gemini Skills/Extensions Currently Installed
117 " 🔵 Multi-Provider Agent Architecture Already Exists: GeminiAgent.ts, SDKAgent.ts, OpenRouterAgent.ts
118 " 🔵 Gemini CLI Extension/Skill Architecture: Storage Paths, Activation Mechanism, and Manifest Format
119 5:16p 🟣 Scaffolded Directory Structure for Sidebar Multi-Provider Commands and Skills
120 " 🟣 5 SA Spec Claude Slash Commands Created at Global User Level
121 " 🟣 5 SA Spec Gemini Custom Commands Created as TOML Files — Parity with Claude Commands
122 5:17p 🟣 Gemini sa-spec Skill Created — Lazy-Load Trigger for SA Spec Workflows
123 " 🟣 Multi-Provider SA Spec Sidebar Support Fully Deployed and Verified
124 " 🟣 readme.md Updated with Three-Provider Sidebar Command Reference Table
125 5:51p 🔵 sa-spec CLI Tool Structure in /Users/lovius/ai
126 5:52p 🔵 sa-spec is a Dual-Purpose VSCode Extension and npm CLI Package
127 " 🟣 Multi-Provider AI Prompt Templates Added to sa-spec Package
128 " 🟣 sa-spec install-prompts Command Added to CLI
129 " 🟣 sa-spec install-prompts Command Successfully Landed in src/cli.js
130 " ✅ package.json check Script Extended to Validate All JS Entry Points
131 5:53p 🟣 sa-spec install-prompts Verified End-to-End: 16 Files Deployed to Dotfiles
132 " ✅ readme.md Updated to Document install-prompts and Cross-Workspace Setup Flow
133 " 🔵 sa-spec Package Files Are All Untracked in Git — Never Committed

Access 491k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
