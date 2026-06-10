# 챗봇 모니터링 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여러 챗봇을 등록해 GitHub Actions에서 하루 1회 Playwright 시나리오 체크(접속→발화→키워드 검증)를 수행하고, 결과를 허브 챗봇 모니터링 탭에 표시하며 실패 시 메일로 알린다.

**Architecture:** 러너(GitHub Actions + Playwright)는 Supabase에 직접 기록하고, 허브는 기존 Express 라우트(`server/routes/chatbot.js` 스텁 확장)로 읽기/CRUD만 한다. 판정·메일 본문 생성은 순수 함수(`scripts/lib/judge.mjs`)로 분리해 단위 테스트한다. UI는 Mailer의 행 리스트·하트비트·ConfirmDialog·토스트 문법을 그대로 재사용한다.

**Tech Stack:** Playwright(chromium, devDependency), GitHub Actions cron, Supabase, Express, React 19, 기존 디자인 토큰.

**스펙:** `docs/superpowers/specs/2026-06-10-chatbot-monitoring-design.md`

**전역 규칙:** 마이그레이션은 SQL Editor 적용(db push 금지). 색은 토큰만. 각 Task 끝에 커밋.

---

### Task 1: 마이그레이션 SQL + 판정·메일 순수 함수 (TDD)

**Files:**
- Create: `supabase/migrations/20260610100000_add_chatbot_monitoring.sql`
- Create: `scripts/lib/judge.mjs`
- Test: `scripts/lib/judge.test.mjs`

- [ ] **Step 1: 마이그레이션 파일** — 스펙 §1의 SQL 그대로 (chatbots / chatbot_check_log / chatbot_monitor_settings + 단일행 INSERT).

- [ ] **Step 2: 실패하는 테스트** `scripts/lib/judge.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { judgeStep, buildFailureMail } from './judge.mjs'

describe('judgeStep', () => {
  it('키워드가 페이지 텍스트에 있으면 ok', () => {
    expect(judgeStep('안녕하세요! 무엇을 도와드릴까요?', '도와드릴까요')).toEqual({ ok: true })
  })
  it('키워드가 없으면 사유 + 발췌(끝 300자)', () => {
    const r = judgeStep('x'.repeat(400) + ' 죄송합니다', '도와드릴까요')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('도와드릴까요')
    expect(r.excerpt.length).toBeLessThanOrEqual(300)
    expect(r.excerpt).toContain('죄송합니다')
  })
})

describe('buildFailureMail', () => {
  it('실패 봇 목록으로 제목·본문 생성', () => {
    const { subject, body } = buildFailureMail([
      { name: '코기 상담봇', detail: 'timeout: 키워드 "도와드릴까요" 미노출' },
      { name: 'FAQ봇', detail: 'input_not_found' },
    ], 'https://hub.example.com')
    expect(subject).toBe('🤖 챗봇 체크 실패 2건')
    expect(body).toContain('코기 상담봇')
    expect(body).toContain('input_not_found')
    expect(body).toContain('https://hub.example.com')
  })
})
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run scripts/lib/judge.test.mjs` → FAIL (모듈 없음)

- [ ] **Step 4: 구현** `scripts/lib/judge.mjs`:

```js
// 시나리오 스텝 판정: 페이지 텍스트에 기대 키워드가 노출되었는가
export function judgeStep(pageText, expectKeyword) {
  if (pageText.includes(expectKeyword)) return { ok: true }
  return {
    ok: false,
    reason: `키워드 "${expectKeyword}" 미노출`,
    excerpt: pageText.slice(-300),
  }
}

// 실패 봇 목록 → 알림 메일 제목/본문
export function buildFailureMail(failures, hubUrl) {
  const subject = `🤖 챗봇 체크 실패 ${failures.length}건`
  const lines = failures.map(f => `- ${f.name}: ${f.detail}`)
  const body = [
    '챗봇 모니터링 일일 체크에서 실패가 발생했습니다.',
    '',
    ...lines,
    '',
    `허브에서 확인: ${hubUrl}`,
  ].join('\n')
  return { subject, body }
}
```

- [ ] **Step 5: 통과 확인 + 커밋** — `npx vitest run scripts/lib/judge.test.mjs` PASS → `git add -A && git commit -m "feat(chatbot): 마이그레이션 SQL + 판정·메일 순수 함수"`

---

### Task 2: 서버 라우트 (TDD)

**Files:**
- Modify: `server/routes/chatbot.js` (스텁 → 전체 구현)
- Test: `server/routes/chatbot.test.js`

- [ ] **Step 1: 실패하는 테스트** `server/routes/chatbot.test.js` (mailer.test.js의 mockQuery 패턴 복사 — `in`/`limit` 포함):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('../db.js', () => ({ default: { from: mockFrom } }))

function mockQuery(result) {
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve, reject) => p.then(resolve, reject),
  }
}

const { default: chatbotRouter } = await import('./chatbot.js')
const app = express()
app.use(express.json())
app.use('/api/chatbot', chatbotRouter)

const AUTH = { 'x-app-password': 'test-password' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_PASSWORD = 'test-password'
})

describe('GET /api/chatbot/bots', () => {
  it('인증 없으면 401', async () => {
    expect((await request(app).get('/api/chatbot/bots')).status).toBe(401)
  })

  it('봇 목록 + recent_checks(오래된순) 병합', async () => {
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: [{ id: 'b1', name: '코기' }, { id: 'b2', name: 'FAQ' }], error: null }))
      .mockReturnValueOnce(mockQuery({
        data: [
          { chatbot_id: 'b1', ok: false, detail: 'timeout', duration_ms: 60000, checked_at: '2026-06-10T00:00:00Z' },
          { chatbot_id: 'b1', ok: true, detail: null, duration_ms: 3000, checked_at: '2026-06-09T00:00:00Z' },
        ],
        error: null,
      }))
    const res = await request(app).get('/api/chatbot/bots').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body[0].recent_checks.map(c => c.ok)).toEqual([true, false])
    expect(res.body[1].recent_checks).toEqual([])
  })

  it('check_log 조회 실패해도 봇 목록은 반환 (best-effort)', async () => {
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: [{ id: 'b1' }], error: null }))
      .mockReturnValueOnce(mockQuery({ data: null, error: { message: 'no table' } }))
    const res = await request(app).get('/api/chatbot/bots').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body[0].recent_checks).toEqual([])
  })
})

describe('POST /api/chatbot/bots', () => {
  it('봇 생성 201', async () => {
    const bot = { name: '코기', url: 'https://x.y', scenario: [{ say: '안녕', expect: '도와' }] }
    mockFrom.mockReturnValueOnce(mockQuery({ data: { id: 'b1', ...bot }, error: null }))
    const res = await request(app).post('/api/chatbot/bots').set(AUTH).send(bot)
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('코기')
  })
})

describe('PATCH /api/chatbot/bots/:id', () => {
  it('허용되지 않은 필드만 있으면 400', async () => {
    const res = await request(app).patch('/api/chatbot/bots/b1').set(AUTH).send({ id: 'hack' })
    expect(res.status).toBe(400)
  })
  it('enabled 토글 성공', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: [{ id: 'b1', enabled: false }], error: null }))
    const res = await request(app).patch('/api/chatbot/bots/b1').set(AUTH).send({ enabled: false })
    expect(res.status).toBe(200)
    expect(res.body.enabled).toBe(false)
  })
})

describe('DELETE /api/chatbot/bots/:id', () => {
  it('삭제 성공', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: null, error: null }))
    expect((await request(app).delete('/api/chatbot/bots/b1').set(AUTH)).status).toBe(200)
  })
})

describe('settings', () => {
  it('GET: 단일 행 반환', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: { id: 1, recipients: ['a@b.c'] }, error: null }))
    const res = await request(app).get('/api/chatbot/settings').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body.recipients).toEqual(['a@b.c'])
  })
  it('PUT: recipients 갱신', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: { id: 1, recipients: ['x@y.z'] }, error: null }))
    const res = await request(app).put('/api/chatbot/settings').set(AUTH).send({ recipients: ['x@y.z'] })
    expect(res.status).toBe(200)
    expect(res.body.recipients).toEqual(['x@y.z'])
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run server/routes/chatbot.test.js` → FAIL

- [ ] **Step 3: 구현** `server/routes/chatbot.js` 전체 교체:

```js
// server/routes/chatbot.js
import { Router } from 'express'
import db from '../db.js'

const router = Router()

const ALLOWED_BOT_PATCH_FIELDS = new Set([
  'name', 'url', 'scenario', 'input_selector', 'enabled', 'sort_order',
])

function auth(req, res, next) {
  if (req.headers['x-app-password'] !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

// GET /api/chatbot/bots — 봇 목록 + 최근 체크 10건(오래된순) 병합
router.get('/bots', auth, async (_req, res) => {
  try {
    const { data, error } = await db
      .from('chatbots')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error

    const byBot = new Map(data.map(b => [b.id, []]))
    if (data.length) {
      const { data: logs } = await db
        .from('chatbot_check_log')
        .select('chatbot_id, ok, detail, duration_ms, checked_at')
        .in('chatbot_id', data.map(b => b.id))
        .order('checked_at', { ascending: false })
        .limit(Math.min(data.length * 10, 300))
      for (const row of logs ?? []) {
        const list = byBot.get(row.chatbot_id)
        if (list && list.length < 10) {
          list.push({ ok: row.ok, detail: row.detail, duration_ms: row.duration_ms, checked_at: row.checked_at })
        }
      }
    }
    res.json(data.map(b => ({ ...b, recent_checks: byBot.get(b.id).reverse() })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chatbot/bots
router.post('/bots', auth, async (req, res) => {
  const { name, url, scenario, input_selector } = req.body
  try {
    const { data, error } = await db
      .from('chatbots')
      .insert({ name, url, scenario: scenario ?? [], input_selector: input_selector || null })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/chatbot/bots/:id
router.patch('/bots/:id', auth, async (req, res) => {
  const keys = Object.keys(req.body).filter(k => ALLOWED_BOT_PATCH_FIELDS.has(k))
  if (keys.length === 0) return res.status(400).json({ error: 'no valid fields' })
  const updateObj = Object.fromEntries(keys.map(k => [k, req.body[k]]))
  try {
    const { data, error } = await db
      .from('chatbots')
      .update(updateObj)
      .eq('id', req.params.id)
      .select()
    if (error) throw error
    if (!data?.length) return res.status(404).json({ error: 'not found' })
    res.json(data[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/chatbot/bots/:id
router.delete('/bots/:id', auth, async (req, res) => {
  try {
    const { error } = await db.from('chatbots').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chatbot/settings
router.get('/settings', auth, async (_req, res) => {
  try {
    const { data, error } = await db
      .from('chatbot_monitor_settings')
      .select('*')
      .eq('id', 1)
      .single()
    if (error) throw error
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/chatbot/settings
router.put('/settings', auth, async (req, res) => {
  const { recipients } = req.body
  try {
    const { data, error } = await db
      .from('chatbot_monitor_settings')
      .update({ recipients: recipients ?? [], updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
```

- [ ] **Step 4: 통과 확인 + 전체 테스트 + 커밋** — `npx vitest run server/routes/chatbot.test.js` PASS, `npm test` PASS → `git add -A && git commit -m "feat(chatbot): 봇 CRUD·설정 라우트 + recent_checks 병합"`

---

### Task 3: Playwright 러너 + GitHub Actions 워크플로우

**Files:**
- Create: `scripts/chatbot-check.mjs`
- Create: `.github/workflows/chatbot-check.yml`
- Modify: `package.json` (devDependency playwright)

- [ ] **Step 1: Playwright 설치** — Run: `npm install -D playwright` (브라우저 바이너리는 CI에서만 설치, 로컬은 `npx playwright install chromium` 선택)

- [ ] **Step 2: 러너 구현** `scripts/chatbot-check.mjs`:

```js
// 챗봇 일일 시나리오 체크 러너 (GitHub Actions에서 실행)
// 사용: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 환경변수 필요
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdir } from 'node:fs/promises'
import { judgeStep, buildFailureMail } from './lib/judge.mjs'
import { sendMail } from '../server/smtp.js'

const HUB_URL = process.env.HUB_URL ?? 'https://mailer-sangjuns-projects-bbf3bb9f.vercel.app'
const STEP_TIMEOUT_MS = 60_000
const INPUT_SELECTORS = ['textarea', 'input[type="text"]', '[contenteditable="true"]']

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function findInput(page, override) {
  const candidates = override ? [override, ...INPUT_SELECTORS] : INPUT_SELECTORS
  for (const sel of candidates) {
    const loc = page.locator(sel).first()
    if (await loc.isVisible().catch(() => false)) return loc
  }
  return null
}

async function checkBot(browser, bot) {
  const started = Date.now()
  const page = await browser.newPage()
  try {
    await page.goto(bot.url, { waitUntil: 'networkidle', timeout: 30_000 })
      .catch(err => { throw new Error(`goto_failed: ${err.message.slice(0, 120)}`) })

    for (const [i, step] of bot.scenario.entries()) {
      const input = await findInput(page, bot.input_selector)
      if (!input) throw new Error(`input_not_found: 스텝 ${i + 1}에서 입력창을 찾지 못함`)
      await input.fill(step.say)
      await input.press('Enter')

      const appeared = await page
        .getByText(step.expect)
        .first()
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false)
      if (!appeared) {
        const pageText = await page.locator('body').innerText().catch(() => '')
        const verdict = judgeStep(pageText, step.expect)
        throw new Error(`timeout: 스텝 ${i + 1} ${verdict.reason}\n응답 발췌: ${verdict.excerpt ?? '(없음)'}`)
      }
    }
    return { ok: true, detail: null, duration_ms: Date.now() - started }
  } catch (err) {
    await mkdir('screenshots', { recursive: true })
    await page.screenshot({ path: `screenshots/${bot.name.replace(/[^\w가-힣-]/g, '_')}.png`, fullPage: true }).catch(() => {})
    return { ok: false, detail: String(err.message).slice(0, 500), duration_ms: Date.now() - started }
  } finally {
    await page.close()
  }
}

async function notifyFailures(failures) {
  if (!failures.length) return
  const { data: settings } = await db.from('chatbot_monitor_settings').select('recipients').eq('id', 1).single()
  const recipients = settings?.recipients ?? []
  if (!recipients.length) { console.log('수신자 미설정 — 메일 생략'); return }

  const { data: senders } = await db.from('sender_accounts').select('email, app_password').order('created_at').limit(1)
  if (!senders?.length) { console.log('발신 계정 없음 — 메일 생략'); return }

  const { subject, body } = buildFailureMail(failures, `${HUB_URL}/chatbot`)
  for (const to of recipients) {
    await sendMail({ senderEmail: senders[0].email, senderPassword: senders[0].app_password, to, subject, body })
      .catch(err => console.error(`메일 발송 실패(${to}):`, err.message))
  }
  console.log(`실패 알림 메일 발송: ${recipients.length}명`)
}

const { data: bots, error } = await db.from('chatbots').select('*').eq('enabled', true)
if (error) { console.error('봇 목록 조회 실패:', error.message); process.exit(1) }

const targets = (bots ?? []).filter(b => Array.isArray(b.scenario) && b.scenario.length > 0)
console.log(`체크 대상: ${targets.length}개 봇`)
if (!targets.length) process.exit(0)

const browser = await chromium.launch()
const failures = []
for (const bot of targets) {
  const result = await checkBot(browser, bot)
  console.log(`[${result.ok ? 'OK' : 'FAIL'}] ${bot.name} (${result.duration_ms}ms)${result.ok ? '' : ` — ${result.detail}`}`)
  const { error: logErr } = await db.from('chatbot_check_log')
    .insert({ chatbot_id: bot.id, ok: result.ok, detail: result.detail, duration_ms: result.duration_ms })
  if (logErr) console.error('로그 기록 실패:', logErr.message)
  if (!result.ok) failures.push({ name: bot.name, detail: result.detail })
}
await browser.close()
await notifyFailures(failures)
console.log(`완료: 성공 ${targets.length - failures.length} / 실패 ${failures.length}`)
```

- [ ] **Step 3: 워크플로우** `.github/workflows/chatbot-check.yml`:

```yaml
name: chatbot-check
on:
  schedule:
    - cron: '30 23 * * *'   # 매일 08:30 KST
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install chromium --with-deps
      - run: node scripts/chatbot-check.mjs
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: failure-screenshots
          path: screenshots/
          if-no-files-found: ignore
          retention-days: 7
```

- [ ] **Step 4: 문법 검증 + 커밋** — `node --check scripts/chatbot-check.mjs` 통과, `npm test` PASS(러너는 단위 테스트 대상 아님 — judge만) → `git add -A && git commit -m "feat(chatbot): Playwright 러너 + GitHub Actions 일일 체크 워크플로우"`

---

### Task 4: 프런트 API 클라이언트 + HeartbeatBar 공용화

**Files:**
- Create: `src/lib/api/chatbot.js`
- Move: `src/components/mailer/HeartbeatBar.jsx` → `src/components/shared/HeartbeatBar.jsx`
- Modify: `src/components/mailer/JobRow.jsx` (import 경로)

- [ ] **Step 1: API 클라이언트** `src/lib/api/chatbot.js` (mailer.js의 request 패턴):

```js
// src/lib/api/chatbot.js
const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function request(method, path, body = null, password) {
  const res = await fetch(`${BASE}/api/chatbot${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-app-password': password ?? '',
    },
    body: body ? JSON.stringify(body) : null,
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (method === 'DELETE') return null
  return res.json()
}

export const getBots = (pw) => request('GET', '/bots', null, pw)
export const createBot = (bot, pw) => request('POST', '/bots', bot, pw)
export const updateBot = (id, patch, pw) => request('PATCH', `/bots/${id}`, patch, pw)
export const deleteBot = (id, pw) => request('DELETE', `/bots/${id}`, null, pw)
export const getChatbotSettings = (pw) => request('GET', '/settings', null, pw)
export const updateChatbotSettings = (body, pw) => request('PUT', '/settings', body, pw)
```

- [ ] **Step 2: HeartbeatBar 이동** — `git mv src/components/mailer/HeartbeatBar.jsx src/components/shared/HeartbeatBar.jsx`, JobRow.jsx의 import를 `'../shared/HeartbeatBar.jsx'`로 수정.

- [ ] **Step 3: 검증 + 커밋** — `npm test` PASS, `npm run build` 성공 → `git add -A && git commit -m "feat(chatbot): API 클라이언트 + HeartbeatBar 공용화"`

---

### Task 5: ChatbotPage UI (봇 목록·등록 모달·설정)

**Files:**
- Create: `src/components/chatbot/BotRow.jsx`
- Create: `src/components/chatbot/BotModal.jsx`
- Create: `src/components/chatbot/ChatbotSettings.jsx`
- Modify: `src/pages/ChatbotPage.jsx` (전면 재작성)
- Modify: `src/index.css` (시나리오 스텝 편집 CSS)

- [ ] **Step 1: BotRow.jsx** (JobRow 단순화 — 드래그·선택 없음):

```jsx
import { Pencil, Trash2 } from 'lucide-react'
import HeartbeatBar from '../shared/HeartbeatBar.jsx'
import MoreMenu from '../shared/MoreMenu.jsx'
import { fmtKst } from '../../lib/datetime.js'

export default function BotRow({ bot, onToggle, onEdit, onDelete, toggling }) {
  const checks = bot.recent_checks ?? []
  const last = checks[checks.length - 1]
  const lastFailed = last && !last.ok
  const dotClass = !checks.length ? 'idle' : lastFailed ? 'fail' : 'ok'
  let host = bot.url
  try { host = new URL(bot.url).host } catch { /* 원본 유지 */ }

  return (
    <div className={`job-row${lastFailed ? ' failed' : ''}`}>
      <div className="job-row-main">
        <span className={`status-dot ${dotClass}`} />
        <div className="job-row-title">
          <span className="job-row-name">{bot.name}</span>
          <span className="job-row-sub">
            <span className="mono">{host}</span>
            {last && <> · 마지막 체크: <span className="mono">{fmtKst(last.checked_at)}</span> · {last.ok ? '성공' : '실패'}</>}
            {!checks.length && <> · 아직 체크 전</>}
          </span>
        </div>
        <HeartbeatBar sends={checks.map(c => ({ ok: c.ok, sent_at: c.checked_at }))} />
        <button
          type="button"
          className={`switch${bot.enabled ? ' on' : ''}`}
          onClick={onToggle}
          disabled={toggling}
          role="switch"
          aria-checked={bot.enabled}
          aria-label={bot.enabled ? `${bot.name} 비활성화` : `${bot.name} 활성화`}
        >
          <span className="switch-knob" />
        </button>
        <MoreMenu label={`${bot.name} 메뉴`} items={[
          { icon: Pencil, text: '수정', onClick: onEdit },
          { icon: Trash2, text: '삭제', danger: true, onClick: onDelete },
        ]} />
      </div>
      {lastFailed && last.detail && (
        <div className="bot-fail-detail">{last.detail}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: BotModal.jsx** (시나리오 스텝 동적 편집):

```jsx
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Modal from '../shared/Modal.jsx'

export default function BotModal({ bot, onSubmit, onClose, loading }) {
  const [name, setName] = useState(bot?.name ?? '')
  const [url, setUrl] = useState(bot?.url ?? '')
  const [steps, setSteps] = useState(bot?.scenario?.length ? bot.scenario : [{ say: '', expect: '' }])
  const [inputSelector, setInputSelector] = useState(bot?.input_selector ?? '')
  const [showAdvanced, setShowAdvanced] = useState(!!bot?.input_selector)

  const setStep = (i, key, value) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: value } : s))

  const handleSubmit = (e) => {
    e.preventDefault()
    const scenario = steps.filter(s => s.say.trim() && s.expect.trim())
    onSubmit({ name, url, scenario, input_selector: inputSelector.trim() || null })
  }

  const valid = steps.some(s => s.say.trim() && s.expect.trim())

  return (
    <Modal title={bot ? '챗봇 수정' : '챗봇 등록'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label className="form-label" htmlFor="bot-name">이름</label>
          <input id="bot-name" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="예: 코기 상담봇" required />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="bot-url">챗봇 URL</label>
          <input id="bot-url" className="form-input mono" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required />
        </div>
        <div className="form-field">
          <label className="form-label">시나리오 (발화 → 기대 키워드)</label>
          <div className="scenario-steps">
            {steps.map((s, i) => (
              <div key={i} className="scenario-step">
                <span className="scenario-step-num mono">{i + 1}</span>
                <input className="form-input" value={s.say} onChange={e => setStep(i, 'say', e.target.value)} placeholder="발화 (예: 안녕)" aria-label={`스텝 ${i + 1} 발화`} />
                <span className="scenario-arrow">→</span>
                <input className="form-input" value={s.expect} onChange={e => setStep(i, 'expect', e.target.value)} placeholder="기대 키워드" aria-label={`스텝 ${i + 1} 기대 키워드`} />
                {steps.length > 1 && (
                  <button type="button" className="scenario-step-remove" onClick={() => setSteps(prev => prev.filter((_, idx) => idx !== i))} aria-label={`스텝 ${i + 1} 삭제`}>
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="attachment-add" onClick={() => setSteps(prev => [...prev, { say: '', expect: '' }])}>
            <Plus size={12} /> 스텝 추가
          </button>
          <p className="form-hint">응답에 기대 키워드가 나타나면 성공으로 판정합니다. 매일 08:30 자동 체크.</p>
        </div>
        <button type="button" className="recipient-toggle" onClick={() => setShowAdvanced(v => !v)}>
          고급 설정 {showAdvanced ? '접기' : '펼치기'}
        </button>
        {showAdvanced && (
          <div className="form-field" style={{ marginTop: '12px' }}>
            <label className="form-label" htmlFor="bot-selector">입력창 셀렉터 (선택)</label>
            <input id="bot-selector" className="form-input mono" value={inputSelector} onChange={e => setInputSelector(e.target.value)} placeholder="비우면 자동 탐색 (textarea → input → contenteditable)" />
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>취소</button>
          <button type="submit" className="modal-submit" disabled={loading || !valid}>
            {loading ? '저장 중…' : (bot ? '수정' : '등록')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 3: ChatbotSettings.jsx** (GrafanaSettings 패턴):

```jsx
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import TagInput from '../mailer/TagInput.jsx'
import { getChatbotSettings, updateChatbotSettings } from '../../lib/api/chatbot.js'
import { getCookie, clearCookie } from '../../lib/auth.js'

export default function ChatbotSettings() {
  const password = getCookie()
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getChatbotSettings(password)
      setRecipients(s.recipients ?? [])
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') clearCookie()
      else toast.error('설정을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [password])

  useEffect(() => { load() }, [load])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const s = await updateChatbotSettings({ recipients }, password)
      setRecipients(s.recipients ?? [])
      toast.success('설정을 저장했습니다')
    } catch {
      toast.error('저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="job-empty">불러오는 중…</p>

  return (
    <form className="grafana-settings" onSubmit={handleSave}>
      <div className="form-field">
        <label className="form-label">실패 알림 수신자</label>
        <TagInput values={recipients} onChange={setRecipients} />
        <p className="form-hint">체크 실패 시 메일을 받을 주소. 비우면 알림을 보내지 않습니다.</p>
      </div>
      <div className="modal-actions">
        <button type="submit" className="modal-submit" disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: ChatbotPage.jsx 재작성** (MailerPage 축약판 — 탭 2개, 낙관적 토글, ConfirmDialog, 스켈레톤, 60초 폴링 없음 — 하루 1회 체크라 불필요, 탭 진입 시 1회 로드):

```jsx
// src/pages/ChatbotPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { getBots, createBot, updateBot, deleteBot } from '../lib/api/chatbot.js'
import { getCookie, clearCookie } from '../lib/auth.js'
import AppHeader from '../components/shared/AppHeader.jsx'
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx'
import BotRow from '../components/chatbot/BotRow.jsx'
import BotModal from '../components/chatbot/BotModal.jsx'
import ChatbotSettings from '../components/chatbot/ChatbotSettings.jsx'

export default function ChatbotPage() {
  const navigate = useNavigate()
  const password = getCookie()
  const [bots, setBots] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [tab, setTab] = useState('bots')
  const [showModal, setShowModal] = useState(false)
  const [editBot, setEditBot] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [togglingIds, setTogglingIds] = useState(new Set())

  const refresh = useCallback(async () => {
    try {
      setBots(await getBots(password))
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') { clearCookie(); navigate('/login') }
    } finally {
      setInitialLoading(false)
    }
  }, [password, navigate])

  useEffect(() => { refresh() }, [refresh])

  const handleSubmit = async (data) => {
    setSaving(true)
    try {
      if (editBot) {
        const updated = await updateBot(editBot.id, data, password)
        setBots(prev => prev.map(b => b.id === editBot.id ? { ...b, ...updated } : b))
        toast.success('챗봇을 수정했습니다')
      } else {
        const bot = await createBot(data, password)
        setBots(prev => [...prev, { ...bot, recent_checks: [] }])
        toast.success(`"${bot.name}"을(를) 등록했습니다 — 다음 체크부터 포함됩니다`)
      }
      setShowModal(false)
      setEditBot(null)
    } catch {
      toast.error(editBot ? '수정에 실패했습니다' : '등록에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (bot) => {
    const next = !bot.enabled
    setTogglingIds(prev => new Set(prev).add(bot.id))
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, enabled: next } : b))
    try {
      await updateBot(bot.id, { enabled: next }, password)
      toast.success(next ? `"${bot.name}" 체크 활성화` : `"${bot.name}" 체크 중지`)
    } catch {
      setBots(prev => prev.map(b => b.id === bot.id ? { ...b, enabled: !next } : b))
      toast.error('상태 변경에 실패했습니다')
    } finally {
      setTogglingIds(prev => { const s = new Set(prev); s.delete(bot.id); return s })
    }
  }

  const requestDelete = (bot) => setConfirm({
    title: '챗봇 삭제',
    message: `"${bot.name}"을(를) 삭제할까요? 체크 이력도 함께 삭제됩니다.`,
    confirmLabel: '삭제',
    danger: true,
    action: async () => {
      try {
        await deleteBot(bot.id, password)
        setBots(prev => prev.filter(b => b.id !== bot.id))
        toast.success('챗봇을 삭제했습니다')
      } catch {
        toast.error('삭제에 실패했습니다')
      }
    },
  })

  return (
    <div className="app">
      <AppHeader toolName="챗봇 모니터링">
        {tab === 'bots' && (
          <button className="app-new-btn" onClick={() => { setEditBot(null); setShowModal(true) }}>
            <Plus size={14} /> 챗봇 등록
          </button>
        )}
      </AppHeader>

      <nav className="nav-tabs">
        <button className={`nav-tab${tab === 'bots' ? ' active' : ''}`} onClick={() => setTab('bots')}>봇 목록</button>
        <button className={`nav-tab${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>설정</button>
      </nav>

      {tab === 'bots' ? (
        <div className="job-list">
          <p className="form-hint">매일 08:30 KST 자동 체크 · GitHub Actions에서 수동 실행 가능</p>
          {initialLoading ? (
            <>
              <div className="job-skeleton" />
              <div className="job-skeleton" />
            </>
          ) : bots.length === 0 ? (
            <div className="job-empty">
              <p>등록된 챗봇이 없습니다.</p>
              <button className="app-new-btn" onClick={() => { setEditBot(null); setShowModal(true) }}>
                <Plus size={14} /> 챗봇 등록
              </button>
            </div>
          ) : (
            bots.map(bot => (
              <BotRow
                key={bot.id}
                bot={bot}
                toggling={togglingIds.has(bot.id)}
                onToggle={() => handleToggle(bot)}
                onEdit={() => { setEditBot(bot); setShowModal(true) }}
                onDelete={() => requestDelete(bot)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="grafana-wrap"><ChatbotSettings /></div>
      )}

      {showModal && (
        <BotModal
          bot={editBot}
          onSubmit={handleSubmit}
          onClose={() => { setShowModal(false); setEditBot(null) }}
          loading={saving}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={async () => { await confirm.action(); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: CSS 추가** — index.css `/* ── 준비 중 빈 상태 ── */` 섹션을 챗봇 섹션으로 대체(coming-soon 제거):

```css
/* ── 챗봇 모니터링 ── */
.scenario-steps { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.scenario-step { display: flex; align-items: center; gap: 8px; }
.scenario-step .form-input { flex: 1; min-width: 0; }
.scenario-step-num { font-size: 12px; color: var(--color-text-faint); width: 14px; text-align: right; flex-shrink: 0; }
.scenario-arrow { color: var(--color-text-faint); flex-shrink: 0; }
.scenario-step-remove {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
  background: none; border: none; cursor: pointer; color: var(--color-text-faint);
}
.scenario-step-remove:hover { color: var(--color-status-error); background: color-mix(in srgb, var(--color-status-error) 10%, transparent); }
.bot-fail-detail {
  margin-top: 6px; padding: 8px 10px; border-radius: 8px;
  font-size: 12px; color: var(--color-status-error);
  background: color-mix(in srgb, var(--color-status-error) 8%, transparent);
  white-space: pre-wrap; word-break: break-word;
  font-family: var(--font-mono);
}
```

- [ ] **Step 6: 검증 + 커밋** — `npm test` PASS, lint, build → `git add -A && git commit -m "feat(chatbot): 봇 목록·등록 모달·설정 UI"`

---

### Task 6: IconRail·허브 활성화 + 배너 합산 + 최종 검증

**Files:**
- Modify: `src/components/shared/IconRail.jsx` (챗봇 disabled 제거)
- Modify: `src/pages/HubPage.jsx` (챗봇 카드 활성화 + 배너 합산)

- [ ] **Step 1: IconRail** — TOOLS의 챗봇 항목에서 `disabled: true` 제거, label을 `'챗봇 모니터링'`으로.

- [ ] **Step 2: HubPage** — TOOLS 챗봇 항목 `active: true`로. `getBots` 추가 로드(best-effort), 배너 로직 확장:

```jsx
import { getBots } from '../lib/api/chatbot.js'
// ...
const [bots, setBots] = useState(null)
useEffect(() => {
  getJobs(getCookie()).then(setJobs).catch(() => {})
  getBots(getCookie()).then(setBots).catch(() => {})
}, [])

const botFailCount = bots?.filter(b => {
  const last = b.recent_checks?.[b.recent_checks.length - 1]
  return last && !last.ok
}).length ?? 0
```

배너: 둘 다 정상이면 기존 문구, 실패가 있으면 항목별로 — `Mailer: 최근 발송 N건 실패` / `챗봇: 어제 체크 N건 실패`를 ' · '로 연결. 챗봇 카드에도 상태 도트(`hub-card-dot`, jobs 카드와 동일 패턴, bots 로드 시).

- [ ] **Step 3: 전체 검증** — `npm test` PASS, `npm run lint` 0 에러, `npm run build` 성공, dev 서버 스모크(챗봇 탭 진입·등록 모달).

- [ ] **Step 4: 커밋** — `git add -A && git commit -m "feat(chatbot): 레일·허브 활성화 + 상태 배너 합산"`

---

## 배포 체크리스트 (구현 후 사용자 안내)

1. SQL Editor에서 `20260610100000_add_chatbot_monitoring.sql` 실행
2. GitHub repo Settings → Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등록
3. PR 머지 → Vercel 배포
4. 허브에서 봇 등록 → Actions 탭에서 `chatbot-check` workflow_dispatch 수동 실행 → 결과·스크린샷 확인
5. 검증 후 로컬 `monitor_link.sh` 프로세스 중단

## Self-Review 체크 결과

- 스펙 §1→Task 1, §2→Task 3, §3→Task 2, §4→Task 4·5·6, §5 판정→Task 1·3, §6 테스트→Task 1·2, §7→배포 체크리스트. 누락 없음.
- 타입 일관성: `recent_checks: [{ok, detail, duration_ms, checked_at}]` (Task 2 서버 ↔ Task 5 BotRow ↔ Task 6 HubPage), `scenario: [{say, expect}]` (Task 1 SQL ↔ Task 3 러너 ↔ Task 5 BotModal), `judgeStep/buildFailureMail` 시그니처 (Task 1 ↔ Task 3) 일치.
- HeartbeatBar props: `sends=[{ok, sent_at}]` — BotRow에서 checked_at→sent_at 매핑함 (Task 5 Step 1).
