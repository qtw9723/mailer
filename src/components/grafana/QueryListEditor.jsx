import { useState, useRef } from 'react'
import { X, Check, AlertTriangle, Loader2, FlaskConical } from 'lucide-react'
import { rowIsGood } from '../../lib/grafanaQueryGate.js'

// 범용 쿼리 리스트 편집기 (데스크톱 단일 행 + 테스트 후 결과 서브라인).
// props:
//  title, items, columns([{key,label,wide?,type?}]), newRow(()=>row),
//  addLabel, onChange(newItems), onTest(query)=>Promise<{ok,value?,count?,error?}>,
//  formatResult(resp)=>string  (통과 시 보여줄 1줄 상세; 옵션)
// columns는 배열 순서대로 한 줄에 배치하며, wide=true(쿼리)는 남는 폭을 채운다.
export default function QueryListEditor({ items, columns, newRow, addLabel, onChange, onTest, formatResult }) {
  const [testing, setTesting] = useState(null) // 테스트 진행 중인 행 식별자(_id 또는 index)

  // 항상 최신 items를 가리키는 ref — 비동기 콜백의 stale 스냅샷/행 부활 방지.
  const itemsRef = useRef(items)
  itemsRef.current = items

  const patchAt = (idx, patch) => onChange(itemsRef.current.map((it, k) => (k === idx ? { ...it, ...patch } : it)))
  const update = (i, patch) => patchAt(i, patch)
  const remove = (i) => onChange(itemsRef.current.filter((_, idx) => idx !== i))
  const add = () => onChange([...itemsRef.current, newRow()])

  const rowKey = (row, i) => row._id ?? i
  const findIdx = (row, i) => (row._id != null ? itemsRef.current.findIndex((x) => x._id === row._id) : i)

  const onFieldChange = (i, c, value) => {
    const v = c.type === 'number' ? Number(value) : value
    // query를 수정하면 이전 테스트 상태를 무효화한다.
    const extra = c.key === 'query' ? { _test: 'untested', _testError: '', _testDetail: '' } : {}
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
      patchAt(idx, r?.ok
        ? { _test: 'passed', _testedQuery: q, _testError: '', _testDetail: formatResult ? formatResult(r) : '' }
        : { _test: 'failed', _testError: r?.error || '실패', _testDetail: '' })
    } catch (e) {
      const idx = findIdx(row, i)
      if (idx !== -1) patchAt(idx, { _test: 'failed', _testError: e.message, _testDetail: '' })
    } finally {
      setTesting(null)
    }
  }

  // 행 상태: 테스트중 / 실패 / 등록가능(통과·기존) / 미테스트
  const stateOf = (row, key) => {
    if (testing === key) return 'testing'
    if (row._test === 'failed') return 'fail'
    if (rowIsGood(row)) return 'ok'
    return 'todo'
  }

  // 결과 서브라인은 테스트중 / 실패 / 방금 통과일 때만(기존 저장·미테스트 행은 소음 줄이려 생략).
  const resultLine = (row, st) => {
    if (st === 'testing') return <div className="query-result"><Loader2 size={13} className="query-spin" /> 테스트 중…</div>
    if (st === 'fail') return <div className="query-result fail"><AlertTriangle size={13} /> <span className="query-rtext" title={row._testError}>실패 · {row._testError}</span></div>
    if (row._test === 'passed') return <div className="query-result ok"><Check size={13} /> <span className="query-rtext">통과{row._testDetail ? ` · ${row._testDetail}` : ''}</span></div>
    return null
  }

  return (
    <div className="query-list">
      {items.map((row, i) => {
        const key = rowKey(row, i)
        const st = stateOf(row, key)
        return (
          <div className={`query-row s-${st}`} key={key}>
            <div className="query-line">
              <input
                className="query-chk"
                type="checkbox"
                title="사용"
                checked={row.enabled !== false}
                onChange={(e) => update(i, { enabled: e.target.checked })}
              />
              {columns.map((c) => (
                <input
                  key={c.key}
                  className={`form-input query-${c.key}${c.wide ? ' query-grow' : ''}${c.type === 'number' ? ' query-num' : ''}`}
                  type={c.type || 'text'}
                  placeholder={c.label}
                  value={row[c.key] ?? ''}
                  onChange={(e) => onFieldChange(i, c, e.target.value)}
                />
              ))}
              <button type="button" className="query-test-btn" disabled={st === 'testing'} onClick={() => runTest(i)}>
                <FlaskConical size={13} /> {st === 'testing' ? '테스트 중…' : '테스트'}
              </button>
              <button type="button" className="query-del" aria-label="삭제" onClick={() => remove(i)}>
                <X size={15} />
              </button>
            </div>
            {resultLine(row, st)}
          </div>
        )
      })}
      <button type="button" className="query-add" onClick={add}>{addLabel}</button>
    </div>
  )
}
