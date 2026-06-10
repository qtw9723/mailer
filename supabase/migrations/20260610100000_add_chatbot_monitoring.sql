-- 챗봇 모니터링: 봇 등록 + 일일 시나리오 체크 이력 + 알림 설정
-- 적용: Supabase SQL Editor에서 직접 실행 (db push 금지 — 히스토리 divergence)
CREATE TABLE IF NOT EXISTS chatbots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  -- 시나리오: [{"say": "발화", "expect": "기대 키워드"}] 1개 이상. 순차 실행.
  scenario JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 입력창 셀렉터 오버라이드 (null이면 러너의 기본 휴리스틱 사용)
  input_selector TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chatbot_check_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  ok BOOLEAN NOT NULL,
  detail TEXT,
  duration_ms INT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_check_log ON chatbot_check_log (chatbot_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS chatbot_monitor_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO chatbot_monitor_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
