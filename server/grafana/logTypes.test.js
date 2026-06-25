import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('../db.js', () => ({ default: { from: mockFrom } }))

function mockQuery(result) {
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve, reject) => p.then(resolve, reject),
  }
}

const { listTypes, getType, updateType, deleteType, resolveAndPersist } = await import('./logTypes.js')

beforeEach(() => vi.clearAllMocks())

describe('listTypes', () => {
  it('유형 목록 반환', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: [{ id: 't1', label: 'A' }], error: null }))
    expect(await listTypes()).toEqual([{ id: 't1', label: 'A' }])
  })
})

describe('getType', () => {
  it('없으면 null', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: null, error: null }))
    expect(await getType('x')).toBeNull()
  })
  it('유형 + runs + entries 병합', async () => {
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: { id: 't1', label: 'A' }, error: null }))
      .mockReturnValueOnce(mockQuery({ data: [{ id: 1, count: 3 }], error: null }))
      .mockReturnValueOnce(mockQuery({ data: [{ id: 9, occurred_at: '2026-06-24T05:00:00Z', msg: 'm' }], error: null }))
    const r = await getType('t1')
    expect(r.label).toBe('A')
    expect(r.runs).toEqual([{ id: 1, count: 3 }])
    expect(r.entries).toEqual([{ id: 9, occurred_at: '2026-06-24T05:00:00Z', msg: 'm' }])
  })
})

describe('updateType', () => {
  it('note 갱신', async () => {
    const q = mockQuery({ data: [{ id: 't1', note: 'hi' }], error: null })
    mockFrom.mockReturnValueOnce(q)
    const r = await updateType('t1', { note: 'hi', bogus: 'x' })
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ note: 'hi' }))
    expect(q.update.mock.calls[0][0]).not.toHaveProperty('bogus')
    expect(r.note).toBe('hi')
  })
  it('없으면 null', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: [], error: null }))
    expect(await updateType('x', { note: 'a' })).toBeNull()
  })
})

describe('deleteType', () => {
  it('삭제', async () => {
    const q = mockQuery({ error: null })
    mockFrom.mockReturnValueOnce(q)
    await deleteType('t1')
    expect(q.delete).toHaveBeenCalled()
    expect(q.eq).toHaveBeenCalledWith('id', 't1')
  })
})

describe('resolveAndPersist', () => {
  it('기존 유형 매칭 시 신규 생성 없이 회차 적재 + 누적 갱신', async () => {
    const listQ = mockQuery({ data: [{ id: 't1', label: '타임아웃', total_count: 10 }], error: null })
    const runInsQ = mockQuery({ data: { id: 1 }, error: null })
    const updQ = mockQuery({ error: null })
    mockFrom.mockReturnValueOnce(listQ).mockReturnValueOnce(runInsQ).mockReturnValueOnce(updQ)
    await resolveAndPersist({ types: [{ label: '타임아웃', app: 'soe', count: 5, rows: [], existingMatch: '타임아웃' }] }, '2026-06-24T00:00:00Z')
    expect(runInsQ.insert).toHaveBeenCalledWith(expect.objectContaining({ type_id: 't1', app: 'soe', count: 5 }))
    expect(updQ.update).toHaveBeenCalledWith(expect.objectContaining({ total_count: 15 }))
  })
  it('신규 유형이면 생성 후 적재', async () => {
    const listQ = mockQuery({ data: [], error: null })
    const insTypeQ = mockQuery({ data: { id: 'new1', label: '신규', total_count: 0 }, error: null })
    const runInsQ = mockQuery({ data: { id: 2 }, error: null })
    const updQ = mockQuery({ error: null })
    mockFrom.mockReturnValueOnce(listQ).mockReturnValueOnce(insTypeQ).mockReturnValueOnce(runInsQ).mockReturnValueOnce(updQ)
    await resolveAndPersist({ types: [{ label: '신규', app: 'c3', count: 2, rows: [] }] }, '2026-06-24T00:00:00Z')
    expect(insTypeQ.insert).toHaveBeenCalledWith(expect.objectContaining({ label: '신규' }))
    expect(runInsQ.insert).toHaveBeenCalledWith(expect.objectContaining({ type_id: 'new1', count: 2 }))
    expect(updQ.update).toHaveBeenCalledWith(expect.objectContaining({ total_count: 2 }))
  })
  it('rows[] 인덱스를 ES 원본 행으로 되살려 entries 적재(범위 밖 무시, ts→occurred_at)', async () => {
    const listQ = mockQuery({ data: [{ id: 't1', label: 'A', total_count: 0 }], error: null })
    const runInsQ = mockQuery({ data: { id: 7 }, error: null })
    const entInsQ = mockQuery({ error: null })
    const updQ = mockQuery({ error: null })
    mockFrom.mockReturnValueOnce(listQ).mockReturnValueOnce(runInsQ).mockReturnValueOnce(entInsQ).mockReturnValueOnce(updQ)
    const logs = [{ app: 'soe', count: 3, error: null, rows: [
      { ts: 'T0', time: 't0', msg: 'm0' }, { ts: 'T1', time: 't1', msg: 'm1' }, { ts: 'T2', time: 't2', msg: 'm2' },
    ] }]
    await resolveAndPersist({ types: [{ label: 'A', app: 'soe', count: 3, rows: [0, 2, 99], existingMatch: 'A' }] }, '2026-06-24T00:00:00Z', logs)
    expect(entInsQ.insert).toHaveBeenCalledWith([
      { type_id: 't1', run_id: 7, app: 'soe', occurred_at: 'T0', msg: 'm0' },
      { type_id: 't1', run_id: 7, app: 'soe', occurred_at: 'T2', msg: 'm2' },
    ])
  })
  it('types 비면 아무 것도 안 함(list만 조회)', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: [], error: null }))
    await resolveAndPersist({ types: [] }, '2026-06-24T00:00:00Z')
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })
})
