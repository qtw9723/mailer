import { useState } from 'react'
import { Pencil, Trash2, Copy, GripVertical, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nextSendAt, formatNextSend } from '../../lib/datetime.js'
import HeartbeatBar from '../shared/HeartbeatBar.jsx'
import MoreMenu from '../shared/MoreMenu.jsx'

function intervalLabel(minutes) {
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}시간마다`
  return `${minutes}분마다`
}

export default function JobRow({ job, selected, onSelect, onToggle, onEdit, onDelete, onDuplicate, onResetCount, senders, toggling }) {
  const [recipientsOpen, setRecipientsOpen] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  const lastFailed = job.recent_sends?.length > 0 && !job.recent_sends[job.recent_sends.length - 1].ok
  const dotClass = lastFailed ? 'fail' : job.is_active ? 'ok' : 'idle'
  const next = job.is_active ? formatNextSend(nextSendAt(job.last_sent_at, job.interval_minutes)) : null
  const senderEmail = senders?.find(s => s.id === job.sender_account_id)?.email

  return (
    <div ref={setNodeRef} style={style} className={`job-row${lastFailed ? ' failed' : ''}${selected ? ' selected' : ''}`}>
      <div className="job-row-main">
        <button type="button" className="drag-handle" {...attributes} {...listeners} aria-label="순서 변경">
          <GripVertical size={14} />
        </button>
        <input type="checkbox" className="job-checkbox" checked={selected} onChange={e => onSelect(e.target.checked)} aria-label={`${job.name} 선택`} />
        <span className={`status-dot ${dotClass}`} />
        <div className="job-row-title">
          <span className="job-row-name">{job.name}</span>
          <span className="job-row-sub">
            <span className="mono">{intervalLabel(job.interval_minutes)}</span>
            {next && <> · 다음 발송: <span className="mono job-next">{next}</span></>}
            {lastFailed && <span className="job-fail-label"> · 최근 발송 실패</span>}
          </span>
        </div>
        <HeartbeatBar sends={job.recent_sends ?? []} />
        <button
          type="button"
          className={`switch${job.is_active ? ' on' : ''}`}
          onClick={onToggle}
          disabled={toggling}
          role="switch"
          aria-checked={job.is_active}
          aria-label={job.is_active ? `${job.name} 중지` : `${job.name} 시작`}
        >
          <span className="switch-knob" />
        </button>
        <MoreMenu label={`${job.name} 작업 메뉴`} items={[
          { icon: Pencil, text: '수정', onClick: onEdit },
          { icon: Copy, text: '복제', onClick: onDuplicate },
          job.use_index && { icon: RotateCcw, text: '순번 초기화', onClick: onResetCount },
          { icon: Trash2, text: '삭제', danger: true, onClick: onDelete },
        ]} />
      </div>
      <div className="job-row-meta">
        {senderEmail && <span className="mono">{senderEmail}</span>}
        <button type="button" className="recipient-toggle" onClick={() => setRecipientsOpen(o => !o)}>
          수신자 {job.recipients.length}명 {recipientsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        <span>누적 {job.send_count}회</span>
      </div>
      {recipientsOpen && (
        <div className="recipient-list">
          {job.recipients.map(email => <div key={email} className="recipient-list-item mono">{email}</div>)}
        </div>
      )}
    </div>
  )
}
