import { describe, it, expect, vi } from 'vitest'
import { activeLogGroups, buildAnalyzePrompt, parseAnalysis, analyzeLogs } from './analyze.js'

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
      types: [{ label: '타임아웃', description: 'd', app: 'soe', count: 4, existingMatch: '', logs: [{ time: 't', msg: 'm' }] }],
    })
    const r = parseAnalysis(text)
    expect(r.summary).toBe('- 점검1')
    expect(r.types).toHaveLength(1)
    expect(r.types[0]).toMatchObject({ label: '타임아웃', app: 'soe', count: 4 })
  })
  it('깨진 JSON은 빈 결과', () => {
    expect(parseAnalysis('not json')).toEqual({ summary: '', types: [] })
  })
  it('label 없는 유형은 제거, count 없으면 logs 길이로', () => {
    const text = JSON.stringify({ summary: '', types: [{ label: '', app: 'a' }, { label: 'x', app: 'a', logs: [{ msg: '1' }, { msg: '2' }] }] })
    const r = parseAnalysis(text)
    expect(r.types).toHaveLength(1)
    expect(r.types[0].count).toBe(2)
  })
  it('logs는 최대 5개, msg 없는 행 제거', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ msg: `m${i}` }))
    const text = JSON.stringify({ summary: '', types: [{ label: 'x', app: 'a', count: 8, logs: [...many, { msg: '' }] }] })
    expect(parseAnalysis(text).types[0].logs).toHaveLength(5)
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
})
