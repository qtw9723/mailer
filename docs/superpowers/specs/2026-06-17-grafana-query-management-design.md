# 설계 — Grafana 모니터링 쿼리 UI 관리

> 작성일 2026-06-17. 프로젝트 `/Users/sangjun/IdeaProjects/mailer`.
> 배경: 모니터링 대상 쿼리(Prometheus 메트릭 5개, ES 로그 쿼리 5개)가 `server/grafana/config.js`에 하드코딩돼 있어, 항목을 추가·수정·삭제하려면 코드 배포가 필요하다. 이를 설정 탭(`GrafanaSettings.jsx`)에서 UI로 직접 관리하도록 한다.

## 1. 목적

`config.js`의 `METRICS`(`{label, query, threshold}`)와 `LOG_QUERIES`(`{label, query}`)를 Supabase에 저장하고, 설정 UI에서 **추가/수정/삭제 + 항목별 enabled 토글**로 관리한다. 코드 배포 없이 모니터링 대상을 바꿀 수 있게 한다.

## 2. 접근 방식

기존 싱글톤 설정 행(`grafana_report_settings`, id=1)에 **JSONB 컬럼 2개**를 추가해 배열을 통째로 저장한다(별도 정규화 테이블 미채택 — 항목 5~10개 수준, 한 번에 묶어 편집, 단일 관리자 도구라 YAGNI). 저장은 기존 `PUT /settings` 한 경로로 다른 설정과 함께 원자적으로 처리한다.

`config.js`의 상수는 **시드 겸 폴백 원천**으로만 남긴다: DB 배열이 비어 있으면 `getSettings`가 기본값을 채워 반환하므로 UI는 첫 진입부터 기존 5+5개를 보여주고, 첫 저장 시 DB에 영구화된다. SQL에 시드 JSON을 중복으로 박지 않는다.

## 3. 데이터 모델

`grafana_report_settings`에 컬럼 추가:
- `metrics jsonb NOT NULL DEFAULT '[]'::jsonb` — `[{label, query, threshold, enabled}]`
- `log_queries jsonb NOT NULL DEFAULT '[]'::jsonb` — `[{label, query, enabled}]`

기존 단일 행은 ALTER의 DEFAULT로 `'[]'`가 채워진다. 형태 검증은 앱 레이어(`PUT /settings`)에서 수행한다(JSONB 레벨 CHECK 없음).

**항목 스키마**
- metric: `label`(비어있지 않은 문자열), `query`(비어있지 않은 문자열), `threshold`(유한수), `enabled`(불리언, 누락 시 true 취급)
- log query: `label`(비어있지 않은 문자열), `query`(비어있지 않은 문자열), `enabled`(불리언, 누락 시 true 취급)

**상한(검증):** 각 배열 최대 50항목, 개별 `query` 길이 최대 2000자, `label` 최대 200자.

## 4. enabled 동작

`gatherReportData`는 `enabled !== false`인 항목만 Grafana에 조회한다. **비활성 항목은 리포트(메트릭 표·로그 표)에서 통째 제외**된다(값/카운트 0이 아니라 행 자체가 빠짐). 삭제 없이 일시 제외하는 용도.

## 5. 적용 범위

- **웹 `/report`와 예약 `/tick` 모두** 설정의 `metrics`·`log_queries`를 동일하게 사용(단일 설정원).
- 메트릭 임계값(threshold) 판정 로직(`buildReport`)·이메일 템플릿·스케줄·라벨 표시 불변.
- `LOG_HOURS`(24)·`LOG_FETCH`(50)·`log_lag_hours` 등 시간창 설정은 이번 범위 밖(그대로).

## 6. 변경 파일 / 인터페이스

| 파일 | 변경 |
|------|------|
| 마이그레이션 `supabase/migrations/20260617000000_add_grafana_queries.sql` | `metrics jsonb`, `log_queries jsonb` 컬럼 추가(멱등 `ADD COLUMN IF NOT EXISTS`). **`supabase db push` 금지 — Management API로 적용** |
| `server/grafana/config.js` | `METRICS`→`DEFAULT_METRICS`, `LOG_QUERIES`→`DEFAULT_LOG_QUERIES`로 개명. 각 항목에 `enabled: true` 추가. 시드·폴백 원천으로만 사용 |
| `server/grafana/settings.js` | `getSettings`: `metrics`/`log_queries`가 비어 있으면 `DEFAULT_*`로 채워 반환. `saveSettings({..., metrics, log_queries})`: 두 배열 저장에 포함 |
| `server/grafana/client.js` | `METRICS`/`LOG_QUERIES` import 제거. `gatherReportData(metrics, logQueries, lagHours)` — 인자로 받은 배열 사용, `enabled !== false`만 필터해 조회. 로그 결과 매핑도 필터된 배열 기준 |
| `server/routes/grafana.js` | `/report`·`/tick`: `getSettings()` 후 `gatherReportData(settings.metrics, settings.log_queries, lagFrom(settings))` 호출. `PUT /settings`: `metrics`·`log_queries` 형태·상한 검증(아니면 400), `saveSettings`에 전달 |
| `src/lib/api/grafana.js` | 변경 없음(이미 body 전체 송수신) |
| `src/components/grafana/GrafanaSettings.jsx` | 로드/저장 state에 `metrics`·`log_queries` 추가. 두 편집 섹션 렌더. 저장 payload에 포함 |
| `src/components/grafana/QueryListEditor.jsx` (신규) | 행 리스트 편집 서브컴포넌트. props로 컬럼 정의를 받아 메트릭/로그 양쪽에 재사용 |
| `src/index.css` | 행 편집 UI용 최소 스타일(기존 `.form-*` 최대한 재사용) |

### gatherReportData 명세
```
gatherReportData(metrics, logQueries, lagHours) →
  metrics = metrics.filter(m => m.enabled !== false) 만 queryPrometheus
  logQueries 활성분 = logQueries.filter(q => q.enabled !== false)
  queryElasticsearch(활성분, LOG_HOURS, LOG_FETCH, lagHours)
  return { metrics: [...], logs: [...] }   // 비활성 항목은 포함 안 함
```

### getSettings 폴백 명세
```
const row = <singleton>
return {
  ...row,
  metrics:     row.metrics?.length     ? row.metrics     : DEFAULT_METRICS,
  log_queries: row.log_queries?.length ? row.log_queries : DEFAULT_LOG_QUERIES,
}
```

## 7. 프론트엔드 UI

`GrafanaSettings.jsx`에 기존 필드 아래로 두 섹션 추가, **기존 단일 “저장” 버튼으로 함께 PUT**:

- **메트릭 쿼리** 섹션: 행마다 `label` / `query` / `threshold` 입력 + enabled 체크박스 + 삭제 버튼. “+ 메트릭 추가” 버튼이 빈 행 append.
- **로그 쿼리** 섹션: 행마다 `label` / `query` 입력 + enabled 체크박스 + 삭제 버튼. “+ 로그 쿼리 추가” 버튼.

`QueryListEditor`는 `{ items, columns, onChange }`를 받아 행 추가/삭제/필드변경을 처리하는 범용 컴포넌트. `columns`로 메트릭(3필드)·로그(2필드) 차이를 흡수.

클라이언트 측 가벼운 가드: `label`/`query`가 빈 행이 있으면 저장 비활성 또는 경고(서버 검증이 최종 권위). 서버 400 메시지를 가능하면 UI에 노출(현재는 일괄 “저장에 실패했습니다.”).

## 8. 범위 밖 (YAGNI)

- 저장 전 “쿼리 테스트/미리보기”(Grafana 실호출 검증) — 후속 과제.
- 드래그 정렬 — 배열 순서 = 추가 순서로 충분.
- 항목별 메타데이터(설명, 심각도 등) — 불필요.

## 9. 테스트

- `routes/grafana.test.js`:
  - `PUT /settings`: 정상 `metrics`/`log_queries` 저장 시 `saveSettings`가 두 배열 포함해 호출됨.
  - 비정상 형태(메트릭 threshold 비수치, label 빈문자열, query 빈문자열, 배열 아님, 상한 초과) → 400.
  - `/report`·`/tick`: `gatherReportData`가 설정의 `metrics`·`log_queries`로 호출되는지(모킹 인자 확인).
- `report.test.js` 또는 `client` 단위테스트:
  - `gatherReportData`가 `enabled === false` 항목을 조회·결과에서 제외.
  - `getSettings` 폴백: DB 배열 비어 있을 때 `DEFAULT_*` 반환.

## 10. 작업 방식

- 브랜치 `feature/grafana-query-management`에서 진행(main 직접 금지).
- 마이그레이션은 `supabase db push` 금지 — `.env`의 `SUPABASE_ACCESS_TOKEN` 기반 Management API로 멱등 SQL 적용.
