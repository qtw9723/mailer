# Grafana AI 분석: 과거 메모·빈도 참조 + AI 메모 보강 — 설계

날짜: 2026-07-02
브랜치: `feature/grafana-ai-analysis-history`

## 목적

Grafana 리포트의 Gemini 로그 분석이 매 회차 백지 상태에서 분석하지 않도록, 기존 로그 유형의
**메모(note)·누적 빈도(total_count)·최근 회차 추세**를 프롬프트에 주입한다. 목표:

1. **반복/기지 이슈 식별** — 메모가 달린 기존 유형은 "기지 이슈"로 인식·구분
2. **빈도 추세 반영** — 평소 대비 급증한 유형을 요약에서 강조
3. **중복 분석 줄이기** — 이미 결론난 유형 재설명 최소화, 신규 이슈에 집중
4. **메모 자동 보강** — AI가 유형별 관찰 내용을 **별도 칸(`ai_note`)**에 기록.
   사용자 메모(`note`)는 절대 건드리지 않음.

## 변경 범위

### 1. DB 마이그레이션

```sql
ALTER TABLE grafana_log_types ADD COLUMN IF NOT EXISTS ai_note TEXT;
```

- 새 파일: `supabase/migrations/20260702000000_add_grafana_log_type_ai_note.sql`
- 적용: Management API 멱등 SQL (**`supabase db push` 금지** — 마이그레이션 divergence 이력)

### 2. 히스토리 조회 — `server/grafana/logTypes.js`

새 함수 `listTypesWithHistory()`:

- `listTypes()` 결과(이미 `select('*')`라 `ai_note` 자동 포함)에 최근 회차 추세를 붙임
- 추세 조회는 유형별 N+1 대신 **일괄 조회 후 그룹핑**:
  `grafana_log_type_runs`에서 최근 14일치 `type_id, run_at, count`를 한 번에 가져와
  유형별로 **날짜(KST) 단위 합산** 후 최근 5개 날짜만 유지
  (같은 유형이 앱별로 하루 여러 run을 가질 수 있으므로 날짜 합산)
- 반환 형태: 기존 type 객체 + `recentRuns: [{ date: 'MM-DD', count }]` (최신순)

### 3. 프롬프트 강화 — `server/grafana/analyze.js`

`buildAnalyzePrompt()`의 `[기존 로그 유형]` 렌더 확장:

```
- 타임아웃: 소켓 타임아웃 문제
  · 운영자 메모: 모니터링 중, 벤더 대응 대기
  · AI 메모: 평시 5~8건 수준
  · 누적 47건 · 최근 06-24:7, 06-23:5, 06-22:6, 06-20:9, 06-19:5
```

- 메모/AI메모/빈도 줄은 값이 있을 때만 출력(없으면 기존처럼 label: description 한 줄)
- LLM 지시 추가:
  - 기존 메모·추세를 참고해 **기지 이슈는 요약에서 그렇게 표시**
  - **빈도가 최근 추세 대비 급증한 유형은 요약에서 강조**
  - 이미 메모로 결론난 유형은 재설명 최소화, **신규 유형 분석에 집중**
  - `aiNote`: 유형별로 운영자에게 남길 짧은 관찰 메모(추세 변화·특이점).
    특이사항 없으면 빈 문자열 → 기존 값 유지

### 4. 응답 스키마·정규화 — `server/grafana/analyze.js`

- `RESPONSE_SCHEMA.types.items`에 `aiNote: { type: STRING }` 추가 (required 아님)
- `normalizeType()`에 `aiNote: String(t.aiNote ?? '').trim()` 추가

### 5. AI 메모 저장 — `server/grafana/logTypes.js` `resolveAndPersist()`

- 유형 update 시 `aiNote`가 **비어있지 않으면** `ai_note` 갱신(빈 문자열이면 기존 값 유지)
- 신규 유형 insert 시에도 `ai_note` 포함
- 저장은 기존 정책 그대로 **일일 tick 경로에서만** (미리보기 `/api/analyze`는 저장 없음 —
  `resolveAndPersist`를 호출하지 않으므로 자동 충족)

### 6. 호출부 — `server/routes/grafana.js`

- tick·미리보기 두 경로 모두 `listTypes()` → `listTypesWithHistory()`로 교체
  (미리보기도 강화된 프롬프트의 이점을 받되 저장은 없음)

### 7. UI — 웹 '로그 유형' 탭

- 유형 상세에 `🤖 AI 메모` 읽기 전용 표시 (사용자 메모 입력칸과 구분)
- `updateType()`의 allowed 필드에 `ai_note`는 **추가하지 않음** (AI 전용 칸, 수동 편집 불가)

## 에러 처리

- 추세 조회 실패 시: 히스토리 없이 기존 `listTypes()` 결과로 폴백 (분석 자체는 진행)
- LLM 전체는 기존 best-effort 유지 — 실패해도 리포트/메일 정상

## 테스트

- `buildAnalyzePrompt`: 메모/빈도/추세가 있는 유형·없는 유형 렌더 검증 (기존 격리 테스트 패턴)
- `normalizeType`: `aiNote` 정규화 (누락·공백·정상)
- `resolveAndPersist`: aiNote 있음→갱신, 빈 문자열→기존 유지, 신규 유형→포함
- `listTypesWithHistory`: 날짜 합산·최근 5일 절단·폴백 (db mock)

## 범위 밖 (YAGNI)

- 회차별 메모(`runs.note`)는 프롬프트에 넣지 않음 — 유형 메모+추세로 충분, 토큰 절약
- 메일 본문에 유형별 AI 메모 미표시 — 요약 블록이 이미 반영, 간결 유지
- `ai_note` 수동 편집/삭제 UI — 필요해지면 후속
