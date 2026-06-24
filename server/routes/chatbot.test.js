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

  it('category 정규화: 공백/빈값은 null로 insert', async () => {
    const q = mockQuery({ data: { id: 'b1' }, error: null })
    mockFrom.mockReturnValueOnce(q)
    await request(app).post('/api/chatbot/bots').set(AUTH)
      .send({ name: 'x', url: 'https://x.y', scenario: [], category: '  ' })
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ category: null }))
  })

  it('category 트림 후 저장', async () => {
    const q = mockQuery({ data: { id: 'b1' }, error: null })
    mockFrom.mockReturnValueOnce(q)
    await request(app).post('/api/chatbot/bots').set(AUTH)
      .send({ name: 'x', url: 'https://x.y', scenario: [], category: ' 예약 ' })
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ category: '예약' }))
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

  it('category 수정 허용', async () => {
    const q = mockQuery({ data: [{ id: 'b1', category: '결제' }], error: null })
    mockFrom.mockReturnValueOnce(q)
    const res = await request(app).patch('/api/chatbot/bots/b1').set(AUTH).send({ category: '결제' })
    expect(res.status).toBe(200)
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ category: '결제' }))
  })
})

describe('DELETE /api/chatbot/bots/:id', () => {
  it('삭제 성공', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: null, error: null }))
    expect((await request(app).delete('/api/chatbot/bots/b1').set(AUTH)).status).toBe(200)
  })
})

describe('POST /api/chatbot/run-check', () => {
  it('인증 없으면 401', async () => {
    expect((await request(app).post('/api/chatbot/run-check').send({})).status).toBe(401)
  })

  it('GITHUB_TOKEN 미설정이면 503 + 안내', async () => {
    delete process.env.GITHUB_TOKEN
    const res = await request(app).post('/api/chatbot/run-check').set(AUTH).send({})
    expect(res.status).toBe(503)
    expect(res.body.error).toContain('GITHUB_TOKEN')
  })

  it('전체 실행: dispatch API 호출 후 202', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, status: 204 })
    const res = await request(app).post('/api/chatbot/run-check').set(AUTH).send({})
    expect(res.status).toBe(202)
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toContain('/actions/workflows/chatbot-check.yml/dispatches')
    expect(JSON.parse(opts.body)).toEqual({ ref: 'main', inputs: {} })
    fetchSpy.mockRestore()
  })

  it('개별 실행: bot_id를 inputs로 전달', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, status: 204 })
    const res = await request(app).post('/api/chatbot/run-check').set(AUTH).send({ bot_id: 'b1' })
    expect(res.status).toBe(202)
    const [, opts] = fetchSpy.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ ref: 'main', inputs: { bot_id: 'b1' } })
    fetchSpy.mockRestore()
  })

  it('카테고리 실행: category를 inputs로 전달', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, status: 204 })
    const res = await request(app).post('/api/chatbot/run-check').set(AUTH).send({ category: '예약' })
    expect(res.status).toBe(202)
    const [, opts] = fetchSpy.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ ref: 'main', inputs: { category: '예약' } })
    fetchSpy.mockRestore()
  })

  it('bot_id가 category보다 우선', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, status: 204 })
    await request(app).post('/api/chatbot/run-check').set(AUTH).send({ bot_id: 'b1', category: '예약' })
    const [, opts] = fetchSpy.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ ref: 'main', inputs: { bot_id: 'b1' } })
    fetchSpy.mockRestore()
  })

  it('GitHub API 실패 시 502', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Bad credentials' })
    const res = await request(app).post('/api/chatbot/run-check').set(AUTH).send({})
    expect(res.status).toBe(502)
    fetchSpy.mockRestore()
  })
})

describe('GET /api/chatbot/dispatch (pg_cron 정시 트리거)', () => {
  const CRON = { authorization: 'Bearer cron-secret' }

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
    process.env.GITHUB_TOKEN = 'ghp_test'
  })

  it('CRON_SECRET 불일치면 401', async () => {
    const res = await request(app).get('/api/chatbot/dispatch').set({ authorization: 'Bearer wrong' })
    expect(res.status).toBe(401)
  })

  it('CRON_SECRET 미설정이면 401 (헤더만으로 통과 불가)', async () => {
    delete process.env.CRON_SECRET
    const res = await request(app).get('/api/chatbot/dispatch').set(CRON)
    expect(res.status).toBe(401)
  })

  it('GITHUB_TOKEN 미설정이면 503', async () => {
    delete process.env.GITHUB_TOKEN
    const res = await request(app).get('/api/chatbot/dispatch').set(CRON)
    expect(res.status).toBe(503)
  })

  it('전체 봇 체크 디스패치: inputs 없이 202', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, status: 204 })
    const res = await request(app).get('/api/chatbot/dispatch').set(CRON)
    expect(res.status).toBe(202)
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toContain('/actions/workflows/chatbot-check.yml/dispatches')
    expect(JSON.parse(opts.body)).toEqual({ ref: 'main', inputs: {} })
    fetchSpy.mockRestore()
  })

  it('GitHub API 실패 시 502', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Bad credentials' })
    const res = await request(app).get('/api/chatbot/dispatch').set(CRON)
    expect(res.status).toBe(502)
    fetchSpy.mockRestore()
  })
})

describe('PATCH /api/chatbot/categories (이름 변경)', () => {
  it('from/to 누락이면 400', async () => {
    expect((await request(app).patch('/api/chatbot/categories').set(AUTH).send({ from: '예약' })).status).toBe(400)
    expect((await request(app).patch('/api/chatbot/categories').set(AUTH).send({ to: '  ' })).status).toBe(400)
  })

  it('봇 일괄 변경 + 관리 목록 이름 변경', async () => {
    const botsQ = mockQuery({ error: null })
    const getQ = mockQuery({ data: { categories: ['예약', '결제'] }, error: null })
    const updQ = mockQuery({ data: { id: 1, categories: ['상담', '결제'] }, error: null })
    mockFrom.mockReturnValueOnce(botsQ).mockReturnValueOnce(getQ).mockReturnValueOnce(updQ)
    const res = await request(app).patch('/api/chatbot/categories').set(AUTH).send({ from: '예약', to: ' 상담 ' })
    expect(res.status).toBe(200)
    expect(botsQ.update).toHaveBeenCalledWith({ category: '상담' })
    expect(botsQ.eq).toHaveBeenCalledWith('category', '예약')
    expect(updQ.update).toHaveBeenCalledWith(expect.objectContaining({ categories: ['상담', '결제'] }))
  })
})

describe('DELETE /api/chatbot/categories (삭제)', () => {
  it('name 누락이면 400', async () => {
    expect((await request(app).delete('/api/chatbot/categories').set(AUTH).send({})).status).toBe(400)
  })

  it('해당 봇은 미분류(null) + 관리 목록에서 제거', async () => {
    const botsQ = mockQuery({ error: null })
    const getQ = mockQuery({ data: { categories: ['예약', '결제'] }, error: null })
    const updQ = mockQuery({ data: { id: 1, categories: ['결제'] }, error: null })
    mockFrom.mockReturnValueOnce(botsQ).mockReturnValueOnce(getQ).mockReturnValueOnce(updQ)
    const res = await request(app).delete('/api/chatbot/categories').set(AUTH).send({ name: '예약' })
    expect(res.status).toBe(200)
    expect(botsQ.update).toHaveBeenCalledWith({ category: null })
    expect(botsQ.eq).toHaveBeenCalledWith('category', '예약')
    expect(updQ.update).toHaveBeenCalledWith(expect.objectContaining({ categories: ['결제'] }))
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

  it('PUT: recipients만 보내면 categories는 건드리지 않음', async () => {
    const q = mockQuery({ data: { id: 1 }, error: null })
    mockFrom.mockReturnValueOnce(q)
    await request(app).put('/api/chatbot/settings').set(AUTH).send({ recipients: ['x@y.z'] })
    const patch = q.update.mock.calls[0][0]
    expect(patch).toHaveProperty('recipients')
    expect(patch).not.toHaveProperty('categories')
  })

  it('PUT: categories 갱신 (트림·중복·빈값 제거, 순서 유지)', async () => {
    const q = mockQuery({ data: { id: 1, categories: ['예약', '결제'] }, error: null })
    mockFrom.mockReturnValueOnce(q)
    const res = await request(app).put('/api/chatbot/settings').set(AUTH)
      .send({ categories: [' 예약 ', '예약', '', '결제'] })
    expect(res.status).toBe(200)
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ categories: ['예약', '결제'] }))
  })
})
