const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/

export function isValidEmail(value) {
  return EMAIL_RE.test(value)
}

// 붙여넣기 텍스트를 쉼표/세미콜론/공백/줄바꿈으로 분리해 유효·무효 이메일로 분류
export function parseEmails(text) {
  const tokens = text.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean)
  return {
    valid: tokens.filter(isValidEmail),
    invalid: tokens.filter(t => !isValidEmail(t)),
  }
}
