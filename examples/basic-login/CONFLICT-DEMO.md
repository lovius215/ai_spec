# 衝突檢查實戰示範（Conflict Demo）

假設團隊已經歸檔了 `REQ-001-user-login`，現在另一位成員提出新需求草稿 **`passwordless-login`（「無密碼登入」）**，同樣觸及 `POST /api/v1/auth/login` 與 `users` 資料表。

## 1. `spec:analyze` 執行 `sa-spec impact --json`

在本範例目錄（`examples/basic-login`）直接執行 `sa-spec impact --json`，CLI 會實測輸出以下碰撞矩陣：

```json
{
  "requirements": [
    {
      "dir": "passwordless-login",
      "isDraft": true,
      "status": "待確認",
      "apis": ["POST /api/v1/auth/login"],
      "tables": ["users"]
    },
    {
      "dir": "REQ-001-user-login",
      "isDraft": false,
      "status": "已審核",
      "apis": ["POST /api/v1/auth/login"],
      "tables": ["login_audit_logs", "users"]
    }
  ],
  "apiCollisions": [
    {
      "endpoint": "POST /api/v1/auth/login",
      "dirs": ["passwordless-login", "REQ-001-user-login"]
    }
  ],
  "tableCollisions": [
    {
      "table": "users",
      "dirs": ["passwordless-login", "REQ-001-user-login"]
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
