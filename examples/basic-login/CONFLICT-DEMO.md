# 衝突檢查實戰示範（Conflict Demo）

假設團隊已經歸檔了 `REQ-001-user-login`（本範例目錄），現在另一位成員提出新需求：**「無密碼登入（Magic Link）」**，預計新增或調整 `POST /api/v1/auth/login` 並修改 `users` 資料表的 `password_hash` 為可空（Nullable）。

## 1. `spec:analyze` 執行 `sa-spec impact --json`

AI 在分析階段先透過 `impactIndex` 快速定位重疊資源，不需全量讀取無關需求：

```json
{
  "requirements": [
    {
      "dir": "REQ-001-user-login",
      "isDraft": false,
      "status": "已審核",
      "apis": ["POST /api/v1/auth/login"],
      "tables": ["login_audit_logs", "users"]
    }
  ]
}
```

## 2. 偵測到衝突後的行為（停止產出、只問釐清問題）

因為新需求直接影響 `REQ-001-user-login` 已確認的 `POST /api/v1/auth/login` 契約與 `users.password_hash`（`NOT NULL`）約束，AI **不得產生 SRS / OpenAPI / DB Schema 草稿，也不得修改 `REQ-001-user-login`**，而是回報：

1. **衝突對象**：`REQ-001-user-login`（`openapi.yaml`、`db-schema.md`）
2. **影響範圍**：共用同一個登入路徑與 `users` 密碼非空約束。
3. **待釐清問題（最多 3 題）**：
   - 無密碼登入是否改用獨立端點（例如 `POST /api/v1/auth/magic-link`），保留既有 `/api/v1/auth/login` 不變？
   - `users.password_hash` 若改為 Nullable，既有帳密登入流程是否需要補上「未設定密碼帳號」的錯誤處理？
