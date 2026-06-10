# 챗봇 모니터링 스펙 — monitor_link.sh 마이그레이션 + 시나리오 체크

날짜: 2026-06-10
상태: 승인됨

## 목표

로컬 `monitor_link.sh`(단일 봇 curl 가용성 체크)를 CS SmartHub의 챗봇 모니터링 툴로
대체한다. 여러 챗봇을 등록하고, 각 봇에 대해 **하루 1회 GitHub Actions에서 Playwright로
실제 사용자처럼 접속 → 발화 입력 → 응답 확인**하는 시나리오 체크를 수행한다.
실패 시 메일로 알린다. 단순 HTTP 가용성 체크는 만들지 않는다(사용자 결정).

대상 봇은 외부(인터넷) 공개 봇만이며, 현재는 cogi(next-ti.ai) 위젯 기반이다.

## 범위

- **포함**: chatbots/chatbot_check_log/chatbot_monitor_settings 테이블, GitHub Actions
  러너(Playwright + 메일 알림), 서버 CRUD 라우트, ChatbotPage UI(봇 목록·등록 모달·설정),
  허브 홈 챗봇 카드 활성화 + 상태 배너 합산, IconRail 챗봇 항목 활성화.
- **제외**: 단순 가용성 체크(L0), 멀티턴 대화 컨텍스트 검증 고도화(시나리오 스텝 순차 실행까지만),
  봇별 체크 주기 커스텀(전역 하루 1회).

## 1. 데이터 모델 (Supabase — SQL Editor로 멱등 적용, db push 금지)

`supabase/migrations/20260610100000_add_chatbot_monitoring.sql`:

```sql
CREATE TABLE IF NOT EXISTS chatbots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  -- 시나리오: [{"say": "발화", "expect": "기대 키워드"}] 1개 이상. 순차 실행.
  scenario JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 입력창 셀렉터 오버라이드 (null이면 러너의 기본 휴리스틱 사용)
  input_selector TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chatbot_check_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  ok BOOLEAN NOT NULL,
  detail TEXT,            -- 실패 사유: 'timeout' | 'keyword_missing: ...' | 에러 메시지 (+ 응답 발췌)
  duration_ms INT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_check_log ON chatbot_check_log (chatbot_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS chatbot_monitor_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- 단일 행
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO chatbot_monitor_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
```

## 2. GitHub Actions 러너

### 워크플로우 `.github/workflows/chatbot-check.yml`
- `schedule: cron '30 23 * * *'` (= 매일 08:30 KST) + `workflow_dispatch`(수동 실행 버튼)
- Node 22 + `npx playwright install chromium --with-deps`
- `node scripts/chatbot-check.mjs` 실행
- 실패 스크린샷을 artifact로 업로드(7일 보관, `if: always()`)
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (메일 계정은 DB의 sender_accounts 재사용이므로 추가 시크릿 불필요)

### 러너 스크립트 `scripts/chatbot-check.mjs`
1. Supabase에서 `enabled=true` 챗봇 로드 (없으면 즉시 종료)
2. 봇마다 Playwright chromium으로:
   - `page.goto(url)` 후 네트워크 안정 대기
   - 시나리오 스텝 순차 실행: 입력창에 `say` 입력 → Enter → **제한시간(60s) 내 페이지에
     `expect` 키워드 텍스트가 새로 노출되는지** 대기(`page.getByText`). 응답 말풍선 셀렉터에
     의존하지 않는 판정이라 위젯 마크업 변경에 강함
   - 입력창 탐색: `input_selector`가 있으면 그것, 없으면 기본 휴리스틱
     (보이는 `textarea` → `input[type="text"]` → `[contenteditable="true"]` 순)
   - 모든 스텝 통과 = ok. 실패 시 사유와 페이지 텍스트 발췌(300자)를 detail에 기록,
     스크린샷 저장(`screenshots/<봇이름>.png`)
3. 결과를 `chatbot_check_log`에 insert
4. 실패 봇이 1개 이상이면: `chatbot_monitor_settings.recipients`(비어 있으면 발송 생략)에
   `sender_accounts` 첫 계정으로 메일 발송 — 제목 `🤖 챗봇 체크 실패 N건`, 본문에 봇별
   사유 + 허브 링크. 발송 로직은 `server/smtp.js` 재사용
5. 개별 봇 실패는 다른 봇 체크를 막지 않음. 스크립트 exit code는 항상 0
   (실패 통지는 메일·허브 담당, Actions 빨간불은 러너 자체 오류만)

## 3. 서버 라우트 `server/routes/chatbot.js` (+ index.js·api 마운트)

기존 mailer.js 패턴(auth 미들웨어 `x-app-password`) 동일:

- `GET /api/chatbot/bots` — 봇 목록 + 각 봇 `recent_checks: [{ok, detail, duration_ms, checked_at}]`
  최근 10건(오래된순) 병합. mailer의 recent_sends와 동일 best-effort 패턴
- `POST /api/chatbot/bots` — { name, url, scenario, input_selector? } 생성
- `PATCH /api/chatbot/bots/:id` — 허용 필드: name, url, scenario, input_selector, enabled, sort_order
- `DELETE /api/chatbot/bots/:id`
- `GET /api/chatbot/settings` / `PUT /api/chatbot/settings` — recipients

## 4. 프런트 UI

### ChatbotPage 재작성 ("준비 중" 제거)
- 탭: **봇 목록 / 설정** (Mailer·Grafana와 동일 nav-tabs)
- 봇 행(Mailer JobRow 문법 재사용): 상태 도트(최근 체크 ok=초록/fail=빨강/이력 없음=회색) +
  이름 + URL 호스트 + 마지막 체크 "6월 10일 (수) 08:30 · 성공" + **하트비트 바(최근 10회=10일)**
  + 활성 토글(낙관적 업데이트) + ⋯ 메뉴(수정/삭제—ConfirmDialog)
- 실패 행은 Mailer와 동일하게 좌측 빨강 보더 + detail 사유 노출
- 등록/수정 모달(BotModal): 이름, URL, 시나리오 스텝 리스트(발화 input + 기대 키워드 input,
  [+ 스텝 추가]/[삭제]), 고급 옵션으로 입력창 셀렉터(접힘, 선택)
- 설정 탭: 수신자 TagInput(이메일 검증 재사용) + 저장 — GrafanaSettings 패턴
- 빈 상태: "등록된 챗봇이 없습니다" + [+ 챗봇 등록]
- 체크는 하루 1회임을 안내하는 캡션 ("매일 08:30 자동 체크 · GitHub Actions에서 수동 실행 가능")
- HeartbeatBar를 `components/mailer/` → `components/shared/`로 이동(공용화), Mailer import 경로 갱신

### 허브 홈 / IconRail
- IconRail 챗봇 항목 `disabled` 제거
- HubPage 챗봇 카드 활성화(준비 중 배지 제거) + 상태 도트
- 허브 상태 배너에 챗봇 실패 합산: "챗봇: 어제 체크 N건 실패" (getBots 재사용, best-effort)

## 5. 판정·에러 처리 원칙

- 성공 = 시나리오 모든 스텝에서 제한시간 내 기대 키워드 노출
- 실패 유형: `timeout`(키워드 미노출), `input_not_found`(입력창 탐색 실패), `goto_failed`(접속 실패),
  각각 detail에 한국어 사유 + 페이지 텍스트 발췌
- 러너의 Supabase 기록 실패 → 콘솔 로그 + 메일 시도는 계속
- 프런트 mutation은 Mailer와 동일: try/catch + 토스트 + 낙관적 토글 롤백
- 시나리오 빈 배열인 봇은 러너가 건너뛰고 로그에 기록하지 않음 (UI에서 최소 1스텝 강제)

## 6. 테스트

- `server/routes/chatbot.test.js`: CRUD + recent_checks 병합 + settings (mailer.test.js 패턴)
- 러너의 판정 로직을 순수 함수로 분리(`scripts/lib/judge.mjs` — 페이지 텍스트 + expect → ok/사유)하여
  단위 테스트. Playwright 조작부는 E2E 성격이라 단위 테스트 제외, workflow_dispatch 수동 실행으로 검증
- 기존 전체 테스트 통과 유지, lint·build 통과

## 7. 배포·적용 순서

1. SQL Editor에서 마이그레이션 적용
2. GitHub repo secrets 등록 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
3. main 머지 → Vercel 배포(UI·라우트)
4. 허브에서 봇 1개 등록 → Actions workflow_dispatch 수동 실행으로 셀렉터·판정 검증
5. 이후 매일 08:30 KST 자동 실행. 검증 완료 후 로컬 monitor_link.sh 중단 안내
