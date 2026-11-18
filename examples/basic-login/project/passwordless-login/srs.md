# {{REQ_ID}} 無密碼登入（衝突示範草稿）

- 狀態：待確認
- 版本：0.1.0

## 摘要
新增無密碼 Magic Link 登入流程（刻意與 `REQ-001` 共用 `/api/v1/auth/login` 與 `users` 以示範 `sa-spec impact` 碰撞偵測）。

## 功能需求
1. 使用者輸入 Email 後請求寄送 Magic Link。
2. 預期與 `REQ-001` 共用登入端點與 `users` 資料表，需先釐清是否拆分端點。

## 驗收條件
- [ ] 待釐清與 `REQ-001` 之 API／DB 衝突後補齊。
