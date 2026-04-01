// src/components/JobCard.jsx
import { Play, Square, Pencil, Trash2, Copy } from 'lucide-react'

function fmt(iso) {
  if (!iso) return '미발송'
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function intervalLabel(minutes) {
  if (minutes < 60) return `${minutes}분마다`
  if (minutes % 60 === 0) return `${minutes / 60}시간마다`
  return `${minutes}분마다`
}

export default function JobCard({ job, selected, onSelect, onToggle, onEdit, onDelete, onDuplicate }) {
  return (
    <div className={`job-card${job.is_active ? ' job-card-active' : ''}${selected ? ' job-card-selected' : ''}`}>
      <div className="job-card-top">
        <div className="job-card-left">
          <input type="checkbox" className="job-checkbox" checked={selected} onChange={e => onSelect(e.target.checked)} />
          <div className="job-card-name">{job.name}</div>
        </div>
        <div className="job-card-actions">
          <button
            className={`btn ${job.is_active ? 'btn-stop' : 'btn-start'}`}
            onClick={onToggle}
          >
            {job.is_active ? <><Square size={11} /> 중지</> : <><Play size={11} /> 시작</>}
          </button>
          <button className="btn btn-edit" onClick={onEdit}>
            <Pencil size={11} /> 수정
          </button>
          <button className="btn btn-edit" onClick={onDuplicate}>
            <Copy size={11} />
          </button>
          <button className="btn btn-delete" onClick={onDelete}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      <div className="job-card-meta">
        <span className="job-meta-item">
          <span className={`job-badge ${job.sender === 'gmail' ? 'job-badge-gmail' : 'job-badge-ms'}`}>
            {job.sender === 'gmail' ? 'Gmail' : 'Outlook'}
          </span>
        </span>
        <span className="job-meta-item">수신자 {job.recipients.length}명</span>
        <span className="job-meta-item">{intervalLabel(job.interval_minutes)}</span>
        <span className="job-meta-item">
          <span className={`job-status-dot${job.is_active ? ' job-status-dot-active' : ''}`} />
          {job.is_active ? '실행 중' : '중지됨'}
        </span>
        {job.use_index && <span className="job-meta-item job-badge job-badge-index"># 순번</span>}
        <span className="job-meta-item">누적 {job.send_count}회</span>
        <span className="job-meta-item">마지막: {fmt(job.last_sent_at)}</span>
      </div>
    </div>
  )
}
