// server/grafana/analyze.js
// 앱별 ERROR 로그를 Gemini로 분석해 (1) 점검 포인트 요약 + (2) 로그 유형 분류 결과를 만든다.
// 격리·테스트 가능: Gemini 호출은 model 주입으로 대체 가능. 파싱/정규화는 순수 함수.
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
// 프롬프트에 넣고 분류 대상이 되는 앱별 로그 상한. LOG_FETCH(50)와 맞춰 가져온 행 전부를
// 유형에 매핑 가능하게 한다. 이 목록의 #번호가 곧 응답 rows[]의 인덱스.
export const MAX_ROWS_PER_APP = 50

// 앱 → 프롬프트에 노출한(=rows 인덱스 기준이 되는) 행 목록. 프롬프트/적재가 동일하게 사용.
export function appRowIndex(groups) {
  const m = new Map()
  for (const g of groups ?? []) m.set(g.app, (g.rows ?? []).slice(0, MAX_ROWS_PER_APP))
  return m
}

export const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING, description: '운영자가 점검해야 할 포인트를 한국어 불릿으로 간단히. 이상 없으면 그렇게 적기.' },
    types: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          label: { type: SchemaType.STRING, description: '로그 유형의 짧은 이름' },
          description: { type: SchemaType.STRING, description: '이 유형이 무엇이고 솔루션에서 무엇을 확인해야 하는지' },
          app: { type: SchemaType.STRING, description: '해당 앱 이름' },
          count: { type: SchemaType.INTEGER, description: '이 유형이 대표하는 원시 로그 수' },
          existingMatch: { type: SchemaType.STRING, description: '기존 유형 목록 중 동일하면 그 label, 아니면 빈 문자열' },
          rows: {
            type: SchemaType.ARRAY,
            description: '이 유형에 속한 원시 로그의 번호(해당 앱 로그 목록의 #번호). 같은 메시지가 3번이면 번호 3개를 모두 나열.',
            items: { type: SchemaType.INTEGER },
          },
        },
        required: ['label', 'app', 'count'],
      },
    },
  },
  required: ['summary', 'types'],
}

// 분석 대상이 있는 앱만 추림(에러난 그룹·빈 그룹 제외).
export function activeLogGroups(logs) {
  return (logs ?? []).filter((g) => !g.error && (g.count > 0 || (g.rows && g.rows.length)))
}

// 프롬프트 구성. 기존 유형 목록을 주입해 유형명 일관성을 유지한다.
export function buildAnalyzePrompt(groups, existingTypes = []) {
  const typeList = (existingTypes ?? [])
    .map((t) => `- ${t.label}${t.description ? `: ${t.description}` : ''}`)
    .join('\n') || '(아직 없음)'
  const logBlocks = groups
    .map((g) => {
      const rows = (g.rows ?? []).slice(0, MAX_ROWS_PER_APP)
        .map((r, i) => `  [#${i}] [${r.time}] ${r.msg}`).join('\n')
      return `## 앱: ${g.app} (총 ${g.count}건)\n${rows || '  (로그 없음)'}`
    })
    .join('\n\n')

  return `당신은 운영 모니터링 보조자입니다. 아래는 최근 24시간 앱별 ERROR 로그입니다. 각 로그 앞 [#번호]는 그 앱 안에서의 로그 번호입니다.
반복되는 동일/유사 로그를 하나의 유형으로 묶어 분류하고, 운영자가 솔루션에서 확인해야 할 핵심만 추려 주세요.

[기존 로그 유형] — 가능하면 아래 유형을 재사용(existingMatch에 동일 label 기입), 새로운 패턴만 신규 유형으로:
${typeList}

[로그]
${logBlocks}

요구사항:
- summary: 운영자가 오늘 점검할 포인트를 한국어 불릿 3~6개로 간단히(심각도 높은 것 우선). 각 불릿은 "- "로 시작하고 항목마다 줄바꿈(\\n)으로 구분.
- types: 로그를 유형별로 묶어 각 유형마다 label/description/app/count/rows 작성.
- rows: 그 유형에 속한 로그의 [#번호]를 모두 나열(해당 앱 기준). 같은 메시지가 3번 나오면 번호 3개 모두 포함. 한 번호는 한 유형에만.
- count: 그 유형의 총 발생 추정 건수(앱 총 건수가 표시 행보다 많을 수 있음).
- 추측성 과장 금지. 실제 로그에 근거할 것.`
}

// Gemini 응답 텍스트(JSON) → { summary, types[] } 방어적 정규화.
export function parseAnalysis(text) {
  let obj
  try { obj = JSON.parse(text) } catch { return { summary: '', types: [] } }
  const summary = typeof obj?.summary === 'string' ? obj.summary : ''
  const types = Array.isArray(obj?.types)
    ? obj.types.map(normalizeType).filter(Boolean)
    : []
  return { summary, types }
}

// rows[]: 정수 인덱스만 추려 음수 제거·중복 제거. 범위 밖 인덱스는 적재 단계에서 무시.
function normalizeRows(rows) {
  if (!Array.isArray(rows)) return []
  const seen = new Set()
  const out = []
  for (const v of rows) {
    const n = Math.trunc(Number(v))
    if (Number.isInteger(n) && n >= 0 && !seen.has(n)) { seen.add(n); out.push(n) }
  }
  return out
}

function normalizeType(t) {
  if (!t || typeof t !== 'object') return null
  const label = String(t.label ?? '').trim()
  if (!label) return null
  const rows = normalizeRows(t.rows)
  const count = Number.isFinite(t.count) ? Math.max(0, Math.trunc(t.count)) : rows.length
  return {
    label,
    description: String(t.description ?? '').trim(),
    app: String(t.app ?? '').trim(),
    count,
    existingMatch: String(t.existingMatch ?? '').trim(),
    rows,
  }
}

// Gemini 모델 핸들 생성(키 없으면 throw). 테스트에서는 model 주입으로 대체.
export function getModel() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY 미설정')
  const genai = new GoogleGenerativeAI(key)
  return genai.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  })
}

// Gemini 일시 장애(과부하/속도제한/네트워크)인지 판정. 설정 오류(키 없음)는 재시도 무의미.
export function isRetryableError(e) {
  const msg = String(e?.message ?? '')
  if (/GEMINI_API_KEY/.test(msg)) return false
  return /\b(429|500|502|503|504)\b/.test(msg) ||
    /overload|high demand|unavailable|temporar|rate ?limit|deadline|timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed/i.test(msg)
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 일시 오류에 한해 지수 백오프 재시도. 그 외 오류는 즉시 전파.
// sleep 주입으로 테스트에서 실제 대기 없이 검증 가능.
export async function withRetry(fn, { retries = 3, baseDelayMs = 1000, sleep = defaultSleep, isRetryable = isRetryableError } = {}) {
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e
      await sleep(baseDelayMs * 2 ** attempt)
      attempt++
    }
  }
}

// 로그 분석 실행. 분석 대상이 없으면 LLM 호출 없이 빈 결과.
// model 주입 시 그것을 사용(테스트/대체). Gemini 일시 장애는 재시도(opts.retry로 조정).
// 재시도까지 실패하면 throw → 호출부에서 best-effort 처리.
export async function analyzeLogs(logs, existingTypes = [], model = null, opts = {}) {
  const groups = activeLogGroups(logs)
  if (!groups.length) return { summary: '', types: [] }
  const m = model ?? getModel()
  const prompt = buildAnalyzePrompt(groups, existingTypes)
  const result = await withRetry(() => m.generateContent(prompt), opts.retry)
  const text = typeof result?.response?.text === 'function' ? result.response.text() : (result?.response?.text ?? '')
  return parseAnalysis(text)
}
