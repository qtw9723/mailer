# CS SmartHub 「관제 콘솔」 리디자인 스펙

날짜: 2026-06-10
상태: 승인됨 (하트비트 바 백엔드 포함)

## 목표

CS SmartHub를 "매일 출근 직후 발송 상태를 수 초 안에 파악하는 관제(NOC) 콘솔"로 재정의한다.
기존 다크+보라 정체성은 유지하되, 보라를 브랜드·인터랙션 전용으로 격리하고
상태(정상/실패)는 통일된 시맨틱 색으로만 표현한다. 평상시 화면은 무채색에 가깝게
가라앉히고, 이상이 있을 때만 빨강이 튀게 만든다.

참고 리서치: Uptime Kuma(하트비트 바·NOC 다크), Grafana Stat 패널(임계치 채색),
Loops 리디자인 회고(카드→컴팩트 리스트 회귀), Supabase Studio(아이콘 레일),
Linear/Retool(Cmd+K), 토스 TDS·KRDS(한글 타이포 수치), PatternFly(심각도 보더).

## 범위

- **포함**: 전체 UI 재스타일링(index.css 토큰 기반 재작성), 레이아웃 변경(아이콘 레일,
  컴팩트 행 리스트), 공용 컴포넌트 신설(ConfirmDialog, 토스트, 커맨드 팔레트, 상태 배지,
  더보기 메뉴), UX 감사 high/medium 이슈 해결, **send_log 테이블 신설 + 발송 기록 +
  하트비트 바**(유일한 백엔드 변경).
- **제외**: 그 외 기능·API 변경, 인증 방식 변경, 신규 페이지.

## 1. 디자인 토큰 (Tailwind v4 `@theme`)

`src/index.css`를 토큰 기반으로 재작성한다. 모든 색·타이포는 CSS 변수만 사용하고
하드코딩 hex를 남기지 않는다.

### 색상

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-bg-base` | `#101014` | 페이지 배경 |
| `--color-bg-surface` | `#16161c` | 카드·행·헤더 |
| `--color-bg-raised` | `#1d1d25` | 모달·드롭다운·팔레트 |
| `--color-bg-hover` | `#222230` | 호버 표면 |
| `--color-border-subtle` | `rgba(255,255,255,0.07)` | 기본 보더 |
| `--color-border-strong` | `rgba(255,255,255,0.14)` | 강조 보더 |
| `--color-text-primary` | `#E8E8EE` | 1차 텍스트 |
| `--color-text-secondary` | `#8E8E9E` | 2차 텍스트(메타) — AA 4.5:1 충족 |
| `--color-text-faint` | `#55555f` | 장식·비활성 전용(본문 금지) |
| `--color-accent` | `#9d8ffc` | 브랜드·인터랙션 전용: 활성 레일 아이콘, 포커스 링, 주 CTA, 링크. **상태 의미 금지** |
| `--color-status-ok` | `#4ade80` | 정상·활성 |
| `--color-status-error` | `#f87171` | 실패·삭제 |
| `--color-status-warn` | `#fbbf24` | 경고·진행 중 |
| `--color-status-idle` | `#71717a` | 중지·대기 |
| `--color-status-info` | `#60a5fa` | 정보 |

상태 배지 fill은 각 상태색의 10% 알파(`color-mix(in srgb, var(--color-status-ok) 10%, transparent)`).
실패 행 격상: 좌측 3px `--color-status-error` 보더 + 8% 빨강 배경.

Grafana의 기존 `#81c784/#c62828/#ff8a80/#2e7d32` 와 Mailer의 `#f87171/#9d8ffc` 상태
표현을 전부 위 토큰으로 치환한다.

### 타이포그래피

- 폰트: **Pretendard Variable** — index.html에 jsDelivr 다이나믹 서브셋 CSS 1줄 추가.
  스택: `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif`
- 모노(시각·크론·이메일·로그): `ui-monospace, "SF Mono", Menlo, monospace` + `font-variant-numeric: tabular-nums`
- 스케일(행간 모두 1.5): 페이지 제목 18px/700 · 행 제목 14px/600 · 본문 13px/400 ·
  메타·테이블 12px/400 · KPI 숫자 26px/700 tabular-nums
- `body { word-break: keep-all; overflow-wrap: break-word; }`
- 한글 레이블의 `text-transform: uppercase` 및 `letter-spacing` 확대 전부 제거
  (`.form-label`, `.app-title`). 본문 자간 -0.01em, 숫자 0.

## 2. 레이아웃

### 아이콘 레일 (신규: `src/components/shared/IconRail.jsx`)

- 모든 보호 페이지 좌측에 52px 고정 세로 레일. 항목: Mail(Mailer) / BarChart3(Grafana) /
  Bot(챗봇, 비활성 흐림 + title="준비 중") / 최하단 LogOut.
- 활성 툴 아이콘은 `--color-accent` + 좌측 2px 인디케이터. 비활성은 `--color-text-secondary`.
- 레일 최상단 로고(클릭 시 허브 홈 `/`).
- 허브 홈은 "대문"으로 유지하되 레일도 함께 노출(왕복 pogo-sticking 제거).
- AppHeader의 "‹ CS SmartHub" 뒤로가기와 로그아웃 버튼은 레일로 이전되어 제거.
  헤더에는 툴 이름 + 페이지 액션(새 작업, 새로고침)만 남기고 높이 48px로 조밀화.
- 모바일(~640px): 레일을 하단 고정 바(높이 56px, 가로 배치)로 전환.

### 커맨드 팔레트 (신규: `src/components/shared/CommandPalette.jsx`, `cmdk` 의존성)

- Cmd+K(맥)/Ctrl+K로 열림. `--color-bg-raised` 표면.
- 1단계 명령: "Mailer로 이동", "Grafana 리포트로 이동", "허브 홈", "로그아웃"
- 2단계 명령: "새 작업 만들기"(Mailer로 이동 + 모달 오픈), "발신 계정 관리", "리포트 새로고침"
- 라우터 레벨(App.jsx 내 보호 레이아웃)에서 전역 마운트.

### 라우팅 구조 변경

`App.jsx`에 보호 레이아웃 컴포넌트(`<AppLayout>`: IconRail + CommandPalette + Toaster + Outlet)를
도입해 중복 제거. ProtectedRoute는 유지.

## 3. Mailer 페이지

### 작업 행 리스트 (JobCard → `JobRow.jsx` 재작성)

- 카드 그리드를 높이 56~64px 컴팩트 행으로 전환. 행 구성(좌→우):
  1. 드래그핸들(GripVertical, 기존 dnd-kit 유지) + 선택 체크박스
  2. 상태 도트 + 행 제목 14px/600 (도트: 활성=ok, 중지=idle, 최근 발송 실패=error)
  3. 주기 자연어("2시간마다") + **다음 발송: "6월 12일 (목) 09:00 · 2일 후"**
     — `last_sent_at + interval_minutes`로 파생 계산(`src/lib/datetime.js`에 헬퍼 추가),
     1시간 이내 임박 시 `--color-accent` 강조. 미발송 작업은 "곧 발송".
  4. 하트비트 바(최근 10회, 아래 6절) — 모노 데이터 영역
  5. 활성 토글(스위치 형태) + ⋯ 더보기 메뉴
- ⋯ 더보기 메뉴(신규 `MoreMenu.jsx`): 수정 / 복제 / 순번 초기화(use_index 시) / 삭제(빨강).
  기존 항상 노출 5버튼 제거 — 모바일 넘침 동시 해결.
- 수신자 펼침(▾ 수신자 N명)은 행 하단 아코디언으로 유지.
- **활성 (N) / 중지됨 (N) 그룹 헤더**로 리스트 구획. 드래그 정렬은 그룹 내에서 유지.
- 빈 상태: "발송 작업이 없습니다" + [+ 새 작업] 버튼.
- 초기 로드: 행 모양 스켈레톤 3개(200ms 지연 표시) — 빈 상태 오인 해소.

### 동작 개선

- 삭제(개별·일괄): ConfirmDialog로 `"{작업명}" 작업을 삭제할까요?` + 빨강 [삭제] 버튼.
  순번 초기화·발신 계정 삭제의 `confirm()`도 ConfirmDialog로 교체.
- 토글: 낙관적 업데이트 + 실패 시 롤백 + 에러 토스트. 요청 중 스위치 disabled.
- `handleDragEnd`: `reorderJobs` API 호출을 setJobs 업데이터 밖으로 이동(StrictMode 중복 방지),
  실패 시 토스트.
- 모든 mutation(생성/수정/삭제/복제/토글/정렬)에 try/catch + 성공/실패 토스트.

## 4. Grafana 페이지

- 상단 요약 배너 유지하되 토큰 색으로: 정상 = ok 10% fill + "✅ 모두 정상입니다",
  이상 = error fill + "이상 N건 — 점검 필요". 우측에 확인 시각(모노).
- Stat 카드 재구성: 라벨 12px secondary → 값 26px/700 tabular-nums → 임계치 캡션.
  평상시 무채색(값만 primary), 임계 초과 시에만 값·보더 error 채색. (스파크라인·델타는
  데이터 없으므로 제외)
- 로그 테이블: 행 좌측 3px 심각도 보더, 시각 열 모노+tabular-nums 우측 정렬,
  메시지 2줄 클램프 + 행 클릭 시 전문 아코디언 확장.
- 설정 탭은 현행 유지(드로어 전환은 범위 제외). 폼 스타일은 공통 폼 토큰 적용.

## 5. 허브 홈 / 로그인 / 챗봇

- 허브 홈: 상단 한 문장 상태 배너 — `getJobs`의 `recent_sends`(send_log 기반)만 사용해
  "✅ 모두 정상입니다 · 활성 작업 N개" / 최근 발송 실패 존재 시 "Mailer: 최근 발송 N건 실패".
  Grafana 실시간 조회(`getReport`)는 느려서 배너에 포함하지 않음(신규 API 없음).
  Mailer 툴 카드에 상태 도트 추가. "추가 예정" 빈 카드 유지.
- 로그인: 토큰 적용 + 제출 중 "확인 중…" + disabled + 실패 시 입력 빨강 보더 + `aria-invalid`.
- 챗봇: 빈 상태 3요소(48px Bot 아이콘 저채도 보라 + "챗봇 모니터링을 준비하고 있어요" +
  예정 기능 2줄)로 교체.

## 6. 하트비트 바 + send_log (유일한 백엔드 변경)

### DB

`supabase/migrations/20260610000000_add_send_log.sql` (멱등):

```sql
CREATE TABLE IF NOT EXISTS send_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES mail_jobs(id) ON DELETE CASCADE,
  ok BOOLEAN NOT NULL,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_send_log_job_sent ON send_log (job_id, sent_at DESC);
```

**적용 방법: Supabase SQL Editor에서 직접 실행** (`supabase db push` 금지 — 마이그레이션
히스토리 divergence). 파일은 기록용으로 커밋한다.

### 서버 (`server/routes/mailer.js`)

- tick(발송 루프)에서 각 작업 발송 후 성공/실패를 `send_log`에 insert
  (실패 시 error 메시지 저장, insert 실패는 발송을 막지 않게 best-effort).
- `GET /jobs` 응답에 작업별 최근 10회 이력 포함: jobs 조회 후 send_log를
  `job_id IN (...)` + 윈도우로 조회해 `recent_sends: [{ok, sent_at}]`로 병합.
  (N+1 회피, 단일 쿼리)

### 프런트

- `JobRow`에 하트비트 바: 16px 높이, 최근 10회를 순수 CSS flex div로 렌더
  (성공=ok 60% 알파, 실패=error, 이력 없음 슬롯=border-subtle). hover 시 title로
  시각+결과. 이력 0건이면 "이력 없음" 캡션.
- 행 상태 도트: 최근 1회 실패 시 error로 격상(활성이어도).

## 7. 공용 컴포넌트 & 공통 개선

| 항목 | 내용 |
|---|---|
| 토스트 | `sonner` 도입, `<Toaster theme="dark">`를 AppLayout에 마운트. 모든 mutation 성공/실패 알림 |
| ConfirmDialog | 신규 `shared/ConfirmDialog.jsx` — role="dialog", aria-modal, ESC 닫기, 포커스 트랩, [취소/확인(또는 빨강 삭제)] 순서 고정 |
| 포커스 | 전역 `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`, 입력은 focus ring 병행 |
| 반응형 | ~640px 단일 브레이크포인트: 레일→하단 바, hub-grid 1열, 행 액션 ⋯ 메뉴(이미 축약), 모달 풀스크린 시트, 인터랙티브 요소 min-height 36px+ |
| 모달 공통 | JobModal·SenderModal·ConfirmDialog: role="dialog", aria-modal, ESC 닫기, 오버레이 클릭 닫기(dirty 시 확인), label htmlFor/id 연결 |
| 접근성 | 아이콘 전용 버튼 전부 aria-label("작업 복제", "작업 삭제" 등) |
| TagInput | 이메일 정규식 검증(무효 시 추가 거부 + 흔들림 피드백), 붙여넣기 쉼표/공백/세미콜론 일괄 파싱 |
| form-hint | `.form-hint { font-size: 12px; color: var(--color-text-secondary); margin-top: 6px }` 정의 |
| 인라인 스타일 | nav-tabs 패딩, 헤더 flex 그룹, HubPage 색 등 클래스로 승격 |
| SenderModal | loading prop + 저장 중 disabled + 실패 시 모달 내 에러 (JobModal과 일관) |
| CSS 정리 | `.app-header` 중복 정의 병합, 죽은 셀렉터 제거 |

## 8. 의존성

추가: `sonner`, `cmdk`. 제거 없음. (하트비트 바·스켈레톤·토글 스위치는 순수 CSS)

## 9. 테스트

- 기존 vitest 테스트(`datetime.test.js`, `auth.test.js`, `mailer.test.js`, `grafana.test.js`,
  `report.test.js`) 전부 통과 유지.
- 신규: `datetime.js`의 다음 발송 계산 헬퍼 단위 테스트, `send_log` 기록·`recent_sends`
  병합 라우트 테스트(supertest), TagInput 이메일 검증·붙여넣기 파싱 테스트,
  ConfirmDialog 렌더·ESC 테스트.
- 시각 확인: `npm run dev`로 로그인 → 허브 → Mailer(행 리스트·모달·삭제 확인·토스트) →
  Grafana(배너·Stat·로그) 순회.

## 10. 에러 처리 원칙

- 모든 사용자 트리거 mutation: try/catch → 실패 토스트(한국어, 원인 短문) + 상태 롤백.
- 폴링(60s)·배너 데이터 등 백그라운드 조회 실패는 조용히 유지(기존 동작), 단 UNAUTHORIZED는
  기존대로 로그인 리다이렉트.
- send_log insert 실패는 발송 성공/실패에 영향 없음(best-effort, 서버 콘솔 로그만).

## 구현 순서(개요)

1. 토큰·타이포 기반(@theme, Pretendard, 전역 규칙) — 이후 모든 단계의 토대
2. 공용 컴포넌트(Toaster, ConfirmDialog, AppLayout+IconRail, CommandPalette)
3. Mailer 행 리스트 전환 + 동작 개선
4. send_log 백엔드 + 하트비트 바 (SQL Editor 적용 단계 포함)
5. Grafana·허브·로그인·챗봇 재스타일
6. 반응형·접근성 마무리 + 전체 테스트
