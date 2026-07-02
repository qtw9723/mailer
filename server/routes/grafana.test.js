// server/routes/grafana.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../grafana/client.js', () => ({ gatherReportData: vi.fn(), queryPrometheus: vi.fn(), queryElasticsearch: vi.fn() }))
vi.mock('../grafana/email.js', () => ({ sendReportEmail: vi.fn() }))
vi.mock('../grafana/settings.js', () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  markSent: vi.fn(),
}))
vi.mock('../grafana/analyze.js', () => ({ analyzeLogs: vi.fn() }))
vi.mock('../grafana/logTypes.js', () => ({
  listTypes: vi.fn(), listTypesWithHistory: vi.fn(), getType: vi.fn(), updateType: vi.fn(), deleteType: vi.fn(), updateRun: vi.fn(), resolveAndPersist: vi.fn(),
}))

import { gatherReportData, queryPrometheus, queryElasticsearch } from '../grafana/client.js'
import { LOG_HOURS, LOG_FETCH, LOG_INDEX_LAG_HOURS } from '../grafana/config.js'
import { sendReportEmail } from '../grafana/email.js'
import { getSettings, saveSettings, markSent } from '../grafana/settings.js'
import { analyzeLogs } from '../grafana/analyze.js'
import { listTypes, listTypesWithHistory, getType, updateType, deleteType, updateRun, resolveAndPersist } from '../grafana/logTypes.js'
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
  process.env.GRAFANA_EMAIL_TO = 'fallback@example.com'
  // LLM/유형 기본 목: 분석 없음, 유형 없음 (개별 테스트에서 덮어씀)
  analyzeLogs.mockResolvedValue({ summary: '', types: [] })
  listTypes.mockResolvedValue([])
  listTypesWithHistory.mockResolvedValue([])
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
  })
  it('Grafana 조회 실패 시 502', async () => {
    gatherReportData.mockRejectedValueOnce(new Error('grafana down'))
    const res = await request(app).get('/api/grafana/report').set('x-app-password', 'test-pw')
    expect(res.status).toBe(502)
  })
  it('설정의 log_lag_hours로 gatherReportData 호출', async () => {
    getSettings.mockResolvedValueOnce({ recipients: ['a@x.com'], send_hour: 9, enabled: true, log_lag_hours: 2 })
    gatherReportData.mockResolvedValueOnce(SAMPLE)
    await request(app).get('/api/grafana/report').set('x-app-password', 'test-pw')
    expect(gatherReportData).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), 2)
  })
  it('설정 조회 실패해도 기본 오프셋(3)으로 리포트 반환', async () => {
    getSettings.mockRejectedValueOnce(new Error('db down'))
    gatherReportData.mockResolvedValueOnce(SAMPLE)
    const res = await request(app).get('/api/grafana/report').set('x-app-password', 'test-pw')
    expect(res.status).toBe(200)
    expect(gatherReportData).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), 3)
  })
})

describe('GET /api/grafana/settings', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).get('/api/grafana/settings')
    expect(res.status).toBe(401)
  })
  it('recipients 비어있으면 env 폴백으로 채워 반환', async () => {
    getSettings.mockResolvedValueOnce({ id: 1, recipients: [], send_hour: 9, enabled: true, last_sent_date: null, log_lag_hours: 3 })
    const res = await request(app).get('/api/grafana/settings').set('x-app-password', 'test-pw')
    expect(res.status).toBe(200)
    expect(res.body.recipients).toEqual(['fallback@example.com'])
    expect(res.body.send_hour).toBe(9)
    expect(res.body.log_lag_hours).toBe(3)
  })
  it('recipients/log_lag_hours 그대로 반환', async () => {
    getSettings.mockResolvedValueOnce({ id: 1, recipients: ['a@x.com'], send_hour: 13, enabled: false, last_sent_date: null, log_lag_hours: 5 })
    const res = await request(app).get('/api/grafana/settings').set('x-app-password', 'test-pw')
    expect(res.body.recipients).toEqual(['a@x.com'])
    expect(res.body.log_lag_hours).toBe(5)
  })
})

describe('PUT /api/grafana/settings', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).put('/api/grafana/settings').send({ recipients: [], send_hour: 9, enabled: true })
    expect(res.status).toBe(401)
  })
  it('send_hour 범위 밖이면 400', async () => {
    const res = await request(app).put('/api/grafana/settings')
      .set('x-app-password', 'test-pw').send({ recipients: ['a@x.com'], send_hour: 24, enabled: true })
    expect(res.status).toBe(400)
  })
  it('send_hour가 숫자가 아니면 400', async () => {
    const res = await request(app).put('/api/grafana/settings')
      .set('x-app-password', 'test-pw').send({ recipients: ['a@x.com'], send_hour: null, enabled: true })
    expect(res.status).toBe(400)
  })
  it('log_lag_hours 범위 밖이면 400', async () => {
    const res = await request(app).put('/api/grafana/settings')
      .set('x-app-password', 'test-pw').send({ recipients: ['a@x.com'], send_hour: 9, enabled: true, log_lag_hours: 25 })
    expect(res.status).toBe(400)
  })
  it('log_lag_hours 음수면 400', async () => {
    const res = await request(app).put('/api/grafana/settings')
      .set('x-app-password', 'test-pw').send({ recipients: ['a@x.com'], send_hour: 9, enabled: true, log_lag_hours: -1 })
    expect(res.status).toBe(400)
  })
  it('정상 저장 시 log_lag_hours 포함해 저장(미지정 시 기본 3)', async () => {
    saveSettings.mockResolvedValueOnce({ id: 1, recipients: ['a@x.com'], send_hour: 8, enabled: true, last_sent_date: null, log_lag_hours: 3 })
    const res = await request(app).put('/api/grafana/settings')
      .set('x-app-password', 'test-pw').send({ recipients: ['a@x.com', ' '], send_hour: 8, enabled: true })
    expect(res.status).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ recipients: ['a@x.com'], send_hour: 8, enabled: true, log_lag_hours: 3 })
  })
  it('log_lag_hours 지정 시 그 값으로 저장', async () => {
    saveSettings.mockResolvedValueOnce({ id: 1, recipients: ['a@x.com'], send_hour: 8, enabled: true, last_sent_date: null, log_lag_hours: 2 })
    await request(app).put('/api/grafana/settings')
      .set('x-app-password', 'test-pw').send({ recipients: ['a@x.com'], send_hour: 8, enabled: true, log_lag_hours: 2 })
    expect(saveSettings).toHaveBeenCalledWith({ recipients: ['a@x.com'], send_hour: 8, enabled: true, log_lag_hours: 2 })
  })
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
})

describe('GET /api/grafana/tick', () => {
  it('CRON_SECRET 없으면 401', async () => {
    const res = await request(app).get('/api/grafana/tick')
    expect(res.status).toBe(401)
  })
  it('비활성 시 발송 안 하고 skip', async () => {
    getSettings.mockResolvedValueOnce({ recipients: ['a@x.com'], send_hour: 9, enabled: false, last_sent_date: null })
    const res = await request(app).get('/api/grafana/tick').set('Authorization', 'Bearer cron-secret')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ sent: false, analyzed: false, reason: 'disabled' })
    expect(sendReportEmail).not.toHaveBeenCalled()
  })
  it('시각 불일치 시 skip', async () => {
    getSettings.mockResolvedValueOnce({ recipients: ['a@x.com'], send_hour: 99, enabled: true, last_sent_date: null })
    const res = await request(app).get('/api/grafana/tick').set('Authorization', 'Bearer cron-secret')
    expect(res.body.sent).toBe(false)
    expect(res.body.reason).toBe('not-time')
  })
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
      expect(res.body).toEqual({ sent: true, analyzed: true, alerts: 0 })
      expect(gatherReportData).toHaveBeenCalledWith(M, L, 4)
      expect(sendReportEmail).toHaveBeenCalledOnce()
      expect(sendReportEmail.mock.calls[0][1]).toEqual(['a@x.com'])
      expect(markSent).toHaveBeenCalledOnce()
      expect(markSent.mock.calls[0][0]).toBe('2026-06-05')
    } finally {
      vi.useRealTimers()
    }
  })
  it('발송 대상이나 수신자 없으면 발송은 skip(no-recipients)하되 분석은 진행', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T00:00:00Z'))
    process.env.GRAFANA_EMAIL_TO = ''
    try {
      getSettings.mockResolvedValueOnce({ recipients: [], send_hour: 9, enabled: true, last_sent_date: '2000-01-01', last_analysis_date: null })
      gatherReportData.mockResolvedValueOnce(SAMPLE)
      const res = await request(app).get('/api/grafana/tick').set('Authorization', 'Bearer cron-secret')
      expect(res.body).toEqual({ sent: false, analyzed: true, alerts: 0, reason: 'no-recipients' })
      expect(sendReportEmail).not.toHaveBeenCalled()
      expect(markSent).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('GET /api/grafana/report (analysis 포함)', () => {
  it('저장된 last_analysis를 함께 반환', async () => {
    getSettings.mockResolvedValueOnce({ log_lag_hours: 3, last_analysis: { summary: 's', generated_at: 'g' } })
    gatherReportData.mockResolvedValueOnce(SAMPLE)
    const res = await request(app).get('/api/grafana/report').set('x-app-password', 'test-pw')
    expect(res.body.analysis).toEqual({ summary: 's', generated_at: 'g' })
  })
})

describe('POST /api/grafana/analyze (미리보기)', () => {
  it('인증 없으면 401', async () => {
    expect((await request(app).post('/api/grafana/analyze')).status).toBe(401)
  })
  it('현재 로그로 분석 결과 반환(저장 안 함)', async () => {
    getSettings.mockResolvedValueOnce({ log_lag_hours: 2 })
    gatherReportData.mockResolvedValueOnce(SAMPLE)
    analyzeLogs.mockResolvedValueOnce({ summary: '점검', types: [{ label: 'L', app: 'soe', count: 2, logs: [] }] })
    const res = await request(app).post('/api/grafana/analyze').set('x-app-password', 'test-pw')
    expect(res.status).toBe(200)
    expect(res.body.summary).toBe('점검')
    expect(resolveAndPersist).not.toHaveBeenCalled() // 미리보기는 저장 안 함
  })
  it('GEMINI 키 없으면 503', async () => {
    getSettings.mockResolvedValueOnce({})
    gatherReportData.mockResolvedValueOnce(SAMPLE)
    analyzeLogs.mockRejectedValueOnce(new Error('GEMINI_API_KEY 미설정'))
    const res = await request(app).post('/api/grafana/analyze').set('x-app-password', 'test-pw')
    expect(res.status).toBe(503)
  })
})

describe('log-types CRUD', () => {
  it('GET 목록', async () => {
    listTypes.mockResolvedValueOnce([{ id: 't1', label: 'A', total_count: 5 }])
    const res = await request(app).get('/api/grafana/log-types').set('x-app-password', 'test-pw')
    expect(res.body).toEqual([{ id: 't1', label: 'A', total_count: 5 }])
  })
  it('GET 상세 없으면 404', async () => {
    getType.mockResolvedValueOnce(null)
    expect((await request(app).get('/api/grafana/log-types/x').set('x-app-password', 'test-pw')).status).toBe(404)
  })
  it('PATCH note 갱신', async () => {
    updateType.mockResolvedValueOnce({ id: 't1', note: 'hi' })
    const res = await request(app).patch('/api/grafana/log-types/t1').set('x-app-password', 'test-pw').send({ note: 'hi' })
    expect(res.status).toBe(200)
    expect(updateType).toHaveBeenCalledWith('t1', { note: 'hi' })
  })
  it('PATCH 유효 필드 없으면 400', async () => {
    const res = await request(app).patch('/api/grafana/log-types/t1').set('x-app-password', 'test-pw').send({ bogus: 1 })
    expect(res.status).toBe(400)
  })
  it('DELETE 성공', async () => {
    deleteType.mockResolvedValueOnce()
    const res = await request(app).delete('/api/grafana/log-types/t1').set('x-app-password', 'test-pw')
    expect(res.status).toBe(200)
    expect(deleteType).toHaveBeenCalledWith('t1')
  })
  it('PATCH 회차 메모 저장', async () => {
    updateRun.mockResolvedValueOnce({ id: 5, note: '확인함' })
    const res = await request(app).patch('/api/grafana/log-type-runs/5').set('x-app-password', 'test-pw').send({ note: '확인함' })
    expect(res.status).toBe(200)
    expect(updateRun).toHaveBeenCalledWith('5', '확인함')
  })
  it('PATCH 회차 note 없으면 400', async () => {
    const res = await request(app).patch('/api/grafana/log-type-runs/5').set('x-app-password', 'test-pw').send({})
    expect(res.status).toBe(400)
  })
  it('PATCH 없는 회차면 404', async () => {
    updateRun.mockResolvedValueOnce(null)
    const res = await request(app).patch('/api/grafana/log-type-runs/999').set('x-app-password', 'test-pw').send({ note: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/grafana/tick (분석 저장)', () => {
  it('분석 결과 있으면 persist + last_analysis 저장 + 메일에 요약 포함', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T00:00:00Z'))
    try {
      getSettings.mockResolvedValueOnce({ recipients: ['a@x.com'], send_hour: 9, enabled: true, last_sent_date: '2000-01-01', metrics: [], log_queries: [] })
      gatherReportData.mockResolvedValueOnce(SAMPLE)
      analyzeLogs.mockResolvedValueOnce({ summary: '점검 요약', types: [{ label: 'L', app: 'soe', count: 3, logs: [] }] })
      sendReportEmail.mockResolvedValueOnce()
      const res = await request(app).get('/api/grafana/tick').set('Authorization', 'Bearer cron-secret')
      expect(res.body.sent).toBe(true)
      expect(res.body.analyzed).toBe(true)
      expect(resolveAndPersist).toHaveBeenCalledOnce()
      expect(saveSettings).toHaveBeenCalledWith({ last_analysis_date: '2026-06-05', last_analysis: { summary: '점검 요약', generated_at: '2026-06-05T00:00:00.000Z' } })
      expect(sendReportEmail.mock.calls[0][0]).toContain('점검 요약')
    } finally {
      vi.useRealTimers()
    }
  })
  it('분석 실패해도 메일은 발송(best-effort)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T00:00:00Z'))
    try {
      getSettings.mockResolvedValueOnce({ recipients: ['a@x.com'], send_hour: 9, enabled: true, last_sent_date: '2000-01-01', metrics: [], log_queries: [] })
      gatherReportData.mockResolvedValueOnce(SAMPLE)
      analyzeLogs.mockRejectedValueOnce(new Error('gemini down'))
      sendReportEmail.mockResolvedValueOnce()
      const res = await request(app).get('/api/grafana/tick').set('Authorization', 'Bearer cron-secret')
      expect(res.body.sent).toBe(true)
      expect(res.body.analyzed).toBe(false)
      expect(sendReportEmail).toHaveBeenCalledOnce()
      expect(markSent).toHaveBeenCalledOnce()
      // 분석 실패 시 last_analysis_date를 남기지 않아 다음 tick에서 재시도 가능해야 함
      expect(saveSettings).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('이미 발송했으나(already-sent) 오늘 분석 전이면 메일 없이 분석만 재시도', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T00:00:00Z')) // KST 9시
    try {
      // 발송 시각 7시(이미 지남), 오늘 이미 발송 완료, 그러나 분석은 아직(어제 날짜)
      getSettings.mockResolvedValueOnce({ recipients: ['a@x.com'], send_hour: 7, enabled: true, last_sent_date: '2026-06-05', last_analysis_date: '2026-06-04', metrics: [], log_queries: [] })
      gatherReportData.mockResolvedValueOnce(SAMPLE)
      analyzeLogs.mockResolvedValueOnce({ summary: '재시도 요약', types: [{ label: 'L', app: 'soe', count: 1, logs: [] }] })
      const res = await request(app).get('/api/grafana/tick').set('Authorization', 'Bearer cron-secret')
      expect(res.body).toEqual({ sent: false, analyzed: true, alerts: 0 })
      expect(sendReportEmail).not.toHaveBeenCalled() // 메일 재발송 안 함
      expect(markSent).not.toHaveBeenCalled()
      expect(resolveAndPersist).toHaveBeenCalledOnce()
      expect(saveSettings).toHaveBeenCalledWith({ last_analysis_date: '2026-06-05', last_analysis: { summary: '재시도 요약', generated_at: '2026-06-05T00:00:00.000Z' } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('오늘 이미 발송·분석 완료면 아무것도 안 함(already-sent)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T00:00:00Z'))
    try {
      getSettings.mockResolvedValueOnce({ recipients: ['a@x.com'], send_hour: 9, enabled: true, last_sent_date: '2026-06-05', last_analysis_date: '2026-06-05' })
      const res = await request(app).get('/api/grafana/tick').set('Authorization', 'Bearer cron-secret')
      expect(res.body).toEqual({ sent: false, analyzed: false, reason: 'already-sent' })
      expect(gatherReportData).not.toHaveBeenCalled()
      expect(sendReportEmail).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

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
  it('log 정상 → 설정 lag 적용해 queryElasticsearch 호출, count 반환', async () => {
    getSettings.mockResolvedValueOnce({ log_lag_hours: 2 })
    queryElasticsearch.mockResolvedValueOnce({ _test: { count: 3, rows: [] } })
    const res = await request(app).post('/api/grafana/test-query').set('x-app-password', 'test-pw').send({ type: 'log', query: 'error' })
    expect(res.body).toEqual({ ok: true, count: 3 })
    expect(queryElasticsearch).toHaveBeenCalledWith([{ label: '_test', query: 'error' }], LOG_HOURS, LOG_FETCH, 2)
  })
  it('log: 설정 조회 실패 시 기본 오프셋으로 호출', async () => {
    getSettings.mockRejectedValueOnce(new Error('db down'))
    queryElasticsearch.mockResolvedValueOnce({ _test: { count: 0, rows: [] } })
    await request(app).post('/api/grafana/test-query').set('x-app-password', 'test-pw').send({ type: 'log', query: 'error' })
    expect(queryElasticsearch).toHaveBeenCalledWith([{ label: '_test', query: 'error' }], LOG_HOURS, LOG_FETCH, LOG_INDEX_LAG_HOURS)
  })
})
