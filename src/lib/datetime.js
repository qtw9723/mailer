// UTC ISO 문자열 → KST(+9) "YYYY-MM-DD HH:MM"
// 서버 server/grafana/report.js의 fmtTimeKst와 동일 로직(프런트 표시용).
export function fmtKst(ts) {
  if (!ts) return ''
  const base = String(ts).replace('Z', '').split('.')[0]
  const d = new Date(base + 'Z')
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 16)
  const kst = new Date(d.getTime() + 9 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`
}

// 마지막 발송 시각 + 간격(분) → 다음 발송 예정 시각. 미발송이면 null(= 곧 발송).
export function nextSendAt(lastSentAt, intervalMinutes) {
  if (!lastSentAt) return null
  return new Date(new Date(lastSentAt).getTime() + intervalMinutes * 60_000)
}

// 다음 발송 시각을 "6월 12일 (금) 09:00 · 2일 후" 형태(KST)로. 1시간 이내는 "N분 후".
export function formatNextSend(next, now = new Date()) {
  if (!next) return '곧 발송'
  const diffMs = next.getTime() - now.getTime()
  if (diffMs <= 0) return '곧 발송'
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}분 후`

  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(next)
  const get = (t) => parts.find((p) => p.type === t)?.value
  const abs = `${get('month')}월 ${get('day')}일 (${get('weekday')}) ${get('hour')}:${get('minute')}`

  const rel = diffMin < 24 * 60
    ? `${Math.round(diffMin / 60)}시간 후`
    : `${Math.round(diffMin / (24 * 60))}일 후`
  return `${abs} · ${rel}`
}
