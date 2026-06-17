// server/grafana/config.test.js
import { describe, it, expect } from 'vitest'
import { activeQueries, withQueryDefaults, DEFAULT_METRICS, DEFAULT_LOG_QUERIES } from './config.js'

describe('activeQueries', () => {
  it('enabled:false 항목 제외, enabled 없으면 포함', () => {
    const items = [{ label: 'a', enabled: true }, { label: 'b', enabled: false }, { label: 'c' }]
    expect(activeQueries(items).map((x) => x.label)).toEqual(['a', 'c'])
  })
  it('null/undefined → 빈 배열', () => {
    expect(activeQueries(null)).toEqual([])
    expect(activeQueries(undefined)).toEqual([])
  })
})

describe('withQueryDefaults', () => {
  it('metrics/log_queries 비어 있으면 기본값으로 채움', () => {
    const out = withQueryDefaults({ id: 1, metrics: [], log_queries: null })
    expect(out.metrics).toBe(DEFAULT_METRICS)
    expect(out.log_queries).toBe(DEFAULT_LOG_QUERIES)
  })
  it('값이 있으면 그대로 둠', () => {
    const m = [{ label: 'x', query: 'q', threshold: 1, enabled: true }]
    const out = withQueryDefaults({ id: 1, metrics: m, log_queries: m })
    expect(out.metrics).toBe(m)
    expect(out.log_queries).toBe(m)
  })
  it('다른 필드 보존', () => {
    const out = withQueryDefaults({ id: 1, send_hour: 9, metrics: [], log_queries: [] })
    expect(out.send_hour).toBe(9)
  })
  it('기본 상수에 enabled:true가 들어있다', () => {
    expect(DEFAULT_METRICS.every((m) => m.enabled === true)).toBe(true)
    expect(DEFAULT_LOG_QUERIES.every((q) => q.enabled === true)).toBe(true)
  })
})
