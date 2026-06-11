// server/routes/chatbot.test.js
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
  it('인증 없으면 401', async () => {
    expect((await request(app).post('/api/chatbot/bots').send({})).status).toBe(401)
  })

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
