-- 그라파나 LLM 로그 분석: 영속 로그 유형 + 회차별 로그 + 설정의 최신 분석 캐시
-- 적용: Management API(SUPABASE_ACCESS_TOKEN)로 멱등 실행. db push 금지(히스토리 divergence)
CREATE TABLE IF NOT EXISTS grafana_log_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL,
  description  TEXT,                 -- LLM이 정리한 유형 설명/점검 포인트
  note         TEXT,                 -- 사용자 편집 노트
  total_count  INT  NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grafana_log_type_runs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_id    UUID NOT NULL REFERENCES grafana_log_types(id) ON DELETE CASCADE,
  run_at     TIMESTAMPTZ NOT NULL,
  app        TEXT,
  count      INT NOT NULL DEFAULT 0,                 -- 이 회차에서 이 유형이 대표한 원시 로그 수
  logs       JSONB NOT NULL DEFAULT '[]'::jsonb,     -- LLM이 중복정리한 대표 로그 [{time,msg}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grafana_log_type_runs ON grafana_log_type_runs (type_id, run_at DESC);

ALTER TABLE grafana_report_settings ADD COLUMN IF NOT EXISTS last_analysis JSONB;
