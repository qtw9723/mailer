// src/pages/ChatbotPage.jsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Play } from 'lucide-react'
import { toast } from 'sonner'
import { getBots, createBot, updateBot, deleteBot, runCheck } from '../lib/api/chatbot.js'
import { getCookie, clearCookie } from '../lib/auth.js'
import AppHeader from '../components/shared/AppHeader.jsx'
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx'
import BotRow from '../components/chatbot/BotRow.jsx'
import BotModal from '../components/chatbot/BotModal.jsx'
import ChatbotSettings from '../components/chatbot/ChatbotSettings.jsx'

// 미분류(category null) 그룹 실행용 센티넬 — 러너가 .is('category', null)로 해석
const UNCAT = '__none__'

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
  const [running, setRunning] = useState(false)
  const [activeCat, setActiveCat] = useState(null) // null = 전체, UNCAT = 미분류

  const { list: catList, hasUncat } = useMemo(() => {
    const set = new Set()
    let uncat = false
    for (const b of bots) { if (b.category) set.add(b.category); else uncat = true }
    return { list: [...set].sort((a, b) => a.localeCompare(b, 'ko')), hasUncat: uncat }
  }, [bots])

  const visibleBots = activeCat == null ? bots
    : activeCat === UNCAT ? bots.filter(b => !b.category)
    : bots.filter(b => b.category === activeCat)

  const runTarget = activeCat == null ? null
    : activeCat === UNCAT ? { category: UNCAT, label: '미분류' }
    : { category: activeCat, label: activeCat }
  const runLabel = activeCat == null ? '전체 체크' : `"${runTarget.label}" 체크`

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

  // target: { botId, label } 단건 / { category, label } 그룹 / null 전체
  const handleRunCheck = async (target = null) => {
    setRunning(true)
    try {
      await runCheck(target, password)
      toast.success(
        target ? `${target.label} 테스트를 요청했습니다` : '전체 체크를 요청했습니다',
        { description: '약 2~3분 후 새로고침하면 결과가 반영됩니다' },
      )
    } catch (e) {
      if (e.message.includes('GITHUB_TOKEN')) toast.error('GitHub 토큰이 설정되지 않았습니다', { description: '관리자에게 GITHUB_TOKEN 환경변수 설정을 요청하세요' })
      else toast.error('실행 요청에 실패했습니다')
    } finally {
      setRunning(false)
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
          <>
            <button className="app-new-btn" onClick={() => handleRunCheck(runTarget)} disabled={running || visibleBots.length === 0}>
              <Play size={14} /> {running ? '요청 중…' : runLabel}
            </button>
            <button className="app-new-btn" onClick={() => { setEditBot(null); setShowModal(true) }}>
              <Plus size={14} /> 챗봇 등록
            </button>
          </>
        )}
      </AppHeader>

      <nav className="nav-tabs">
        <button className={`nav-tab${tab === 'bots' ? ' active' : ''}`} onClick={() => setTab('bots')}>봇 목록</button>
        <button className={`nav-tab${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>설정</button>
      </nav>

      {tab === 'bots' ? (
        <div className="job-list">
          <p className="form-hint">매일 08:30 KST 자동 체크 · GitHub Actions에서 수동 실행 가능</p>
          {(catList.length > 0 || hasUncat) && (
            <div className="cat-chips">
              <button type="button" className={`cat-chip${activeCat == null ? ' active' : ''}`} onClick={() => setActiveCat(null)}>전체</button>
              {catList.map(c => (
                <button type="button" key={c} className={`cat-chip${activeCat === c ? ' active' : ''}`} onClick={() => setActiveCat(c)}>{c}</button>
              ))}
              {hasUncat && (
                <button type="button" className={`cat-chip${activeCat === UNCAT ? ' active' : ''}`} onClick={() => setActiveCat(UNCAT)}>미분류</button>
              )}
            </div>
          )}
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
            visibleBots.map(bot => (
              <BotRow
                key={bot.id}
                bot={bot}
                toggling={togglingIds.has(bot.id)}
                onToggle={() => handleToggle(bot)}
                onEdit={() => { setEditBot(bot); setShowModal(true) }}
                onDelete={() => requestDelete(bot)}
                onRunCheck={() => handleRunCheck({ botId: bot.id, label: `"${bot.name}"` })}
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
          categories={catList}
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
