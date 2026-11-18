# REQ-001 開發交接摘要 (Handoff)

- 狀態：已審核

## 1. 開發目標
實作會員 Email + 密碼登入流程與 JWT Access Token 簽發。

## 2. 要開發什麼
- `POST /api/v1/auth/login` 登入端點與輸入驗證。
- `users` 密碼雜湊驗證、失敗鎖定計數與 `login_audit_logs` 稽核寫入。
- 依 `uml/wireframe.puml` 實作登入表單與錯誤狀態顯示。

## 3. 不要開發什麼
- 本需求不包含註冊、忘記密碼重設與 OAuth 第三方登入。

## 4. 來源文件索引
- `srs.md`
- `uml/sequence.puml`
- `uml/wireframe.puml`
- `openapi.yaml`
- `db-schema.md`

## 5. 角色與權限
- 僅 `status = 'active'` 之會員可成功取得 JWT；`disabled` 回傳 `403`。

## 6. API 契約
- `POST /api/v1/auth/login`：詳見 `openapi.yaml`，成功回傳 `200`（`accessToken`、`expiresIn`），失敗回傳 `401` / `403` / `429`。

## 7. DB 變更
- 新增或確認 `users` 與 `login_audit_logs` 資料表結構（詳見 `db-schema.md`）。

## 8. UI / 畫面規格
- 請參照 `uml/wireframe.puml` 實作登入畫面與表單驗證提示。

## 9. 驗收條件
- 正常帳密登入回 `200`、錯誤密碼回 `401`、停用回 `403`、連續 5 次失敗回 `429`。

## 10. 開發限制
- 密碼與 JWT Secret 不得寫死於程式碼或輸出至日誌。

## 11. 建議實作範圍
- 優先完成後端 `AuthService` 與單元測試，再串接前端登入表單。
