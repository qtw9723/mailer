// KST = UTC+9, DST 없음. UTC Date에 9시간 더해 KST 시계값을 구한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function toKst(date) {
  return new Date(date.getTime() + KST_OFFSET_MS)
}

export function kstHour(date) {
  return toKst(date).getUTCHours()
}

export function kstDateString(date) {
  return toKst(date).toISOString().slice(0, 10)
}

export function shouldSend(settings, now) {
  if (!settings.enabled) return { send: false, reason: 'disabled' }
  if (kstHour(now) !== settings.send_hour) return { send: false, reason: 'not-time' }
  if (settings.last_sent_date === kstDateString(now)) return { send: false, reason: 'already-sent' }
  return { send: true, reason: 'ok' }
}

// AI 분석 실행 여부. 발송과 분리 — 발송 시각 이후라면 오늘 분석이 성공할 때까지 매 tick 재시도.
// (발송은 하루 한 번이지만 분석은 일시 장애 시 같은 날 재시도되어야 하므로 정각 고정이 아닌 '이후' 조건)
export function shouldAnalyze(settings, now) {
  if (!settings.enabled) return { run: false, reason: 'disabled' }
  if (kstHour(now) < settings.send_hour) return { run: false, reason: 'before-hour' }
  if (settings.last_analysis_date === kstDateString(now)) return { run: false, reason: 'already-analyzed' }
  return { run: true, reason: 'ok' }
}
