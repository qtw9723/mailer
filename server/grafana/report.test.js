// server/grafana/report.test.js
import { describe, it, expect } from 'vitest'
import {
  extractPromValue, normalizeEsIndex, fmtTimeKst, parseEsResponses, buildReport, buildEmailHtml,
} from './report.js'

describe('extractPromValue', () => {
  it('frames의 마지막 값 추출', () => {
    const resp = { results: { A: { frames: [{ data: { values: [[1700000000000], [13.7]] } }] } } }
    expect(extractPromValue(resp)).toBe(13.7)
  })
  it('frames 없으면 null', () => {
    expect(extractPromValue({ results: { A: { frames: [] } } })).toBeNull()
    expect(extractPromValue({})).toBeNull()
  })
})

describe('normalizeEsIndex', () => {
  it('[prefix]날짜 템플릿 → prefix*', () => {
    expect(normalizeEsIndex('[out_logs-]YYYY.MM.DD')).toBe('out_logs-*')
  })
  it('일반 문자열은 그대로', () => {
    expect(normalizeEsIndex('logs-*')).toBe('logs-*')
  })
})

describe('fmtTimeKst', () => {
  it('UTC ISO → KST(+9) YYYY-MM-DD HH:MM', () => {
    expect(fmtTimeKst('2026-06-03T07:37:49.123Z')).toBe('2026-06-03 16:37')
  })
  it('빈 값은 빈 문자열', () => {
    expect(fmtTimeKst('')).toBe('')
  })
})

describe('parseEsResponses', () => {
  it('앱별 count와 rows 파싱', () => {
    const responses = [
      { hits: { total: { value: 2 }, hits: [
        { _source: { '@timestamp': '2026-06-03T07:37:49Z', message: 'boom' } },
      ] } },
      { hits: { total: { value: 0 }, hits: [] } },
    ]
    const queries = [{ label: 'soe' }, { label: 'c3' }]
    const out = parseEsResponses(responses, queries, '@timestamp')
    expect(out.soe.count).toBe(2)
    expect(out.soe.rows[0]).toEqual({ time: '2026-06-03 16:37', msg: 'boom' })
    expect(out.c3.count).toBe(0)
  })
  it('message 없으면 log→msg 순으로 폴백', () => {
    const responses = [{ hits: { total: { value: 1 }, hits: [{ _source: { '@timestamp': '', log: 'fromlog' } }] } }]
    const out = parseEsResponses(responses, [{ label: 'x' }], '@timestamp')
    expect(out.x.rows[0].msg).toBe('fromlog')
  })
})

describe('buildReport', () => {
  const base = {
    generatedAt: '2026-06-05T00:00:00.000Z',
    metrics: [
      { label: 'CPU', value: 13.7, threshold: 80, error: null },
      { label: 'MEM', value: 90, threshold: 85, error: null },
      { label: 'DISK', value: null, threshold: 85, error: '데이터 없음' },
    ],
    logs: [
      { app: 'soe', count: 1, rows: [], error: null },
      { app: 'c3', count: 0, rows: [], error: null },
    ],
  }
  it('임계 초과 메트릭 + 로그 1건 이상을 alerts로 합산', () => {
    const r = buildReport(base)
    expect(r.summary.alerts).toBe(2) // MEM 초과 + soe 1건
    expect(r.summary.status).toBe('alert')
  })
  it('over 플래그 계산', () => {
    const r = buildReport(base)
    expect(r.metrics.find(m => m.label === 'CPU').over).toBe(false)
    expect(r.metrics.find(m => m.label === 'MEM').over).toBe(true)
    expect(r.metrics.find(m => m.label === 'DISK').over).toBe(false)
  })
  it('이상 0건이면 status ok', () => {
    const r = buildReport({ generatedAt: 'x', metrics: [{ label: 'CPU', value: 1, threshold: 80, error: null }], logs: [] })
    expect(r.summary).toEqual({ alerts: 0, status: 'ok' })
  })
})

describe('buildEmailHtml', () => {
  it('요약과 앱 라벨이 포함된 HTML 반환', () => {
    const report = buildReport({
      generatedAt: '2026-06-05T00:00:00.000Z',
      metrics: [{ label: 'CPU', value: 13.7, threshold: 80, error: null }],
      logs: [{ app: 'soe', count: 1, rows: [{ time: '2026-06-03 16:37', msg: 'boom' }], error: null }],
    })
    const html = buildEmailHtml(report)
    expect(html).toContain('<html')
    expect(html).toContain('이상 1건')
    expect(html).toContain('soe')
    expect(html).toContain('boom')
  })
})
