import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import TagInput from '../mailer/TagInput.jsx'
import { getChatbotSettings, updateChatbotSettings } from '../../lib/api/chatbot.js'
import { getCookie, clearCookie } from '../../lib/auth.js'

export default function ChatbotSettings() {
  const password = getCookie()
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getChatbotSettings(password)
      setRecipients(s.recipients ?? [])
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') clearCookie()
      else toast.error('설정을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [password])

  useEffect(() => { load() }, [load])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const s = await updateChatbotSettings({ recipients }, password)
      setRecipients(s.recipients ?? [])
      toast.success('설정을 저장했습니다')
    } catch {
      toast.error('저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="job-empty">불러오는 중…</p>

  return (
    <form className="grafana-settings" onSubmit={handleSave}>
      <div className="form-field">
        <label className="form-label">실패 알림 수신자</label>
        <TagInput values={recipients} onChange={setRecipients} />
        <p className="form-hint">체크 실패 시 메일을 받을 주소. 비우면 알림을 보내지 않습니다.</p>
      </div>
      <div className="modal-actions">
        <button type="submit" className="modal-submit" disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </form>
  )
}
