// server/grafana/logTypes.js
// 영속 로그 유형 + 회차별 로그 저장/조회. 유형은 누적, 노트는 유형에 고정.
import db from '../db.js'

const TYPES = 'grafana_log_types'
const RUNS = 'grafana_log_type_runs'

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
  return { ...type, runs: runs ?? [] }
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

// 분석 결과의 types[]를 영속 유형에 반영(기존 매칭 or 신규 생성) + 회차 적재 + 누적 갱신.
export async function resolveAndPersist(analysis, runAt) {
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

    const { error: e1 } = await db.from(RUNS).insert({
      type_id: type.id, run_at: runAt, app: at.app || null, count: at.count ?? 0, logs: at.logs ?? [],
    })
    if (e1) throw e1

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
