# UML 產出規則

## 格式
- UML 圖一律使用 PlantUML。
- PlantUML 檔案副檔名使用 `.puml`，放置於需求的 `uml/` 資料夾中，並以圖型命名（例如 `uml/sequence.puml`、`uml/activity.puml`、`uml/state.puml`）。
- **嚴禁將多張圖混在同一個檔案中**：每個 `.puml` 檔案僅能包含單一組 `@start...` 與 `@end...` 區塊（例如 `@startuml`...`@enduml` 或 `@startsalt`...`@endsalt`），避免 PlantUML 預覽或渲染工具解析失敗或無法開啟。
- 若需求涉及多個面向（例如業務流程、循序互動、狀態轉換），必須依圖型或面向拆分成獨立的 `.puml` 檔案。
- 圖表內容依 `project/system-spec.md` 鎖定之主要語言描述（支援 `zh-TW`、`en`、`zh-CN`、`ja`、`ko`），同一專案內維持單一語言，標準技術術語保留英文。

## 限制
- 不可自行幻想未確認的角色、流程、資料、系統行為或例外情境。
- 不明確的部分必須標示為「待確認」，並回到人工審核。
- UML 必須能追溯到對應需求編號。
- UML 內容不得超出已確認或已標示假設的需求範圍。
- 單張圖應保持精簡清晰，避免過度龐大或單一圖節點過多導致渲染失敗。

## 圖表類型
- Use Case Diagram：用於描述使用者、外部系統與系統功能邊界。
- Activity Diagram：用於描述業務流程、判斷點與例外流程。
- Sequence Diagram：用於描述角色、系統、服務或 API 之間的互動順序。
- Class Diagram：用於描述主要資料物件、屬性與關聯。
- State Diagram：用於描述有明確生命週期的物件狀態。
- Wireframe / Mockup (PlantUML Salt)：用於描述前端介面佈局、表單欄位、按鈕與操作畫面，獨立存放於 `uml/wireframe.puml`（使用 `@startsalt` 與 `@endsalt`）。若需求涉及前端 UI 或使用者操作畫面時按需產出；純後端需求則在 `handoff.md` 標示「無 UI 介面需求」。

## 圖表說明
每張 UML 圖旁邊或同一文件內需補充：
- 圖表目的。
- 對應需求編號。
- 涵蓋範圍。
- 未涵蓋範圍。
- 待確認事項。
