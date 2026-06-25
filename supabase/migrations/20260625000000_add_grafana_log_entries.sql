-- 그라파나 로그 유형: 개별 로그(occurrence) 정규화 저장
-- LLM은 분류(rows 인덱스)만, 시각·메시지는 ES 원본을 그대로 저장 → 모든 발생 시각 보존
-- 적용: Management API(SUPABASE_ACCESS_TOKEN)로 멱등 실행. db push 금지(히스토리 divergence)
CREATE TABLE IF NOT EXISTS grafana_log_entries (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_id     UUID   NOT NULL REFERENCES grafana_log_types(id)     ON DELETE CASCADE,
  run_id      BIGINT NOT NULL REFERENCES grafana_log_type_runs(id) ON DELETE CASCADE,
  app         TEXT,
  occurred_at TIMESTAMPTZ,                         -- ES 원본 시각(ground-truth)
  msg         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gle_type_time ON grafana_log_entries (type_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_gle_run       ON grafana_log_entries (run_id);
