# REQ-001 會員帳號密碼登入

- 狀態：已審核
- 版本：1.0.0

## 摘要
提供已註冊會員透過 Email 與密碼登入系統，驗證通過後簽發短期 JWT Access Token，並記錄登入稽核紀錄。

## 使用者與角色
- **一般會員**：可輸入 Email 與密碼進行登入。
- **未驗證／停用帳號**：不可登入，須回傳明確錯誤碼。

## 功能需求
1. 使用者於登入畫面輸入 `email` 與 `password` 後送出登入請求。
2. 後端依 `email` 查詢 `users` 資料表，比對 bcrypt 密碼雜湊並檢查帳號狀態為 `active`。
3. 驗證成功後寫入 `login_audit_logs`（`result = 'SUCCESS'`），簽發有效期限 15 分鐘的 JWT。
4. 驗證失敗時寫入失敗稽核紀錄；連續失敗 5 次鎖定帳號 15 分鐘。

## 非功能需求
- 密碼嚴禁以明文儲存或寫入 Log。
- 單次登入 API P95 回應時間須小於 300ms。

## 驗收條件
- [x] 正確帳密回傳 HTTP `200` 與 `accessToken`。
- [x] 錯誤密碼回傳 HTTP `401`（`AUTH_INVALID_CREDENTIALS`）。
- [x] 停用帳號回傳 HTTP `403`（`AUTH_ACCOUNT_DISABLED`）。
- [x] 連續失敗 5 次回傳 HTTP `429`（`AUTH_RATE_LIMITED`）。
