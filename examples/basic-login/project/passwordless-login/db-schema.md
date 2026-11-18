# {{REQ_ID}} 資料庫設計草稿 (DB Schema)

## users
| 欄位 | 型別 | Nullable | 約束 | 說明 |
|---|---|---|---|---|
| password_hash | VARCHAR(255) | YES | - | 擬放寬為可空（與 REQ-001 衝突，待確認） |
