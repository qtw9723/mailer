import { Pencil, Trash2 } from 'lucide-react'
import HeartbeatBar from '../shared/HeartbeatBar.jsx'
import MoreMenu from '../shared/MoreMenu.jsx'
import { fmtKst } from '../../lib/datetime.js'

export default function BotRow({ bot, onToggle, onEdit, onDelete, toggling }) {
  const checks = bot.recent_checks ?? []
  const last = checks[checks.length - 1]
  const lastFailed = last && !last.ok
  const dotClass = !checks.length ? 'idle' : lastFailed ? 'fail' : 'ok'
  let host = bot.url
  try { host = new URL(bot.url).host } catch { /* 원본 유지 */ }

  return (
    <div className={`job-row${lastFailed ? ' failed' : ''}`}>
      <div className="job-row-main">
        <span className={`status-dot ${dotClass}`} />
        <div className="job-row-title">
          <span className="job-row-name">{bot.name}</span>
          <span className="job-row-sub">
            <span className="mono">{host}</span>
            {last && <> · 마지막 체크: <span className="mono">{fmtKst(last.checked_at)}</span> · {last.ok ? '성공' : '실패'}</>}
            {!checks.length && <> · 아직 체크 전</>}
          </span>
        </div>
        <HeartbeatBar sends={checks.map(c => ({ ok: c.ok, sent_at: c.checked_at }))} />
        <button
          type="button"
          className={`switch${bot.enabled ? ' on' : ''}`}
          onClick={onToggle}
          disabled={toggling}
          role="switch"
          aria-checked={bot.enabled}
          aria-label={bot.enabled ? `${bot.name} 비활성화` : `${bot.name} 활성화`}
        >
          <span className="switch-knob" />
        </button>
        <MoreMenu label={`${bot.name} 메뉴`} items={[
          { icon: Pencil, text: '수정', onClick: onEdit },
          { icon: Trash2, text: '삭제', danger: true, onClick: onDelete },
        ]} />
      </div>
      {lastFailed && last.detail && (
        <div className="bot-fail-detail">{last.detail}</div>
      )}
    </div>
  )
}
