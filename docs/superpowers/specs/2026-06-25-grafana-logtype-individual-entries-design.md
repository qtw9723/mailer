# 그라파나 로그 유형: 개별 로그 정규화 저장

작성일: 2026-06-25

## 문제

로그 유형 상세의 "발생 타임라인"에서 같은 에러가 다른 타임스탬프로 3건
발생해도 1건만 노출된다.

근본 원인: Gemini가 동일/유사 메시지를 **대표 로그 1개 + count**로 접으면서
개별 발생 시각이 저장 단계에서 소실된다(`grafana_log_type_runs.logs` jsonb에
대표 5개만 적재). 타임라인은 저장된 대표 1건만 충실히 그릴 뿐이다.

직전 PR #15에서 `logs[].times[]`(LLM이 모든 시각을 서술)로 완화했으나, LLM이
시각을 누락/변형할 수 있고 대표 로그 5개 제한에 걸린다.

## 핵심 통찰

개별 원시 로그는 **이미 우리 손에 있다.** ES 쿼리(`gatherReportData` →
`queryElasticsearch`)가 앱당 최대 `LOG_FETCH=50`건의 원시 로그를 실제
타임스탬프와 함께 가져온다. LLM에게 시각을 받아 적는 게 아니라, 우리가 가진
원본을 유형에 **매핑만** 하면 (50건 내) 모든 시각을 손실 없이 남길 수 있다.

## 설계

### 데이터 모델

기존 유지:
- `grafana_log_types` — 영속 유형(label, description, note, total_count, last_seen_at)
- `grafana_log_type_runs` — 회차별 집계(type_id, run_at, app, count, logs jsonb)

신규 테이블:

```sql
create table if not exists grafana_log_entries (
  id          bigserial primary key,
  type_id     bigint not null references grafana_log_types(id) on delete cascade,
  run_id      bigint not null references grafana_log_type_runs(id) on delete cascade,
  app         text,
  occurred_at timestamptz,           -- ES 원본 시각(ground-truth)
  msg         text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_gle_type_time on grafana_log_entries (type_id, occurred_at desc);
create index if not exists idx_gle_run on grafana_log_entries (run_id);
```

### 데이터 흐름

1. ES에서 앱당 ≤50건 원시 로그(시각+메시지) 확보 (기존).
2. 프롬프트에서 각 원시 로그에 번호(index) 부여.
3. LLM 응답 스키마: 유형마다 `logs`/`times` 대신 **`rows: [index…]`**(이 유형에
   속한 원시 로그 번호) 반환. 시각·메시지는 LLM이 베끼지 않음.
4. 적재(`resolveAndPersist`): 유형 resolve/생성 → run(count) insert →
   `rows`의 각 index를 **서버가 쥔 원본 행**으로 되살려 `grafana_log_entries`에
   1건씩 insert (occurred_at = ES 원본 ISO 시각).

LLM은 분류(어느 행이 어느 유형)만 담당하고, 시각·메시지는 ES 원본을 그대로
저장하므로 환각/포맷변형/누락이 없다.

### count 의미

- 유형별 `count`(run에 저장)는 LLM이 추정한 총 발생 수(기존 의미 유지) — 앱 전체
  건수가 fetch 상한 50을 넘을 수 있어 추정.
- `grafana_log_entries`는 실제 저장된 개별 행(정확).
- "외 N건"(run) = max(0, run.count − 해당 run의 entries 수).

### 화면 (LogTypesTab 상세)

- **발생 타임라인** = entries를 occurred_at desc로. 같은 에러 3건이면 정확히 3행.
- **회차별** = runs(run_at·count), 펼치면 run_id별 entries. `count > entries`면
  `… 외 N건 (미수집)` 표기.
- 기존 데이터: entries 없음 → 타임라인 미표시(소급 불가, 알려진 한계).
  회차별은 옛 `logs` jsonb로 폴백.

### 조회 상한

`LOG_FETCH=50` 유지. count > 50인 앱의 초과분은 "외 N건"으로 표기(저장 안 함).

## 정리 사항

- 직전 PR #15의 `times[]` 스키마/정규화/프론트 확장은 이 방식으로 대체(제거).
- `grafana_log_type_runs.logs` jsonb는 신규 회차부터 미사용. 옛 데이터 폴백용으로
  컬럼은 보존.
- 마이그레이션은 `supabase db push` 금지 → Management API로 멱등 SQL 적용.

## 테스트

- `analyze`: 신규 `rows[]` 스키마 parse/normalize(정수화·범위 밖/중복 무시).
- `logTypes`: rows→entries 매핑 insert, getType entries 포함(목 db).
- 프론트: 타임라인 entries 렌더, 외 N건, 옛 logs 폴백.

## 영향 파일

`server/grafana/analyze.js`, `server/grafana/logTypes.js`,
`server/grafana/report.js`(원시행 raw ts 보존), 호출부(persist에 groups 전달),
`src/components/grafana/LogTypesTab.jsx`, 마이그레이션 SQL, 관련 테스트.
