// server/grafana/report.js

// Prometheus /api/ds/query 응답에서 마지막 값 추출
export function extractPromValue(resp) {
  try {
    const frames = resp?.results?.A?.frames
    if (!frames || !frames.length) return null
    const values = frames[0]?.data?.values
    if (!values || !values.length) return null
    const lastCol = values[values.length - 1]
    return lastCol && lastCol.length ? lastCol[lastCol.length - 1] : null
  } catch {
    return null
  }
}

// Grafana ES 인덱스 템플릿 [prefix]YYYY.MM.DD → prefix*
export function normalizeEsIndex(index) {
  return String(index).replace(/\[([^\]]+)\].*/, '$1*')
}

// UTC ISO → KST(+9) "YYYY-MM-DD HH:MM"
export function fmtTimeKst(ts) {
  if (!ts) return ''
  try {
    const base = String(ts).replace('Z', '').split('.')[0]
    const d = new Date(base + 'Z')
    if (Number.isNaN(d.getTime())) return String(ts).slice(0, 16)
    const kst = new Date(d.getTime() + 9 * 3600 * 1000)
    const p = (n) => String(n).padStart(2, '0')
    return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`
  } catch {
    return String(ts).slice(0, 16)
  }
}

// _msearch responses[] → {label: {count, rows}}
export function parseEsResponses(responses, queries, timefield) {
  const out = {}
  for (let i = 0; i < queries.length; i++) {
    const resp = responses[i] || {}
    const hits = resp.hits || {}
    const total = hits.total
    const count = (total && typeof total === 'object') ? (total.value || 0) : (total || 0)
    const rows = (hits.hits || []).map((h) => {
      const src = h._source || {}
      const ts = src[timefield] || ''
      const msg = src.message || src.log || src.msg || JSON.stringify(src)
      return { time: fmtTimeKst(String(ts)), msg: String(msg) }
    })
    out[queries[i].label] = { count, rows }
  }
  return out
}

// 수집된 원시 결과 → 최종 리포트 JSON (요약/over/alerts 계산)
export function buildReport({ metrics, logs, generatedAt }) {
  let alerts = 0
  const m = metrics.map((x) => {
    let over = false
    if (x.error == null && x.value != null) {
      const v = Number(x.value)
      over = !Number.isNaN(v) && v > x.threshold
    }
    if (over) alerts++
    return { label: x.label, value: x.value ?? null, threshold: x.threshold, over, error: x.error ?? null }
  })
  const l = logs.map((x) => {
    if (!x.error && x.count) alerts++
    return { app: x.app, count: x.count ?? 0, rows: x.rows ?? [], error: x.error ?? null }
  })
  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    summary: { alerts, status: alerts ? 'alert' : 'ok' },
    metrics: m,
    logs: l,
  }
}

// 이메일용 HTML (라이트 테마, 메일 클라이언트 호환)
export function buildEmailHtml(report) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const alerts = report.summary.alerts
  const summaryText = alerts ? `⚠️ 이상 ${alerts}건 — 점검 필요` : '✅ 정상'
  const sc = alerts ? '#c62828' : '#2e7d32'

  const metricRows = report.metrics.map((m) => {
    const v = m.error ? m.error : (m.value == null ? '데이터 없음' : (typeof m.value === 'number' ? m.value.toFixed(1) : m.value))
    const mark = m.over ? '⚠' : (m.error || m.value == null ? '○' : '✓')
    return `<tr><td>${mark} ${esc(m.label)}</td><td style="text-align:right">${esc(v)}</td><td style="text-align:right">${m.threshold}</td></tr>`
  }).join('')

  const logBlocks = report.logs.map((g) => {
    const mark = g.count ? '⚠' : '✓'
    const head = `<div style="margin:10px 0 6px"><strong>${mark} ${esc(g.app)}</strong>: ${g.error ? esc(g.error) : g.count + '건'}</div>`
    if (!g.count || g.error) return head
    const rows = g.rows.slice(0, 5).map((r) => `<tr><td style="color:#999;font-size:12px">${esc(r.time)}</td><td>${esc(r.msg.slice(0, 150))}</td></tr>`).join('')
    return head + `<table style="width:100%;border-collapse:collapse">${rows}</table>`
  }).join('')

  return `<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;padding:20px">
<div style="max-width:800px;margin:0 auto;background:#fff;padding:20px;border-radius:8px">
<h1 style="font-size:22px;margin:0 0 6px">📊 그라파나 모니터링 보고서</h1>
<div style="color:#666;font-size:13px;margin-bottom:16px">${esc(fmtTimeKst(report.generatedAt))} (KST)</div>
<div style="padding:12px;border-radius:6px;font-weight:bold;color:${sc};background:${alerts ? '#ffebee' : '#e8f5e9'};border-left:4px solid ${sc};margin-bottom:18px">${summaryText}</div>
<div style="font-weight:bold;margin-bottom:8px">📈 리소스 사용량</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tr><th style="text-align:left">항목</th><th style="text-align:right">값</th><th style="text-align:right">임계</th></tr>${metricRows}</table>
<div style="font-weight:bold;margin-bottom:4px">🔍 ERROR 로그 (앱별)</div>${logBlocks}
</div></body></html>`
}
