import { useState, useEffect, useCallback } from 'react'
import { Trash2, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { getLogTypes, getLogType, updateLogType, deleteLogType } from '../../lib/api/grafana.js'
import { clearCookie } from '../../lib/auth.js'
import { fmtKst, kstDateKey } from '../../lib/datetime.js'
import ConfirmDialog from '../shared/ConfirmDialog.jsx'

// 발생 타임라인: 개별 로그(entries)를 occurred_at desc로 그대로 나열. 같은 에러 3건이면 3행.
// 오늘(KST) 수집한 회차(run_at 기준)에 속한 로그를 하이라이트해 한눈에 구분.
function Timeline({ entries, runs }) {
  if (!entries?.length) {
    return <p className="job-empty">개별 발생 기록이 없습니다. (다음 분석 회차부터 시각이 쌓입니다)</p>
  }
  const todayKey = kstDateKey(new Date().toISOString())
  const todayRunIds = new Set((runs ?? []).filter((r) => kstDateKey(r.run_at) === todayKey).map((r) => r.id))
  return (
    <table className="logtype-timeline">
      <tbody>
        {entries.map((e) => {
          const today = todayRunIds.has(e.run_id)
          return (
            <tr key={e.id} className={today ? 'logtype-tl-today' : undefined}>
              <td className="logtype-tl-time mono">
                {e.occurred_at ? fmtKst(e.occurred_at) : '-'}
                {today && <span className="logtype-today-badge">오늘 수집</span>}
              </td>
              <td className="logtype-tl-app">{e.app && <span className="cat-badge">{e.app}</span>}</td>
              <td className="logtype-tl-msg">{e.msg}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// 회차별: 회차(run) 헤더 + 펼치면 그 회차의 개별 로그. 신규는 entries(run_id), 옛 데이터는 logs jsonb 폴백.
// count보다 적게 기록됐으면(>50 상한 등) "외 N건" 표기.
function RunRow({ run, entries }) {
  const [open, setOpen] = useState(false)
  const mine = (entries ?? []).filter((e) => e.run_id === run.id)
  const legacy = mine.length === 0 ? (run.logs ?? []) : []
  const rows = mine.length
    ? mine.map((e) => ({ key: e.id, time: e.occurred_at ? fmtKst(e.occurred_at) : '-', msg: e.msg }))
    : legacy.map((l, i) => ({ key: `l${i}`, time: l.time, msg: l.msg }))
  const missing = Math.max(0, (run.count ?? 0) - rows.length)
  return (
    <div className="logtype-run">
      <button className="logtype-run-head" onClick={() => setOpen((o) => !o)}>
        <span className="mono">{fmtKst(run.run_at)}</span>
        {run.app && <span className="cat-badge">{run.app}</span>}
        <span className="logtype-run-count mono">{run.count}건</span>
        <span className="logtype-run-toggle">{open ? '접기' : `로그 ${rows.length}`}</span>
      </button>
      {open && (
        <table className="grafana-log-table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}><td className="grafana-log-time mono">{r.time}</td><td className="grafana-log-msg">{r.msg}</td></tr>
            ))}
            {missing > 0 && (
              <tr className="logtype-tl-more"><td className="grafana-log-time mono">-</td><td className="grafana-log-msg">… 외 {missing}건 (미수집)</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Detail({ id, password, onBack, onChanged }) {
  const [type, setType] = useState(null)
  const [note, setNote] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [view, setView] = useState('timeline')

  const load = useCallback(async () => {
    try {
      const t = await getLogType(id, password)
      setType(t); setNote(t.note ?? ''); setLabel(t.label ?? '')
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') clearCookie()
      else toast.error('유형을 불러오지 못했습니다')
    }
  }, [id, password])
  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      await updateLogType(id, { note, label: label.trim() || type.label }, password)
      toast.success('저장했습니다')
      onChanged?.()
    } catch {
      toast.error('저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await deleteLogType(id, password)
      toast.success('유형을 삭제했습니다')
      onChanged?.(); onBack()
    } catch {
      toast.error('삭제에 실패했습니다')
    }
  }

  if (!type) return <p className="job-empty">불러오는 중…</p>

  return (
    <div className="logtype-detail">
      <div className="logtype-detail-head">
        <button className="logtype-back" onClick={onBack}><ChevronLeft size={16} /> 목록</button>
        <button className="logtype-delete" onClick={() => setConfirm(true)}><Trash2 size={14} /> 삭제</button>
      </div>

      <input className="form-input logtype-label" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="유형 이름" />
      {type.description && <p className="logtype-desc">{type.description}</p>}
      <div className="logtype-stat mono">누적 {type.total_count}건 · 마지막 {type.last_seen_at ? fmtKst(type.last_seen_at) : '-'}</div>

      <label className="form-label">노트</label>
      <textarea className="form-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="이 유형에 대한 메모…" />
      <div className="modal-actions">
        <button className="modal-submit" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
      </div>

      <div className="logtype-view-toggle">
        <button className={`cat-chip${view === 'timeline' ? ' active' : ''}`} onClick={() => setView('timeline')}>발생 타임라인</button>
        <button className={`cat-chip${view === 'runs' ? ' active' : ''}`} onClick={() => setView('runs')}>회차별</button>
      </div>
      {(type.runs ?? []).length === 0
        ? <p className="job-empty">아직 기록이 없습니다.</p>
        : view === 'timeline'
          ? <Timeline entries={type.entries} runs={type.runs} />
          : type.runs.map((r) => <RunRow key={r.id} run={r} entries={type.entries} />)}

      {confirm && (
        <ConfirmDialog
          title="로그 유형 삭제"
          message={`"${type.label}"을(를) 삭제할까요? 회차 로그도 함께 삭제됩니다.`}
          confirmLabel="삭제" danger
          onConfirm={async () => { await remove(); setConfirm(false) }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  )
}

export default function LogTypesTab({ password }) {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTypes(await getLogTypes(password))
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') clearCookie()
      else toast.error('로그 유형을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [password])
  useEffect(() => { load() }, [load])

  if (selected) return <Detail id={selected} password={password} onBack={() => setSelected(null)} onChanged={load} />

  if (loading) return <p className="job-empty">불러오는 중…</p>
  if (types.length === 0) {
    return <p className="job-empty">저장된 로그 유형이 없습니다. 발송 시각에 LLM이 분석해 유형을 쌓습니다.</p>
  }

  return (
    <div className="logtype-list">
      {types.map((t) => (
        <button key={t.id} className="logtype-row" onClick={() => setSelected(t.id)}>
          <div className="logtype-row-main">
            <strong>{t.label}</strong>
            <span className="logtype-row-count mono">누적 {t.total_count}건</span>
          </div>
          <div className="logtype-row-sub">
            {t.note ? <span className="logtype-row-note">📝 {t.note}</span> : <span className="logtype-row-desc">{t.description}</span>}
            <span className="logtype-row-time mono">{t.last_seen_at ? fmtKst(t.last_seen_at) : ''}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
