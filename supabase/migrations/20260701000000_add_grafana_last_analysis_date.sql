-- grafana_report_settings에 '오늘 AI 분석 완료' 추적 컬럼 추가.
-- 발송(last_sent_date)과 분리해, 분석이 일시 장애로 실패한 날은 이후 tick에서 재시도되게 한다.
-- 분석이 성공(또는 분석 대상 없음)한 날의 KST 날짜만 기록. NULL이면 오늘 아직 분석 전.
ALTER TABLE grafana_report_settings
  ADD COLUMN IF NOT EXISTS last_analysis_date DATE;
