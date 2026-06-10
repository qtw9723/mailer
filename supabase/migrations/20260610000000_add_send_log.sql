-- send_log: 작업별 발송 성공/실패 이력 (하트비트 바)
-- 적용: Supabase SQL Editor에서 직접 실행 (db push 금지 — 히스토리 divergence)
CREATE TABLE IF NOT EXISTS send_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES mail_jobs(id) ON DELETE CASCADE,
  ok BOOLEAN NOT NULL,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_send_log_job_sent ON send_log (job_id, sent_at DESC);
