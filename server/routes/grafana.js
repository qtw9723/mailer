// server/routes/grafana.js
import { Router } from 'express'
import { gatherReportData } from '../grafana/client.js'
import { buildReport, buildEmailHtml } from '../grafana/report.js'
import { sendReportEmail } from '../grafana/email.js'

const router = Router()

function auth(req, res, next) {
  if (req.headers['x-app-password'] !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

// GET /api/grafana/report — 웹 on-demand 조회
router.get('/report', auth, async (_req, res) => {
  try {
    const report = buildReport(await gatherReportData())
    res.json(report)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// GET /api/grafana/cron — Vercel Cron이 호출. 조회 후 이메일 발송.
router.get('/cron', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    const report = buildReport(await gatherReportData())
    await sendReportEmail(buildEmailHtml(report))
    res.json({ sent: true, alerts: report.summary.alerts })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
