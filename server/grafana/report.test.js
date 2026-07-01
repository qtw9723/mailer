// server/grafana/report.test.js
import { describe, it, expect } from 'vitest'
import {
  extractPromValue, normalizeEsIndex, fmtTimeKst, parseEsResponses, buildReport, buildEmailHtml, esLogRange,
  summaryToBullets, combineLogQueries, grafanaLogExploreUrl,
} from './report.js'

// panes= 파라미터를 디코드해 JSON으로 파싱
function parsePanes(url) {
  const m = url.match(/[?&]panes=([^&]+)/)
  return m ? JSON.parse(decodeURIComponent(m[1])) : null
}

describe('extractPromValue', () => {
  it('frames의 마지막 값 추출', () => {
    const resp = { results: { A: { frames: [{ data: { values: [[1700000000000], [13.7]] } }] } } }
    expect(extractPromValue(resp)).toBe(13.7)
  })
  it('frames 없으면 null', () => {
    expect(extractPromValue({ results: { A: { frames: [] } } })).toBeNull()
    expect(extractPromValue({})).toBeNull()
  })
})

describe('normalizeEsIndex', () => {
  it('[prefix]날짜 템플릿 → prefix*', () => {
    expect(normalizeEsIndex('[out_logs-]YYYY.MM.DD')).toBe('out_logs-*')
  })
  it('일반 문자열은 그대로', () => {
    expect(normalizeEsIndex('logs-*')).toBe('logs-*')
  })
})

describe('fmtTimeKst', () => {
  it('UTC ISO → KST(+9) YYYY-MM-DD HH:MM', () => {
    expect(fmtTimeKst('2026-06-03T07:37:49.123Z')).toBe('2026-06-03 16:37')
  })
  it('빈 값은 빈 문자열', () => {
    expect(fmtTimeKst('')).toBe('')
  })
})

describe('parseEsResponses', () => {
  it('앱별 count와 rows 파싱', () => {
    const responses = [
      { hits: { total: { value: 2 }, hits: [
        { _source: { '@timestamp': '2026-06-03T07:37:49Z', message: 'boom' } },
      ] } },
      { hits: { total: { value: 0 }, hits: [] } },
    ]
    const queries = [{ label: 'soe' }, { label: 'c3' }]
    const out = parseEsResponses(responses, queries, '@timestamp')
    expect(out.soe.count).toBe(2)
    expect(out.soe.rows[0]).toEqual({ time: '2026-06-03 16:37', ts: '2026-06-03T07:37:49Z', msg: 'boom' })
    expect(out.c3.count).toBe(0)
  })
  it('message 없으면 log→msg 순으로 폴백', () => {
    const responses = [{ hits: { total: { value: 1 }, hits: [{ _source: { '@timestamp': '', log: 'fromlog' } }] } }]
    const out = parseEsResponses(responses, [{ label: 'x' }], '@timestamp')
    expect(out.x.rows[0].msg).toBe('fromlog')
  })
})

describe('buildReport', () => {
  const base = {
    generatedAt: '2026-06-05T00:00:00.000Z',
    metrics: [
      { label: 'CPU', value: 13.7, threshold: 80, error: null },
      { label: 'MEM', value: 90, threshold: 85, error: null },
      { label: 'DISK', value: null, threshold: 85, error: '데이터 없음' },
    ],
    logs: [
      { app: 'soe', count: 1, rows: [], error: null },
      { app: 'c3', count: 0, rows: [], error: null },
    ],
  }
  it('임계 초과 메트릭 + 로그 1건 이상을 alerts로 합산', () => {
    const r = buildReport(base)
    expect(r.summary.alerts).toBe(2) // MEM 초과 + soe 1건
    expect(r.summary.status).toBe('alert')
  })
  it('over 플래그 계산', () => {
    const r = buildReport(base)
    expect(r.metrics.find(m => m.label === 'CPU').over).toBe(false)
    expect(r.metrics.find(m => m.label === 'MEM').over).toBe(true)
    expect(r.metrics.find(m => m.label === 'DISK').over).toBe(false)
  })
  it('이상 0건이면 status ok', () => {
    const r = buildReport({ generatedAt: 'x', metrics: [{ label: 'CPU', value: 1, threshold: 80, error: null }], logs: [] })
    expect(r.summary).toEqual({ alerts: 0, status: 'ok' })
  })
})

describe('buildEmailHtml', () => {
  const baseReport = (over = {}) => buildReport({
    generatedAt: '2026-06-05T00:00:00.000Z',
    metrics: [{ label: 'CPU', value: 13.7, threshold: 80, error: null }],
    logs: [{ app: 'soe', count: 1, rows: [{ time: '2026-06-03 16:37', msg: 'boom' }], error: null }],
    ...over,
  })

  it('요약과 앱 라벨/메시지가 포함된 HTML 반환', () => {
    const html = buildEmailHtml(baseReport())
    expect(html).toContain('<html')
    expect(html).toContain('이상 1건')
    expect(html).toContain('soe')
    expect(html).toContain('boom')
  })

  it('새 디자인 요소 포함(그림자/부제/섹션타이틀/테이블헤더)', () => {
    const html = buildEmailHtml(baseReport())
    expect(html).toContain('box-shadow')
    expect(html).toContain('지난 24시간 모니터링 현황')
    expect(html).toContain('📈 리소스 사용량')
    expect(html).toContain('🔍 ERROR 로그')
    expect(html).toContain('>항목<')
    expect(html).toContain('>시간<')
    expect(html).toContain('>메시지<')
  })

  it('날짜를 KST 한국어 형식으로 표시', () => {
    const html = buildEmailHtml(baseReport())
    expect(html).toContain('2026년 06월 05일 09:00')
    expect(html).toContain('(KST)')
  })

  it('로그가 20건 초과면 "외 N건" 행 표시', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ time: `t${i}`, msg: `m${i}` }))
    const html = buildEmailHtml(baseReport({ logs: [{ app: 'soe', count: 25, rows, error: null }] }))
    expect(html).toContain('외 5건')
  })

  it('로그가 20건 이하면 "외" 초과행 없음', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ time: `t${i}`, msg: `m${i}` }))
    const html = buildEmailHtml(baseReport({ logs: [{ app: 'soe', count: 20, rows, error: null }] }))
    expect(html).not.toContain('외 ')
  })

  it('메시지가 500자 초과면 앞 500자만 + 잘림 표시', () => {
    const msg = 'x'.repeat(600)
    const html = buildEmailHtml(baseReport({ logs: [{ app: 'soe', count: 1, rows: [{ time: 't', msg }], error: null }] }))
    expect(html).toContain('x'.repeat(500))       // 앞부분 표시
    expect(html).not.toContain('x'.repeat(600))    // 전문은 미표시
    expect(html).toContain('[뒤 100자 생략]')       // 잘림 표시(잘린 글자수)
  })

  it('메시지가 500자 이하면 잘림 표시 없이 전문', () => {
    const msg = 'y'.repeat(500)
    const html = buildEmailHtml(baseReport({ logs: [{ app: 'soe', count: 1, rows: [{ time: 't', msg }], error: null }] }))
    expect(html).toContain('y'.repeat(500))
    expect(html).not.toContain('자 생략')
  })

  it('링크 주어지면 리포트/그라파나 버튼 href 포함(& 이스케이프)', () => {
    const html = buildEmailHtml(baseReport(), '', {
      reportUrl: 'https://mailer-two-chi.vercel.app/grafana',
      grafanaUrl: 'https://grafana.next-ti.ai/explore?a=1&b=2',
    })
    expect(html).toContain('href="https://mailer-two-chi.vercel.app/grafana"')
    expect(html).toContain('href="https://grafana.next-ti.ai/explore?a=1&amp;b=2"')
    expect(html).toContain('리포트 페이지')
    expect(html).toContain('Grafana')
  })

  it('링크 미제공이면 버튼 미포함', () => {
    const html = buildEmailHtml(baseReport())
    expect(html).not.toContain('리포트 페이지')
    expect(html).not.toContain('href=')
  })

  it('로그 그룹 에러는 메시지 표기하고 행 테이블 없음', () => {
    const html = buildEmailHtml(baseReport({ logs: [{ app: 'soe', count: 0, rows: [], error: 'ES 조회 실패' }] }))
    expect(html).toContain('ES 조회 실패')
    // 로그 테이블은 시간/메시지 헤더로 식별됨 — 에러 그룹이면 렌더되지 않아야 함 (리소스 테이블의 항목/값/임계 헤더는 별개로 존재)
    expect(html).not.toContain('>시간<')
  })

  it('메트릭 에러는 ○ 아이콘과 에러문구 표기', () => {
    const html = buildEmailHtml(baseReport({ metrics: [{ label: 'CPU', value: null, threshold: 80, error: 'PromQL 오류' }] }))
    expect(html).toContain('○')
    expect(html).toContain('PromQL 오류')
  })

  it('메시지를 HTML 이스케이프', () => {
    const html = buildEmailHtml(baseReport({ logs: [{ app: 'soe', count: 1, rows: [{ time: 't', msg: '<script>x</script>' }], error: null }] }))
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>x')
  })
  it('summary 주어지면 AI 점검 요약 블록 포함(불릿 정리·이스케이프)', () => {
    const html = buildEmailHtml(baseReport(), '- 점검A\n- <b>점검B</b>')
    expect(html).toContain('AI 점검 요약')
    expect(html).toContain('<li')
    expect(html).toContain('점검A')
    expect(html).toContain('&lt;b&gt;점검B')
  })
  it('summary 비면 요약 블록 없음', () => {
    expect(buildEmailHtml(baseReport(), '')).not.toContain('AI 점검 요약')
  })
})

describe('summaryToBullets', () => {
  it('줄바꿈으로 구분된 불릿을 항목 배열로', () => {
    expect(summaryToBullets('- 점검A\n- 점검B\n* 점검C')).toEqual(['점검A', '점검B', '점검C'])
  })
  it('한 줄로 뭉친 응답은 " - "/" • " 구분자로 분해', () => {
    expect(summaryToBullets('- 점검A - 점검B • 점검C')).toEqual(['점검A', '점검B', '점검C'])
  })
  it('불릿 마커 없는 한 줄은 단일 항목', () => {
    expect(summaryToBullets('단일 점검 항목')).toEqual(['단일 점검 항목'])
  })
  it('빈 값/공백은 빈 배열', () => {
    expect(summaryToBullets('')).toEqual([])
    expect(summaryToBullets(null)).toEqual([])
    expect(summaryToBullets('   ')).toEqual([])
  })
})

describe('combineLogQueries', () => {
  it('활성 쿼리를 괄호로 감싸 OR로 결합', () => {
    const out = combineLogQueries([
      { label: 'soe', query: 'app.keyword:"soe" && error' },
      { label: 'c3', query: 'app.keyword:"c3" && error' },
    ])
    expect(out).toBe('(app.keyword:"soe" && error) OR (app.keyword:"c3" && error)')
  })
  it('enabled:false 는 제외', () => {
    const out = combineLogQueries([
      { label: 'soe', query: 'app.keyword:"soe" && error' },
      { label: 'c3', query: 'app.keyword:"c3" && error', enabled: false },
    ])
    expect(out).toBe('(app.keyword:"soe" && error)')
  })
  it('활성 쿼리가 없으면 빈 문자열', () => {
    expect(combineLogQueries([])).toBe('')
    expect(combineLogQueries([{ label: 'x', query: 'y', enabled: false }])).toBe('')
    expect(combineLogQueries(null)).toBe('')
  })
})

describe('grafanaLogExploreUrl', () => {
  const base = 'https://grafana.next-ti.ai'
  const esUid = 'ff6mo4stnwc1sa'

  it('base/explore + schemaVersion + panes 포함', () => {
    const url = grafanaLogExploreUrl({ base, esUid, query: 'app.keyword:"soe" && error' })
    expect(url.startsWith('https://grafana.next-ti.ai/explore?')).toBe(true)
    expect(url).toContain('schemaVersion=1')
    expect(url).toContain('orgId=1')
    expect(url).toContain('panes=')
  })
  it('panes에 결합 쿼리·ES uid·로그 뷰·24시간 범위가 담김', () => {
    const query = '(app.keyword:"soe" && error) OR (app.keyword:"c3" && error)'
    const panes = parsePanes(grafanaLogExploreUrl({ base, esUid, query }))
    const pane = Object.values(panes)[0]
    expect(pane.queries[0].query).toBe(query)
    expect(pane.queries[0].datasource.uid).toBe(esUid)
    expect(pane.queries[0].metrics[0].type).toBe('logs')
    expect(pane.range).toEqual({ from: 'now-24h', to: 'now' })
    expect(pane.panelsState.logs.visualisationType).toBe('table')
  })
  it('base나 esUid 없으면 빈 문자열', () => {
    expect(grafanaLogExploreUrl({ base: '', esUid, query: 'x' })).toBe('')
    expect(grafanaLogExploreUrl({ base, esUid: '', query: 'x' })).toBe('')
  })
  it('base 끝 슬래시 정규화', () => {
    const url = grafanaLogExploreUrl({ base: base + '/', esUid, query: 'x' })
    expect(url.startsWith('https://grafana.next-ti.ai/explore?')).toBe(true)
  })
})

describe('esLogRange', () => {
  it('lagHours=0이면 now-24h ~ now', () => {
    expect(esLogRange(24, 0)).toEqual({ gte: 'now-24h', lte: 'now' })
  })
  it('lagHours=3이면 now-27h ~ now-3h', () => {
    expect(esLogRange(24, 3)).toEqual({ gte: 'now-27h', lte: 'now-3h' })
  })
  it('lagHours 기본값은 0', () => {
    expect(esLogRange(24)).toEqual({ gte: 'now-24h', lte: 'now' })
  })
  it('lagHours=24면 now-48h ~ now-24h', () => {
    expect(esLogRange(24, 24)).toEqual({ gte: 'now-48h', lte: 'now-24h' })
  })
})
