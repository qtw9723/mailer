# 설계 — Grafana 모니터링 쿼리 UI 관리

> 작성일 2026-06-17. 프로젝트 `/Users/sangjun/IdeaProjects/mailer`.
> 배경: 모니터링 대상 쿼리(Prometheus 메트릭 5개, ES 로그 쿼리 5개)가 `server/grafana/config.js`에 하드코딩돼 있어, 항목을 추가·수정·삭제하려면 코드 배포가 필요하다. 이를 설정 탭(`GrafanaSettings.jsx`)에서 UI로 직접 관리하도록 한다.

## 1. 목적

`config.js`의 `METRICS`(`{label, query, threshold}`)와 `LOG_QUERIES`(`{label, query}`)를 Supabase에 저장하고, 설정 UI에서 **추가/수정/삭제 + 항목별 enabled 토글**로 관리한다. 코드 배포 없이 모니터링 대상을 바꿀 수 있게 한다. 신규·수정한 쿼리는 **테스트(Grafana 실호출)에 통과해야 등록**할 수 있다(§8).

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
| `server/grafana/client.js` | `METRICS`/`LOG_QUERIES` import 제거. `gatherReportData(metrics, logQueries, lagHours)` — 인자로 받은 배열 사용, `enabled !== false`만 필터해 조회. 로그 결과 매핑도 필터된 배열 기준. (단일 쿼리 테스트는 기존 `queryPrometheus`/`queryElasticsearch` 재사용) |
| `server/routes/grafana.js` | `/report`·`/tick`: `getSettings()` 후 `gatherReportData(settings.metrics, settings.log_queries, lagFrom(settings))` 호출. `PUT /settings`: `metrics`·`log_queries` 형태·상한 검증(아니면 400), `saveSettings`에 전달. **`POST /test-query` 신규**(§8) |
| `src/lib/api/grafana.js` | `testQuery({ type, query }, password)` 추가. updateSettings는 변경 없음(body 전체 송수신) |
| `src/components/grafana/GrafanaSettings.jsx` | 로드/저장 state에 `metrics`·`log_queries` 추가. 두 편집 섹션 렌더. 저장 payload에 포함. 행별 테스트 상태 추적 + 게이트로 저장 버튼 제어(§8) |
| `src/components/grafana/QueryListEditor.jsx` (신규) | 행 리스트 편집 서브컴포넌트. props로 컬럼 정의를 받아 메트릭/로그 양쪽에 재사용. 행별 “테스트” 버튼·상태 배지 포함 |
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

## 8. 쿼리 테스트 게이트

쿼리는 **테스트 통과 후에만 등록(저장)** 할 수 있다.

### 테스트 엔드포인트
`POST /api/grafana/test-query` (auth: `x-app-password`)
- body: `{ type: 'metric' | 'log', query: string }`
- `metric` → `queryPrometheus(query)` 1회 실행. 성공 시 `{ ok: true, value }`(value가 null=데이터 없음이어도 ok). 예외 시 `{ ok: false, error }`.
- `log` → `queryElasticsearch([{ label: '_test', query }], LOG_HOURS, LOG_FETCH, 0)` 1회. 성공 시 `{ ok: true, count }`. 예외 시 `{ ok: false, error }`. (lagHours는 통과/실패에 무관하므로 0 고정 — “실행되는가”만 본다.)
- 검증: `type`∈{metric,log}, `query` 비어있지 않은 문자열·길이 ≤2000. 아니면 400.
- **HTTP 코드 구분**: 요청 형식 오류만 400. **쿼리 실행 실패는 HTTP 200 + `{ ok: false, error }`**(쿼리 자체가 깨졌다는 건 정상 응답으로 보고, 클라이언트가 ok 플래그로 통과/실패 판정). 401은 인증 실패.
- 쿼리는 `APP_PASSWORD` 뒤의 관리자 입력으로, 저장될 쿼리와 동일 신뢰 수준. 실행 위험 동일.

### 통과 기준
**에러 없이 실행되면 통과.** Grafana가 쿼리를 정상 수락·파싱하면 OK이며, 데이터 0건·null도 통과로 본다(예: Pod 재시작 0, 로그 히트 없음은 정상 상황).

### 게이트 범위 (신규·수정된 행만)
- 로드된 기존 행은 마지막 저장된 `query`를 “검증된 값(grandfather)”으로 신뢰한다.
- 어떤 행이 **저장 가능(good)** 한 조건: 현재 `query`가 그 행의 마지막 저장 `query`와 동일(미변경) **또는** 현재 `query`에 대해 테스트 통과.
- 신규 행은 마지막 저장 `query`가 없으므로 **반드시 테스트 통과해야** 저장 가능.
- `query` 텍스트를 수정하면 통과 상태가 풀려 재테스트 필요. **`label`·`threshold`·`enabled` 변경은 게이트와 무관**(Grafana 호출에 영향 없음).
- 게이트는 `enabled`와 독립이다: 비활성 신규/수정 행도 저장하려면 통과해야 한다(나중에 활성화될 때 깨진 쿼리가 등록돼 있는 것을 방지). 테스트하기 싫으면 그 행을 삭제.

### 상태 추적 (프론트)
각 행에 비저장 메타 보유: `_savedQuery`(로드 시 = 저장된 query, 신규는 없음), 테스트 결과(`untested`/`passed`/`failed`)와 통과 시점의 `_testedQuery`.
- “good” = `query === _savedQuery` 또는 (`passed` && `_testedQuery === query`).
- 하나라도 good 아닌 행이 있으면 **저장 버튼 비활성**, 어느 행이 테스트 필요한지 표시.
- 테스트 실패/네트워크 오류 → ✗ 배지 + 메시지, 해당 행은 테스트 필요 상태 유지(저장 차단), 재시도 가능.

### 서버 권위 범위
게이트는 **클라이언트 UX 차원**이다. 서버는 저장 시 형태·상한(§3) 검증은 하되, “테스트됐는지”는 추적하지 않는다(저장마다 전 쿼리 재실행은 과함). 신규/수정 쿼리의 Grafana 실행 검증은 클라이언트 테스트 게이트가 담당.

## 9. 범위 밖 (YAGNI)

- 드래그 정렬 — 배열 순서 = 추가 순서로 충분.
- 항목별 메타데이터(설명, 심각도 등) — 불필요.
- “전체 테스트” 일괄 버튼 — 행별 테스트로 충분(추후 추가 가능).

## 10. 테스트

- `routes/grafana.test.js`:
  - `PUT /settings`: 정상 `metrics`/`log_queries` 저장 시 `saveSettings`가 두 배열 포함해 호출됨.
  - 비정상 형태(메트릭 threshold 비수치, label 빈문자열, query 빈문자열, 배열 아님, 상한 초과) → 400.
  - `/report`·`/tick`: `gatherReportData`가 설정의 `metrics`·`log_queries`로 호출되는지(모킹 인자 확인).
  - `POST /test-query`: `type:'metric'` → `queryPrometheus` 호출, 성공 `{ok:true,value}`/예외 `{ok:false,error}`. `type:'log'` → `queryElasticsearch` 호출, `{ok:true,count}`. 잘못된 `type`·빈 `query`·길이 초과 → 400. (client 모킹)
- `report.test.js` 또는 `client` 단위테스트:
  - `gatherReportData`가 `enabled === false` 항목을 조회·결과에서 제외.
  - `getSettings` 폴백: DB 배열 비어 있을 때 `DEFAULT_*` 반환.

## 11. 작업 방식

- 브랜치 `feature/grafana-query-management`에서 진행(main 직접 금지).
- 마이그레이션은 `supabase db push` 금지 — `.env`의 `SUPABASE_ACCESS_TOKEN` 기반 Management API로 멱등 SQL 적용.
