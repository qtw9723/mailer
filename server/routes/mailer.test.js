// server/routes/mailer.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// DB 모킹
vi.mock('../db.js', () => ({
  default: {
    query: vi.fn(),
  },
}))

import db from '../db.js'

// 라우터만 테스트 — smtp는 모킹
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
    db.query.mockResolvedValueOnce({ rows: [{ id: '1', name: 'test' }] })
    const res = await request(app).get('/api/mailer/jobs').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: '1', name: 'test' }])
  })
})

describe('POST /api/mailer/jobs', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).post('/api/mailer/jobs').send({ name: 'test' })
    expect(res.status).toBe(401)
  })

  it('작업 생성 후 201 반환', async () => {
    const job = { id: '1', name: 'test', recipients: [], interval_minutes: 60 }
    db.query.mockResolvedValueOnce({ rows: [job] })
    const res = await request(app).post('/api/mailer/jobs').set(AUTH).send(job)
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('test')
  })
})

describe('DELETE /api/mailer/jobs/:id', () => {
  it('첨부파일 없는 작업 삭제', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: '1', attachments: [] }] }) // getJob
      .mockResolvedValueOnce({ rows: [] })                               // deleteJob
    const res = await request(app).delete('/api/mailer/jobs/1').set(AUTH)
    expect(res.status).toBe(200)
  })
})
