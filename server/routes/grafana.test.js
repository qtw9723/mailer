// server/routes/grafana.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../grafana/client.js', () => ({
  gatherReportData: vi.fn(),
}))
vi.mock('../grafana/email.js', () => ({
  sendReportEmail: vi.fn(),
}))

import { gatherReportData } from '../grafana/client.js'
import { sendReportEmail } from '../grafana/email.js'
const { default: grafanaRouter } = await import('./grafana.js')

const app = express()
app.use(express.json())
app.use('/api/grafana', grafanaRouter)

const SAMPLE = {
  metrics: [{ label: 'CPU', value: 10, threshold: 80, error: null }],
  logs: [{ app: 'soe', count: 0, rows: [], error: null }],
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_PASSWORD = 'test-pw'
  process.env.CRON_SECRET = 'cron-secret'
})

describe('GET /api/grafana/report', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).get('/api/grafana/report')
    expect(res.status).toBe(401)
  })
  it('인증 성공 시 리포트 JSON 반환', async () => {
    gatherReportData.mockResolvedValueOnce(SAMPLE)
    const res = await request(app).get('/api/grafana/report').set('x-app-password', 'test-pw')
    expect(res.status).toBe(200)
    expect(res.body.summary).toEqual({ alerts: 0, status: 'ok' })
    expect(res.body.metrics[0].label).toBe('CPU')
  })
  it('Grafana 조회 실패 시 502', async () => {
    gatherReportData.mockRejectedValueOnce(new Error('grafana down'))
    const res = await request(app).get('/api/grafana/report').set('x-app-password', 'test-pw')
    expect(res.status).toBe(502)
  })
})

describe('GET /api/grafana/cron', () => {
  it('CRON_SECRET 없으면 401', async () => {
    const res = await request(app).get('/api/grafana/cron')
    expect(res.status).toBe(401)
  })
  it('올바른 Bearer면 조회+메일 발송 후 sent 반환', async () => {
    gatherReportData.mockResolvedValueOnce(SAMPLE)
    sendReportEmail.mockResolvedValueOnce()
    const res = await request(app).get('/api/grafana/cron').set('Authorization', 'Bearer cron-secret')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ sent: true, alerts: 0 })
    expect(sendReportEmail).toHaveBeenCalledOnce()
  })
})
