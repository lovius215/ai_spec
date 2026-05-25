# 個人系統分析 AI 工作台

這是一個輕量需求整理工作台。AI 工作流固定為四個指令：

```text
spec:init
spec:propose
spec:analyze
spec:commit
```

## 流程

| 指令 | 用途 |
|---|---|
| `spec:init` | 初始化並載入相關 skills/rules。 |
| `spec:propose` | 使用者提出需求後，整理需求摘要、目標、初步流程與待確認事項。 |
| `spec:analyze` | 先檢查是否與既有需求衝突；無衝突才產出 SRS、UML、OpenAPI、DB Schema 草稿；有衝突則釐清後再次執行 `spec:analyze`。 |
| `spec:commit` | 使用者確認無衝突版本後，將版本歸檔到 `project/`。 |

`spec:analyze` 若發現衝突，只會列出衝突與待釐清問題，不會修改任何需求文件，也不會產出最終文件。釐清後應再次執行 `spec:analyze`，重新檢查並產出草稿；不是進入 `spec:commit`。除非使用者明確指定，任何流程都不能修改其他需求資料夾。

狀態機：

```text
init -> propose -> analyze

analyze 無衝突 -> 產出待確認版本 -> commit
analyze 有衝突 -> 釐清問題 -> analyze
```

## 歸檔文件

每個需求歸檔後包含：

```text
project/
  REQ-001-login/
    srs.md
    uml.puml
    openapi.yaml
    db-schema.md
    history.md
```

## CLI

```bash
sa-spec init
sa-spec new --id REQ-001 --name login
sa-spec check
```

| 指令 | 用途 |
|---|---|
| `sa-spec init` | 建立最小文件骨架。 |
| `sa-spec new --id REQ-001 --name login` | 建立需求資料夾與空白文件。 |
| `sa-spec check` | 檢查基本文件是否存在並顯示狀態。 |
