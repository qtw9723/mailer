// server/grafana/logTypes.js
// 영속 로그 유형 + 회차별 집계 + 개별 로그(entries) 저장/조회. 유형은 누적, 노트는 유형에 고정.
import db from '../db.js'
import { activeLogGroups, appRowIndex } from './analyze.js'

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
        .insert({ label: at.label, description: at.description || null })
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
      updated_at: new Date().toISOString(),
    }).eq('id', type.id)
    if (e2) throw e2
    type.total_count = nextTotal // 같은 label이 또 나오면 누적 유지
  }
}
