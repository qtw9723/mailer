// server/grafana/config.js
// 모니터링 쿼리 기본값(시드 겸 폴백). 실제 런타임 값은 grafana_report_settings 설정에서 읽는다.

export const DEFAULT_METRICS = [
  { label: 'CPU 사용률(최대, %)',
    query: 'max(max_over_time((100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))[24h:5m]))',
    threshold: 80, enabled: true },
  { label: '메모리 사용률(최대, %)',
    query: 'max(max_over_time(((1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100)[24h:5m]))',
    threshold: 85, enabled: true },
  { label: '디스크 사용률(최대, %)',
    query: 'max(max_over_time(((1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"} / node_filesystem_size_bytes)) * 100)[24h:5m]))',
    threshold: 85, enabled: true },
  { label: '비정상 상태 Pod 수',
    query: 'max(max_over_time(sum(kube_pod_status_phase{phase=~"Pending|Failed|Unknown"})[24h:5m]))',
    threshold: 0, enabled: true },
  { label: '최근 24시간 Pod 재시작 횟수',
    query: 'sum(increase(kube_pod_container_status_restarts_total[24h]))',
    threshold: 0, enabled: true },
]

export const DEFAULT_LOG_QUERIES = [
  { label: 'chatbot',  query: 'app.keyword:"chatbot" && error', enabled: true },
  { label: 'soe',      query: 'app.keyword:"soe" && error', enabled: true },
  { label: 'c3',       query: 'app.keyword:"c3" && error', enabled: true },
  { label: 'webhook',  query: 'app.keyword:"webhook" && error', enabled: true },
  { label: 'docstore', query: 'app.keyword:"docstore" && error', enabled: true },
]

export const LOG_HOURS = 24
export const LOG_FETCH = 50
export const LOG_SHOW = 5

// 로그 적재 지연 보정 기본값(시간). 설정(log_lag_hours)이 없을 때의 폴백.
export const LOG_INDEX_LAG_HOURS = 3

// 활성(enabled !== false) 항목만 남긴다.
export function activeQueries(items) {
  return (items ?? []).filter((q) => q.enabled !== false)
}

// 설정 행의 metrics/log_queries가 비어 있으면 기본값으로 채워 반환.
export function withQueryDefaults(row) {
  return {
    ...row,
    metrics: row?.metrics?.length ? row.metrics : DEFAULT_METRICS,
    log_queries: row?.log_queries?.length ? row.log_queries : DEFAULT_LOG_QUERIES,
  }
}
