// 시나리오 스텝 정규화: type 없는 구버전 스텝은 say로 간주.
// selector는 스텝별 대상 오버라이드(발화=입력창, 버튼=클릭 대상).
export function normalizeStep(step) {
  const type = step.type === 'click' ? 'click' : 'say'
  return {
    type,
    text: type === 'click' ? step.click : step.say,
    expect: step.expect,
    selector: step.selector?.trim() || null,
  }
}

// 시나리오 스텝 판정: 페이지 텍스트에 기대 키워드가 노출되었는가
export function judgeStep(pageText, expectKeyword) {
  if (pageText.includes(expectKeyword)) return { ok: true }
  return {
    ok: false,
    reason: `키워드 "${expectKeyword}" 미노출`,
    excerpt: pageText.slice(-300),
  }
}

// 실패 봇 목록 → 알림 메일 제목/본문
export function buildFailureMail(failures, hubUrl) {
  const subject = `🤖 챗봇 체크 실패 ${failures.length}건`
  const lines = failures.map(f => `- ${f.name}: ${f.detail}`)
  const body = [
    '챗봇 모니터링 일일 체크에서 실패가 발생했습니다.',
    '',
    ...lines,
    '',
    `허브에서 확인: ${hubUrl}`,
  ].join('\n')
  return { subject, body }
}
