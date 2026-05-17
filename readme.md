# 個人系統分析 AI 工作台使用說明

本專案是個人用系統分析 AI 工作台，用來協助把需求想法整理成可審核、可追溯、可驗收的系統分析文件。

AI 會協助釐清需求、產出草稿、提醒待確認事項、進行初步風險評估，並維護需求歷程。所有文件在人工確認前都只能視為草稿或待確認，不會自動標示為已審核。

## npm CLI

`sa-spec` 是 npm 安裝的系統分析 prompt kit，不做 VS Code extension。安裝後會把指令模板放到 Codex、Claude Code、Gemini CLI 與 Gemini Code Assist 各自支援的全域 commands/prompts 位置，讓既有 VS Code 側邊欄出現可用指令提示。

```bash
npm install -g sa-spec
sa-spec install
```

未全域安裝時也可以直接執行：

```bash
npx sa-spec install
```

`sa-spec install` 只會安裝側邊欄 prompt commands，不會安裝或註冊任何 VS Code extension。Gemini Code Assist 會寫入 VS Code 使用者設定的 `geminicodeassist.customCommands`。

可用指令：

- `npx sa-spec install`：安裝 Codex、Claude、Gemini CLI、Gemini Code Assist 側邊欄全域指令。
- `npx sa-spec init`：初始化 `project/` 與必要規則骨架。
- `npx sa-spec doctor`：檢查目前工作目錄是否缺少核心檔案。
- `npx sa-spec status`：查看系統規格書與需求索引摘要。
- `npx sa-spec install-prompts`：安裝 Codex、Claude、Gemini CLI、Gemini Code Assist 側邊欄全域指令。
- `npx sa-spec template system-spec --stdout`：輸出系統規格書模板。
- `npx sa-spec template req --id REQ-001 --name login`：建立需求模板資料夾。

若要在其他 VS Code 工作區直接使用 Codex、Claude、Gemini 側邊欄指令，安裝 npm package 後執行一次：

```bash
sa-spec install-prompts
```

或未全域安裝時：

```bash
npx sa-spec install-prompts
```

## 側邊欄 Prompt Commands

使用 Codex、Claude、Gemini 各自的 VS Code 側邊欄時，可直接使用全域 commands。這些提示來自各工具原生的 prompt/command 機制，不需要 VS Code extension。

| 工具 | 指令 |
|---|---|
| Codex | `/prompts:spec-init`、`/prompts:spec-propose`、`/prompts:spec-apply`、`/prompts:spec-review`、`/prompts:spec-status` |
| Claude | `/spec-init`、`/spec-propose`、`/spec-apply`、`/spec-review`、`/spec-status` |
| Gemini CLI | `/spec:init`、`/spec:propose`、`/spec:apply`、`/spec:review`、`/spec:status` |
| Gemini Code Assist | `/spec-init`、`/spec-propose`、`/spec-apply`、`/spec-review`、`/spec-status` |

Gemini 也已安裝 `sa-spec` skill，當需求與系統分析、SRS、風險、歷程或 `spec:*` 流程相關時可自動套用。

## 使用前先知道

- 請使用繁體中文描述需求。
- 不需要一開始就把需求寫完整，可以先提供想法、目標或情境。
- AI 不會自行幻想未確認的業務規則、角色、流程、資料或系統行為。
- 資訊不足時，AI 會先提出待確認問題。
- 每次新增或修改需求時，AI 都會主動進行風險評估。
- 每次需求異動都必須更新對應需求的 `history.md`。

## 目錄用途

```text
skills/
  system-analysis/
    SKILL.md

rules/
  system-spec.md
  estimation.md
  spec.md
  wireframe.md
  uml-style.md
  db-table.md
  risk.md
  history.md
  review.md
  file-style.md

project/
  index.md
  system-spec.md
```

| 目錄或檔案 | 用途 |
|---|---|
| `skills/system-analysis/SKILL.md` | 系統分析工作流程 |
| `rules/` | 各類文件產出與審核規則 |
| `project/system-spec.md` | 整體系統規格書 |
| `project/index.md` | 需求索引 |
| `project/REQ-xxx-需求短名/` | 單一需求的文件資料夾 |

## 指令使用方式

可以使用 `spec:` 指令明確告訴 AI 目前要執行哪一種需求文件流程。

| 指令 | 用途 | 說明 |
|---|---|---|
| `spec:init` | 初始化系統規格書 | AI 依序詢問整個系統的目標、角色、流程、模組、資料與外部介接，建立整體系統規格書草稿與初始結構。 |
| `spec:propose` | 整理需求草稿 | 根據目前描述整理需求草稿；資訊不足時，先列待確認問題。 |
| `spec:apply` | 套用已確認內容 | 只更新需求文件、需求索引、風險評估與需求歷程，不修改實際產品程式碼。 |
| `spec:review` | 審核文件一致性 | 檢查 SRS、Wireframe、UML、API、DB Table、風險與歷程是否一致。 |
| `spec:status` | 查看需求狀態 | 彙整需求狀態、待確認事項、風險與缺漏文件。 |

### 指令範例

```text
spec:init
```

```text
spec:propose 我想新增會員登入功能
```

```text
spec:apply REQ-001
```

```text
spec:review REQ-001
```

```text
spec:status REQ-001
```

`spec:init` 適合在專案一開始使用，讓 AI 先把整體系統規格書脈絡問清楚。`spec:apply` 預設只代表「套用已確認內容到需求文件」。若指令缺少需求編號或必要上下文，AI 會先列待確認事項，不會直接套用變更。若遇到高風險或影響範圍不明，文件狀態會維持 `待確認`。

風險評估、跨文件一致性檢查與需求歷程更新屬於自動觸發的內建行為，不需要額外輸入獨立指令。

人日估算屬於系統分析輸出的一部分。當你用 `spec:init` 建立整體系統規格書，或用 `spec:apply` 更新需求時，AI 應同時評估是否需要補上或更新估算前提與人日總覽。

## 系統規格書

除了單一需求文件，專案現在也支援整體系統規格書，用來讓人快速理解整個系統是做什麼的。

- 規則檔：`rules/system-spec.md`
- 文件位置：`project/system-spec.md`
- 估算規則：`rules/estimation.md`

系統規格書適合描述：

- 系統摘要與業務目標
- 範圍與不在範圍
- 使用者與角色
- 系統邊界
- 主要功能模組
- 核心流程總覽
- 關鍵資料主題
- 外部系統與介接
- 非功能需求總覽
- 已知限制與假設
- 相關需求清單
- 估算總覽

## 常見使用方式

### 新增需求

可以這樣請 AI 協助：

```text
我想新增一個會員登入需求，先幫我整理需求草稿。
```

AI 會先判斷資訊是否足夠。若資訊不足，會列出待確認問題；若可先建立草稿，會協助規劃需求資料夾，並產出或更新：

- `project/index.md`
- `project/REQ-xxx-需求短名/spec.md`
- `project/REQ-xxx-需求短名/risk.md`
- `project/REQ-xxx-需求短名/history.md`

### 修改既有需求

可以這樣描述異動：

```text
請修改 REQ-001，登入失敗 5 次後需要鎖定帳號 15 分鐘。
```

AI 會先整理本次變更點與可能受影響文件，再更新相關文件。每次修改都會同步更新：

- 受影響的需求文件
- `risk.md`
- `history.md`
- 必要時更新 `project/index.md`

### 產出 SRS

可以這樣請 AI 產出：

```text
請依照目前資訊產出 REQ-001 的 SRS 草稿。
```

SRS 會遵守 `rules/spec.md`，至少包含需求摘要、業務目標、角色、前置條件、主要流程、例外流程、功能需求、非功能需求、業務規則、驗收條件與待確認事項。

### 產出 Wireframe

可以這樣請 AI 產出：

```text
請依照 REQ-001 的 SRS 產出 Wireframe 草稿。
```

Wireframe 會遵守 `rules/wireframe.md`。若 SRS 沒有提到某個欄位、按鈕、流程或錯誤狀態，AI 不會直接當成正式內容，而會列為待確認事項。

### 產出 UML

可以指定圖表類型：

```text
請幫 REQ-001 產出 Use Case Diagram 和 Sequence Diagram。
```

UML 會遵守 `rules/uml-style.md`，使用 PlantUML 與 `.puml` 檔案，並標示對應需求編號、涵蓋範圍、未涵蓋範圍與待確認事項。

### 產出 DB Table

可以這樣請 AI 產出：

```text
請依照 REQ-001 產出 DB Table 草稿。
```

DB Table 設計會遵守 `rules/db-table.md`。若資料庫類型、欄位型別、唯一性、刪除規則、個資或稽核需求不明確，AI 會標示為待確認。

### 審核文件

可以請 AI 協助檢查草稿：

```text
請審核 REQ-001 的 SRS、Wireframe、risk.md 和 history.md 是否一致。
```

審核會遵守 `rules/review.md`，重點包含：

- 是否有未確認假設被寫成正式需求。
- SRS、Wireframe、UML、API、DB Table 是否一致。
- 驗收條件是否可驗證。
- 風險評估是否完成。
- 歷程是否已更新。

## 標準工作流程

1. 使用者提出需求想法或變更內容。
2. AI 判斷是新增需求、修改需求、審核需求，或產出特定文件。
3. 若資訊不足，AI 先提出待確認問題。
4. 若可產出草稿，AI 建立或更新對應需求文件。
5. AI 主動產生或更新風險評估。
6. AI 追加需求歷程。
7. AI 列出需要人工確認的事項。
8. 使用者確認後，文件才可進一步標示為 `已審核`。

## 建議需求資料夾格式

```text
project/
  index.md
  REQ-001-login/
    spec.md
    wireframe.md
    history.md
    risk.md
    uml/
      use-case.puml
      sequence.puml
    api.md
    db-table.md
```

每個需求至少應包含：

- `spec.md`：需求規格。
- `history.md`：需求歷程。
- `risk.md`：風險評估。

若需求涉及畫面，加入 `wireframe.md`。若需求涉及 UML、API 或 DB Table，依需求加入 `uml/`、`api.md`、`db-table.md`。

## 文件狀態

| 狀態 | 說明 |
|---|---|
| `草稿` | AI 已根據目前資訊整理，但尚未人工確認 |
| `待確認` | 存在會影響範圍、權限、資料、流程或驗收條件的問題 |
| `已審核` | 已經使用者人工確認 |

AI 不會自行把文件標示為 `已審核`。

## 人工審核停點

以下情況完成後，需要使用者人工確認：

- 需求摘要草稿完成。
- SRS 草稿完成。
- Wireframe 草稿完成。
- UML 草稿完成。
- API 或資料模型草稿完成。
- DB Table 設計草稿完成。
- 風險等級為高。
- 有待確認事項會影響需求範圍、權限、資料或驗收條件。

## 建議提供給 AI 的資訊

新增或修改需求時，建議盡量提供：

- 需求目標。
- 使用者或角色。
- 主要操作流程。
- 例外情境。
- 權限限制。
- 需要記錄或查詢的資料。
- 是否涉及畫面。
- 是否涉及 API、DB Table、UML 或外部系統。
- 驗收方式或成功標準。

若尚未確定，可以直接說明「尚未確認」，AI 會把它整理到待確認事項。

## 使用範例

```text
我想新增一個後台公告管理需求，管理員可以新增、編輯、下架公告。請先幫我整理 SRS 草稿，資訊不足的地方請列待確認問題。
```

```text
請依照 REQ-002 的 spec.md 產出 wireframe.md，若發現 SRS 沒提到的欄位或狀態，請列為待確認事項。
```

```text
請修改 REQ-003，新增匯出 CSV 功能，並同步更新風險評估與需求歷程。
```

```text
請審核 REQ-004 的 SRS 與 DB Table 是否一致，並檢查是否有未確認假設。
```

## 重要提醒

- AI 產出的內容預設是草稿。
- 未確認內容必須留在待確認事項，不可混入正式需求。
- Wireframe 若發現 SRS 缺口，需回到 SRS 補待確認事項。
- DB Table 欄位、Index、Constraint 必須能追溯到需求或明確技術理由。
- 任何需求異動都要同步更新風險評估與需求歷程。
