-- grafana_report_settings에 모니터링 쿼리 저장 컬럼 추가.
-- metrics: [{label, query, threshold, enabled}], log_queries: [{label, query, enabled}]
-- 비어 있으면(기본 '[]') 앱이 config.js의 DEFAULT_METRICS/DEFAULT_LOG_QUERIES로 폴백한다.
ALTER TABLE grafana_report_settings
  ADD COLUMN IF NOT EXISTS metrics     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS log_queries JSONB NOT NULL DEFAULT '[]'::jsonb;
