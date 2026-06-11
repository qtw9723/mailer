const SLOTS = 10

// 최근 발송 성공/실패 이력(오래된순)을 Uptime Kuma식 막대로 표시
export default function HeartbeatBar({ sends = [] }) {
  if (sends.length === 0) {
    return <span className="heartbeat-empty">이력 없음</span>
  }
  const recent = sends.slice(-SLOTS)
  const padded = [...Array(SLOTS - recent.length).fill(null), ...recent]
  return (
    <div className="heartbeat" aria-label={`최근 발송 ${recent.length}회`}>
      {padded.map((s, i) => (
        <span
          key={i}
          className={`hb-slot${s == null ? ' empty' : s.ok ? ' ok' : ' fail'}`}
          title={s ? `${new Date(s.sent_at).toLocaleString('ko-KR')} · ${s.ok ? '성공' : '실패'}` : undefined}
        />
      ))}
    </div>
  )
}
