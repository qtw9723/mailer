// server/grafana/logTypes.js
// 영속 로그 유형 + 회차별 집계 + 개별 로그(entries) 저장/조회. 유형은 누적, 노트는 유형에 고정.
import db from '../db.js'
import { activeLogGroups, appRowIndex } from './analyze.js'
import { kstDateString } from './schedule.js'

const TYPES = 'grafana_log_types'
const RUNS = 'grafana_log_type_runs'
const ENTRIES = 'grafana_log_entries'

export async function listTypes() {
  const { data, error } = await db
    .from(TYPES)
    .select('*')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

// 유형 목록 + 최근 회차 추세(recentRuns). AI 분석 프롬프트용.
// runs는 유형별 N+1 대신 최근 days일치를 일괄 조회해 유형별·KST 날짜별로 합산
// (같은 유형이 앱별로 하루 여러 run을 가질 수 있음). 최신 날짜부터 maxPoints개.
// 추세 조회 실패는 분석을 막지 않도록 recentRuns: []로 폴백.
export async function listTypesWithHistory({ days = 14, maxPoints = 5 } = {}) {
  const types = await listTypes()
  if (!types.length) return types
  let runs = []
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const { data, error } = await db
      .from(RUNS)
      .select('type_id, run_at, count')
      .gte('run_at', since)
      .order('run_at', { ascending: false })
    if (error) throw error
    runs = data ?? []
  } catch {
    return types.map((t) => ({ ...t, recentRuns: [] }))
  }
  // run_at desc 입력이므로 Map 삽입 순서가 곧 최신 날짜순.
  const byType = new Map()
  for (const r of runs) {
    const date = kstDateString(new Date(r.run_at))
    let dates = byType.get(r.type_id)
    if (!dates) { dates = new Map(); byType.set(r.type_id, dates) }
    dates.set(date, (dates.get(date) ?? 0) + (r.count ?? 0))
  }
  return types.map((t) => ({
    ...t,
    recentRuns: [...(byType.get(t.id) ?? new Map()).entries()]
      .slice(0, maxPoints)
      .map(([date, count]) => ({ date, count })),
  }))
}

export async function getType(id) {
  const { data: type, error } = await db.from(TYPES).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!type) return null
  const { data: runs, error: e2 } = await db
    .from(RUNS).select('*').eq('type_id', id).order('run_at', { ascending: false }).limit(100)
  if (e2) throw e2
  // 개별 로그 발생 이력(타임라인). 최신순, 넉넉히 1000건.
  const { data: entries, error: e3 } = await db
    .from(ENTRIES).select('*').eq('type_id', id).order('occurred_at', { ascending: false, nullsFirst: false }).limit(1000)
  if (e3) throw e3
  return { ...type, runs: runs ?? [], entries: entries ?? [] }
}

export async function updateType(id, fields) {
  const allowed = ['note', 'label', 'description']
  const update = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (fields[k] !== undefined) update[k] = fields[k]
  const { data, error } = await db.from(TYPES).update(update).eq('id', id).select('*')
  if (error) throw error
  if (!data?.length) return null
  return data[0]
}

export async function deleteType(id) {
  const { error } = await db.from(TYPES).delete().eq('id', id)
  if (error) throw error
}

// 회차별 메모 저장. note=null/'' 도 허용(메모 삭제).
export async function updateRun(id, note) {
  const { data, error } = await db.from(RUNS).update({ note }).eq('id', id).select('*')
  if (error) throw error
  if (!data?.length) return null
  return data[0]
}

// 분석 결과의 types[]를 영속 유형에 반영(기존 매칭 or 신규 생성) + 회차 집계 적재 +
// rows[] 인덱스를 ES 원본 행으로 되살려 개별 로그(entries) 적재 + 누적 갱신.
// logs: gatherReportData가 준 원시 그룹(app/rows 포함). rows 인덱스 매핑 기준.
export async function resolveAndPersist(analysis, runAt, logs = []) {
  const rowsByApp = appRowIndex(activeLogGroups(logs))
  const existing = await listTypes()
  const byLabel = new Map(existing.map((t) => [t.label, t]))

  for (const at of analysis?.types ?? []) {
    let type = (at.existingMatch && byLabel.get(at.existingMatch)) || byLabel.get(at.label)
    if (!type) {
      const { data, error } = await db
        .from(TYPES)
        .insert({ label: at.label, description: at.description || null, ai_note: at.aiNote || null })
        .select('*')
        .single()
      if (error) throw error
      type = data
      byLabel.set(type.label, type)
    }

    const { data: run, error: e1 } = await db.from(RUNS).insert({
      type_id: type.id, run_at: runAt, app: at.app || null, count: at.count ?? 0,
    }).select('id').single()
    if (e1) throw e1

    // rows 인덱스 → 해당 앱 원본 행. 범위 밖 인덱스는 무시. 시각·메시지는 ES 원본 그대로.
    const appRows = rowsByApp.get(at.app) ?? []
    const entries = (at.rows ?? [])
      .filter((i) => i < appRows.length)
      .map((i) => appRows[i])
      .map((r) => ({ type_id: type.id, run_id: run.id, app: at.app || null, occurred_at: r.ts || null, msg: r.msg }))
    if (entries.length) {
      const { error: eE } = await db.from(ENTRIES).insert(entries)
      if (eE) throw eE
    }

    const nextTotal = (type.total_count ?? 0) + (at.count ?? 0)
    const { error: e2 } = await db.from(TYPES).update({
      total_count: nextTotal,
      last_seen_at: runAt,
      description: at.description || type.description || null,
      // AI 관찰 메모: 이번 회차에 내용이 있을 때만 교체(빈 문자열 → 기존 유지)
      ...(at.aiNote ? { ai_note: at.aiNote } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', type.id)
    if (e2) throw e2
    type.total_count = nextTotal // 같은 label이 또 나오면 누적 유지
  }
}
