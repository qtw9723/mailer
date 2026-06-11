import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Modal from '../shared/Modal.jsx'

export default function BotModal({ bot, onSubmit, onClose, loading }) {
  const [name, setName] = useState(bot?.name ?? '')
  const [url, setUrl] = useState(bot?.url ?? '')
  const [steps, setSteps] = useState(bot?.scenario?.length ? bot.scenario : [{ say: '', expect: '' }])
  const [inputSelector, setInputSelector] = useState(bot?.input_selector ?? '')
  const [showAdvanced, setShowAdvanced] = useState(!!bot?.input_selector)

  const setStep = (i, key, value) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: value } : s))

  const handleSubmit = (e) => {
    e.preventDefault()
    const scenario = steps.filter(s => s.say.trim() && s.expect.trim())
    onSubmit({ name, url, scenario, input_selector: inputSelector.trim() || null })
  }

  const valid = steps.some(s => s.say.trim() && s.expect.trim())

  return (
    <Modal title={bot ? '챗봇 수정' : '챗봇 등록'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label className="form-label" htmlFor="bot-name">이름</label>
          <input id="bot-name" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="예: 코기 상담봇" required />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="bot-url">챗봇 URL</label>
          <input id="bot-url" className="form-input mono" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required />
        </div>
        <div className="form-field">
          <label className="form-label">시나리오 (발화 → 기대 키워드)</label>
          <div className="scenario-steps">
            {steps.map((s, i) => (
              <div key={i} className="scenario-step">
                <span className="scenario-step-num mono">{i + 1}</span>
                <input className="form-input" value={s.say} onChange={e => setStep(i, 'say', e.target.value)} placeholder="발화 (예: 안녕)" aria-label={`스텝 ${i + 1} 발화`} />
                <span className="scenario-arrow">→</span>
                <input className="form-input" value={s.expect} onChange={e => setStep(i, 'expect', e.target.value)} placeholder="기대 키워드" aria-label={`스텝 ${i + 1} 기대 키워드`} />
                {steps.length > 1 && (
                  <button type="button" className="scenario-step-remove" onClick={() => setSteps(prev => prev.filter((_, idx) => idx !== i))} aria-label={`스텝 ${i + 1} 삭제`}>
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="attachment-add" onClick={() => setSteps(prev => [...prev, { say: '', expect: '' }])}>
            <Plus size={12} /> 스텝 추가
          </button>
          <p className="form-hint">응답에 기대 키워드가 나타나면 성공으로 판정합니다. 매일 08:30 자동 체크.</p>
        </div>
        <button type="button" className="recipient-toggle" onClick={() => setShowAdvanced(v => !v)}>
          고급 설정 {showAdvanced ? '접기' : '펼치기'}
        </button>
        {showAdvanced && (
          <div className="form-field advanced-field">
            <label className="form-label" htmlFor="bot-selector">입력창 셀렉터 (선택)</label>
            <input id="bot-selector" className="form-input mono" value={inputSelector} onChange={e => setInputSelector(e.target.value)} placeholder="비우면 자동 탐색 (textarea → input → contenteditable)" />
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>취소</button>
          <button type="submit" className="modal-submit" disabled={loading || !valid}>
            {loading ? '저장 중…' : (bot ? '수정' : '등록')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
