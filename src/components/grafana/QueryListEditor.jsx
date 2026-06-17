import { useState } from 'react'
import { X } from 'lucide-react'
import { rowIsGood } from '../../lib/grafanaQueryGate.js'

// 범용 쿼리 리스트 편집기.
// props:
//  title, items, columns([{key,label,wide?,type?}]), newRow(()=>row),
//  addLabel, onChange(newItems), onTest(query)=>Promise<{ok,error}>
export default function QueryListEditor({ title, items, columns, newRow, addLabel, onChange, onTest }) {
  const [testing, setTesting] = useState(-1) // 테스트 진행 중인 행 index

  const update = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const add = () => onChange([...items, newRow()])

  const runTest = async (i) => {
    const row = items[i]
    if (!String(row.query ?? '').trim()) return
    setTesting(i)
    try {
      const r = await onTest(row.query)
      update(i, r?.ok ? { _test: 'passed', _testedQuery: row.query, _testError: '' }
                      : { _test: 'failed', _testError: r?.error || '실패' })
    } catch (e) {
      update(i, { _test: 'failed', _testError: e.message })
    } finally {
      setTesting(-1)
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
        {items.map((row, i) => (
          <div className="query-row" key={i}>
            <div className="query-fields">
              {columns.map((c) => (
                <input
                  key={c.key}
                  className={`form-input${c.wide ? ' query-wide' : ''}`}
                  type={c.type || 'text'}
                  placeholder={c.label}
                  value={row[c.key] ?? ''}
                  onChange={(e) => update(i, {
                    [c.key]: c.type === 'number' ? Number(e.target.value) : e.target.value,
                  })}
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
              <button type="button" className="query-test-btn" disabled={testing === i} onClick={() => runTest(i)}>
                {testing === i ? '테스트 중…' : '테스트'}
              </button>
              {badge(row)}
              <button type="button" className="query-del" aria-label="삭제" onClick={() => remove(i)}>
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="query-add" onClick={add}>{addLabel}</button>
    </div>
  )
}
