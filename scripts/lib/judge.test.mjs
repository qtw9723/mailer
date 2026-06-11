import { describe, it, expect } from 'vitest'
import { judgeStep, buildFailureMail } from './judge.mjs'

describe('judgeStep', () => {
  it('키워드가 페이지 텍스트에 있으면 ok', () => {
    expect(judgeStep('안녕하세요! 무엇을 도와드릴까요?', '도와드릴까요')).toEqual({ ok: true })
  })
  it('키워드가 없으면 사유 + 발췌(끝 300자)', () => {
    const r = judgeStep('x'.repeat(400) + ' 죄송합니다', '도와드릴까요')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('도와드릴까요')
    expect(r.excerpt.length).toBeLessThanOrEqual(300)
    expect(r.excerpt).toContain('죄송합니다')
  })
})

describe('buildFailureMail', () => {
  it('실패 봇 목록으로 제목·본문 생성', () => {
    const { subject, body } = buildFailureMail([
      { name: '코기 상담봇', detail: 'timeout: 키워드 "도와드릴까요" 미노출' },
      { name: 'FAQ봇', detail: 'input_not_found' },
    ], 'https://hub.example.com')
    expect(subject).toBe('🤖 챗봇 체크 실패 2건')
    expect(body).toContain('코기 상담봇')
    expect(body).toContain('input_not_found')
    expect(body).toContain('https://hub.example.com')
  })
})
