import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import { rowIsGood } from '../../lib/grafanaQueryGate.js'

// 범용 쿼리 리스트 편집기.
// props:
//  title, items, columns([{key,label,wide?,type?}]), newRow(()=>row),
//  addLabel, onChange(newItems), onTest(query)=>Promise<{ok,error}>
export default function QueryListEditor({ title, items, columns, newRow, addLabel, onChange, onTest }) {
  const [testing, setTesting] = useState(null) // 테스트 진행 중인 행 식별자(_id 또는 index)

  // 항상 최신 items를 가리키는 ref — 비동기 콜백의 stale 스냅샷/행 부활 방지.
  const itemsRef = useRef(items)
  itemsRef.current = items

  const patchAt = (idx, patch) => onChange(itemsRef.current.map((it, k) => (k === idx ? { ...it, ...patch } : it)))
  const update = (i, patch) => patchAt(i, patch)
  const remove = (i) => onChange(itemsRef.current.filter((_, idx) => idx !== i))
  const add = () => onChange([...itemsRef.current, newRow()])

  // 행 식별: _id 있으면 _id, 없으면 index.
  const rowKey = (row, i) => row._id ?? i
  // 비동기 결과 적용 시점에 행의 현재 인덱스를 다시 찾는다(삭제됐으면 -1).
  const findIdx = (row, i) => (row._id != null ? itemsRef.current.findIndex((x) => x._id === row._id) : i)

  const onFieldChange = (i, c, value) => {
    const v = c.type === 'number' ? Number(value) : value
    // query를 수정하면 이전 테스트 상태를 무효화한다.
    const extra = c.key === 'query' ? { _test: 'untested', _testError: '' } : {}
    update(i, { [c.key]: v, ...extra })
  }

  const runTest = async (i) => {
    const row = itemsRef.current[i]
    const q = String(row.query ?? '')
    if (!q.trim()) return
    setTesting(rowKey(row, i))
    try {
      const r = await onTest(q)
      const idx = findIdx(row, i)
      if (idx === -1) return // 행이 삭제됨 → 결과 폐기
      patchAt(idx, r?.ok ? { _test: 'passed', _testedQuery: q, _testError: '' }
                         : { _test: 'failed', _testError: r?.error || '실패' })
    } catch (e) {
      const idx = findIdx(row, i)
      if (idx !== -1) patchAt(idx, { _test: 'failed', _testError: e.message })
    } finally {
      setTesting(null)
    }
  }

  const badge = (row) => {
    if (rowIsGood(row)) return <span className="query-badge ok">✓ 등록 가능</span>
    if (row._test === 'failed') return <span className="query-badge fail">✗ {row._testError || '실패'}</span>
    return <span className="query-badge todo">미테스트</span>
  }

  return (
    <div className="form-field">
      <label className="form-label">{title}</label>
      <div className="query-list">
        {items.map((row, i) => {
          const isTesting = testing === rowKey(row, i)
          return (
            <div className="query-row" key={rowKey(row, i)}>
              <div className="query-fields">
                {columns.map((c) => (
                  <input
                    key={c.key}
                    className={`form-input${c.wide ? ' query-wide' : ''}`}
                    type={c.type || 'text'}
                    placeholder={c.label}
                    value={row[c.key] ?? ''}
                    onChange={(e) => onFieldChange(i, c, e.target.value)}
                  />
                ))}
              </div>
              <div className="query-controls">
                <label className="query-enabled">
                  <input
                    type="checkbox"
                    checked={row.enabled !== false}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                  />
                  사용
                </label>
                <button type="button" className="query-test-btn" disabled={isTesting} onClick={() => runTest(i)}>
                  {isTesting ? '테스트 중…' : '테스트'}
                </button>
                {badge(row)}
                <button type="button" className="query-del" aria-label="삭제" onClick={() => remove(i)}>
                  <X size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <button type="button" className="query-add" onClick={add}>{addLabel}</button>
    </div>
  )
}
