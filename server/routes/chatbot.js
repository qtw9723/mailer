// server/routes/chatbot.js
import { Router } from 'express'
import db from '../db.js'

const router = Router()

const ALLOWED_BOT_PATCH_FIELDS = new Set([
  'name', 'url', 'scenario', 'input_selector', 'enabled', 'sort_order', 'category',
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

    // 하트비트용 최근 체크 이력 병합 (best-effort — 테이블 미적용 환경에서도 동작)
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
  const { name, url, scenario, input_selector, category } = req.body
  try {
    const { data, error } = await db
      .from('chatbots')
      .insert({ name, url, scenario: scenario ?? [], input_selector: input_selector || null, category: category?.trim() || null })
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
  if ('category' in updateObj) updateObj.category = updateObj.category?.trim() || null
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

// POST /api/chatbot/run-check — GitHub Actions 워크플로우 수동 트리거 (bot_id 있으면 해당 봇만)
router.post('/run-check', auth, async (req, res) => {
  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({ error: 'GITHUB_TOKEN이 설정되지 않았습니다. Fine-grained 토큰(Actions: write)을 환경변수에 추가하세요.' })
  }
  const repo = process.env.GITHUB_REPO ?? 'qtw9723/mailer'
  const { bot_id, category } = req.body ?? {}
  // bot_id(단건) 우선, 없으면 category(그룹). 둘 다 없으면 전체.
  const inputs = bot_id ? { bot_id } : category ? { category } : {}
  try {
    const ghRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/chatbot-check.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'cs-smarthub',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    })
    if (!ghRes.ok) {
      const text = await ghRes.text()
      return res.status(502).json({ error: `GitHub dispatch 실패 (${ghRes.status}): ${text.slice(0, 200)}` })
    }
    res.status(202).json({ triggered: true })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// PATCH /api/chatbot/categories — 카테고리 이름 변경(봇까지 일괄 반영)
router.patch('/categories', auth, async (req, res) => {
  const from = req.body?.from
  const to = (req.body?.to ?? '').trim()
  if (!from || !to) return res.status(400).json({ error: 'from/to required' })
  try {
    const { error: e1 } = await db.from('chatbots').update({ category: to }).eq('category', from)
    if (e1) throw e1
    const { data: s, error: e2 } = await db.from('chatbot_monitor_settings').select('categories').eq('id', 1).single()
    if (e2) throw e2
    const seen = new Set()
    const categories = (s?.categories ?? [])
      .map(c => (c === from ? to : c)).map(c => String(c).trim())
      .filter(c => c && !seen.has(c) && seen.add(c))
    const { data, error: e3 } = await db.from('chatbot_monitor_settings')
      .update({ categories, updated_at: new Date().toISOString() }).eq('id', 1).select().single()
    if (e3) throw e3
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/chatbot/categories — 카테고리 삭제(해당 봇은 미분류로 이동)
router.delete('/categories', auth, async (req, res) => {
  const name = req.body?.name
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const { error: e1 } = await db.from('chatbots').update({ category: null }).eq('category', name)
    if (e1) throw e1
    const { data: s, error: e2 } = await db.from('chatbot_monitor_settings').select('categories').eq('id', 1).single()
    if (e2) throw e2
    const categories = (s?.categories ?? []).filter(c => c !== name)
    const { data, error: e3 } = await db.from('chatbot_monitor_settings')
      .update({ categories, updated_at: new Date().toISOString() }).eq('id', 1).select().single()
    if (e3) throw e3
    res.json(data)
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

// PUT /api/chatbot/settings — recipients / categories 부분 갱신 (제공된 것만 변경)
router.put('/settings', auth, async (req, res) => {
  const { recipients, categories } = req.body
  const patch = { updated_at: new Date().toISOString() }
  if (recipients !== undefined) patch.recipients = recipients ?? []
  if (categories !== undefined) {
    const seen = new Set()
    patch.categories = (Array.isArray(categories) ? categories : [])
      .map(c => String(c).trim())
      .filter(c => c && !seen.has(c) && seen.add(c)) // 트림·빈값·중복 제거, 순서 유지
  }
  try {
    const { data, error } = await db
      .from('chatbot_monitor_settings')
      .update(patch)
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
