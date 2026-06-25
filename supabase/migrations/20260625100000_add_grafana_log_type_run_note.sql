-- 그라파나 로그 유형: 회차별 메모. 회차별 보기에서 운영자가 그 회차에 대한 노트 작성.
-- 적용: Management API(SUPABASE_ACCESS_TOKEN)로 멱등 실행. db push 금지(히스토리 divergence)
ALTER TABLE grafana_log_type_runs ADD COLUMN IF NOT EXISTS note TEXT;
