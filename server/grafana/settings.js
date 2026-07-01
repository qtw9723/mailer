import db from '../db.js'
import { withQueryDefaults } from './config.js'

const TABLE = 'grafana_report_settings'
const SINGLETON_ID = 1

// 싱글톤 행 조회. 없으면 기본값으로 생성 후 반환. metrics/log_queries는 비어 있으면 기본값으로 채움.
export async function getSettings() {
  const { data, error } = await db.from(TABLE).select('*').eq('id', SINGLETON_ID).maybeSingle()
  if (error) throw error
  if (data) return withQueryDefaults(data)

  const { data: created, error: insErr } = await db
    .from(TABLE)
    .insert({ id: SINGLETON_ID })
    .select('*')
    .single()
  if (insErr) throw insErr
  return withQueryDefaults(created)
}

// 제공된 필드만 저장(undefined 키는 건드리지 않음 — 부분 업데이트).
export async function saveSettings(fields) {
  const allowed = ['recipients', 'send_hour', 'enabled', 'log_lag_hours', 'metrics', 'log_queries', 'last_analysis', 'last_analysis_date']
  const update = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (fields[k] !== undefined) update[k] = fields[k]

  const { data, error } = await db
    .from(TABLE)
    .update(update)
    .eq('id', SINGLETON_ID)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// 발송 성공 후 마지막 발송 날짜 기록.
export async function markSent(dateStr) {
  const { error } = await db
    .from(TABLE)
    .update({ last_sent_date: dateStr })
    .eq('id', SINGLETON_ID)
  if (error) throw error
}
