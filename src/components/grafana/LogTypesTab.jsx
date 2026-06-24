import { useState, useEffect, useCallback } from 'react'
import { Trash2, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { getLogTypes, getLogType, updateLogType, deleteLogType } from '../../lib/api/grafana.js'
import { clearCookie } from '../../lib/auth.js'
import { fmtKst } from '../../lib/datetime.js'
import ConfirmDialog from '../shared/ConfirmDialog.jsx'

function RunRow({ run }) {
  const [open, setOpen] = useState(false)
  const logs = run.logs ?? []
  return (
    <div className="logtype-run">
      <button className="logtype-run-head" onClick={() => setOpen((o) => !o)}>
        <span className="mono">{fmtKst(run.run_at)}</span>
        {run.app && <span className="cat-badge">{run.app}</span>}
        <span className="logtype-run-count mono">{run.count}건</span>
        <span className="logtype-run-toggle">{open ? '접기' : `로그 ${logs.length}`}</span>
      </button>
      {open && logs.length > 0 && (
        <table className="grafana-log-table">
          <tbody>
            {logs.map((r, i) => (
              <tr key={i}><td className="grafana-log-time mono">{r.time}</td><td className="grafana-log-msg">{r.msg}</td></tr>
            ))}
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

      <h4 className="logtype-runs-title">회차별 로그</h4>
      {(type.runs ?? []).length === 0
        ? <p className="job-empty">아직 기록이 없습니다.</p>
        : type.runs.map((r) => <RunRow key={r.id} run={r} />)}

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
