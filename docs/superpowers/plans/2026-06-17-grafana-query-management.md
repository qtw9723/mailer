# Grafana 모니터링 쿼리 UI 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `config.js`에 하드코딩된 Grafana 모니터링 쿼리(메트릭·로그)를 설정 탭 UI에서 CRUD+enabled 토글로 관리하고, 신규·수정 쿼리는 테스트(Grafana 실호출) 통과 후에만 등록되게 한다.

**Architecture:** 쿼리 배열을 기존 싱글톤 설정 행(`grafana_report_settings`)의 JSONB 컬럼 2개에 저장한다. `config.js` 상수는 시드 겸 폴백으로만 남긴다. 백엔드는 설정에서 읽은 쿼리 배열을 `gatherReportData`에 인자로 넘기고 `enabled !== false`만 조회한다. 테스트 게이트는 프론트의 순수 함수로 판정한다. 단일 쿼리 검증은 `POST /test-query` 엔드포인트가 처리한다.

**Tech Stack:** Node/Express(ESM), Supabase(JS client + Management API), Vite + React 19, vitest + supertest, @testing-library/react.

**관련 스펙:** `docs/superpowers/specs/2026-06-17-grafana-query-management-design.md`

**작업 규칙:**
- 브랜치 `feature/grafana-query-management`에서 진행(이미 생성됨, main 직접 금지).
- 마이그레이션은 `supabase db push` 금지 — `.env`의 `SUPABASE_ACCESS_TOKEN` 기반 Management API로 적용.
- 테스트 실행: `npm test`(= `vitest run`). 린트: `npm run lint`.

---

## Task 1: 마이그레이션 — metrics/log_queries JSONB 컬럼 추가

**Files:**
- Create: `supabase/migrations/20260617000000_add_grafana_queries.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성 (멱등)**

`supabase/migrations/20260617000000_add_grafana_queries.sql`:
```sql
-- grafana_report_settings에 모니터링 쿼리 저장 컬럼 추가.
-- metrics: [{label, query, threshold, enabled}], log_queries: [{label, query, enabled}]
-- 비어 있으면(기본 '[]') 앱이 config.js의 DEFAULT_METRICS/DEFAULT_LOG_QUERIES로 폴백한다.
ALTER TABLE grafana_report_settings
  ADD COLUMN IF NOT EXISTS metrics     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS log_queries JSONB NOT NULL DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: Management API로 적용 (`supabase db push` 금지)**

Run (프로젝트 루트에서):
```bash
set -a; . ./.env; set +a
node -e '
const fs=require("fs");
const sql=fs.readFileSync("supabase/migrations/20260617000000_add_grafana_queries.sql","utf8");
const ref="enawzdqroidrhtjqhpka";
fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{
  method:"POST",
  headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"},
  body:JSON.stringify({query:sql}),
}).then(async r=>{console.log("HTTP",r.status,await r.text())});
'
```
Expected: `HTTP 200` または `HTTP 201`, 본문 `[]`(빈 결과). 멱등이라 재실행해도 동일.

- [ ] **Step 3: 컬럼 생성 확인**

Run:
```bash
set -a; . ./.env; set +a
node -e '
const ref="enawzdqroidrhtjqhpka";
const sql="SELECT column_name FROM information_schema.columns WHERE table_name=\x27grafana_report_settings\x27 AND column_name IN (\x27metrics\x27,\x27log_queries\x27) ORDER BY column_name;";
fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{
  method:"POST",
  headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"},
  body:JSON.stringify({query:sql}),
}).then(async r=>{console.log(await r.text())});
'
```
Expected: `[{"column_name":"log_queries"},{"column_name":"metrics"}]`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260617000000_add_grafana_queries.sql
git commit -m "feat(grafana): metrics/log_queries JSONB 컬럼 마이그레이션"
```

---

## Task 2: config.js — DEFAULT_* 개명 + enabled + 순수 헬퍼

**Files:**
- Modify: `server/grafana/config.js`
- Test: `server/grafana/config.test.js` (Create)

- [ ] **Step 1: 실패 테스트 작성**

`server/grafana/config.test.js`:
```js
// server/grafana/config.test.js
import { describe, it, expect } from 'vitest'
import { activeQueries, withQueryDefaults, DEFAULT_METRICS, DEFAULT_LOG_QUERIES } from './config.js'

describe('activeQueries', () => {
  it('enabled:false 항목 제외, enabled 없으면 포함', () => {
    const items = [{ label: 'a', enabled: true }, { label: 'b', enabled: false }, { label: 'c' }]
    expect(activeQueries(items).map((x) => x.label)).toEqual(['a', 'c'])
  })
  it('null/undefined → 빈 배열', () => {
    expect(activeQueries(null)).toEqual([])
    expect(activeQueries(undefined)).toEqual([])
  })
})

describe('withQueryDefaults', () => {
  it('metrics/log_queries 비어 있으면 기본값으로 채움', () => {
    const out = withQueryDefaults({ id: 1, metrics: [], log_queries: null })
    expect(out.metrics).toBe(DEFAULT_METRICS)
    expect(out.log_queries).toBe(DEFAULT_LOG_QUERIES)
  })
  it('값이 있으면 그대로 둠', () => {
    const m = [{ label: 'x', query: 'q', threshold: 1, enabled: true }]
    const out = withQueryDefaults({ id: 1, metrics: m, log_queries: m })
    expect(out.metrics).toBe(m)
    expect(out.log_queries).toBe(m)
  })
  it('다른 필드 보존', () => {
    const out = withQueryDefaults({ id: 1, send_hour: 9, metrics: [], log_queries: [] })
    expect(out.send_hour).toBe(9)
  })
  it('기본 상수에 enabled:true가 들어있다', () => {
    expect(DEFAULT_METRICS.every((m) => m.enabled === true)).toBe(true)
    expect(DEFAULT_LOG_QUERIES.every((q) => q.enabled === true)).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- server/grafana/config.test.js`
Expected: FAIL (`activeQueries`/`withQueryDefaults`가 export되지 않음).

- [ ] **Step 3: config.js 구현**

`server/grafana/config.js` 전체를 다음으로 교체:
```js
// server/grafana/config.js
// 모니터링 쿼리 기본값(시드 겸 폴백). 실제 런타임 값은 grafana_report_settings 설정에서 읽는다.

export const DEFAULT_METRICS = [
  { label: 'CPU 사용률(최대, %)',
    query: 'max(max_over_time((100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))[24h:5m]))',
    threshold: 80, enabled: true },
  { label: '메모리 사용률(최대, %)',
    query: 'max(max_over_time(((1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100)[24h:5m]))',
    threshold: 85, enabled: true },
  { label: '디스크 사용률(최대, %)',
    query: 'max(max_over_time(((1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"} / node_filesystem_size_bytes)) * 100)[24h:5m]))',
    threshold: 85, enabled: true },
  { label: '비정상 상태 Pod 수',
    query: 'max(max_over_time(sum(kube_pod_status_phase{phase=~"Pending|Failed|Unknown"})[24h:5m]))',
    threshold: 0, enabled: true },
  { label: '최근 24시간 Pod 재시작 횟수',
    query: 'sum(increase(kube_pod_container_status_restarts_total[24h]))',
    threshold: 0, enabled: true },
]

export const DEFAULT_LOG_QUERIES = [
  { label: 'chatbot',  query: 'app.keyword:"chatbot" && error', enabled: true },
  { label: 'soe',      query: 'app.keyword:"soe" && error', enabled: true },
  { label: 'c3',       query: 'app.keyword:"c3" && error', enabled: true },
  { label: 'webhook',  query: 'app.keyword:"webhook" && error', enabled: true },
  { label: 'docstore', query: 'app.keyword:"docstore" && error', enabled: true },
]

export const LOG_HOURS = 24
export const LOG_FETCH = 50
export const LOG_SHOW = 5

// 로그 적재 지연 보정 기본값(시간). 설정(log_lag_hours)이 없을 때의 폴백.
export const LOG_INDEX_LAG_HOURS = 3

// 활성(enabled !== false) 항목만 남긴다.
export function activeQueries(items) {
  return (items ?? []).filter((q) => q.enabled !== false)
}

// 설정 행의 metrics/log_queries가 비어 있으면 기본값으로 채워 반환.
export function withQueryDefaults(row) {
  return {
    ...row,
    metrics: row?.metrics?.length ? row.metrics : DEFAULT_METRICS,
    log_queries: row?.log_queries?.length ? row.log_queries : DEFAULT_LOG_QUERIES,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- server/grafana/config.test.js`
Expected: PASS (전부). (이 시점에 `client.js`는 아직 `METRICS`를 import하므로 전체 `npm test`는 깨질 수 있음 — Task 3에서 해소. 여기서는 config.test.js만 돌린다.)

- [ ] **Step 5: Commit**

```bash
git add server/grafana/config.js server/grafana/config.test.js
git commit -m "feat(grafana): config DEFAULT_* 개명 + enabled + activeQueries/withQueryDefaults"
```

---

## Task 3: settings.js / client.js / routes 배선 — 설정 쿼리를 리포트에 연결

**Files:**
- Modify: `server/grafana/settings.js`
- Modify: `server/grafana/client.js`
- Modify: `server/routes/grafana.js`
- Test: `server/routes/grafana.test.js` (기존 어서션 갱신)

- [ ] **Step 1: 기존 라우트 테스트의 gatherReportData 어서션을 새 시그니처로 갱신 (실패 유도)**

`server/routes/grafana.test.js`에서 아래 3개 어서션을 교체한다.

(a) `describe('GET /api/grafana/report')`의 `'설정의 log_lag_hours로 gatherReportData 호출'`:
```js
  it('설정의 log_lag_hours로 gatherReportData 호출', async () => {
    getSettings.mockResolvedValueOnce({ recipients: ['a@x.com'], send_hour: 9, enabled: true, log_lag_hours: 2 })
    gatherReportData.mockResolvedValueOnce(SAMPLE)
    await request(app).get('/api/grafana/report').set('x-app-password', 'test-pw')
    expect(gatherReportData).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), 2)
  })
```
(b) 같은 describe의 `'설정 조회 실패해도 기본 오프셋(3)으로 리포트 반환'`:
```js
  it('설정 조회 실패해도 기본 오프셋(3)으로 리포트 반환', async () => {
    getSettings.mockRejectedValueOnce(new Error('db down'))
    gatherReportData.mockResolvedValueOnce(SAMPLE)
    const res = await request(app).get('/api/grafana/report').set('x-app-password', 'test-pw')
    expect(res.status).toBe(200)
    expect(gatherReportData).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), 3)
  })
```
(c) `describe('GET /api/grafana/tick')`의 `'발송 조건 충족 시 ...'` — getSettings 모킹에 metrics/log_queries 추가하고 어서션 교체:
```js
  it('발송 조건 충족 시 설정 recipients/lag로 발송 후 markSent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T00:00:00Z'))
    try {
      const M = [{ label: 'CPU', query: 'up', threshold: 80, enabled: true }]
      const L = [{ label: 'soe', query: 'error', enabled: true }]
      getSettings.mockResolvedValueOnce({ recipients: ['a@x.com'], send_hour: 9, enabled: true, last_sent_date: '2000-01-01', log_lag_hours: 4, metrics: M, log_queries: L })
      gatherReportData.mockResolvedValueOnce(SAMPLE)
      sendReportEmail.mockResolvedValueOnce()
      const res = await request(app).get('/api/grafana/tick').set('Authorization', 'Bearer cron-secret')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ sent: true, alerts: 0 })
      expect(gatherReportData).toHaveBeenCalledWith(M, L, 4)
      expect(sendReportEmail).toHaveBeenCalledOnce()
      expect(sendReportEmail.mock.calls[0][1]).toEqual(['a@x.com'])
      expect(markSent).toHaveBeenCalledOnce()
      expect(markSent.mock.calls[0][0]).toBe('2026-06-05')
    } finally {
      vi.useRealTimers()
    }
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- server/routes/grafana.test.js`
Expected: FAIL (현재 라우트는 `gatherReportData(lagHours)` 1-인자 호출이라 어서션 불일치).

- [ ] **Step 3: settings.js 수정 — getSettings 폴백, saveSettings 부분 업데이트**

`server/grafana/settings.js` 전체를 다음으로 교체:
```js
import db from '../db.js'
import { withQueryDefaults } from './config.js'

const TABLE = 'grafana_report_settings'
const SINGLETON_ID = 1

// 싱글톤 행 조회. 없으면 기본값으로 생성 후 반환. metrics/log_queries는 비어 있으면 기본값으로 채움.
export async function getSettings() {
  const { data, error } = await db.from(TABLE).select('*').eq('id', SINGLETON_ID).maybeSingle()
  if (error) throw error
  if (data) return withQueryDefaults(data)

  const { data: created, error: insErr } = await db
    .from(TABLE)
    .insert({ id: SINGLETON_ID })
    .select('*')
    .single()
  if (insErr) throw insErr
  return withQueryDefaults(created)
}

// 제공된 필드만 저장(undefined 키는 건드리지 않음 — 부분 업데이트).
export async function saveSettings(fields) {
  const allowed = ['recipients', 'send_hour', 'enabled', 'log_lag_hours', 'metrics', 'log_queries']
  const update = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (fields[k] !== undefined) update[k] = fields[k]

  const { data, error } = await db
    .from(TABLE)
    .update(update)
    .eq('id', SINGLETON_ID)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// 발송 성공 후 마지막 발송 날짜 기록.
export async function markSent(dateStr) {
  const { error } = await db
    .from(TABLE)
    .update({ last_sent_date: dateStr })
    .eq('id', SINGLETON_ID)
  if (error) throw error
}
```

- [ ] **Step 4: client.js 수정 — gatherReportData가 쿼리 배열을 인자로 받음**

`server/grafana/client.js` 상단 import를 교체:
```js
import { LOG_HOURS, LOG_FETCH, LOG_INDEX_LAG_HOURS, activeQueries } from './config.js'
import { extractPromValue, normalizeEsIndex, parseEsResponses, esLogRange } from './report.js'
```
그리고 파일 맨 끝의 `gatherReportData` 함수를 다음으로 교체:
```js
// 메트릭/로그를 모두 조회해 buildReport 입력 형태로 반환. 비활성 항목 제외, 개별 실패는 격리.
export async function gatherReportData(metrics, logQueries, lagHours = LOG_INDEX_LAG_HOURS) {
  const activeMetrics = activeQueries(metrics)
  const m = await Promise.all(activeMetrics.map(async (mt) => {
    try {
      const value = await queryPrometheus(mt.query)
      return { label: mt.label, value, threshold: mt.threshold, error: value == null ? '데이터 없음' : null }
    } catch {
      return { label: mt.label, value: null, threshold: mt.threshold, error: '조회 실패' }
    }
  }))

  const activeLogs = activeQueries(logQueries)
  let logs
  try {
    const res = await queryElasticsearch(activeLogs, LOG_HOURS, LOG_FETCH, lagHours)
    logs = activeLogs.map((lq) => ({
      app: lq.label,
      count: res[lq.label]?.count ?? 0,
      rows: res[lq.label]?.rows ?? [],
      error: null,
    }))
  } catch {
    logs = activeLogs.map((lq) => ({ app: lq.label, count: 0, rows: [], error: '조회 실패' }))
  }

  return { metrics: m, logs }
}
```
(주의: `queryElasticsearch`에 빈 배열이 들어가면 `_msearch` 페이로드가 빈 문자열이 되어 호출이 무의미하지만, 호출 자체는 안전하다. 전 항목 비활성은 드물고 결과는 빈 logs로 정상 처리됨.)

- [ ] **Step 5: routes/grafana.js 수정 — /report·/tick가 설정 쿼리 전달**

`server/routes/grafana.js` 상단 import에 `DEFAULT_METRICS, DEFAULT_LOG_QUERIES` 추가:
```js
import { LOG_INDEX_LAG_HOURS, DEFAULT_METRICS, DEFAULT_LOG_QUERIES } from '../grafana/config.js'
```
`GET /report` 핸들러를 다음으로 교체:
```js
// GET /api/grafana/report — 웹 on-demand 조회 (설정의 쿼리·오프셋 적용)
router.get('/report', auth, async (_req, res) => {
  let settings = null
  try { settings = await getSettings() } catch { /* 설정 조회 실패 시 기본값 */ }
  const lagHours = lagFrom(settings)
  const metrics = settings?.metrics ?? DEFAULT_METRICS
  const logQueries = settings?.log_queries ?? DEFAULT_LOG_QUERIES
  try {
    const report = buildReport(await gatherReportData(metrics, logQueries, lagHours))
    res.json(report)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})
```
`GET /tick` 핸들러 안의 리포트 생성 줄을 교체:
```js
    const report = buildReport(await gatherReportData(settings.metrics, settings.log_queries, lagFrom(settings)))
```
(`lagFrom`는 `settings`가 null이어도 안전하게 기본값 반환하도록 이미 작성돼 있음: `Number.isInteger(undefined)` → false → `LOG_INDEX_LAG_HOURS`.)

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `npm test`
Expected: PASS (config.test.js, routes/grafana.test.js 포함 전체 green). 특히 갱신한 3개 어서션 통과.

- [ ] **Step 7: Commit**

```bash
git add server/grafana/settings.js server/grafana/client.js server/routes/grafana.js server/routes/grafana.test.js
git commit -m "feat(grafana): 설정의 metrics/log_queries를 리포트 조회에 연결"
```

---

## Task 4: PUT /settings — metrics/log_queries 검증·저장

**Files:**
- Modify: `server/routes/grafana.js`
- Test: `server/routes/grafana.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`server/routes/grafana.test.js`의 `describe('PUT /api/grafana/settings')` 안에 추가:
```js
  it('정상 metrics/log_queries 저장 시 saveSettings에 포함', async () => {
    const M = [{ label: 'CPU', query: 'up', threshold: 80, enabled: true }]
    const L = [{ label: 'soe', query: 'error', enabled: false }]
    saveSettings.mockResolvedValueOnce({ id: 1, recipients: ['a@x.com'], send_hour: 8, enabled: true, log_lag_hours: 3, metrics: M, log_queries: L })
    const res = await request(app).put('/api/grafana/settings')
      .set('x-app-password', 'test-pw')
      .send({ recipients: ['a@x.com'], send_hour: 8, enabled: true, metrics: M, log_queries: L })
    expect(res.status).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ recipients: ['a@x.com'], send_hour: 8, enabled: true, log_lag_hours: 3, metrics: M, log_queries: L })
  })
  it('metric threshold가 숫자 아니면 400', async () => {
    const res = await request(app).put('/api/grafana/settings').set('x-app-password', 'test-pw')
      .send({ recipients: [], send_hour: 8, enabled: true, metrics: [{ label: 'x', query: 'q', threshold: 'NaN', enabled: true }] })
    expect(res.status).toBe(400)
  })
  it('metric label 빈 문자열이면 400', async () => {
    const res = await request(app).put('/api/grafana/settings').set('x-app-password', 'test-pw')
      .send({ recipients: [], send_hour: 8, enabled: true, metrics: [{ label: '  ', query: 'q', threshold: 1, enabled: true }] })
    expect(res.status).toBe(400)
  })
  it('log query 빈 문자열이면 400', async () => {
    const res = await request(app).put('/api/grafana/settings').set('x-app-password', 'test-pw')
      .send({ recipients: [], send_hour: 8, enabled: true, log_queries: [{ label: 'soe', query: '', enabled: true }] })
    expect(res.status).toBe(400)
  })
  it('metrics가 배열 아니면 400', async () => {
    const res = await request(app).put('/api/grafana/settings').set('x-app-password', 'test-pw')
      .send({ recipients: [], send_hour: 8, enabled: true, metrics: { not: 'array' } })
    expect(res.status).toBe(400)
  })
  it('항목 수 상한(50) 초과면 400', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ label: `m${i}`, query: 'q', threshold: 1, enabled: true }))
    const res = await request(app).put('/api/grafana/settings').set('x-app-password', 'test-pw')
      .send({ recipients: [], send_hour: 8, enabled: true, metrics: many })
    expect(res.status).toBe(400)
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- server/routes/grafana.test.js`
Expected: FAIL (검증 미구현 — 잘못된 입력에도 400이 아니거나 saveSettings 인자 불일치).

- [ ] **Step 3: 검증 헬퍼 + PUT 핸들러 구현**

`server/routes/grafana.js`에서 `auth`/`envRecipients`/`lagFrom` 헬퍼 근처에 추가:
```js
const ARRAY_MAX = 50
const QUERY_MAX = 2000
const LABEL_MAX = 200

function isStr(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max
}
function isValidMetricArray(arr) {
  if (!Array.isArray(arr) || arr.length > ARRAY_MAX) return false
  return arr.every((m) =>
    m && typeof m === 'object' &&
    isStr(m.label, LABEL_MAX) && isStr(m.query, QUERY_MAX) &&
    typeof m.threshold === 'number' && Number.isFinite(m.threshold) &&
    typeof m.enabled === 'boolean')
}
function isValidLogArray(arr) {
  if (!Array.isArray(arr) || arr.length > ARRAY_MAX) return false
  return arr.every((q) =>
    q && typeof q === 'object' &&
    isStr(q.label, LABEL_MAX) && isStr(q.query, QUERY_MAX) &&
    typeof q.enabled === 'boolean')
}
```
`PUT /settings` 핸들러에서 `cleanRecipients` 산출 후, `saveSettings` 호출 직전 부분을 다음으로 교체:
```js
  const cleanRecipients = Array.isArray(recipients)
    ? recipients.map((s) => String(s).trim()).filter(Boolean)
    : []

  const payload = { recipients: cleanRecipients, send_hour, enabled: !!enabled, log_lag_hours }
  if (req.body.metrics !== undefined) {
    if (!isValidMetricArray(req.body.metrics)) return res.status(400).json({ error: 'invalid metrics' })
    payload.metrics = req.body.metrics
  }
  if (req.body.log_queries !== undefined) {
    if (!isValidLogArray(req.body.log_queries)) return res.status(400).json({ error: 'invalid log_queries' })
    payload.log_queries = req.body.log_queries
  }

  try {
    const saved = await saveSettings(payload)
    res.json(saved)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
```
(기존 `saveSettings({ recipients: cleanRecipients, send_hour, enabled: !!enabled, log_lag_hours })` 호출 블록을 위 내용으로 대체. metrics/log_queries 미포함 PUT은 payload에 해당 키가 없어 기존 동작·기존 테스트와 동일.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- server/routes/grafana.test.js`
Expected: PASS (신규 검증 테스트 + 기존 PUT 테스트 모두).

- [ ] **Step 5: Commit**

```bash
git add server/routes/grafana.js server/routes/grafana.test.js
git commit -m "feat(grafana): PUT /settings에 metrics/log_queries 검증·저장"
```

---

## Task 5: POST /test-query — 단일 쿼리 실호출 검증

**Files:**
- Modify: `server/routes/grafana.js`
- Test: `server/routes/grafana.test.js`

- [ ] **Step 1: client.js 모킹 확장 + 실패 테스트 작성**

`server/routes/grafana.test.js` 상단의 client 모킹을 교체:
```js
vi.mock('../grafana/client.js', () => ({ gatherReportData: vi.fn(), queryPrometheus: vi.fn(), queryElasticsearch: vi.fn() }))
```
그리고 import 줄을 교체:
```js
import { gatherReportData, queryPrometheus, queryElasticsearch } from '../grafana/client.js'
import { LOG_HOURS, LOG_FETCH } from '../grafana/config.js'
```
파일 끝에 describe 추가:
```js
describe('POST /api/grafana/test-query', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).post('/api/grafana/test-query').send({ type: 'metric', query: 'up' })
    expect(res.status).toBe(401)
  })
  it('type 잘못되면 400', async () => {
    const res = await request(app).post('/api/grafana/test-query').set('x-app-password', 'test-pw').send({ type: 'x', query: 'up' })
    expect(res.status).toBe(400)
  })
  it('query 비면 400', async () => {
    const res = await request(app).post('/api/grafana/test-query').set('x-app-password', 'test-pw').send({ type: 'metric', query: '   ' })
    expect(res.status).toBe(400)
  })
  it('metric 정상 → queryPrometheus 호출, ok:true (value null도 ok)', async () => {
    queryPrometheus.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/grafana/test-query').set('x-app-password', 'test-pw').send({ type: 'metric', query: 'up' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, value: null })
    expect(queryPrometheus).toHaveBeenCalledWith('up')
  })
  it('metric 실행 실패 → HTTP 200 + ok:false', async () => {
    queryPrometheus.mockRejectedValueOnce(new Error('bad expr'))
    const res = await request(app).post('/api/grafana/test-query').set('x-app-password', 'test-pw').send({ type: 'metric', query: 'bad(' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toBe('bad expr')
  })
  it('log 정상 → queryElasticsearch 호출, count 반환', async () => {
    queryElasticsearch.mockResolvedValueOnce({ _test: { count: 3, rows: [] } })
    const res = await request(app).post('/api/grafana/test-query').set('x-app-password', 'test-pw').send({ type: 'log', query: 'error' })
    expect(res.body).toEqual({ ok: true, count: 3 })
    expect(queryElasticsearch).toHaveBeenCalledWith([{ label: '_test', query: 'error' }], LOG_HOURS, LOG_FETCH, 0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- server/routes/grafana.test.js`
Expected: FAIL (라우트 미구현 → 404; 모킹 import한 `queryPrometheus` 미사용).

- [ ] **Step 3: 라우트 구현**

`server/routes/grafana.js` import에 client 함수와 config 상수 추가:
```js
import { gatherReportData, queryPrometheus, queryElasticsearch } from '../grafana/client.js'
import { LOG_INDEX_LAG_HOURS, LOG_HOURS, LOG_FETCH, DEFAULT_METRICS, DEFAULT_LOG_QUERIES } from '../grafana/config.js'
```
(`gatherReportData` import는 기존 줄을 이 줄로 통합. `LOG_INDEX_LAG_HOURS`/`DEFAULT_*`는 기존/Task3에서 추가됨 — 중복 import 되지 않게 한 줄로 정리.)

`export default router` 직전에 라우트 추가:
```js
// POST /api/grafana/test-query — 단일 쿼리 실호출 검증(등록 게이트용)
router.post('/test-query', auth, async (req, res) => {
  const { type, query } = req.body
  if ((type !== 'metric' && type !== 'log') || typeof query !== 'string' || !query.trim() || query.length > 2000) {
    return res.status(400).json({ error: 'invalid request' })
  }
  try {
    if (type === 'metric') {
      const value = await queryPrometheus(query)
      return res.json({ ok: true, value })
    }
    const result = await queryElasticsearch([{ label: '_test', query }], LOG_HOURS, LOG_FETCH, 0)
    return res.json({ ok: true, count: result?._test?.count ?? 0 })
  } catch (e) {
    return res.json({ ok: false, error: e.message })
  }
})
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npm test`
Expected: PASS (전체).

- [ ] **Step 5: Commit**

```bash
git add server/routes/grafana.js server/routes/grafana.test.js
git commit -m "feat(grafana): POST /test-query 단일 쿼리 검증 엔드포인트"
```

---

## Task 6: 프론트 API 클라이언트 + 테스트 게이트 순수 함수

**Files:**
- Modify: `src/lib/api/grafana.js`
- Create: `src/lib/grafanaQueryGate.js`
- Test: `src/lib/grafanaQueryGate.test.js`

- [ ] **Step 1: 게이트 실패 테스트 작성**

`src/lib/grafanaQueryGate.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { rowIsGood, canSave } from './grafanaQueryGate.js'

describe('rowIsGood', () => {
  it('저장값과 동일(미변경) → good', () => {
    expect(rowIsGood({ label: 'CPU', query: 'up', _savedQuery: 'up', _test: 'untested' })).toBe(true)
  })
  it('신규(저장값 없음) + 미테스트 → not good', () => {
    expect(rowIsGood({ label: 'CPU', query: 'up', _test: 'untested' })).toBe(false)
  })
  it('신규 + 현재 query로 통과 → good', () => {
    expect(rowIsGood({ label: 'CPU', query: 'up', _test: 'passed', _testedQuery: 'up' })).toBe(true)
  })
  it('통과 후 query 수정 → not good (재테스트 필요)', () => {
    expect(rowIsGood({ label: 'CPU', query: 'up2', _test: 'passed', _testedQuery: 'up' })).toBe(false)
  })
  it('label/query 빈 행 → not good', () => {
    expect(rowIsGood({ label: '', query: 'up', _savedQuery: 'up' })).toBe(false)
    expect(rowIsGood({ label: 'x', query: '  ', _savedQuery: '  ' })).toBe(false)
  })
})

describe('canSave', () => {
  it('모든 행 good이면 true', () => {
    const m = [{ label: 'CPU', query: 'up', _savedQuery: 'up' }]
    const l = [{ label: 'soe', query: 'error', _test: 'passed', _testedQuery: 'error' }]
    expect(canSave(m, l)).toBe(true)
  })
  it('하나라도 not good이면 false', () => {
    const m = [{ label: 'CPU', query: 'up', _test: 'untested' }]
    expect(canSave(m, [])).toBe(false)
  })
  it('빈 리스트들은 true', () => {
    expect(canSave([], [])).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/lib/grafanaQueryGate.test.js`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 게이트 순수 함수 구현**

`src/lib/grafanaQueryGate.js`:
```js
// 쿼리 행의 등록 가능 여부 판정 (순수 함수).
// 행 메타: _savedQuery(마지막 저장된 query, 신규는 undefined),
//          _test('untested'|'passed'|'failed'), _testedQuery(통과 시점 query).

export function rowIsGood(row) {
  if (!row) return false
  const label = String(row.label ?? '').trim()
  const query = String(row.query ?? '').trim()
  if (!label || !query) return false
  if (row.query === row._savedQuery) return true                  // 미변경(grandfather)
  return row._test === 'passed' && row._testedQuery === row.query // 현재 query로 테스트 통과
}

export function canSave(...lists) {
  return lists.every((list) => (list ?? []).every(rowIsGood))
}
```

- [ ] **Step 4: 게이트 테스트 통과 확인**

Run: `npm test -- src/lib/grafanaQueryGate.test.js`
Expected: PASS.

- [ ] **Step 5: api 클라이언트에 testQuery 추가**

`src/lib/api/grafana.js` 끝에 추가:
```js
export async function testQuery(body, password) {
  const res = await fetch(`${BASE}/api/grafana/test-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-password': password ?? '' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  return res.json()
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/grafanaQueryGate.js src/lib/grafanaQueryGate.test.js src/lib/api/grafana.js
git commit -m "feat(grafana): 등록 게이트 순수함수 + testQuery API 클라이언트"
```

---

## Task 7: QueryListEditor 컴포넌트

**Files:**
- Create: `src/components/grafana/QueryListEditor.jsx`
- Test: `src/components/grafana/QueryListEditor.test.jsx`

- [ ] **Step 1: 실패 테스트 작성**

`src/components/grafana/QueryListEditor.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QueryListEditor from './QueryListEditor.jsx'

const COLUMNS = [
  { key: 'label', label: '라벨' },
  { key: 'query', label: '쿼리', wide: true },
]
const newRow = () => ({ label: '', query: '', enabled: true })

function setup(items, props = {}) {
  const onChange = vi.fn()
  const onTest = props.onTest ?? vi.fn().mockResolvedValue({ ok: true })
  render(
    <QueryListEditor
      title="로그 쿼리"
      items={items}
      columns={COLUMNS}
      newRow={newRow}
      addLabel="+ 로그 쿼리 추가"
      onChange={onChange}
      onTest={onTest}
    />
  )
  return { onChange, onTest }
}

describe('QueryListEditor', () => {
  it('항목 행을 렌더한다', () => {
    setup([{ label: 'soe', query: 'error', enabled: true, _savedQuery: 'error' }])
    expect(screen.getByDisplayValue('soe')).toBeInTheDocument()
    expect(screen.getByDisplayValue('error')).toBeInTheDocument()
  })
  it('추가 버튼이 새 행을 append한다', () => {
    const { onChange } = setup([])
    fireEvent.click(screen.getByText('+ 로그 쿼리 추가'))
    expect(onChange).toHaveBeenCalledWith([{ label: '', query: '', enabled: true }])
  })
  it('삭제 버튼이 행을 제거한다', () => {
    const { onChange } = setup([{ label: 'soe', query: 'error', enabled: true }])
    fireEvent.click(screen.getByLabelText('삭제'))
    expect(onChange).toHaveBeenCalledWith([])
  })
  it('필드 수정 시 onChange로 갱신', () => {
    const { onChange } = setup([{ label: 'soe', query: 'error', enabled: true }])
    fireEvent.change(screen.getByDisplayValue('soe'), { target: { value: 'soe2' } })
    expect(onChange).toHaveBeenCalledWith([{ label: 'soe2', query: 'error', enabled: true }])
  })
  it('테스트 버튼 클릭 시 onTest 호출 후 통과 상태 반영', async () => {
    const onTest = vi.fn().mockResolvedValue({ ok: true })
    const { onChange } = setup([{ label: 'soe', query: 'error', enabled: true }], { onTest })
    fireEvent.click(screen.getByText('테스트'))
    await waitFor(() => expect(onTest).toHaveBeenCalledWith('error'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ label: 'soe', query: 'error', _test: 'passed', _testedQuery: 'error' }),
    ]))
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/components/grafana/QueryListEditor.test.jsx`
Expected: FAIL (컴포넌트 없음).

- [ ] **Step 3: 컴포넌트 구현**

`src/components/grafana/QueryListEditor.jsx`:
```jsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { rowIsGood } from '../../lib/grafanaQueryGate.js'

// 범용 쿼리 리스트 편집기.
// props:
//  title, items, columns([{key,label,wide?,type?}]), newRow(()=>row),
//  addLabel, onChange(newItems), onTest(query)=>Promise<{ok,error}>
export default function QueryListEditor({ title, items, columns, newRow, addLabel, onChange, onTest }) {
  const [testing, setTesting] = useState(-1) // 테스트 진행 중인 행 index

  const update = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const add = () => onChange([...items, newRow()])

  const runTest = async (i) => {
    const row = items[i]
    if (!String(row.query ?? '').trim()) return
    setTesting(i)
    try {
      const r = await onTest(row.query)
      update(i, r?.ok ? { _test: 'passed', _testedQuery: row.query, _testError: '' }
                      : { _test: 'failed', _testError: r?.error || '실패' })
    } catch (e) {
      update(i, { _test: 'failed', _testError: e.message })
    } finally {
      setTesting(-1)
    }
  }

  const badge = (row) => {
    if (rowIsGood(row)) return <span className="query-badge ok">✓ 등록 가능</span>
    if (row._test === 'failed') return <span className="query-badge fail">✗ {row._testError || '실패'}</span>
    return <span className="query-badge todo">미테스트</span>
  }

  return (
    <div className="form-field">
      <label className="form-label">{title}</label>
      <div className="query-list">
        {items.map((row, i) => (
          <div className="query-row" key={i}>
            <div className="query-fields">
              {columns.map((c) => (
                <input
                  key={c.key}
                  className={`form-input${c.wide ? ' query-wide' : ''}`}
                  type={c.type || 'text'}
                  placeholder={c.label}
                  value={row[c.key] ?? ''}
                  onChange={(e) => update(i, {
                    [c.key]: c.type === 'number' ? Number(e.target.value) : e.target.value,
                  })}
                />
              ))}
            </div>
            <div className="query-controls">
              <label className="query-enabled">
                <input
                  type="checkbox"
                  checked={row.enabled !== false}
                  onChange={(e) => update(i, { enabled: e.target.checked })}
                />
                사용
              </label>
              <button type="button" className="query-test-btn" disabled={testing === i} onClick={() => runTest(i)}>
                {testing === i ? '테스트 중…' : '테스트'}
              </button>
              {badge(row)}
              <button type="button" className="query-del" aria-label="삭제" onClick={() => remove(i)}>
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="query-add" onClick={add}>{addLabel}</button>
    </div>
  )
}
```

- [ ] **Step 4: 컴포넌트 테스트 통과 확인**

Run: `npm test -- src/components/grafana/QueryListEditor.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/grafana/QueryListEditor.jsx src/components/grafana/QueryListEditor.test.jsx
git commit -m "feat(grafana): QueryListEditor 행 편집 컴포넌트 (테스트 버튼 포함)"
```

---

## Task 8: GrafanaSettings 통합 + CSS

**Files:**
- Modify: `src/components/grafana/GrafanaSettings.jsx`
- Modify: `src/index.css`

- [ ] **Step 1: GrafanaSettings.jsx에 쿼리 편집 통합**

`src/components/grafana/GrafanaSettings.jsx` 전체를 다음으로 교체:
```jsx
// src/components/grafana/GrafanaSettings.jsx
import { useState, useEffect, useCallback } from 'react'
import TagInput from '../mailer/TagInput.jsx'
import QueryListEditor from './QueryListEditor.jsx'
import { getSettings, updateSettings, testQuery } from '../../lib/api/grafana.js'
import { canSave } from '../../lib/grafanaQueryGate.js'
import { getCookie, clearCookie } from '../../lib/auth.js'

const METRIC_COLUMNS = [
  { key: 'label', label: '라벨' },
  { key: 'query', label: 'PromQL 쿼리', wide: true },
  { key: 'threshold', label: '임계값', type: 'number' },
]
const LOG_COLUMNS = [
  { key: 'label', label: '라벨' },
  { key: 'query', label: 'ES 쿼리', wide: true },
]
const newMetric = () => ({ label: '', query: '', threshold: 0, enabled: true })
const newLog = () => ({ label: '', query: '', enabled: true })

// 로드된 행에 게이트용 메타 부착(저장값 = 현재 query, 미테스트).
const attachMeta = (r) => ({ ...r, _savedQuery: r.query, _test: 'untested', _testedQuery: undefined, _testError: '' })
// 저장 전 메타 제거.
const stripMetric = (r) => ({ label: r.label, query: r.query, threshold: Number(r.threshold), enabled: r.enabled !== false })
const stripLog = (r) => ({ label: r.label, query: r.query, enabled: r.enabled !== false })

export default function GrafanaSettings() {
  const password = getCookie()
  const [recipients, setRecipients] = useState([])
  const [sendHour, setSendHour] = useState(9)
  const [enabled, setEnabled] = useState(true)
  const [logLagHours, setLogLagHours] = useState(3)
  const [metrics, setMetrics] = useState([])
  const [logQueries, setLogQueries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getSettings(password)
      setRecipients(s.recipients ?? [])
      setSendHour(s.send_hour ?? 9)
      setEnabled(!!s.enabled)
      setLogLagHours(s.log_lag_hours ?? 3)
      setMetrics((s.metrics ?? []).map(attachMeta))
      setLogQueries((s.log_queries ?? []).map(attachMeta))
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') clearCookie()
      else setError('설정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [password])

  useEffect(() => { load() }, [load])

  const runMetricTest = (query) => testQuery({ type: 'metric', query }, password)
  const runLogTest = (query) => testQuery({ type: 'log', query }, password)

  const gateOk = canSave(metrics, logQueries)

  const handleSave = async (e) => {
    e.preventDefault()
    if (!gateOk) return
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const s = await updateSettings({
        recipients, send_hour: sendHour, enabled, log_lag_hours: logLagHours,
        metrics: metrics.map(stripMetric), log_queries: logQueries.map(stripLog),
      }, password)
      setRecipients(s.recipients ?? [])
      setSendHour(s.send_hour ?? sendHour)
      setEnabled(!!s.enabled)
      setLogLagHours(s.log_lag_hours ?? logLagHours)
      setMetrics((s.metrics ?? []).map(attachMeta))
      setLogQueries((s.log_queries ?? []).map(attachMeta))
      setSaved(true)
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') clearCookie()
      else setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="job-empty">불러오는 중…</p>

  return (
    <form className="grafana-settings" onSubmit={handleSave}>
      <div className="form-field">
        <label className="form-label">수신자 이메일</label>
        <TagInput values={recipients} onChange={(v) => { setRecipients(v); setSaved(false) }} />
        <p className="form-hint">이메일 입력 후 Enter. 비우면 환경변수 수신자로 폴백됩니다. 발송을 완전히 멈추려면 아래 ‘매일 자동 발송’을 꺼주세요.</p>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="grafana-send-hour">발송 시각 (KST)</label>
        <select id="grafana-send-hour" className="form-select" value={sendHour}
          onChange={(e) => { setSendHour(Number(e.target.value)); setSaved(false) }}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label className="grafana-toggle">
          <input type="checkbox" checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); setSaved(false) }} />
          매일 자동 발송
        </label>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="grafana-log-lag">로그 적재 지연 보정 (시간)</label>
        <select id="grafana-log-lag" className="form-select" value={logLagHours}
          onChange={(e) => { setLogLagHours(Number(e.target.value)); setSaved(false) }}>
          {Array.from({ length: 25 }, (_, h) => (
            <option key={h} value={h}>{h}시간</option>
          ))}
        </select>
        <p className="form-hint">로그가 ES에 늦게 색인되는 지연을 감안해, 조회 시간창을 이만큼 뒤로 당깁니다. 기본 3시간.</p>
      </div>

      <QueryListEditor
        title="메트릭 쿼리 (Prometheus)"
        items={metrics}
        columns={METRIC_COLUMNS}
        newRow={newMetric}
        addLabel="+ 메트릭 추가"
        onChange={(v) => { setMetrics(v); setSaved(false) }}
        onTest={runMetricTest}
      />

      <QueryListEditor
        title="로그 쿼리 (Elasticsearch)"
        items={logQueries}
        columns={LOG_COLUMNS}
        newRow={newLog}
        addLabel="+ 로그 쿼리 추가"
        onChange={(v) => { setLogQueries(v); setSaved(false) }}
        onTest={runLogTest}
      />

      {!gateOk && <p className="form-hint form-hint-error">신규·수정된 쿼리는 테스트를 통과해야 저장할 수 있습니다.</p>}
      {error && <div className="grafana-error">{error}</div>}
      <div className="modal-actions">
        <button type="submit" className="modal-submit" disabled={saving || !gateOk}>
          {saving ? '저장 중…' : saved ? '저장됨 ✓' : '저장'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: CSS 추가**

`src/index.css` 끝에 추가:
```css
/* Grafana 쿼리 편집기 */
.query-list { display: flex; flex-direction: column; gap: 10px; }
.query-row { border: 1px solid var(--color-border, #ddd); border-radius: 6px; padding: 10px; }
.query-fields { display: flex; gap: 8px; flex-wrap: wrap; }
.query-fields .form-input { flex: 0 0 auto; }
.query-fields .query-wide { flex: 1 1 320px; min-width: 220px; }
.query-controls { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.query-enabled { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--color-text-secondary); }
.query-test-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid var(--color-accent); background: transparent; color: var(--color-accent); cursor: pointer; font-size: 13px; }
.query-test-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.query-badge { font-size: 12px; font-weight: 600; }
.query-badge.ok { color: var(--color-status-ok); }
.query-badge.fail { color: var(--color-status-error); }
.query-badge.todo { color: var(--color-text-faint); }
.query-del { margin-left: auto; background: transparent; border: none; color: var(--color-text-faint); cursor: pointer; display: flex; align-items: center; }
.query-del:hover { color: var(--color-status-error); }
.query-add { margin-top: 10px; padding: 6px 12px; border-radius: 4px; border: 1px dashed var(--color-border, #ccc); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-size: 13px; }
```

- [ ] **Step 3: 린트 + 전체 테스트**

Run: `npm run lint`
Expected: 통과(에러 0).
Run: `npm test`
Expected: PASS (전체).

- [ ] **Step 4: Commit**

```bash
git add src/components/grafana/GrafanaSettings.jsx src/index.css
git commit -m "feat(grafana): 설정 탭에 쿼리 편집 UI + 테스트 게이트 통합"
```

---

## Task 9: 수동 검증 + 브랜치 마무리

**Files:** (없음 — 검증/마무리)

- [ ] **Step 1: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공(에러 0).

- [ ] **Step 2: 로컬 구동 수동 스모크 (선택, 환경변수 필요)**

Run: `npm run dev`
확인:
1. 설정 탭에 “메트릭 쿼리” / “로그 쿼리” 섹션과 기존 5+5 항목이 보임.
2. 새 메트릭 추가 → 저장 버튼 비활성. “테스트” 클릭 → 통과 시 “✓ 등록 가능”, 저장 버튼 활성.
3. 기존 항목 query 수정 → 그 행 “미테스트”로 바뀌고 저장 비활성. 재테스트 통과 시 활성.
4. enabled 끈 항목은 저장 후 리포트(`/report`)에서 제외됨.
5. 저장 후 새로고침 시 변경 유지.

- [ ] **Step 3: 변경 요약 확인 후 finishing-a-development-branch 스킬로 마무리**

Run: `git log --oneline feature/grafana-query-management ^main`
Expected: Task 1~8의 커밋 8개.

이후 `superpowers:finishing-a-development-branch` 스킬을 사용해 머지/PR 여부를 결정한다(메모리 규칙: 브랜치-퍼-태스크).

---

## Self-Review 결과 (작성자 점검)

- **스펙 커버리지**: §3 데이터모델→T1, §2/§5 폴백·배선→T2·T3, §3 검증·§저장→T4, §8 test-query→T5, §8 게이트·api→T6, §7 UI 컴포넌트→T7, §7 통합·CSS→T8. 전 항목 매핑됨.
- **시그니처 일관성**: `gatherReportData(metrics, logQueries, lagHours)`(T3) = 라우트 호출(T3)·테스트 어서션(T3). `activeQueries`/`withQueryDefaults`(T2) ↔ 사용처(T3). `rowIsGood`/`canSave`(T6) ↔ QueryListEditor/GrafanaSettings(T7·T8). `testQuery({type,query})`(T6) ↔ 라우트(T5)·onTest(T7).
- **기존 테스트 회귀**: T3에서 `gatherReportData` 시그니처 변경으로 깨지는 기존 라우트 어서션 3개를 명시적으로 갱신. PUT save 기존 어서션은 payload 부분구성으로 그대로 유지(metrics 미포함 시 키 없음).
- **플레이스홀더**: 없음(모든 코드/명령 구체화).
