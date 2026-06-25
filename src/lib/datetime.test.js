import { describe, it, expect } from 'vitest'
import { fmtKst, nextSendAt, formatNextSend, kstDateKey } from './datetime.js'

describe('fmtKst', () => {
  it('UTC 00:00 → KST 09:00', () => {
    expect(fmtKst('2026-06-05T00:00:00.000Z')).toBe('2026-06-05 09:00')
  })
  it('자정 경계: UTC 23:30 → KST 다음날 08:30', () => {
    expect(fmtKst('2026-06-05T23:30:00Z')).toBe('2026-06-06 08:30')
  })
  it('빈 값/널은 빈 문자열', () => {
    expect(fmtKst('')).toBe('')
    expect(fmtKst(null)).toBe('')
    expect(fmtKst(undefined)).toBe('')
  })
})

describe('kstDateKey', () => {
  it('UTC 시각 → KST 날짜 키', () => {
    expect(kstDateKey('2026-06-05T00:00:00Z')).toBe('2026-06-05')
  })
  it('자정 경계: UTC 23:30 → KST 다음날 날짜', () => {
    expect(kstDateKey('2026-06-05T23:30:00Z')).toBe('2026-06-06')
  })
  it('빈 값은 빈 문자열', () => {
    expect(kstDateKey('')).toBe('')
  })
})

describe('nextSendAt', () => {
  it('미발송 작업은 null (곧 발송 의미)', () => {
    expect(nextSendAt(null, 60)).toBeNull()
  })
  it('마지막 발송 + 간격으로 다음 발송 시각 계산', () => {
    const next = nextSendAt('2026-06-10T00:00:00.000Z', 120)
    expect(next.toISOString()).toBe('2026-06-10T02:00:00.000Z')
  })
})

describe('formatNextSend', () => {
  const now = new Date('2026-06-10T03:00:00.000Z') // KST 12:00
  it('null이면 곧 발송', () => {
    expect(formatNextSend(null, now)).toBe('곧 발송')
  })
  it('과거 시각이면 곧 발송', () => {
    expect(formatNextSend(new Date('2026-06-10T02:59:00.000Z'), now)).toBe('곧 발송')
  })
  it('1시간 이내는 N분 후', () => {
    expect(formatNextSend(new Date('2026-06-10T03:37:00.000Z'), now)).toBe('37분 후')
  })
  it('당일+1시간 이후는 절대시각·상대 병기', () => {
    const s = formatNextSend(new Date('2026-06-12T00:00:00.000Z'), now) // KST 6/12 09:00
    expect(s).toBe('6월 12일 (금) 09:00 · 2일 후')
  })
  it('24시간 이내는 시간 단위 상대표기', () => {
    const s = formatNextSend(new Date('2026-06-10T08:00:00.000Z'), now) // KST 17:00
    expect(s).toBe('6월 10일 (수) 17:00 · 5시간 후')
  })
})
