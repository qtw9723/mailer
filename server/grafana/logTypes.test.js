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
  it('유형 + runs 병합', async () => {
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: { id: 't1', label: 'A' }, error: null }))
      .mockReturnValueOnce(mockQuery({ data: [{ id: 1, count: 3 }], error: null }))
    const r = await getType('t1')
    expect(r.label).toBe('A')
    expect(r.runs).toEqual([{ id: 1, count: 3 }])
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
    const runInsQ = mockQuery({ error: null })
    const updQ = mockQuery({ error: null })
    mockFrom.mockReturnValueOnce(listQ).mockReturnValueOnce(runInsQ).mockReturnValueOnce(updQ)
    await resolveAndPersist({ types: [{ label: '타임아웃', app: 'soe', count: 5, logs: [{ msg: 'm' }], existingMatch: '타임아웃' }] }, '2026-06-24T00:00:00Z')
    expect(runInsQ.insert).toHaveBeenCalledWith(expect.objectContaining({ type_id: 't1', app: 'soe', count: 5 }))
    expect(updQ.update).toHaveBeenCalledWith(expect.objectContaining({ total_count: 15 }))
  })
  it('신규 유형이면 생성 후 적재', async () => {
    const listQ = mockQuery({ data: [], error: null })
    const insTypeQ = mockQuery({ data: { id: 'new1', label: '신규', total_count: 0 }, error: null })
    const runInsQ = mockQuery({ error: null })
    const updQ = mockQuery({ error: null })
    mockFrom.mockReturnValueOnce(listQ).mockReturnValueOnce(insTypeQ).mockReturnValueOnce(runInsQ).mockReturnValueOnce(updQ)
    await resolveAndPersist({ types: [{ label: '신규', app: 'c3', count: 2, logs: [] }] }, '2026-06-24T00:00:00Z')
    expect(insTypeQ.insert).toHaveBeenCalledWith(expect.objectContaining({ label: '신규' }))
    expect(runInsQ.insert).toHaveBeenCalledWith(expect.objectContaining({ type_id: 'new1', count: 2 }))
    expect(updQ.update).toHaveBeenCalledWith(expect.objectContaining({ total_count: 2 }))
  })
  it('types 비면 아무 것도 안 함(list만 조회)', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: [], error: null }))
    await resolveAndPersist({ types: [] }, '2026-06-24T00:00:00Z')
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })
})
