import { describe, it, expect } from 'vitest'
import { judgeStep, buildFailureMail, normalizeStep, buildAttrSelector } from './judge.mjs'

describe('normalizeStep', () => {
  it('type 없는 기존 스텝은 say로 간주 (하위 호환)', () => {
    expect(normalizeStep({ say: '안녕', expect: '도와' }))
      .toEqual({ type: 'say', text: '안녕', expect: '도와', selector: null })
  })
  it('say 타입', () => {
    expect(normalizeStep({ type: 'say', say: '예약', expect: '날짜' }))
      .toEqual({ type: 'say', text: '예약', expect: '날짜', selector: null })
  })
  it('click 타입은 click 필드를 text로', () => {
    expect(normalizeStep({ type: 'click', click: '예약하기', expect: '날짜를 선택' }))
      .toEqual({ type: 'click', text: '예약하기', expect: '날짜를 선택', selector: null })
  })
  it('스텝별 selector는 그대로 전달, 없으면 null', () => {
    expect(normalizeStep({ type: 'click', click: '예약', expect: '날짜', selector: '#btn-book' }).selector).toBe('#btn-book')
    expect(normalizeStep({ say: '안녕', expect: '도와' }).selector).toBeNull()
  })
})

describe('buildAttrSelector', () => {
  it('일반 속성명+값 → CSS 속성 셀렉터', () => {
    expect(buildAttrSelector('data-action', 'guest-guide')).toBe('[data-action="guest-guide"]')
  })
  it('값의 큰따옴표·백슬래시를 이스케이프', () => {
    expect(buildAttrSelector('title', 'a"b\\c')).toBe('[title="a\\"b\\\\c"]')
  })
  it('이름·값 앞뒤 공백은 트림', () => {
    expect(buildAttrSelector(' id ', ' x ')).toBe('[id="x"]')
  })
})

describe('normalizeStep + attr', () => {
  it('attr 있으면 selector를 컴파일된 CSS로 세팅', () => {
    const r = normalizeStep({ type: 'click', click: '', expect: '완료', attr: { name: 'data-action', value: 'guest-guide' } })
    expect(r.selector).toBe('[data-action="guest-guide"]')
  })
  it('attr가 selector보다 우선', () => {
    const r = normalizeStep({ type: 'click', expect: 'x', selector: '#old', attr: { name: 'id', value: 'new' } })
    expect(r.selector).toBe('[id="new"]')
  })
  it('attr.name 비면 무시하고 기존 selector 유지', () => {
    expect(normalizeStep({ type: 'click', expect: 'x', selector: '#btn', attr: { name: '  ', value: 'y' } }).selector).toBe('#btn')
  })
})

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
