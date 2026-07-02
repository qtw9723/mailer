-- grafana_log_types에 AI 관찰 메모 칸 추가.
-- 사용자 메모(note)와 분리: AI 분석이 회차마다 갱신하는 읽기 전용(웹에서) 메모.
ALTER TABLE grafana_log_types ADD COLUMN IF NOT EXISTS ai_note TEXT;
