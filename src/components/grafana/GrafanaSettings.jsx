// src/components/grafana/GrafanaSettings.jsx
import { useState, useEffect, useCallback } from 'react'
import TagInput from '../mailer/TagInput.jsx'
import QueryListEditor from './QueryListEditor.jsx'
import { getSettings, updateSettings, testQuery } from '../../lib/api/grafana.js'
import { canSave } from '../../lib/grafanaQueryGate.js'
import { getCookie, clearCookie } from '../../lib/auth.js'

const METRIC_COLUMNS = [
  { key: 'label', label: '라벨' },
  { key: 'query', label: 'PromQL 쿼리', wide: true },
  { key: 'threshold', label: '임계값', type: 'number' },
]
const LOG_COLUMNS = [
  { key: 'label', label: '라벨' },
  { key: 'query', label: 'ES 쿼리', wide: true },
]
const newMetric = () => ({ _id: crypto.randomUUID(), label: '', query: '', threshold: 0, enabled: true })
const newLog = () => ({ _id: crypto.randomUUID(), label: '', query: '', enabled: true })

// 로드된 행에 게이트용 메타 부착(저장값 = 현재 query, 미테스트).
const attachMeta = (r) => ({ ...r, _id: crypto.randomUUID(), _savedQuery: r.query, _test: 'untested', _testedQuery: undefined, _testError: '' })
// 저장 전 메타 제거.
const stripMetric = (r) => ({ label: r.label, query: r.query, threshold: Number(r.threshold), enabled: r.enabled !== false })
const stripLog = (r) => ({ label: r.label, query: r.query, enabled: r.enabled !== false })

export default function GrafanaSettings() {
  const password = getCookie()
  const [recipients, setRecipients] = useState([])
  const [sendHour, setSendHour] = useState(9)
  const [enabled, setEnabled] = useState(true)
  const [logLagHours, setLogLagHours] = useState(3)
  const [metrics, setMetrics] = useState([])
  const [logQueries, setLogQueries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getSettings(password)
      setRecipients(s.recipients ?? [])
      setSendHour(s.send_hour ?? 9)
      setEnabled(!!s.enabled)
      setLogLagHours(s.log_lag_hours ?? 3)
      setMetrics((s.metrics ?? []).map(attachMeta))
      setLogQueries((s.log_queries ?? []).map(attachMeta))
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') clearCookie()
      else setError('설정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [password])

  useEffect(() => { load() }, [load])

  const runMetricTest = (query) => testQuery({ type: 'metric', query }, password)
  const runLogTest = (query) => testQuery({ type: 'log', query }, password)

  const gateOk = canSave(metrics, logQueries)

  const handleSave = async (e) => {
    e.preventDefault()
    if (!gateOk) return
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const s = await updateSettings({
        recipients, send_hour: sendHour, enabled, log_lag_hours: logLagHours,
        metrics: metrics.map(stripMetric), log_queries: logQueries.map(stripLog),
      }, password)
      setRecipients(s.recipients ?? [])
      setSendHour(s.send_hour ?? sendHour)
      setEnabled(!!s.enabled)
      setLogLagHours(s.log_lag_hours ?? logLagHours)
      setMetrics((s.metrics ?? []).map(attachMeta))
      setLogQueries((s.log_queries ?? []).map(attachMeta))
      setSaved(true)
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') clearCookie()
      else setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="job-empty">불러오는 중…</p>

  return (
    <form className="grafana-settings" onSubmit={handleSave}>
      <div className="form-field">
        <label className="form-label">수신자 이메일</label>
        <TagInput values={recipients} onChange={(v) => { setRecipients(v); setSaved(false) }} />
        <p className="form-hint">이메일 입력 후 Enter. 비우면 환경변수 수신자로 폴백됩니다. 발송을 완전히 멈추려면 아래 ‘매일 자동 발송’을 꺼주세요.</p>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="grafana-send-hour">발송 시각 (KST)</label>
        <select id="grafana-send-hour" className="form-select" value={sendHour}
          onChange={(e) => { setSendHour(Number(e.target.value)); setSaved(false) }}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label className="grafana-toggle">
          <input type="checkbox" checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); setSaved(false) }} />
          매일 자동 발송
        </label>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="grafana-log-lag">로그 적재 지연 보정 (시간)</label>
        <select id="grafana-log-lag" className="form-select" value={logLagHours}
          onChange={(e) => { setLogLagHours(Number(e.target.value)); setSaved(false) }}>
          {Array.from({ length: 25 }, (_, h) => (
            <option key={h} value={h}>{h}시간</option>
          ))}
        </select>
        <p className="form-hint">로그가 ES에 늦게 색인되는 지연을 감안해, 조회 시간창을 이만큼 뒤로 당깁니다. 기본 3시간.</p>
      </div>

      <QueryListEditor
        title="메트릭 쿼리 (Prometheus)"
        items={metrics}
        columns={METRIC_COLUMNS}
        newRow={newMetric}
        addLabel="+ 메트릭 추가"
        onChange={(v) => { setMetrics(v); setSaved(false) }}
        onTest={runMetricTest}
        formatResult={(r) => (r.value == null ? '데이터 없음' : `현재 값 ${r.value}`)}
      />

      <QueryListEditor
        title="로그 쿼리 (Elasticsearch)"
        items={logQueries}
        columns={LOG_COLUMNS}
        newRow={newLog}
        addLabel="+ 로그 쿼리 추가"
        onChange={(v) => { setLogQueries(v); setSaved(false) }}
        onTest={runLogTest}
        formatResult={(r) => `최근 24h(지연보정) ${r.count ?? 0}건`}
      />

      {!gateOk && <p className="form-hint form-hint-error">신규·수정된 쿼리는 테스트를 통과해야 저장할 수 있습니다.</p>}
      {error && <div className="grafana-error">{error}</div>}
      <div className="modal-actions">
        <button type="submit" className="modal-submit" disabled={saving || !gateOk}>
          {saving ? '저장 중…' : saved ? '저장됨 ✓' : '저장'}
        </button>
      </div>
    </form>
  )
}
