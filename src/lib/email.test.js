import { describe, it, expect } from 'vitest'
import { isValidEmail, parseEmails } from './email.js'

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last+tag@sub.domain.io'])('유효: %s', (e) => {
    expect(isValidEmail(e)).toBe(true)
  })
  it.each(['abc', 'a@', '@b.c', 'a b@c.d', 'a@b'])('무효: %s', (e) => {
    expect(isValidEmail(e)).toBe(false)
  })
})

describe('parseEmails', () => {
  it('쉼표·세미콜론·공백·줄바꿈 혼합 분리 + 유효/무효 분류', () => {
    expect(parseEmails('a@b.co, c@d.io;e@f.kr\ng@h.com not-an-email')).toEqual({
      valid: ['a@b.co', 'c@d.io', 'e@f.kr', 'g@h.com'],
      invalid: ['not-an-email'],
    })
  })
  it('빈 문자열은 빈 결과', () => {
    expect(parseEmails('')).toEqual({ valid: [], invalid: [] })
  })
})
