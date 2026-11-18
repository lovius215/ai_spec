# REQ-001 資料庫設計 (DB Schema)

## users
| 欄位 | 型別 | Nullable | 約束 | 說明 |
|---|---|---|---|---|
| id | UUID | NO | PK | 會員主鍵 |
| email | VARCHAR(255) | NO | UNIQUE | 登入 Email |
| password_hash | VARCHAR(255) | NO | - | bcrypt 雜湊 |
| status | VARCHAR(20) | NO | DEFAULT 'active' | active / disabled / locked |
| failed_attempts | INTEGER | NO | DEFAULT 0 | 連續失敗次數 |

## login_audit_logs
| 欄位 | 型別 | Nullable | 約束 | 說明 |
|---|---|---|---|---|
| id | BIGSERIAL | NO | PK | 紀錄主鍵 |
| user_id | UUID | YES | FK -> users(id) | 關聯會員 |
| result | VARCHAR(20) | NO | - | SUCCESS / FAILED |
| created_at | TIMESTAMPTZ | NO | DEFAULT NOW() | 建立時間 |
