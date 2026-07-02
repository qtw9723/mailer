import { describe, it, expect, vi } from 'vitest'
import { activeLogGroups, buildAnalyzePrompt, parseAnalysis, analyzeLogs, isRetryableError, withRetry } from './analyze.js'

const noSleep = () => Promise.resolve()

describe('activeLogGroups', () => {
  it('에러·빈 그룹 제외, 로그 있는 것만', () => {
    const logs = [
      { app: 'a', count: 3, rows: [{ time: 't', msg: 'm' }], error: null },
      { app: 'b', count: 0, rows: [], error: null },
      { app: 'c', count: 5, rows: [], error: '조회 실패' },
    ]
    expect(activeLogGroups(logs).map((g) => g.app)).toEqual(['a'])
  })
})

describe('buildAnalyzePrompt', () => {
  it('기존 유형과 로그를 포함', () => {
    const p = buildAnalyzePrompt(
      [{ app: 'soe', count: 2, rows: [{ time: '09:00', msg: 'timeout' }] }],
      [{ label: '타임아웃', description: '소켓 타임아웃' }],
    )
    expect(p).toContain('타임아웃')
    expect(p).toContain('soe')
    expect(p).toContain('timeout')
  })
  it('기존 유형 없으면 안내 문구', () => {
    expect(buildAnalyzePrompt([{ app: 'x', count: 1, rows: [] }], [])).toContain('(아직 없음)')
  })
})

describe('parseAnalysis', () => {
  it('정상 JSON 정규화', () => {
    const text = JSON.stringify({
      summary: '- 점검1',
      types: [{ label: '타임아웃', description: 'd', app: 'soe', count: 4, existingMatch: '', rows: [0, 2, 5] }],
    })
    const r = parseAnalysis(text)
    expect(r.summary).toBe('- 점검1')
    expect(r.types).toHaveLength(1)
    expect(r.types[0]).toMatchObject({ label: '타임아웃', app: 'soe', count: 4, rows: [0, 2, 5] })
  })
  it('깨진 JSON은 빈 결과', () => {
    expect(parseAnalysis('not json')).toEqual({ summary: '', types: [] })
  })
  it('label 없는 유형은 제거, count 없으면 rows 길이로', () => {
    const text = JSON.stringify({ summary: '', types: [{ label: '', app: 'a' }, { label: 'x', app: 'a', rows: [1, 2] }] })
    const r = parseAnalysis(text)
    expect(r.types).toHaveLength(1)
    expect(r.types[0].count).toBe(2)
  })
  it('rows는 정수만·음수/중복 제거, 같은 메시지 여러 번이면 번호 모두 보존', () => {
    const text = JSON.stringify({ summary: '', types: [{ label: 'x', app: 'a', count: 3, rows: [0, 0, 1, -1, 2.9, 'x', 3] }] })
    expect(parseAnalysis(text).types[0].rows).toEqual([0, 1, 2, 3])
  })
  it('aiNote 정규화: 문자열 trim, 없으면 빈 문자열', () => {
    const r = parseAnalysis(JSON.stringify({
      summary: 's',
      types: [
        { label: 'A', app: 'x', count: 1, aiNote: '  평시 5건 수준  ' },
        { label: 'B', app: 'x', count: 1 },
      ],
    }))
    expect(r.types[0].aiNote).toBe('평시 5건 수준')
    expect(r.types[1].aiNote).toBe('')
  })
})

describe('isRetryableError', () => {
  it('Gemini 503(과부하)은 재시도 대상', () => {
    expect(isRetryableError(new Error('[503 Service Unavailable] This model is currently experiencing high demand.'))).toBe(true)
  })
  it('429 rate limit / overloaded 도 재시도 대상', () => {
    expect(isRetryableError(new Error('[429] rate limit exceeded'))).toBe(true)
    expect(isRetryableError(new Error('model is overloaded'))).toBe(true)
  })
  it('네트워크 계열(fetch failed/timeout)도 재시도 대상', () => {
    expect(isRetryableError(new Error('fetch failed'))).toBe(true)
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true)
  })
  it('설정 오류(GEMINI_API_KEY)는 재시도 안 함', () => {
    expect(isRetryableError(new Error('GEMINI_API_KEY 미설정'))).toBe(false)
  })
  it('일반 오류는 재시도 안 함', () => {
    expect(isRetryableError(new Error('boom'))).toBe(false)
  })
})

describe('withRetry', () => {
  it('일시 오류 후 성공하면 최종 성공값 반환', async () => {
    let n = 0
    const fn = () => { n++; if (n < 3) throw new Error('[503] high demand'); return 'ok' }
    const r = await withRetry(fn, { sleep: noSleep })
    expect(r).toBe('ok')
    expect(n).toBe(3)
  })
  it('재시도 불가 오류는 즉시 throw(한 번만 호출)', async () => {
    let n = 0
    const fn = () => { n++; throw new Error('boom') }
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow('boom')
    expect(n).toBe(1)
  })
  it('재시도 소진 시 마지막 오류 throw', async () => {
    let n = 0
    const fn = () => { n++; throw new Error('[503] high demand') }
    await expect(withRetry(fn, { retries: 2, sleep: noSleep })).rejects.toThrow('503')
    expect(n).toBe(3) // 최초 1 + 재시도 2
  })
})

describe('analyzeLogs', () => {
  it('분석 대상 없으면 LLM 호출 없이 빈 결과', async () => {
    const model = { generateContent: vi.fn() }
    const r = await analyzeLogs([{ app: 'a', count: 0, rows: [], error: null }], [], model)
    expect(r).toEqual({ summary: '', types: [] })
    expect(model.generateContent).not.toHaveBeenCalled()
  })
  it('주입 model로 호출 후 파싱', async () => {
    const model = {
      generateContent: vi.fn().mockResolvedValue({
        response: { text: () => JSON.stringify({ summary: 's', types: [{ label: 'L', app: 'soe', count: 1, logs: [] }] }) },
      }),
    }
    const r = await analyzeLogs([{ app: 'soe', count: 1, rows: [{ time: 't', msg: 'm' }], error: null }], [], model)
    expect(model.generateContent).toHaveBeenCalledOnce()
    expect(r.summary).toBe('s')
    expect(r.types[0].label).toBe('L')
  })
  it('Gemini 503 일시 실패는 재시도 후 성공', async () => {
    const generateContent = vi.fn()
      .mockRejectedValueOnce(new Error('[503 Service Unavailable] high demand'))
      .mockResolvedValueOnce({ response: { text: () => JSON.stringify({ summary: 's', types: [] }) } })
    const r = await analyzeLogs(
      [{ app: 'soe', count: 1, rows: [{ time: 't', msg: 'm' }], error: null }],
      [], { generateContent }, { retry: { sleep: noSleep } },
    )
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(r.summary).toBe('s')
  })
})
