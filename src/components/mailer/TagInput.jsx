// src/components/TagInput.jsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { isValidEmail, parseEmails } from '../../lib/email.js'

export default function TagInput({ values, onChange, placeholder = '이메일 입력 후 Enter' }) {
  const [input, setInput] = useState('')
  const [invalid, setInvalid] = useState(false)

  const flashInvalid = () => {
    setInvalid(true)
    setTimeout(() => setInvalid(false), 400)
  }

  const add = (raw) => {
    const email = raw.trim().replace(/,$/, '')
    if (!email) return true
    if (!isValidEmail(email)) {
      flashInvalid()
      return false
    }
    if (!values.includes(email)) onChange([...values, email])
    return true
  }

  const remove = (email) => onChange(values.filter(e => e !== email))

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (add(input)) setInput('')
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      remove(values[values.length - 1])
    }
  }

  const handleBlur = () => {
    if (input && add(input)) setInput('')
  }

  // 쉼표/공백/줄바꿈 구분 목록 붙여넣기 일괄 추가
  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text')
    if (!/[\s,;]/.test(text.trim())) return // 단일 토큰은 기본 동작
    e.preventDefault()
    const { valid, invalid: bad } = parseEmails(text)
    const fresh = valid.filter(v => !values.includes(v))
    if (fresh.length) onChange([...values, ...fresh])
    if (bad.length) {
      flashInvalid()
      toast.error(`유효하지 않은 주소 ${bad.length}건은 제외했습니다`)
    }
  }

  return (
    <div
      className={`tag-input-wrap${invalid ? ' input-invalid' : ''}`}
      onClick={e => e.currentTarget.querySelector('input')?.focus()}
    >
      {values.map(email => (
        <span key={email} className="tag-pill">
          {email}
          <button className="tag-pill-remove" onClick={() => remove(email)} type="button" aria-label={`${email} 제거`}>
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        className="tag-input-inner"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPaste={handlePaste}
        placeholder={values.length === 0 ? placeholder : ''}
      />
    </div>
  )
}
