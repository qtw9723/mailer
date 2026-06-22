-- 챗봇 모니터링: 봇에 카테고리(단일) 추가 — 그룹 단위 필터·체크용
-- 적용: Management API(SUPABASE_ACCESS_TOKEN)로 멱등 실행. db push 금지 (히스토리 divergence)
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS category TEXT;
