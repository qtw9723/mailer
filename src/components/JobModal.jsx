// src/components/JobModal.jsx
import { useState } from 'react'
import TagInput from './TagInput.jsx'

export default function JobModal({ job, onSubmit, onClose, loading }) {
  const [name, setName] = useState(job?.name ?? '')
  const [sender, setSender] = useState(job?.sender ?? 'gmail')
  const [subject, setSubject] = useState(job?.subject ?? '')
  const [body, setBody] = useState(job?.body ?? '')
  const [recipients, setRecipients] = useState(job?.recipients ?? [])
  const [intervalValue, setIntervalValue] = useState(() => {
    if (!job) return 60
    return job.interval_minutes >= 60 && job.interval_minutes % 60 === 0
      ? job.interval_minutes / 60
      : job.interval_minutes
  })
  const [intervalUnit, setIntervalUnit] = useState(() => {
    if (!job) return 'hours'
    return job.interval_minutes >= 60 && job.interval_minutes % 60 === 0 ? 'hours' : 'minutes'
  })
  const [useIndex, setUseIndex] = useState(job?.use_index ?? false)

  const handleSubmit = (e) => {
    e.preventDefault()
    const interval_minutes = intervalUnit === 'hours'
      ? Number(intervalValue) * 60
      : Number(intervalValue)
    onSubmit({ name, sender, subject, body, recipients, interval_minutes, use_index: useIndex })
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h2 className="modal-title">{job ? '작업 수정' : '새 작업'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label">작업 이름</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 주간 리포트 발송"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label">발신자</label>
            <div className="radio-group">
              <label className="radio-label">
                <input type="radio" value="gmail" checked={sender === 'gmail'} onChange={() => setSender('gmail')} />
                Gmail
              </label>
              <label className="radio-label" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                <input type="radio" value="ms" checked={sender === 'ms'} onChange={() => setSender('ms')} disabled />
                Outlook
              </label>
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">메일 제목</label>
            <input
              className="form-input"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="메일 제목"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label">메일 본문</label>
            <textarea
              className="form-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="메일 내용을 입력하세요"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label">수신자</label>
            <TagInput values={recipients} onChange={setRecipients} />
          </div>

          <div className="form-field">
            <label className="form-label">발송 간격</label>
            <div className="interval-row">
              <input
                className="form-input"
                type="number"
                min="1"
                value={intervalValue}
                onChange={e => setIntervalValue(e.target.value)}
                required
              />
              <select
                className="form-select"
                value={intervalUnit}
                onChange={e => setIntervalUnit(e.target.value)}
              >
                <option value="minutes">분</option>
                <option value="hours">시간</option>
              </select>
            </div>
          </div>

          <div className="form-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={useIndex}
                onChange={e => setUseIndex(e.target.checked)}
              />
              제목 앞에 순번 추가 <span className="checkbox-hint">(예: [1] 제목, [2] 제목 …)</span>
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>취소</button>
            <button
              type="submit"
              className="modal-submit"
              disabled={loading || recipients.length === 0}
            >
              {loading ? '저장 중...' : (job ? '수정' : '생성')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
