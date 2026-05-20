# 발신 계정 관리 기능 설계

## 개요

Gmail 계정(이메일 + 앱 비밀번호)을 DB에 등록해두고, 스케줄 생성/수정 시 발신 계정을 드롭다운으로 선택할 수 있도록 한다. **기존 `sender` enum(gmail/ms) + 환경변수 방식은 그대로 유지**하며, `sender_account_id`가 설정된 경우에만 DB 자격증명을 우선 사용한다.

---

## DB 변경

### 신규 테이블: `sender_accounts`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| email | text | Gmail 주소 |
| app_password | text | 앱 비밀번호 (평문 저장) |
| created_at | timestamptz | |

### `mail_jobs` 테이블 변경

- `sender_account_id` uuid FK 추가 (`sender_accounts.id` 참조, nullable)
- `sender` 컬럼은 그대로 유지 (기존 동작 보존)

기존 job의 `sender_account_id`는 null — 기존 `sender` enum + 환경변수 방식으로 계속 동작한다.

---

## Edge Function 변경 (`mailer`)

### 신규 엔드포인트 (APP_PASSWORD 인증 필요)

| 메서드 | 경로 | 동작 |
|--------|------|------|
| GET | `?resource=senders` | 계정 목록 (app_password 마스킹) |
| POST | `?resource=senders` | 계정 추가 |
| DELETE | `?resource=senders&id=` | 계정 삭제 |

- GET 응답에서 `app_password`는 `"••••••••"`로 마스킹 반환
- 기존 CRUD 엔드포인트(`?id=` 방식) 그대로 유지

### tick 핸들러 변경

```
sender_account_id 있음 → DB에서 email + app_password 조회 → nodemailer 실행
sender_account_id 없음 → 기존 sender enum + 환경변수 방식 (변경 없음)
```

### `db.ts` 변경

- `getSenderAccounts()`, `createSenderAccount()`, `deleteSenderAccount()` 추가
- `getSenderAccountById(id)` 추가 (tick에서 자격증명 조회용)
- `MailJob` 인터페이스에 `sender_account_id: string | null` 추가 (기존 `sender` 유지)

---

## 프론트엔드 변경

### 라우팅

- `App.jsx`에 `page` state (`'jobs' | 'senders'`) 추가
- 헤더에 "스케줄 | 발신 계정" 탭

### 신규 컴포넌트: `SenderPage.jsx`

- 등록된 계정 카드 리스트 (이메일, 앱 비밀번호 마스킹)
- "계정 추가" 버튼 → `SenderModal.jsx` 열기
- 계정 삭제 버튼

### 신규 컴포넌트: `SenderModal.jsx`

- 이메일 입력
- 앱 비밀번호 입력 (보기/숨기기 토글)
- 저장 / 취소

### `src/lib/api.js` 변경

- `getSenders(pw)`, `createSender(data, pw)`, `deleteSender(id, pw)` 추가

### `JobModal.jsx` 변경

- 기존 발신자 라디오(`gmail` / `ms`) 아래에 "등록된 계정으로 발송" 선택 추가
- 등록된 계정이 있을 때 드롭다운 표시 (`sender_account_id` 저장)
- 선택 안 하면 기존 방식 그대로

### `JobCard.jsx` 변경

- `sender_account_id`가 있으면 해당 이메일 주소 표시, 없으면 기존 Gmail/Outlook 배지 표시

---

## 데이터 흐름

```
[SenderPage] → createSender → POST ?resource=senders → DB insert
[JobModal]   → getSenders 드롭다운 → sender_account_id 선택 저장 (선택사항)
[tick]       → job.sender_account_id 있으면 DB 계정 사용, 없으면 기존 env var
```

---

## 범위 외

- Outlook(MS) 계정 지원
- Supabase Vault 암호화
- 계정별 발송 통계
