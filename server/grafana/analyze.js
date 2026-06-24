// server/grafana/analyze.js
// 앱별 ERROR 로그를 Gemini로 분석해 (1) 점검 포인트 요약 + (2) 로그 유형 분류 결과를 만든다.
// 격리·테스트 가능: Gemini 호출은 model 주입으로 대체 가능. 파싱/정규화는 순수 함수.
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const MAX_ROWS_PER_APP = 30 // 프롬프트에 넣는 앱별 로그 상한(토큰 절약)

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
          logs: {
            type: SchemaType.ARRAY,
            description: '중복을 정리한 대표 로그 (최대 5개)',
            items: {
              type: SchemaType.OBJECT,
              properties: {
                time: { type: SchemaType.STRING },
                msg: { type: SchemaType.STRING },
              },
              required: ['msg'],
            },
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
        .map((r) => `  [${r.time}] ${r.msg}`).join('\n')
      return `## 앱: ${g.app} (총 ${g.count}건)\n${rows || '  (대표 로그 없음)'}`
    })
    .join('\n\n')

  return `당신은 운영 모니터링 보조자입니다. 아래는 최근 24시간 앱별 ERROR 로그입니다.
반복되는 동일/유사 로그는 하나의 유형으로 묶어 중복을 정리하고, 운영자가 솔루션에서 확인해야 할 핵심만 추려 주세요.

[기존 로그 유형] — 가능하면 아래 유형을 재사용(existingMatch에 동일 label 기입), 새로운 패턴만 신규 유형으로:
${typeList}

[로그]
${logBlocks}

요구사항:
- summary: 운영자가 오늘 점검할 포인트를 한국어 불릿 3~6개로 간단히(심각도 높은 것 우선). 각 불릿은 "- "로 시작하고 항목마다 줄바꿈(\\n)으로 구분.
- types: 로그를 유형별로 묶어 각 유형마다 label/description/app/count/logs(중복 정리 대표 로그 최대 5개) 작성.
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

function normalizeType(t) {
  if (!t || typeof t !== 'object') return null
  const label = String(t.label ?? '').trim()
  if (!label) return null
  const logs = Array.isArray(t.logs)
    ? t.logs.map((r) => ({ time: String(r?.time ?? ''), msg: String(r?.msg ?? '') })).filter((r) => r.msg).slice(0, 5)
    : []
  const count = Number.isFinite(t.count) ? Math.max(0, Math.trunc(t.count)) : logs.length
  return {
    label,
    description: String(t.description ?? '').trim(),
    app: String(t.app ?? '').trim(),
    count,
    existingMatch: String(t.existingMatch ?? '').trim(),
    logs,
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

// 로그 분석 실행. 분석 대상이 없으면 LLM 호출 없이 빈 결과.
// model 주입 시 그것을 사용(테스트/대체). 실패는 throw → 호출부에서 best-effort 처리.
export async function analyzeLogs(logs, existingTypes = [], model = null) {
  const groups = activeLogGroups(logs)
  if (!groups.length) return { summary: '', types: [] }
  const m = model ?? getModel()
  const result = await m.generateContent(buildAnalyzePrompt(groups, existingTypes))
  const text = typeof result?.response?.text === 'function' ? result.response.text() : (result?.response?.text ?? '')
  return parseAnalysis(text)
}
