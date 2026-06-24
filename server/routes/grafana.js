// server/routes/grafana.js
import { Router } from 'express'
import { gatherReportData, queryPrometheus, queryElasticsearch } from '../grafana/client.js'
import { buildReport, buildEmailHtml } from '../grafana/report.js'
import { sendReportEmail } from '../grafana/email.js'
import { getSettings, saveSettings, markSent } from '../grafana/settings.js'
import { shouldSend, kstDateString } from '../grafana/schedule.js'
import { analyzeLogs } from '../grafana/analyze.js'
import { listTypes, getType, updateType, deleteType, resolveAndPersist } from '../grafana/logTypes.js'
import { LOG_INDEX_LAG_HOURS, LOG_HOURS, LOG_FETCH, DEFAULT_METRICS, DEFAULT_LOG_QUERIES } from '../grafana/config.js'

const router = Router()

function auth(req, res, next) {
  if (req.headers['x-app-password'] !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

function envRecipients() {
  return (process.env.GRAFANA_EMAIL_TO ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

// 설정의 log_lag_hours(0~24 정수)만 채택, 그 외엔 기본 상수로 폴백
function lagFrom(settings) {
  const v = settings?.log_lag_hours
  return Number.isInteger(v) && v >= 0 && v <= 24 ? v : LOG_INDEX_LAG_HOURS
}

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

// GET /api/grafana/report — 웹 on-demand 조회 (설정의 쿼리·오프셋 적용)
router.get('/report', auth, async (_req, res) => {
  let settings = null
  try { settings = await getSettings() } catch { /* 설정 조회 실패 시 기본값 */ }
  const lagHours = lagFrom(settings)
  const metrics = settings?.metrics ?? DEFAULT_METRICS
  const logQueries = settings?.log_queries ?? DEFAULT_LOG_QUERIES
  try {
    const report = buildReport(await gatherReportData(metrics, logQueries, lagHours))
    // 저장된 최신 LLM 분석 요약을 함께 반환(LLM 미호출 — 저렴). 발송 시각에만 갱신됨.
    res.json({ ...report, analysis: settings?.last_analysis ?? null })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// POST /api/grafana/analyze — 현재 로그로 LLM 1회 분석(미리보기, 저장 안 함)
router.post('/analyze', auth, async (_req, res) => {
  let settings = null
  try { settings = await getSettings() } catch { /* 기본값 폴백 */ }
  const metrics = settings?.metrics ?? DEFAULT_METRICS
  const logQueries = settings?.log_queries ?? DEFAULT_LOG_QUERIES
  try {
    const { logs } = await gatherReportData(metrics, logQueries, lagFrom(settings))
    let existing = []
    try { existing = await listTypes() } catch { /* 기존 유형 없어도 진행 */ }
    const analysis = await analyzeLogs(logs, existing)
    res.json(analysis)
  } catch (e) {
    const code = /GEMINI_API_KEY/.test(e.message) ? 503 : 502
    res.status(code).json({ error: e.message })
  }
})

// GET /api/grafana/log-types — 영속 유형 목록
router.get('/log-types', auth, async (_req, res) => {
  try {
    res.json(await listTypes())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/grafana/log-types/:id — 유형 + 회차 로그
router.get('/log-types/:id', auth, async (req, res) => {
  try {
    const t = await getType(req.params.id)
    if (!t) return res.status(404).json({ error: 'not found' })
    res.json(t)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/grafana/log-types/:id — note/label/description 수정
router.patch('/log-types/:id', auth, async (req, res) => {
  const fields = {}
  for (const k of ['note', 'label', 'description']) {
    if (req.body[k] !== undefined) fields[k] = req.body[k] == null ? null : String(req.body[k])
  }
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'no valid fields' })
  try {
    const t = await updateType(req.params.id, fields)
    if (!t) return res.status(404).json({ error: 'not found' })
    res.json(t)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/grafana/log-types/:id
router.delete('/log-types/:id', auth, async (req, res) => {
  try {
    await deleteType(req.params.id)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/grafana/settings
router.get('/settings', auth, async (_req, res) => {
  try {
    const s = await getSettings()
    const recipients = s.recipients?.length ? s.recipients : envRecipients()
    res.json({ ...s, recipients })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/grafana/settings
router.put('/settings', auth, async (req, res) => {
  const { recipients, send_hour, enabled } = req.body
  if (typeof send_hour !== 'number' || !Number.isInteger(send_hour) || send_hour < 0 || send_hour > 23) {
    return res.status(400).json({ error: 'send_hour must be an integer 0-23' })
  }
  const log_lag_hours = req.body.log_lag_hours ?? LOG_INDEX_LAG_HOURS
  if (typeof log_lag_hours !== 'number' || !Number.isInteger(log_lag_hours) || log_lag_hours < 0 || log_lag_hours > 24) {
    return res.status(400).json({ error: 'log_lag_hours must be an integer 0-24' })
  }
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
})

// GET /api/grafana/tick — Supabase pg_cron이 매시간 호출. 설정대로 발송.
// (pg_net의 http_get은 GET만 지원하므로 상태 변경이지만 GET을 사용)
router.get('/tick', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    const now = new Date()
    const settings = await getSettings()
    const decision = shouldSend(settings, now)
    if (!decision.send) return res.json({ sent: false, reason: decision.reason })

    const recipients = settings.recipients?.length ? settings.recipients : envRecipients()
    if (recipients.length === 0) return res.json({ sent: false, reason: 'no-recipients' })

    const data = await gatherReportData(settings.metrics, settings.log_queries, lagFrom(settings))
    const report = buildReport(data)

    // LLM 분석은 best-effort: 실패해도 리포트/메일은 정상 발송. 저장은 이 시점(tick)에만.
    let summary = ''
    try {
      const analysis = await analyzeLogs(data.logs, await listTypes())
      summary = analysis.summary ?? ''
      if (analysis.types.length || summary) {
        if (analysis.types.length) await resolveAndPersist(analysis, now.toISOString())
        await saveSettings({ last_analysis: { summary, generated_at: now.toISOString() } })
      }
    } catch { /* 분석 생략하고 발송 진행 */ }

    await sendReportEmail(buildEmailHtml(report, summary), recipients)
    await markSent(kstDateString(now))
    res.json({ sent: true, alerts: report.summary.alerts })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

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
    // 리포트와 동일한 적재지연 보정(log_lag_hours)을 적용해, 테스트 건수가 리포트 실제 집계치와 일치하게 한다.
    let lagHours = LOG_INDEX_LAG_HOURS
    try { lagHours = lagFrom(await getSettings()) } catch { /* 설정 조회 실패 시 기본 오프셋 */ }
    const result = await queryElasticsearch([{ label: '_test', query }], LOG_HOURS, LOG_FETCH, lagHours)
    return res.json({ ok: true, count: result?._test?.count ?? 0 })
  } catch (e) {
    return res.json({ ok: false, error: e.message })
  }
})

export default router
