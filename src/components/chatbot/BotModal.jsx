import { useState } from 'react'
import { Plus, X, Settings2 } from 'lucide-react'
import Modal from '../shared/Modal.jsx'

// 저장 형식: { type: 'say'|'click', say|click: 텍스트, expect: 키워드, selector?: CSS 셀렉터 }
// 구버전(type 없음)은 say로 간주. selector는 발화=입력창 / 버튼=클릭 대상 오버라이드.
const emptyStep = () => ({ type: 'say', text: '', expect: '', selector: '', showSel: false })

function toEditable(step) {
  const type = step.type === 'click' ? 'click' : 'say'
  const selector = step.selector ?? ''
  return {
    type,
    text: type === 'click' ? (step.click ?? '') : (step.say ?? ''),
    expect: step.expect ?? '',
    selector,
    showSel: !!selector,
  }
}

function toStored({ type, text, expect, selector }) {
  const base = type === 'click'
    ? { type: 'click', click: text.trim(), expect: expect.trim() }
    : { type: 'say', say: text.trim(), expect: expect.trim() }
  return selector.trim() ? { ...base, selector: selector.trim() } : base
}

export default function BotModal({ bot, onSubmit, onClose, loading, categories = [], onAddCategory }) {
  const [name, setName] = useState(bot?.name ?? '')
  const [url, setUrl] = useState(bot?.url ?? '')
  const [category, setCategory] = useState(bot?.category ?? '')
  const [addingCat, setAddingCat] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [steps, setSteps] = useState(bot?.scenario?.length ? bot.scenario.map(toEditable) : [emptyStep()])

  const handleAddCat = async () => {
    const added = await onAddCategory?.(newCat)
    if (added) { setCategory(added); setNewCat(''); setAddingCat(false) }
  }

  const setStep = (i, key, value) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: value } : s))

  const stepValid = (s) => (s.text.trim() || s.selector.trim()) && s.expect.trim()

  const handleSubmit = (e) => {
    e.preventDefault()
    const scenario = steps.filter(stepValid).map(toStored)
    onSubmit({ name, url, category: category.trim() || null, scenario, input_selector: bot?.input_selector ?? null })
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
          <label className="form-label" htmlFor="bot-category">카테고리</label>
          <div className="cat-select-row">
            <select
              id="bot-category"
              className="form-select"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="">(미분류)</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              {category && !categories.includes(category) && <option value={category}>{category}</option>}
            </select>
            <button type="button" className="cat-add-btn" onClick={() => setAddingCat(a => !a)} aria-label="새 카테고리 추가" title="새 카테고리 추가">
              <Plus size={14} />
            </button>
          </div>
          {addingCat && (
            <div className="cat-add-row">
              <input
                className="form-input"
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCat() } }}
                placeholder="새 카테고리 이름"
                aria-label="새 카테고리 이름"
                autoFocus
              />
              <button type="button" className="modal-submit" onClick={handleAddCat} disabled={!newCat.trim()}>추가</button>
            </div>
          )}
          <p className="form-hint">같은 카테고리끼리 묶어서 한 번에 체크할 수 있습니다. ＋로 새 카테고리를 추가할 수 있어요.</p>
        </div>
        <div className="form-field">
          <label className="form-label">시나리오 (액션 → 기대 키워드)</label>
          <div className="scenario-steps">
            {steps.map((s, i) => (
              <div key={i} className="scenario-step-group">
                <div className="scenario-step">
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
                  <button
                    type="button"
                    className={`scenario-step-gear${s.showSel ? ' active' : ''}`}
                    onClick={() => setStep(i, 'showSel', !s.showSel)}
                    aria-label={`스텝 ${i + 1} 셀렉터 설정`}
                    title="셀렉터 직접 지정"
                  >
                    <Settings2 size={13} />
                  </button>
                  {steps.length > 1 && (
                    <button type="button" className="scenario-step-remove" onClick={() => setSteps(prev => prev.filter((_, idx) => idx !== i))} aria-label={`스텝 ${i + 1} 삭제`}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                {s.showSel && (
                  <div className="scenario-step-selector">
                    <input
                      className="form-input mono"
                      value={s.selector}
                      onChange={e => setStep(i, 'selector', e.target.value)}
                      placeholder={s.type === 'click'
                        ? '클릭할 요소 CSS 셀렉터 (예: #btn-reserve) — 비우면 버튼 텍스트로 탐색'
                        : '입력창 CSS 셀렉터 (예: #chat-input-text) — 비우면 자동 탐색'}
                      aria-label={`스텝 ${i + 1} 셀렉터`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="attachment-add" onClick={() => setSteps(prev => [...prev, emptyStep()])}>
            <Plus size={12} /> 스텝 추가
          </button>
          <p className="form-hint">
            발화는 입력창에 타이핑, 버튼은 화면의 해당 텍스트 버튼을 클릭합니다.
            ⚙으로 스텝별 CSS 셀렉터를 직접 지정할 수 있습니다 (발화=입력창, 버튼=클릭 대상).
            기대 키워드는 버튼 텍스트와 다른 문구로. 매일 08:30 자동 체크.
          </p>
        </div>
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
