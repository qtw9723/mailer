# Grafana AI 분석 과거 메모·빈도 참조 + AI 메모 보강 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemini 로그 분석 프롬프트에 기존 유형의 메모·누적빈도·최근 추세를 주입하고, AI가 유형별 관찰 메모(`ai_note`)를 별도 칸에 기록하게 한다.

**Architecture:** `grafana_log_types.ai_note` 컬럼 신설(사용자 `note`와 분리). `logTypes.js`에 최근 회차 추세를 일괄 조회해 붙이는 `listTypesWithHistory()` 추가. `analyze.js`의 프롬프트/응답스키마/정규화에 메모·빈도·`aiNote` 반영. 저장은 기존 tick 경로의 `resolveAndPersist()`에서만.

**Tech Stack:** Node ESM + Express, Supabase(js client), Gemini(`@google/generative-ai`), Vitest, React(프론트).

**Spec:** `docs/superpowers/specs/2026-07-02-grafana-ai-analysis-history-design.md`

## Global Constraints

- 마이그레이션 적용은 **Management API 멱등 SQL** (`supabase db push` 절대 금지 — divergence 이력)
- LLM은 best-effort: 실패해도 리포트/메일 정상 (기존 정책 유지)
- 사용자 메모(`note`)는 AI가 절대 수정하지 않음. `ai_note`는 사용자가 수정 불가(updateType allowed에 미포함)
- 미리보기(`POST /api/grafana/analyze`)는 저장 없음 (기존 정책 유지)
- 테스트: `npm test` (vitest run), 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 작업 브랜치: `feature/grafana-ai-analysis-history` (이미 생성됨)

---

### Task 1: DB 마이그레이션 — `ai_note` 컬럼

**Files:**
- Create: `supabase/migrations/20260702000000_add_grafana_log_type_ai_note.sql`

**Interfaces:**
- Produces: `grafana_log_types.ai_note TEXT` 컬럼 (Task 2~6이 의존)

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- grafana_log_types에 AI 관찰 메모 칸 추가.
-- 사용자 메모(note)와 분리: AI 분석이 회차마다 갱신하는 읽기 전용(웹에서) 메모.
ALTER TABLE grafana_log_types ADD COLUMN IF NOT EXISTS ai_note TEXT;
```

- [ ] **Step 2: Management API로 원격 DB에 멱등 적용**

`.env`의 `SUPABASE_ACCESS_TOKEN` 사용, project ref는 `SUPABASE_URL`(`https://<ref>.supabase.co`)에서 추출:

```bash
cd /Users/sangjun/IdeaProjects/mailer
REF=$(grep '^SUPABASE_URL=' .env | sed -E 's|.*https://([a-z0-9]+)\.supabase\.co.*|\1|')
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2)
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"ALTER TABLE grafana_log_types ADD COLUMN IF NOT EXISTS ai_note TEXT;"}'
```

Expected: `[]` (성공 시 빈 배열) — 오류 JSON이면 중단하고 보고.

- [ ] **Step 3: 컬럼 존재 확인**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='"'"'grafana_log_types'"'"' AND column_name='"'"'ai_note'"'"';"}'
```

Expected: `[{"column_name":"ai_note"}]`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260702000000_add_grafana_log_type_ai_note.sql
git commit -m "feat(grafana): grafana_log_types.ai_note 컬럼 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: analyze.js — 응답 스키마 `aiNote` + 정규화

**Files:**
- Modify: `server/grafana/analyze.js:18-43` (RESPONSE_SCHEMA), `analyze.js:103-117` (normalizeType)
- Test: `server/grafana/analyze.test.js`

**Interfaces:**
- Produces: `normalizeType()` 결과에 `aiNote: string` 필드 (Task 4의 `resolveAndPersist`가 `at.aiNote`로 사용)

- [ ] **Step 1: 실패하는 테스트 작성** — `analyze.test.js`의 `describe('parseAnalysis', ...)` 블록 안에 추가:

```javascript
  it('aiNote 정규화: 문자열 trim, 없으면 빈 문자열', () => {
    const r = parseAnalysis(JSON.stringify({
      summary: 's',
      types: [
        { label: 'A', app: 'x', count: 1, aiNote: '  평시 5건 수준  ' },
        { label: 'B', app: 'x', count: 1 },
      ],
    }))
    expect(r.types[0].aiNote).toBe('평시 5건 수준')
    expect(r.types[1].aiNote).toBe('')
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run server/grafana/analyze.test.js -t aiNote`
Expected: FAIL — `expected undefined to be '평시 5건 수준'`

- [ ] **Step 3: 구현**

`RESPONSE_SCHEMA`의 `types.items.properties`에 (rows 다음) 추가:

```javascript
          aiNote: {
            type: SchemaType.STRING,
            description: '이 유형에 대한 짧은 관찰 메모(빈도 추세 변화·특이점 등 운영자에게 유용한 것만). 특이사항 없으면 빈 문자열.',
          },
```

`normalizeType()`의 return 객체에 추가:

```javascript
    aiNote: String(t.aiNote ?? '').trim(),
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run server/grafana/analyze.test.js`
Expected: 전체 PASS

- [ ] **Step 5: Commit**

```bash
git add server/grafana/analyze.js server/grafana/analyze.test.js
git commit -m "feat(grafana): 분석 응답 스키마에 aiNote 추가·정규화

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: analyze.js — 프롬프트에 메모·빈도·추세 렌더 + 지시 강화

**Files:**
- Modify: `server/grafana/analyze.js:51-78` (buildAnalyzePrompt)
- Test: `server/grafana/analyze.test.js`

**Interfaces:**
- Consumes: 유형 객체의 `note`, `ai_note`, `total_count`, `recentRuns: [{date: 'YYYY-MM-DD', count}]` (Task 5의 `listTypesWithHistory()`가 공급 — 필드 없으면 해당 줄 미출력)
- Produces: 프롬프트 문자열 (외부 계약 변화 없음, 시그니처 동일)

- [ ] **Step 1: 실패하는 테스트 작성** — `describe('buildAnalyzePrompt', ...)` 블록 안에 추가:

```javascript
  it('메모·빈도·추세가 있으면 유형 블록에 렌더', () => {
    const p = buildAnalyzePrompt(
      [{ app: 'soe', count: 1, rows: [{ time: '10:00', msg: 'e' }] }],
      [{
        label: '타임아웃', description: '소켓 타임아웃', note: '모니터링 중',
        ai_note: '평시 5~8건', total_count: 47,
        recentRuns: [{ date: '2026-06-24', count: 7 }, { date: '2026-06-23', count: 5 }],
      }],
    )
    expect(p).toContain('운영자 메모: 모니터링 중')
    expect(p).toContain('AI 메모: 평시 5~8건')
    expect(p).toContain('누적 47건')
    expect(p).toContain('최근 06-24:7, 06-23:5')
  })
  it('메모·빈도 없는 유형은 기존처럼 한 줄만', () => {
    const p = buildAnalyzePrompt(
      [{ app: 'x', count: 1, rows: [] }],
      [{ label: 'A', description: 'd' }],
    )
    expect(p).toContain('- A: d')
    expect(p).not.toContain('운영자 메모')
    expect(p).not.toContain('누적')
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run server/grafana/analyze.test.js -t 렌더`
Expected: FAIL — `운영자 메모` 미포함

- [ ] **Step 3: 구현** — `buildAnalyzePrompt()`를 아래로 교체:

```javascript
// 프롬프트 구성. 기존 유형 목록(메모·누적빈도·최근 추세 포함)을 주입해
// 유형명 일관성 유지 + 기지 이슈 구분 + 빈도 급증 감지를 돕는다.
export function buildAnalyzePrompt(groups, existingTypes = []) {
  const typeList = (existingTypes ?? [])
    .map((t) => {
      let s = `- ${t.label}${t.description ? `: ${t.description}` : ''}`
      if (t.note) s += `\n  · 운영자 메모: ${t.note}`
      if (t.ai_note) s += `\n  · AI 메모: ${t.ai_note}`
      const trend = (t.recentRuns ?? [])
        .map((r) => `${String(r.date).slice(5)}:${r.count}`).join(', ')
      if (t.total_count != null || trend) {
        s += `\n  · 누적 ${t.total_count ?? 0}건${trend ? ` · 최근 ${trend}` : ''}`
      }
      return s
    })
    .join('\n') || '(아직 없음)'
  const logBlocks = groups
    .map((g) => {
      const rows = (g.rows ?? []).slice(0, MAX_ROWS_PER_APP)
        .map((r, i) => `  [#${i}] [${r.time}] ${r.msg}`).join('\n')
      return `## 앱: ${g.app} (총 ${g.count}건)\n${rows || '  (로그 없음)'}`
    })
    .join('\n\n')

  return `당신은 운영 모니터링 보조자입니다. 아래는 최근 24시간 앱별 ERROR 로그입니다. 각 로그 앞 [#번호]는 그 앱 안에서의 로그 번호입니다.
반복되는 동일/유사 로그를 하나의 유형으로 묶어 분류하고, 운영자가 솔루션에서 확인해야 할 핵심만 추려 주세요.

[기존 로그 유형] — 가능하면 아래 유형을 재사용(existingMatch에 동일 label 기입), 새로운 패턴만 신규 유형으로. 각 유형의 메모·누적/최근 빈도는 과거 회차의 기록입니다:
${typeList}

[로그]
${logBlocks}

요구사항:
- summary: 운영자가 오늘 점검할 포인트를 한국어 불릿 3~6개로 간단히(심각도 높은 것 우선). 각 불릿은 "- "로 시작하고 항목마다 줄바꿈(\\n)으로 구분.
- 메모가 있는 기존 유형은 기지(旣知) 이슈 — summary에서 "기존 이슈"로 구분하고 재설명은 최소화. 신규 유형과 변화에 분석을 집중.
- 최근 추세 대비 빈도가 급증한 유형은 summary에서 강조.
- types: 로그를 유형별로 묶어 각 유형마다 label/description/app/count/rows 작성.
- rows: 그 유형에 속한 로그의 [#번호]를 모두 나열(해당 앱 기준). 같은 메시지가 3번 나오면 번호 3개 모두 포함. 한 번호는 한 유형에만.
- count: 그 유형의 총 발생 추정 건수(앱 총 건수가 표시 행보다 많을 수 있음).
- aiNote: 유형별 짧은 관찰 메모(빈도 추세 변화·특이점 등 다음 운영자에게 유용한 것만). 특이사항 없으면 빈 문자열 — 그러면 기존 AI 메모가 유지됩니다.
- 추측성 과장 금지. 실제 로그에 근거할 것.`
}
```

- [ ] **Step 4: 통과 확인 (기존 테스트 포함)**

Run: `npx vitest run server/grafana/analyze.test.js`
Expected: 전체 PASS (기존 `기존 유형과 로그를 포함`·`(아직 없음)` 테스트도 통과해야 함)

- [ ] **Step 5: Commit**

```bash
git add server/grafana/analyze.js server/grafana/analyze.test.js
git commit -m "feat(grafana): 분석 프롬프트에 메모·누적빈도·최근추세 주입

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: logTypes.js — `resolveAndPersist()`의 `ai_note` 저장

**Files:**
- Modify: `server/grafana/logTypes.js:59-103` (resolveAndPersist)
- Test: `server/grafana/logTypes.test.js`

**Interfaces:**
- Consumes: `analysis.types[].aiNote` (Task 2의 normalizeType이 보장 — 항상 string)
- Produces: `grafana_log_types.ai_note` 갱신 (신규 insert 포함). 빈 문자열이면 기존 값 유지.

- [ ] **Step 1: 실패하는 테스트 작성** — `describe('resolveAndPersist', ...)` 블록 안에 추가:

```javascript
  it('aiNote 있으면 ai_note 갱신, 빈 문자열이면 기존 유지', async () => {
    const listQ = mockQuery({ data: [
      { id: 't1', label: 'A', total_count: 1 },
      { id: 't2', label: 'B', total_count: 1 },
    ], error: null })
    const run1 = mockQuery({ data: { id: 1 }, error: null })
    const upd1 = mockQuery({ error: null })
    const run2 = mockQuery({ data: { id: 2 }, error: null })
    const upd2 = mockQuery({ error: null })
    mockFrom.mockReturnValueOnce(listQ)
      .mockReturnValueOnce(run1).mockReturnValueOnce(upd1)
      .mockReturnValueOnce(run2).mockReturnValueOnce(upd2)
    await resolveAndPersist({ types: [
      { label: 'A', app: 'x', count: 1, rows: [], existingMatch: 'A', aiNote: '추세 증가' },
      { label: 'B', app: 'x', count: 1, rows: [], existingMatch: 'B', aiNote: '' },
    ] }, '2026-07-02T00:00:00Z')
    expect(upd1.update).toHaveBeenCalledWith(expect.objectContaining({ ai_note: '추세 증가' }))
    expect(upd2.update.mock.calls[0][0]).not.toHaveProperty('ai_note')
  })
  it('신규 유형 insert에 ai_note 포함', async () => {
    const listQ = mockQuery({ data: [], error: null })
    const insQ = mockQuery({ data: { id: 'nt', label: 'N', total_count: 0 }, error: null })
    const runQ = mockQuery({ data: { id: 3 }, error: null })
    const updQ = mockQuery({ error: null })
    mockFrom.mockReturnValueOnce(listQ).mockReturnValueOnce(insQ)
      .mockReturnValueOnce(runQ).mockReturnValueOnce(updQ)
    await resolveAndPersist({ types: [
      { label: 'N', app: 'x', count: 2, rows: [], existingMatch: '', aiNote: '신규 등장' },
    ] }, '2026-07-02T00:00:00Z')
    expect(insQ.insert).toHaveBeenCalledWith(expect.objectContaining({ ai_note: '신규 등장' }))
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run server/grafana/logTypes.test.js -t ai_note`
Expected: FAIL — update/insert에 `ai_note` 없음

- [ ] **Step 3: 구현** — `resolveAndPersist()` 내 두 곳 수정:

신규 유형 insert (기존 `.insert({ label: at.label, description: at.description || null })`):

```javascript
        .insert({ label: at.label, description: at.description || null, ai_note: at.aiNote || null })
```

유형 누적 update (기존 `db.from(TYPES).update({ ... })` 객체):

```javascript
    const nextTotal = (type.total_count ?? 0) + (at.count ?? 0)
    const { error: e2 } = await db.from(TYPES).update({
      total_count: nextTotal,
      last_seen_at: runAt,
      description: at.description || type.description || null,
      // AI 관찰 메모: 이번 회차에 내용이 있을 때만 교체(빈 문자열 → 기존 유지)
      ...(at.aiNote ? { ai_note: at.aiNote } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', type.id)
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run server/grafana/logTypes.test.js`
Expected: 전체 PASS (기존 resolveAndPersist 테스트 포함 — 기존 테스트는 aiNote 없는 타입을 넣으므로 `ai_note` 미포함 경로로 통과)

- [ ] **Step 5: Commit**

```bash
git add server/grafana/logTypes.js server/grafana/logTypes.test.js
git commit -m "feat(grafana): 분석 aiNote를 유형 ai_note로 영속화(빈 값은 기존 유지)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: logTypes.js — `listTypesWithHistory()` 신설

**Files:**
- Modify: `server/grafana/logTypes.js` (함수 추가 + import)
- Test: `server/grafana/logTypes.test.js` (mockQuery에 `gte` 추가 필요)

**Interfaces:**
- Consumes: `listTypes()`, `kstDateString(date)` (`./schedule.js` — KST 'YYYY-MM-DD' 반환)
- Produces: `listTypesWithHistory({ days = 14, maxPoints = 5 } = {}) → Promise<Array<type & { recentRuns: [{date: 'YYYY-MM-DD', count: number}] }>>` — Task 6(routes)이 사용. 추세 조회 실패 시 `recentRuns: []`로 폴백(throw 안 함).

- [ ] **Step 1: mockQuery 헬퍼에 `gte` 추가** — `logTypes.test.js:6-20`의 mockQuery 객체에 한 줄:

```javascript
    gte: vi.fn().mockReturnThis(),
```

import 줄도 갱신:

```javascript
const { listTypes, listTypesWithHistory, getType, updateType, deleteType, updateRun, resolveAndPersist } = await import('./logTypes.js')
```

- [ ] **Step 2: 실패하는 테스트 작성** — 새 describe 블록:

```javascript
describe('listTypesWithHistory', () => {
  it('유형별 KST 날짜 합산 추세를 최신순 maxPoints개 붙임', async () => {
    const typesQ = mockQuery({ data: [{ id: 't1', label: 'A' }, { id: 't2', label: 'B' }], error: null })
    // 같은 유형·같은 날(KST) 두 run(앱별) → 합산. run_at desc 입력.
    const runsQ = mockQuery({ data: [
      { type_id: 't1', run_at: '2026-07-01T23:00:00Z', count: 3 }, // KST 2026-07-02
      { type_id: 't1', run_at: '2026-07-01T22:00:00Z', count: 2 }, // KST 2026-07-02 → 합산 5
      { type_id: 't1', run_at: '2026-06-30T23:00:00Z', count: 4 }, // KST 2026-07-01
    ], error: null })
    mockFrom.mockReturnValueOnce(typesQ).mockReturnValueOnce(runsQ)
    const r = await listTypesWithHistory()
    expect(r[0].recentRuns).toEqual([
      { date: '2026-07-02', count: 5 },
      { date: '2026-07-01', count: 4 },
    ])
    expect(r[1].recentRuns).toEqual([])
  })
  it('maxPoints 초과 날짜는 절단', async () => {
    const typesQ = mockQuery({ data: [{ id: 't1', label: 'A' }], error: null })
    const runs = [6, 5, 4, 3, 2, 1].map((d) => (
      { type_id: 't1', run_at: `2026-06-2${d}T03:00:00Z`, count: d }
    ))
    mockFrom.mockReturnValueOnce(typesQ).mockReturnValueOnce(mockQuery({ data: runs, error: null }))
    const r = await listTypesWithHistory({ maxPoints: 5 })
    expect(r[0].recentRuns).toHaveLength(5)
    expect(r[0].recentRuns[0].date).toBe('2026-06-26')
  })
  it('추세 조회 실패 시 recentRuns 빈 배열로 폴백(throw 안 함)', async () => {
    const typesQ = mockQuery({ data: [{ id: 't1', label: 'A' }], error: null })
    mockFrom.mockReturnValueOnce(typesQ).mockReturnValueOnce(mockQuery({ data: null, error: new Error('db down') }))
    const r = await listTypesWithHistory()
    expect(r).toEqual([{ id: 't1', label: 'A', recentRuns: [] }])
  })
  it('유형이 없으면 runs 조회 없이 빈 배열', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: [], error: null }))
    expect(await listTypesWithHistory()).toEqual([])
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run server/grafana/logTypes.test.js -t listTypesWithHistory`
Expected: FAIL — `listTypesWithHistory is not a function`

- [ ] **Step 4: 구현** — `logTypes.js` 상단 import에 추가:

```javascript
import { kstDateString } from './schedule.js'
```

`listTypes()` 아래에 함수 추가:

```javascript
// 유형 목록 + 최근 회차 추세(recentRuns). AI 분석 프롬프트용.
// runs는 유형별 N+1 대신 최근 days일치를 일괄 조회해 유형별·KST 날짜별로 합산
// (같은 유형이 앱별로 하루 여러 run을 가질 수 있음). 최신 날짜부터 maxPoints개.
// 추세 조회 실패는 분석을 막지 않도록 recentRuns: []로 폴백.
export async function listTypesWithHistory({ days = 14, maxPoints = 5 } = {}) {
  const types = await listTypes()
  if (!types.length) return types
  let runs = []
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const { data, error } = await db
      .from(RUNS)
      .select('type_id, run_at, count')
      .gte('run_at', since)
      .order('run_at', { ascending: false })
    if (error) throw error
    runs = data ?? []
  } catch {
    return types.map((t) => ({ ...t, recentRuns: [] }))
  }
  // run_at desc 입력이므로 Map 삽입 순서가 곧 최신 날짜순.
  const byType = new Map()
  for (const r of runs) {
    const date = kstDateString(new Date(r.run_at))
    let dates = byType.get(r.type_id)
    if (!dates) { dates = new Map(); byType.set(r.type_id, dates) }
    dates.set(date, (dates.get(date) ?? 0) + (r.count ?? 0))
  }
  return types.map((t) => ({
    ...t,
    recentRuns: [...(byType.get(t.id) ?? new Map()).entries()]
      .slice(0, maxPoints)
      .map(([date, count]) => ({ date, count })),
  }))
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run server/grafana/logTypes.test.js`
Expected: 전체 PASS

- [ ] **Step 6: Commit**

```bash
git add server/grafana/logTypes.js server/grafana/logTypes.test.js
git commit -m "feat(grafana): listTypesWithHistory — 유형별 KST 날짜 합산 추세 조회

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: routes/grafana.js — 호출부 교체

**Files:**
- Modify: `server/routes/grafana.js:9` (import), `:96` (미리보기), `:240` (tick)

**Interfaces:**
- Consumes: `listTypesWithHistory()` (Task 5). `listTypes`는 `GET /log-types` 목록 API가 계속 사용하므로 import 유지.

- [ ] **Step 1: 구현** — 세 곳 수정:

import (line 9):

```javascript
import { listTypes, listTypesWithHistory, getType, updateType, deleteType, updateRun, resolveAndPersist } from '../grafana/logTypes.js'
```

(`listTypes`는 `GET /log-types` 목록 API가 계속 사용하므로 유지)

미리보기 `POST /analyze` (line 96):

```javascript
    try { existing = await listTypesWithHistory() } catch { /* 기존 유형 없어도 진행 */ }
```

tick (line 240):

```javascript
      const analysis = await analyzeLogs(data.logs, await listTypesWithHistory())
```

- [ ] **Step 2: 전체 테스트·린트 통과 확인**

Run: `npm test && npm run lint`
Expected: 전체 PASS, 린트 오류 0

- [ ] **Step 3: Commit**

```bash
git add server/routes/grafana.js
git commit -m "feat(grafana): 분석 호출부를 listTypesWithHistory로 교체(tick·미리보기)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: UI — 로그 유형 상세에 AI 메모 표시

**Files:**
- Modify: `src/components/grafana/LogTypesTab.jsx:153-157` (Detail), `src/index.css:1070` 근처

**Interfaces:**
- Consumes: `getLogType()` 응답의 `ai_note` (컬럼 신설로 `select('*')`에 자동 포함 — API 변경 불필요)

- [ ] **Step 1: Detail에 AI 메모 블록 추가** — `LogTypesTab.jsx`에서 `logtype-stat` div(154행) 다음, `노트` label 앞에:

```jsx
      {type.ai_note && (
        <div className="logtype-ai-note">🤖 <strong>AI 메모</strong> {type.ai_note}</div>
      )}
```

- [ ] **Step 2: CSS 추가** — `src/index.css`의 `.logtype-stat`(1071행) 다음 줄에:

```css
.logtype-ai-note { font-size: 13px; color: var(--color-text-secondary); background: var(--color-bg-secondary, rgba(33,150,243,.08)); border-left: 3px solid #2196F3; padding: 8px 10px; border-radius: 4px; margin-bottom: 16px; }
```

(주의: `--color-bg-secondary` 변수가 index.css에 없으면 폴백값이 적용됨 — 기존 변수명을 확인해 있으면 그것을 사용)

- [ ] **Step 3: 빌드·린트 확인**

Run: `npm run lint && npm run build`
Expected: 오류 0, 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add src/components/grafana/LogTypesTab.jsx src/index.css
git commit -m "feat(grafana): 로그 유형 상세에 AI 메모(읽기 전용) 표시

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 최종 검증

- [ ] **Step 1: 전체 테스트 + 린트**

Run: `npm test && npm run lint`
Expected: 전체 PASS, 오류 0

- [ ] **Step 2: 로컬 미리보기 스모크 (선택, GEMINI_API_KEY 필요)**

서버 기동 후 미리보기 분석 1회 — 프롬프트 강화가 실 LLM 응답과 호환되는지 확인:

```bash
node server/index.js &
sleep 3
curl -s -X POST localhost:3001/api/grafana/analyze -H "x-app-password: $(grep '^APP_PASSWORD=' .env | cut -d= -f2)" | head -c 800
kill %1
```

Expected: `{"summary":"- ...","types":[...]}` 형태 JSON (types 항목에 aiNote 포함 가능). 502/503이면 원인 보고.
(포트는 `server/index.js`의 실제 포트 확인 — 3001이 아니면 맞춰 수정)

- [ ] **Step 3: 완료 보고**

superpowers:finishing-a-development-branch 스킬로 이행 (PR 생성 → `gh pr merge` → Vercel 자동 배포가 이 저장소의 표준 경로).
