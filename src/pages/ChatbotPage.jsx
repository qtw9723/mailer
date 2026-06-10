// src/pages/ChatbotPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { getBots, createBot, updateBot, deleteBot } from '../lib/api/chatbot.js'
import { getCookie, clearCookie } from '../lib/auth.js'
import AppHeader from '../components/shared/AppHeader.jsx'
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx'
import BotRow from '../components/chatbot/BotRow.jsx'
import BotModal from '../components/chatbot/BotModal.jsx'
import ChatbotSettings from '../components/chatbot/ChatbotSettings.jsx'

export default function ChatbotPage() {
  const navigate = useNavigate()
  const password = getCookie()
  const [bots, setBots] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [tab, setTab] = useState('bots')
  const [showModal, setShowModal] = useState(false)
  const [editBot, setEditBot] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [togglingIds, setTogglingIds] = useState(new Set())

  const refresh = useCallback(async () => {
    try {
      setBots(await getBots(password))
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') { clearCookie(); navigate('/login') }
    } finally {
      setInitialLoading(false)
    }
  }, [password, navigate])

  useEffect(() => { refresh() }, [refresh])

  const handleSubmit = async (data) => {
    setSaving(true)
    try {
      if (editBot) {
        const updated = await updateBot(editBot.id, data, password)
        setBots(prev => prev.map(b => b.id === editBot.id ? { ...b, ...updated } : b))
        toast.success('챗봇을 수정했습니다')
      } else {
        const bot = await createBot(data, password)
        setBots(prev => [...prev, { ...bot, recent_checks: [] }])
        toast.success(`"${bot.name}"을(를) 등록했습니다 — 다음 체크부터 포함됩니다`)
      }
      setShowModal(false)
      setEditBot(null)
    } catch {
      toast.error(editBot ? '수정에 실패했습니다' : '등록에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (bot) => {
    const next = !bot.enabled
    setTogglingIds(prev => new Set(prev).add(bot.id))
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, enabled: next } : b))
    try {
      await updateBot(bot.id, { enabled: next }, password)
      toast.success(next ? `"${bot.name}" 체크 활성화` : `"${bot.name}" 체크 중지`)
    } catch {
      setBots(prev => prev.map(b => b.id === bot.id ? { ...b, enabled: !next } : b))
      toast.error('상태 변경에 실패했습니다')
    } finally {
      setTogglingIds(prev => { const s = new Set(prev); s.delete(bot.id); return s })
    }
  }

  const requestDelete = (bot) => setConfirm({
    title: '챗봇 삭제',
    message: `"${bot.name}"을(를) 삭제할까요? 체크 이력도 함께 삭제됩니다.`,
    confirmLabel: '삭제',
    danger: true,
    action: async () => {
      try {
        await deleteBot(bot.id, password)
        setBots(prev => prev.filter(b => b.id !== bot.id))
        toast.success('챗봇을 삭제했습니다')
      } catch {
        toast.error('삭제에 실패했습니다')
      }
    },
  })

  return (
    <div className="app">
      <AppHeader toolName="챗봇 모니터링">
        {tab === 'bots' && (
          <button className="app-new-btn" onClick={() => { setEditBot(null); setShowModal(true) }}>
            <Plus size={14} /> 챗봇 등록
          </button>
        )}
      </AppHeader>

      <nav className="nav-tabs">
        <button className={`nav-tab${tab === 'bots' ? ' active' : ''}`} onClick={() => setTab('bots')}>봇 목록</button>
        <button className={`nav-tab${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>설정</button>
      </nav>

      {tab === 'bots' ? (
        <div className="job-list">
          <p className="form-hint">매일 08:30 KST 자동 체크 · GitHub Actions에서 수동 실행 가능</p>
          {initialLoading ? (
            <>
              <div className="job-skeleton" />
              <div className="job-skeleton" />
            </>
          ) : bots.length === 0 ? (
            <div className="job-empty">
              <p>등록된 챗봇이 없습니다.</p>
              <button className="app-new-btn" onClick={() => { setEditBot(null); setShowModal(true) }}>
                <Plus size={14} /> 챗봇 등록
              </button>
            </div>
          ) : (
            bots.map(bot => (
              <BotRow
                key={bot.id}
                bot={bot}
                toggling={togglingIds.has(bot.id)}
                onToggle={() => handleToggle(bot)}
                onEdit={() => { setEditBot(bot); setShowModal(true) }}
                onDelete={() => requestDelete(bot)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="grafana-wrap"><ChatbotSettings /></div>
      )}

      {showModal && (
        <BotModal
          bot={editBot}
          onSubmit={handleSubmit}
          onClose={() => { setShowModal(false); setEditBot(null) }}
          loading={saving}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={async () => { await confirm.action(); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
