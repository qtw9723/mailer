# Mailer

주기적으로 메일을 자동 발송하고, Grafana 지표를 매일 리포트로 만들어 메일로 보내 주는 웹 앱입니다.
메일 작업을 화면에서 등록·관리하고, 로그는 Gemini로 분석해 점검 포인트를 요약합니다.

## 주요 기능

### 메일 발송 자동화
- 작업(job) 단위로 제목, 본문, 수신자(여러 명), 첨부파일, 발송 간격(분)을 설정
- 발신 계정 선택: Gmail / Outlook SMTP 기본 계정 또는 화면에서 등록한 발신 계정
- 제목에 발송 순번(`[n]`)을 붙이는 옵션, 작업 활성/비활성 토글, 드래그로 순서 변경
- 첨부파일은 Supabase Storage에 저장하고 발송 시점에 내려받아 첨부
- 발송 성공/실패 이력을 `send_log`에 기록
- 스케줄러가 `POST /api/mailer/tick`을 주기적으로 호출하면, 마지막 발송 후 간격이 지난 작업만 병렬로 발송

### Grafana 일일 리포트
- Grafana(Prometheus·Elasticsearch)에서 서버 지표와 앱별 ERROR 로그를 조회
- Gemini가 로그를 분석해 점검 포인트 요약과 로그 유형 분류를 생성 (일시 오류는 자동 재시도)
- 설정 탭에서 수신자, 발송 시각(KST, 시 단위), 자동 발송 on/off를 관리
- 스케줄러가 매시간 `GET /api/grafana/tick`을 호출하면 설정된 시각에만 메일 발송
- 로그 유형 관리, 쿼리 목록 편집과 쿼리 테스트 기능 제공 (설정 탭)

### 공통
- 공용 비밀번호 로그인, 커맨드 팔레트(`cmdk`)

## 기술 스택

| 영역 | 사용 |
|------|------|
| 프론트엔드 | React 19, Vite, React Router, Tailwind CSS 4, dnd-kit, cmdk, sonner |
| 백엔드 | Node.js, Express, Nodemailer |
| 데이터 | Supabase (PostgreSQL, Storage) |
| AI | Google Gemini (`@google/generative-ai`) |
| 테스트 | Vitest, Testing Library, Supertest |
| 배포 | Vercel (Serverless Function + SPA rewrite) |

## 프로젝트 구조

```
├── api/                 Vercel 서버리스 진입점
├── server/
│   ├── index.js         Express 앱 (로컬 개발용 서버)
│   ├── smtp.js          Gmail/Outlook SMTP 발송
│   ├── routes/          mailer, grafana API 라우터
│   └── grafana/         조회·분석·리포트·스케줄·설정 로직
├── src/
│   ├── pages/           Hub, Mailer, Grafana, Login
│   ├── components/      mailer, grafana, shared UI
│   └── lib/             API 클라이언트, 인증, 날짜·이메일 유틸
├── supabase/
│   ├── migrations/      테이블 스키마 (SQL)
│   └── functions/       Edge Function 버전의 발송 로직
└── docs/                설계 문서·계획
```

## API 개요

관리용 API는 로그인 비밀번호가 필요하고, `tick` 엔드포인트는 스케줄러가 호출합니다.

| 경로 | 설명 |
|------|------|
| `GET/POST/PATCH/DELETE /api/mailer/jobs` | 메일 작업 CRUD |
| `GET/POST/DELETE /api/mailer/senders` | 발신 계정 관리 |
| `POST /api/mailer/tick` | 발송 시점이 된 작업 일괄 발송 |
| `GET /api/grafana/report` | 지표·로그 리포트 조회 |
| `POST /api/grafana/analyze` | 로그 AI 분석 실행 |
| `GET/PUT /api/grafana/settings` | 발송 설정 조회/수정 |
| `GET /api/grafana/tick` | 설정 시각이면 리포트 메일 발송 (`CRON_SECRET` 필요) |

## 시작하기

### 요구 사항
- Node.js (Vite 8 지원 버전, 최신 LTS 권장)
- Supabase 프로젝트 (`supabase/migrations`의 SQL 적용)
- Gmail 또는 Outlook 앱 비밀번호

### 실행

```bash
npm install
cp .env.example .env   # 값을 채웁니다
npm run dev            # Vite(프론트) + Express(API) 동시 실행
```

### 환경 변수

`.env.example`을 참고하세요. 주요 항목은 다음과 같습니다.

| 변수 | 용도 |
|------|------|
| `APP_PASSWORD` | 로그인 비밀번호 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | DB·Storage 접근 (서버 전용) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` / `MS_USER`, `MS_APP_PASSWORD` | 기본 발신 계정 |
| `GRAFANA_URL`, `GRAFANA_TOKEN` | Grafana 조회 |
| `CRON_SECRET` | `tick` 엔드포인트 보호 |

`SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용하고 저장소에 커밋하지 않습니다.

### 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 프론트·백엔드 동시 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm test` | 테스트 실행 |
| `npm run lint` | ESLint 검사 |

## 배포

Vercel에 배포합니다. `vercel.json`이 `/api/*`를 서버리스 함수로, 나머지를 SPA로 연결합니다.
`tick` 엔드포인트는 외부 스케줄러(예: Supabase `pg_cron`)가 주기적으로 호출하도록 구성합니다.
