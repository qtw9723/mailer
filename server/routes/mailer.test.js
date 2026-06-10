// server/routes/mailer.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Supabase 클라이언트 모킹 — from()이 체이닝 빌더를 반환
const mockFrom = vi.hoisted(() => vi.fn())
const mockStorageFrom = vi.hoisted(() => vi.fn())

vi.mock('../db.js', () => ({
  default: {
    from: mockFrom,
    storage: { from: mockStorageFrom },
  },
}))

// 체이닝 빌더 헬퍼: 결과값을 지정하면 then/single 모두 해당 값으로 resolve
function mockQuery(result) {
  const p = Promise.resolve(result)
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve, reject) => p.then(resolve, reject),
  }
  return chain
}

vi.mock('../smtp.js', () => ({ sendMail: vi.fn() }))

const { default: mailerRouter } = await import('./mailer.js')
const app = express()
app.use(express.json())
app.use('/api/mailer', mailerRouter)

const AUTH = { 'x-app-password': 'test-password' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_PASSWORD = 'test-password'
})

describe('GET /api/mailer/jobs', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).get('/api/mailer/jobs')
    expect(res.status).toBe(401)
  })

  it('인증 성공 시 작업 목록 반환', async () => {
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: [{ id: '1', name: 'test' }], error: null }))  // mail_jobs
      .mockReturnValueOnce(mockQuery({ data: [], error: null }))                            // send_log
    const res = await request(app).get('/api/mailer/jobs').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: '1', name: 'test', recent_sends: [] }])
  })

  it('각 작업에 최근 발송 이력(recent_sends)을 오래된순으로 포함', async () => {
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: [{ id: 'j1', name: 'a' }, { id: 'j2', name: 'b' }], error: null }))
      .mockReturnValueOnce(mockQuery({
        data: [
          { job_id: 'j1', ok: false, sent_at: '2026-06-10T02:00:00Z' },
          { job_id: 'j1', ok: true, sent_at: '2026-06-10T01:00:00Z' },
        ],
        error: null,
      }))
    const res = await request(app).get('/api/mailer/jobs').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body[0].recent_sends).toEqual([
      { ok: true, sent_at: '2026-06-10T01:00:00Z' },
      { ok: false, sent_at: '2026-06-10T02:00:00Z' },
    ])
    expect(res.body[1].recent_sends).toEqual([])
  })

  it('send_log 조회 실패 시에도 jobs는 정상 반환 (best-effort)', async () => {
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: [{ id: 'j1' }], error: null }))
      .mockReturnValueOnce(mockQuery({ data: null, error: { message: 'relation "send_log" does not exist' } }))
    const res = await request(app).get('/api/mailer/jobs').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body[0].recent_sends).toEqual([])
  })
})

describe('POST /api/mailer/tick — send_log 기록', () => {
  // mockImplementation은 clearAllMocks로 지워지지 않으므로 직접 reset
  afterEach(() => { mockFrom.mockReset() })

  const dueJob = {
    id: 'j1', is_active: true, last_sent_at: null, send_count: 0, use_index: false,
    subject: 's', body: 'b', recipients: ['a@b.c'], interval_minutes: 60,
    sender: 'gmail', sender_account_id: null, attachments: [],
  }

  it('발송 성공 시 ok=true 기록', async () => {
    const inserted = []
    mockFrom.mockImplementation((table) => {
      if (table === 'send_log') {
        return { insert: vi.fn((row) => { inserted.push(row); return Promise.resolve({ error: null }) }) }
      }
      return mockQuery({ data: [dueJob], error: null })
    })
    const res = await request(app).post('/api/mailer/tick')
    expect(res.status).toBe(200)
    expect(res.body.failed).toBe(0)
    expect(inserted).toEqual([{ job_id: 'j1', ok: true, error: null }])
  })

  it('발송 실패 시 ok=false + 에러 메시지 기록', async () => {
    const { sendMail } = await import('../smtp.js')
    sendMail.mockRejectedValueOnce(new Error('SMTP down'))
    const inserted = []
    mockFrom.mockImplementation((table) => {
      if (table === 'send_log') {
        return { insert: vi.fn((row) => { inserted.push(row); return Promise.resolve({ error: null }) }) }
      }
      return mockQuery({ data: [dueJob], error: null })
    })
    const res = await request(app).post('/api/mailer/tick')
    expect(res.status).toBe(200)
    expect(res.body.failed).toBe(1)
    expect(inserted).toHaveLength(1)
    expect(inserted[0].ok).toBe(false)
    expect(inserted[0].error).toContain('SMTP down')
  })
})

describe('POST /api/mailer/jobs', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).post('/api/mailer/jobs').send({ name: 'test' })
    expect(res.status).toBe(401)
  })

  it('작업 생성 후 201 반환', async () => {
    const job = { id: '1', name: 'test', recipients: [], interval_minutes: 60 }
    mockFrom.mockReturnValueOnce(mockQuery({ data: job, error: null }))
    const res = await request(app).post('/api/mailer/jobs').set(AUTH).send(job)
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('test')
  })
})

describe('PATCH /api/mailer/jobs/:id', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).patch('/api/mailer/jobs/1').send({ name: 'x' })
    expect(res.status).toBe(401)
  })

  it('허용되지 않은 필드만 있으면 400', async () => {
    const res = await request(app).patch('/api/mailer/jobs/1').set(AUTH).send({ id: 'hacked', send_count: 999 })
    expect(res.status).toBe(400)
  })

  it('유효한 필드로 업데이트 성공', async () => {
    const updated = { id: '1', name: 'updated', is_active: false }
    mockFrom.mockReturnValueOnce(mockQuery({ data: [updated], error: null }))
    const res = await request(app).patch('/api/mailer/jobs/1').set(AUTH).send({ name: 'updated', is_active: false })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('updated')
  })
})

describe('DELETE /api/mailer/jobs/:id', () => {
  it('첨부파일 없는 작업 삭제', async () => {
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: { id: '1', attachments: [] }, error: null }))  // getJob
      .mockReturnValueOnce(mockQuery({ data: null, error: null }))                           // deleteJob
    const res = await request(app).delete('/api/mailer/jobs/1').set(AUTH)
    expect(res.status).toBe(200)
  })
})
