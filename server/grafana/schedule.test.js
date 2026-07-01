import { describe, it, expect } from 'vitest'
import { kstHour, kstDateString, shouldSend, shouldAnalyze } from './schedule.js'

describe('kstHour', () => {
  it('UTC 00:00 → KST 9시', () => {
    expect(kstHour(new Date('2026-06-05T00:00:00Z'))).toBe(9)
  })
  it('UTC 15:30 → KST 0시(다음날)', () => {
    expect(kstHour(new Date('2026-06-05T15:30:00Z'))).toBe(0)
  })
})

describe('kstDateString', () => {
  it('UTC 23:00 → KST 다음날 날짜', () => {
    expect(kstDateString(new Date('2026-06-05T23:00:00Z'))).toBe('2026-06-06')
  })
  it('UTC 00:00 → 같은 날 KST 09시', () => {
    expect(kstDateString(new Date('2026-06-05T00:00:00Z'))).toBe('2026-06-05')
  })
})

describe('shouldSend', () => {
  const now = new Date('2026-06-05T00:00:00Z') // KST 9시, 날짜 2026-06-05
  it('enabled=false면 disabled', () => {
    expect(shouldSend({ enabled: false, send_hour: 9, last_sent_date: null }, now))
      .toEqual({ send: false, reason: 'disabled' })
  })
  it('시각 불일치면 not-time', () => {
    expect(shouldSend({ enabled: true, send_hour: 10, last_sent_date: null }, now))
      .toEqual({ send: false, reason: 'not-time' })
  })
  it('오늘 이미 보냈으면 already-sent', () => {
    expect(shouldSend({ enabled: true, send_hour: 9, last_sent_date: '2026-06-05' }, now))
      .toEqual({ send: false, reason: 'already-sent' })
  })
  it('조건 충족 시 ok', () => {
    expect(shouldSend({ enabled: true, send_hour: 9, last_sent_date: '2026-06-04' }, now))
      .toEqual({ send: true, reason: 'ok' })
  })
})

describe('shouldAnalyze', () => {
  const now = new Date('2026-06-05T00:00:00Z') // KST 9시, 날짜 2026-06-05
  it('enabled=false면 disabled', () => {
    expect(shouldAnalyze({ enabled: false, send_hour: 7, last_analysis_date: null }, now))
      .toEqual({ run: false, reason: 'disabled' })
  })
  it('send_hour 이전이면 before-hour', () => {
    expect(shouldAnalyze({ enabled: true, send_hour: 10, last_analysis_date: null }, now))
      .toEqual({ run: false, reason: 'before-hour' })
  })
  it('오늘 이미 분석했으면 already-analyzed', () => {
    expect(shouldAnalyze({ enabled: true, send_hour: 7, last_analysis_date: '2026-06-05' }, now))
      .toEqual({ run: false, reason: 'already-analyzed' })
  })
  it('send_hour 이후라도 오늘 분석 전이면 ok(재시도 허용)', () => {
    // 발송 시각(7시)에 실패 → 이후 시각(9시) tick에서 재시도
    expect(shouldAnalyze({ enabled: true, send_hour: 7, last_analysis_date: '2026-06-04' }, now))
      .toEqual({ run: true, reason: 'ok' })
  })
  it('정각(send_hour)에도 오늘 분석 전이면 ok', () => {
    expect(shouldAnalyze({ enabled: true, send_hour: 9, last_analysis_date: null }, now))
      .toEqual({ run: true, reason: 'ok' })
  })
})
