# 그라파나 모니터링 — LLM 로그 분석 + 영속 로그 유형

날짜: 2026-06-24

## 목적
1. **점검 포인트 요약(기능1)**: 앱별 ERROR 로그를 LLM(Gemini)이 분석해 중복을 정리하고, "솔루션에서 확인해야 할 데이터/포인트"를 간단히 요약. 메일 + 웹 리포트에 표시.
2. **영속 로그 유형(기능2)**: LLM이 정리한 로그 유형을 영속 저장. 웹에서 유형별로 열람, 유형별 노트 작성, 회차별 로그 누적. 저장은 **메일 발송 시각(tick)에 1회**. 메일에는 안 보냄.

두 기능은 동일한 LLM 분석 결과를 공유한다.

## 결정 사항
- **LLM**: Gemini, `@google/generative-ai`, 모델 `gemini-2.5-flash`(구현 시 가용 모델명 확인). 키 `GEMINI_API_KEY`(로컬 `.env` + Vercel).
- **저장 모델**: 영속 유형(누적). 노트는 유형에 고정, 회차별 로그는 누적.
- **요약 노출**: 메일 + 웹.
- **타이밍**: tick(발송 시각)에 분석·저장 1회. 웹은 저장된 최신 요약 표시 + 수동 "재분석(미리보기, 저장 안 함)".
- **저장 시점**: tick **단 한 곳**. 수동 재분석은 미리보기만.

## 데이터 모델 (Management API 멱등 적용, `db push` 금지)
```sql
CREATE TABLE IF NOT EXISTS grafana_log_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL,
  description  TEXT,                 -- LLM이 정리한 유형 설명/점검 포인트
  note         TEXT,                 -- 사용자 편집 노트
  total_count  INT  NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grafana_log_type_runs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_id    UUID NOT NULL REFERENCES grafana_log_types(id) ON DELETE CASCADE,
  run_at     TIMESTAMPTZ NOT NULL,
  app        TEXT,
  count      INT NOT NULL DEFAULT 0,  -- 이 회차에서 이 유형이 대표한 원시 로그 수
  logs       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- LLM이 중복정리한 대표 로그 [{time,msg}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grafana_log_type_runs ON grafana_log_type_runs (type_id, run_at DESC);

ALTER TABLE grafana_report_settings ADD COLUMN IF NOT EXISTS last_analysis JSONB;
```

## 모듈

### `server/grafana/analyze.js` (격리·테스트 가능)
- `buildAnalyzePrompt(logs, existingTypes)`: 앱별 로그 + 기존 유형(label+description) → 프롬프트. 기존 유형 재사용 우선, 없을 때만 신규 제안 → 유형명 일관성.
- `parseAnalysis(raw)`: Gemini 구조화 출력 → `{ summary, types: [{ label, description, app, count, logs:[{time,msg}], existingMatch? }] }`. 방어적 파싱/정규화(순수 함수, 단위 테스트).
- `analyzeLogs(logs, existingTypes, client)`: 클라이언트(주입 가능) 호출 → parse. 실패 시 throw(호출부에서 best-effort 처리).
- Gemini 클라이언트 생성은 키 없으면 명확히 에러. 테스트는 client를 목 주입.

### 유형 영속화 (`server/grafana/logTypes.js`)
- `resolveAndPersist(analysis, runAt)`:
  - 각 analyzed type: 기존 유형 매칭(LLM match id 우선 → label 동일 매칭 → 없으면 신규 생성).
  - `grafana_log_type_runs` insert(type_id, run_at, app, count, logs).
  - 유형 갱신: `total_count += count`, `last_seen_at = runAt`, description 최신화.
- `listTypes()`, `getType(id)`(+runs), `updateType(id,{note,label,description})`, `deleteType(id)`.

## 발송 경로(tick) 확장 — 유일 저장 시점
1. `gatherReportData` → metrics+logs
2. `analyzeLogs(logs, listTypes())` — try/catch, 실패 시 분석 생략(리포트/메일은 정상)
3. 성공 시 `resolveAndPersist(analysis, now)` + `saveSettings({ last_analysis: { summary, generated_at } })`
4. `buildEmailHtml(report, analysis?.summary)` — 요약 블록 포함 발송
5. `markSent`

## 엔드포인트 (`server/routes/grafana.js`)
- `GET /report`: 기존 + `analysis: last_analysis`(LLM 미호출)
- `POST /analyze`(auth): 현재 로그로 Gemini 1회 → `{ summary, types }` **미리보기 반환(저장 안 함)**
- `GET /log-types`: 유형 목록
- `GET /log-types/:id`: 유형 + 회차 로그
- `PATCH /log-types/:id`: note/label/description 수정
- `DELETE /log-types/:id`: 유형+회차 삭제

## 웹 UI
- **리포트 탭**: 상단 "AI 점검 요약" 섹션(`analysis.summary` + 생성시각) + "재분석(미리보기)" 버튼(POST /analyze 결과 인라인 표시, 저장 안 함 명시).
- **신규 탭 "로그 유형"**: 유형 목록(label·누적 count·노트 미리보기) → 클릭 시 노트 편집 + 회차별 로그(run_at·app·count·logs). 이름변경·삭제(챗봇 카테고리 패턴 재사용).

## 운영/에러 처리
- Gemini 실패·키 미설정: 분석 best-effort. 리포트·메일·tick 모두 정상 동작(요약/유형 저장만 생략).
- `vercel.json`에 함수 `maxDuration` 60s 상향(Gemini 지연 대비, 플랜 지원 필요).
- 비용: tick 1회/일 + 수동 재분석 시에만 호출. 웹 새로고침은 호출 안 함.

## 테스트 (TDD)
- `analyze.js`: 프롬프트 빌드, `parseAnalysis` 정규화/방어(빈/깨진 응답), client 목 주입 분석.
- `logTypes.js`: 유형 해소(매칭 vs 신규), 회차 적재, total_count 갱신 — db 목.
- 라우트: `GET/PATCH/DELETE /log-types`, `POST /analyze`(analyze 목), `GET /report`(last_analysis 포함), tick(analyze+db 목, 분석 실패해도 메일 발송).
- 메일 HTML 요약 블록 렌더 테스트.
- 실제 Gemini API는 테스트에서 호출하지 않음.

## 범위 밖 (YAGNI)
- 유형 수동 병합, 유형별 알림, 원시 로그 전량(50건) 보관(대표 로그만), 다중 LLM 공급자.
