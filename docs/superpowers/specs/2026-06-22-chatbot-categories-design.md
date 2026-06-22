# 챗봇 모니터링 — 카테고리 기능 설계

날짜: 2026-06-22

## 목적
등록 봇이 많아질 때 일부 모니터링만 묶어서 확인·실행할 수 있도록 봇에 카테고리를 부여한다.
"예약 봇만 체크", "결제 봇만 체크"처럼 그룹 단위 부분 실행이 핵심 시나리오.

## 결정 사항
- **봇당 단일 카테고리** (다중 태그 아님). `chatbots.category TEXT` 컬럼 1개.
- **UI**: 상단 단일 선택 필터 칩 + 평면 목록. 칩으로 거른 목록만 표시하고, 상단 실행 버튼은 현재 보이는(필터된) 봇만 실행.
- **카테고리 입력**: 등록/수정 모달의 자유 입력 + `<datalist>` 자동완성(기존 카테고리 후보). 별도 관리 화면 없음.
- 빈 문자열은 `null`로 정규화 → "미분류"로 표시. 미분류 실행 센티넬은 `__none__`.

## 데이터 모델
```sql
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS category TEXT;
```
- nullable. 기존 행은 null → "미분류". 백필 불필요.
- 적용은 **Management API(SUPABASE_ACCESS_TOKEN)로 멱등 실행. `supabase db push` 금지** (히스토리 divergence). 마이그레이션 파일은 기록용.

## 변경 범위

### DB
- 신규 마이그레이션 파일 `supabase/migrations/<ts>_add_chatbot_category.sql` (기록용).

### 서버 `server/routes/chatbot.js`
- `ALLOWED_BOT_PATCH_FIELDS`에 `category` 추가.
- POST `/bots`: `category` 수용, `category?.trim() || null`로 정규화 후 insert.
- `/run-check`: body에 `{ category }` 수용 → dispatch `inputs.category`로 전달. `bot_id`와 상호 배타(둘 다 오면 bot_id 우선).

### API 클라이언트 `src/lib/api/chatbot.js`
- `runCheck`가 `{ bot_id }` 또는 `{ category }`를 보낼 수 있게 시그니처 확장.

### 모달 `src/components/chatbot/BotModal.jsx`
- 이름·URL 아래 카테고리 입력 필드(input + datalist). props로 기존 카테고리 목록 받음. onSubmit payload에 `category` 포함.

### 목록 `src/pages/ChatbotPage.jsx`
- 봇 목록에서 distinct 카테고리 추출 → `[전체] [<카테고리들>] [미분류]` 단일 선택 칩 바. 기본 "전체".
- 선택 칩으로 목록 필터링. (미분류 칩 = category null)
- 상단 실행 버튼 맥락 인식: "전체" → `전체 체크`(category 미전달), 특정 칩 → `"<카테고리>" 체크`(해당 category 전달, 미분류는 `__none__`).
- BotModal에 기존 카테고리 목록 전달.

### 행 `src/components/chatbot/BotRow.jsx`
- 봇 이름 옆/서브라인에 카테고리 뱃지 표시(없으면 미표시 또는 "미분류").

### 워크플로우 `.github/workflows/chatbot-check.yml`
- `workflow_dispatch.inputs.category` 추가, `CATEGORY` env로 러너에 전달.

### 러너 `scripts/chatbot-check.mjs`
- `process.env.CATEGORY` 있으면 쿼리에 필터: `__none__` → `.is('category', null)`, 그 외 → `.eq('category', CATEGORY)`.
- **메일 규칙**: 부분 실행(BOT_ID 또는 CATEGORY)은 실패 메일 생략. 전체/스케줄 실행만 발송. (기존 "단건 생략" 규칙 확장 → "전체 체크" 동작 불변)

### 스타일 `src/index.css`
- 필터 칩 바 + 카테고리 뱃지 스타일.

## 테스트 (TDD)
- 서버 `chatbot.test.js`:
  - PATCH 허용 필드에 `category` 반영.
  - POST `/bots` category 정규화(빈값 → null).
  - `/run-check`가 `category`를 `inputs.category`로 전달.
- 러너 필터/메일 분기는 순수 함수로 추출 가능하면 단위 테스트, 아니면 수동 검증.

## 범위 밖 (YAGNI)
- 다중 태그, 다중 칩 동시 선택, 카테고리별 스케줄.

---

## 개정 (2026-06-22): 자유입력 → 관리 목록 + 선택/추가

자유입력(datalist)에서 **관리되는 카테고리 목록**으로 전환. 봇이 없어도 카테고리가 유지된다.

- **저장**: `chatbot_monitor_settings.categories JSONB DEFAULT '[]'` 추가(싱글톤 행 재사용). 기존 `chatbots.category` distinct 값으로 1회 백필.
- **모달**: 카테고리 `<select>`(목록 + "(미분류)" 빈 옵션) + 옆 **"+"** 버튼 → 인라인 입력으로 새 카테고리 추가 후 자동 선택.
- **페이지 칩바**: 칩 끝에 **"+"** 칩 → 인라인 입력으로 카테고리 추가.
- 두 진입점 모두 동일한 `addCategory(name)` → `PUT /settings { categories }`(낙관적 갱신). 트림·중복·빈값 제거.
- **칩 목록 출처**: 봇에서 파생이 아니라 **관리 목록(settings.categories)** + 봇 중 미분류 존재 시 "미분류".
- `PUT /settings`는 부분 갱신: 제공된 `recipients`/`categories`만 변경(서로 덮어쓰지 않음).
## 개정 (2026-06-22): 카테고리 이름변경 + 삭제

칩바 끝 **"관리(✎)" 토글** → 각 카테고리 칩이 인라인 이름변경 + ✕삭제로 전환(`CategoryChips` 컴포넌트로 칩바 분리).

- **이름변경**: `PATCH /categories { from, to }` — `chatbots` 중 해당 category 일괄 변경 + settings 목록 치환(트림·중복 제거). 봇까지 일괄 반영.
- **삭제**: `DELETE /categories { name }` — 해당 봇은 `category=null`(미분류)로 이동 + 목록에서 제거. **봇 N개 있으면 확인 다이얼로그에 개수 표시**.
- 프론트는 낙관적 갱신(실패 시 롤백). 삭제 대상 봇 수는 이미 로드된 bots에서 계산(별도 호출 없음).
- 스키마 변경 없음(기존 categories 컬럼/엔드포인트 재사용).
