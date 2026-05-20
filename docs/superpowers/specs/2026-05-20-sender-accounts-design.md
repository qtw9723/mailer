# 발신 계정 관리 기능 설계

## 개요

Gmail 계정(이메일 + 앱 비밀번호)을 DB에 등록해두고, 스케줄 생성/수정 시 발신 계정을 드롭다운으로 선택할 수 있도록 한다. 현재 `sender` 필드(enum: "gmail" | "ms")를 `sender_account_id` FK로 교체한다.

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
- `sender` 컬럼은 그대로 유지 (삭제하지 않음 — 이번 범위 외)

기존 job의 `sender_account_id`는 null로 시작한다. tick 핸들러는 `sender_account_id`가 null인 job을 건너뛰고 오류 로그를 남긴다. 사용자가 각 job을 수정해 발신 계정을 선택하면 정상 동작한다.

---

## Edge Function 변경 (`mailer`)

### 신규 엔드포인트 (APP_PASSWORD 인증 필요)

| 메서드 | 경로 | 동작 |
|--------|------|------|
| GET | `?resource=senders` | 계정 목록 (app_password 마스킹) |
| POST | `?resource=senders` | 계정 추가 |
| DELETE | `?resource=senders&id=` | 계정 삭제 |

- GET 응답에서 `app_password`는 `"••••••••"`로 마스킹해서 반환 (프론트에 평문 노출 안 함)
- tick 핸들러: `job.sender_account_id`로 `sender_accounts`에서 자격증명 조회 후 nodemailer에 전달

### `db.ts` 변경

- `getSenderAccounts()`, `createSenderAccount()`, `deleteSenderAccount()` 함수 추가
- `MailJob` 인터페이스: `sender` → `sender_account_id: string`
- `getDueJobs()`: sender_accounts JOIN해서 자격증명 포함 반환

---

## 프론트엔드 변경

### 라우팅

- `App.jsx`에 `page` state (`'jobs' | 'senders'`) 추가
- 헤더에 "스케줄 | 발신 계정" 탭

### 신규 컴포넌트: `SenderPage.jsx`

- 등록된 계정 카드 리스트 (이메일, 앱 비밀번호 마스킹)
- "계정 추가" 버튼 → `SenderModal.jsx` 열기

### 신규 컴포넌트: `SenderModal.jsx`

- 이메일 입력
- 앱 비밀번호 입력 (보기/숨기기 토글)
- 저장 / 취소

### `src/lib/api.js` 변경

- `getSenders(pw)`, `createSender(data, pw)`, `deleteSender(id, pw)` 추가

### `JobModal.jsx` 변경

- 발신자 라디오(`gmail` / `ms`) → 등록 계정 드롭다운
- 드롭다운 옵션: `{id, email}` 리스트

### `JobCard.jsx` 변경

- `job-badge-gmail` 배지 → 실제 이메일 주소 표시

---

## 데이터 흐름

```
[SenderPage] → createSender → POST ?resource=senders → DB insert
[JobModal]   → 드롭다운에 getSenders 결과 → sender_account_id 저장
[tick]       → getDueJobs (sender_accounts JOIN) → nodemailer(email, app_password)
```

---

## 범위 외 (이번 구현에 포함하지 않음)

- Outlook(MS) 계정 지원 — 향후 추가 가능하도록 `sender_accounts`에 `provider` 컬럼 예약만
- Supabase Vault 암호화
- 계정별 발송 통계
