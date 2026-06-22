-- 챗봇 모니터링: 관리되는 카테고리 목록(드롭다운 선택 + 추가)
-- settings 싱글톤 행에 categories 배열 추가 + 기존 봇 카테고리로 1회 백필
-- 적용: Management API(SUPABASE_ACCESS_TOKEN)로 멱등 실행. db push 금지
ALTER TABLE chatbot_monitor_settings
  ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE chatbot_monitor_settings
SET categories = COALESCE(
  (SELECT jsonb_agg(DISTINCT category ORDER BY category)
     FROM chatbots WHERE category IS NOT NULL AND btrim(category) <> ''),
  '[]'::jsonb)
WHERE id = 1
  AND categories = '[]'::jsonb;  -- 이미 관리 목록이 있으면 덮어쓰지 않음(멱등)
