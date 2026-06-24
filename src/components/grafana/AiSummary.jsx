import { useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { analyzeNow } from '../../lib/api/grafana.js'
import { fmtKst } from '../../lib/datetime.js'

// markdown 불릿 문자열 → 항목 배열. 줄바꿈 우선, 한 줄이면 " - "/" • " 구분자로도 분해.
function toBullets(text) {
  const s = String(text ?? '').trim()
  if (!s) return []
  let parts = s.split('\n')
  if (parts.length === 1) parts = s.split(/\s+[-*•]\s+/)
  return parts.map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
}

// 리포트 탭 상단의 "AI 점검 요약". analysis는 저장된 최신 분석({summary, generated_at}) 또는 null.
export default function AiSummary({ analysis, password }) {
  const [preview, setPreview] = useState(null) // 재분석 미리보기 결과(저장 안 됨)
  const [running, setRunning] = useState(false)

  const reanalyze = async () => {
    setRunning(true)
    try {
      setPreview(await analyzeNow(password))
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') throw e
      toast.error(/GEMINI/.test(e.message) ? 'GEMINI_API_KEY가 설정되지 않았습니다' : '분석에 실패했습니다')
    } finally {
      setRunning(false)
    }
  }

  const saved = analysis?.summary ? toBullets(analysis.summary) : []
  const shown = preview ? toBullets(preview.summary) : saved

  return (
    <section className="grafana-section">
      <div className="ai-summary-head">
        <h3 className="grafana-section-title"><Sparkles size={15} /> AI 점검 요약</h3>
        <button className="ai-reanalyze" onClick={reanalyze} disabled={running}>
          <RefreshCw size={13} className={running ? 'spin' : ''} /> {running ? '분석 중…' : '재분석'}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="job-empty">아직 분석 결과가 없습니다. 발송 시각에 생성되거나 “재분석”으로 미리 볼 수 있습니다.</p>
      ) : (
        <div className="ai-summary-box">
          <ul className="ai-summary-list">
            {shown.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          <div className="ai-summary-meta mono">
            {preview
              ? '미리보기 — 저장되지 않음 (저장은 발송 시각에)'
              : analysis?.generated_at ? `${fmtKst(analysis.generated_at)} (KST) 기준` : ''}
          </div>
        </div>
      )}

      {preview?.types?.length > 0 && (
        <div className="ai-preview-types">
          {preview.types.map((t, i) => (
            <div key={i} className="ai-preview-type">
              <span className="cat-badge">{t.app}</span>
              <strong>{t.label}</strong>
              <span className="ai-preview-count mono">{t.count}건</span>
              {t.description && <span className="ai-preview-desc">{t.description}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
