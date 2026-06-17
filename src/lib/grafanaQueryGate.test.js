import { describe, it, expect } from 'vitest'
import { rowIsGood, canSave } from './grafanaQueryGate.js'

describe('rowIsGood', () => {
  it('저장값과 동일(미변경) → good', () => {
    expect(rowIsGood({ label: 'CPU', query: 'up', _savedQuery: 'up', _test: 'untested' })).toBe(true)
  })
  it('신규(저장값 없음) + 미테스트 → not good', () => {
    expect(rowIsGood({ label: 'CPU', query: 'up', _test: 'untested' })).toBe(false)
  })
  it('신규 + 현재 query로 통과 → good', () => {
    expect(rowIsGood({ label: 'CPU', query: 'up', _test: 'passed', _testedQuery: 'up' })).toBe(true)
  })
  it('통과 후 query 수정 → not good (재테스트 필요)', () => {
    expect(rowIsGood({ label: 'CPU', query: 'up2', _test: 'passed', _testedQuery: 'up' })).toBe(false)
  })
  it('label/query 빈 행 → not good', () => {
    expect(rowIsGood({ label: '', query: 'up', _savedQuery: 'up' })).toBe(false)
    expect(rowIsGood({ label: 'x', query: '  ', _savedQuery: '  ' })).toBe(false)
  })
})

describe('canSave', () => {
  it('모든 행 good이면 true', () => {
    const m = [{ label: 'CPU', query: 'up', _savedQuery: 'up' }]
    const l = [{ label: 'soe', query: 'error', _test: 'passed', _testedQuery: 'error' }]
    expect(canSave(m, l)).toBe(true)
  })
  it('하나라도 not good이면 false', () => {
    const m = [{ label: 'CPU', query: 'up', _test: 'untested' }]
    expect(canSave(m, [])).toBe(false)
  })
  it('빈 리스트들은 true', () => {
    expect(canSave([], [])).toBe(true)
  })
})
