import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Modal from '../shared/Modal.jsx'

// 저장 형식: { type: 'say'|'click', say|click: 텍스트, expect: 키워드 }
// 구버전(type 없음)은 say로 간주
const emptyStep = () => ({ type: 'say', text: '', expect: '' })

function toEditable(step) {
  const type = step.type === 'click' ? 'click' : 'say'
  return { type, text: type === 'click' ? (step.click ?? '') : (step.say ?? ''), expect: step.expect ?? '' }
}

function toStored({ type, text, expect }) {
  return type === 'click'
    ? { type: 'click', click: text.trim(), expect: expect.trim() }
    : { type: 'say', say: text.trim(), expect: expect.trim() }
}

export default function BotModal({ bot, onSubmit, onClose, loading }) {
  const [name, setName] = useState(bot?.name ?? '')
  const [url, setUrl] = useState(bot?.url ?? '')
  const [steps, setSteps] = useState(bot?.scenario?.length ? bot.scenario.map(toEditable) : [emptyStep()])
  const [inputSelector, setInputSelector] = useState(bot?.input_selector ?? '')
  const [showAdvanced, setShowAdvanced] = useState(!!bot?.input_selector)

  const setStep = (i, key, value) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: value } : s))

  const stepValid = (s) => s.text.trim() && s.expect.trim()

  const handleSubmit = (e) => {
    e.preventDefault()
    const scenario = steps.filter(stepValid).map(toStored)
    onSubmit({ name, url, scenario, input_selector: inputSelector.trim() || null })
  }

  const valid = steps.some(stepValid)

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
          <label className="form-label">시나리오 (액션 → 기대 키워드)</label>
          <div className="scenario-steps">
            {steps.map((s, i) => (
              <div key={i} className="scenario-step">
                <span className="scenario-step-num mono">{i + 1}</span>
                <select
                  className="form-select scenario-type"
                  value={s.type}
                  onChange={e => setStep(i, 'type', e.target.value)}
                  aria-label={`스텝 ${i + 1} 종류`}
                >
                  <option value="say">발화</option>
                  <option value="click">버튼</option>
                </select>
                <input
                  className="form-input"
                  value={s.text}
                  onChange={e => setStep(i, 'text', e.target.value)}
                  placeholder={s.type === 'click' ? '버튼 텍스트 (예: 예약하기)' : '발화 (예: 안녕)'}
                  aria-label={`스텝 ${i + 1} ${s.type === 'click' ? '버튼 텍스트' : '발화'}`}
                />
                <span className="scenario-arrow">→</span>
                <input
                  className="form-input"
                  value={s.expect}
                  onChange={e => setStep(i, 'expect', e.target.value)}
                  placeholder="기대 키워드"
                  aria-label={`스텝 ${i + 1} 기대 키워드`}
                />
                {steps.length > 1 && (
                  <button type="button" className="scenario-step-remove" onClick={() => setSteps(prev => prev.filter((_, idx) => idx !== i))} aria-label={`스텝 ${i + 1} 삭제`}>
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="attachment-add" onClick={() => setSteps(prev => [...prev, emptyStep()])}>
            <Plus size={12} /> 스텝 추가
          </button>
          <p className="form-hint">
            발화는 입력창에 타이핑, 버튼은 화면의 해당 텍스트 버튼을 클릭합니다.
            응답에 기대 키워드가 나타나면 성공 — 버튼 텍스트와 다른 키워드를 쓰세요. 매일 08:30 자동 체크.
          </p>
        </div>
        <button type="button" className="recipient-toggle" onClick={() => setShowAdvanced(v => !v)}>
          고급 설정 {showAdvanced ? '접기' : '펼치기'}
        </button>
        {showAdvanced && (
          <div className="form-field advanced-field">
            <label className="form-label" htmlFor="bot-selector">입력창 셀렉터 (선택)</label>
            <input id="bot-selector" className="form-input mono" value={inputSelector} onChange={e => setInputSelector(e.target.value)} placeholder="비우면 자동 탐색 (#chat-input-text → textarea → input)" />
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
