// src/pages/MailerPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { getJobs, createJob, updateJob, deleteJob, reorderJobs, getSenders, createSender, deleteSender } from '../lib/api/mailer.js'
import { getCookie, clearCookie } from '../lib/auth.js'
import JobRow from '../components/mailer/JobRow.jsx'
import JobModal from '../components/mailer/JobModal.jsx'
import SenderPage from '../components/mailer/SenderPage.jsx'
import SenderModal from '../components/mailer/SenderModal.jsx'
import AppHeader from '../components/shared/AppHeader.jsx'
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx'

export default function MailerPage() {
  const navigate = useNavigate()
  const password = getCookie()
  const [jobs, setJobs] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editJob, setEditJob] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [page, setPage] = useState('jobs')
  const [senders, setSenders] = useState([])
  const [showSenderModal, setShowSenderModal] = useState(false)
  const [senderLoading, setSenderLoading] = useState(false)
  const [confirm, setConfirm] = useState(null) // { title, message, confirmLabel, danger, action }
  const [togglingIds, setTogglingIds] = useState(new Set())
  const [searchParams, setSearchParams] = useSearchParams()
  const pollRef = useRef(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const refreshJobs = useCallback(async () => {
    try {
      const data = await getJobs(password)
      setJobs(data.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') {
        clearCookie()
        navigate('/login')
      }
    } finally {
      setInitialLoading(false)
    }
  }, [password, navigate])

  const loadSenders = useCallback(async () => {
    try { setSenders(await getSenders(password)) } catch { /* 발신 계정 로드는 best-effort */ }
  }, [password])

  useEffect(() => {
    refreshJobs()
    loadSenders()
    pollRef.current = setInterval(refreshJobs, 60_000)
    return () => clearInterval(pollRef.current)
  }, [refreshJobs, loadSenders])

  // 커맨드 팔레트 진입 쿼리 해석 (?new=1 → 새 작업 모달, ?tab=senders → 발신 계정 탭)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditJob(null)
      setShowModal(true)
      setSearchParams({}, { replace: true })
    } else if (searchParams.get('tab') === 'senders') {
      setPage('senders')
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleCreate = async (formData) => {
    setLoading(true)
    try {
      const job = await createJob(formData, password)
      setJobs(prev => [job, ...prev])
      setShowModal(false)
      toast.success(`"${job.name}" 작업을 만들었습니다`)
    } catch {
      toast.error('작업 생성에 실패했습니다')
    } finally { setLoading(false) }
  }

  const handleUpdate = async (id, patch) => {
    try {
      const job = await updateJob(id, patch, password)
      setJobs(prev => prev.map(j => j.id === id ? { ...j, ...job } : j))
      setEditJob(null)
      setShowModal(false)
      toast.success('작업을 수정했습니다')
    } catch {
      toast.error('작업 수정에 실패했습니다')
    }
  }

  // 낙관적 토글 + 실패 롤백
  const handleToggle = async (job) => {
    const nextActive = !job.is_active
    setTogglingIds(prev => new Set(prev).add(job.id))
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_active: nextActive } : j))
    try {
      await updateJob(job.id, { is_active: nextActive }, password)
      toast.success(nextActive ? `"${job.name}" 시작됨` : `"${job.name}" 중지됨`)
    } catch {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_active: !nextActive } : j))
      toast.error('상태 변경에 실패했습니다')
    } finally {
      setTogglingIds(prev => { const s = new Set(prev); s.delete(job.id); return s })
    }
  }

  const requestDelete = (job) => setConfirm({
    title: '작업 삭제',
    message: `"${job.name}" 작업을 삭제할까요? 되돌릴 수 없습니다.`,
    confirmLabel: '삭제',
    danger: true,
    action: async () => {
      try {
        await deleteJob(job.id, password)
        setJobs(prev => prev.filter(j => j.id !== job.id))
        toast.success('작업을 삭제했습니다')
      } catch {
        toast.error('삭제에 실패했습니다')
      }
    },
  })

  const requestDeleteSelected = () => setConfirm({
    title: '작업 일괄 삭제',
    message: `선택한 ${selectedIds.size}개 작업을 삭제할까요? 되돌릴 수 없습니다.`,
    confirmLabel: `${selectedIds.size}개 삭제`,
    danger: true,
    action: async () => {
      try {
        await Promise.all([...selectedIds].map(id => deleteJob(id, password)))
        setJobs(prev => prev.filter(j => !selectedIds.has(j.id)))
        setSelectedIds(new Set())
        toast.success('선택한 작업을 삭제했습니다')
      } catch {
        toast.error('일부 작업 삭제에 실패했습니다')
        refreshJobs()
      }
    },
  })

  const requestResetCount = (job) => setConfirm({
    title: '순번 초기화',
    message: `"${job.name}"의 발송 순번을 0으로 초기화할까요?`,
    confirmLabel: '초기화',
    action: async () => {
      try {
        const updated = await updateJob(job.id, { send_count: 0 }, password)
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, ...updated } : j))
        toast.success('순번을 초기화했습니다')
      } catch {
        toast.error('초기화에 실패했습니다')
      }
    },
  })

  const handleDuplicate = async (job) => {
    try {
      const { name, sender, sender_account_id, subject, body, recipients, interval_minutes, use_index, attachments } = job
      const match = name.match(/^\[(\d+)\] (.+)$/)
      const newName = match ? `[${Number(match[1]) + 1}] ${match[2]}` : `[0] ${name}`
      const newJob = await createJob({ name: newName, sender, sender_account_id, subject, body, recipients, interval_minutes, use_index, attachments }, password)
      setJobs(prev => [newJob, ...prev])
      toast.success(`"${newJob.name}"으로 복제했습니다`)
    } catch {
      toast.error('복제에 실패했습니다')
    }
  }

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIndex = jobs.findIndex(j => j.id === active.id)
    const newIndex = jobs.findIndex(j => j.id === over.id)
    const reordered = arrayMove(jobs, oldIndex, newIndex)
    setJobs(reordered)
    reorderJobs(reordered.map(j => j.id), password).catch(() => toast.error('순서 저장에 실패했습니다'))
  }

  const handleCreateSender = async (data) => {
    setSenderLoading(true)
    try {
      const sender = await createSender(data, password)
      setSenders(prev => [...prev, sender])
      setShowSenderModal(false)
      toast.success(`${sender.email} 계정을 추가했습니다`)
    } catch {
      toast.error('계정 추가에 실패했습니다')
    } finally {
      setSenderLoading(false)
    }
  }

  const requestDeleteSender = (id) => setConfirm({
    title: '발신 계정 삭제',
    message: '이 발신 계정을 삭제할까요? 이 계정을 쓰는 작업은 발송에 실패하게 됩니다.',
    confirmLabel: '삭제',
    danger: true,
    action: async () => {
      try {
        await deleteSender(id, password)
        setSenders(prev => prev.filter(s => s.id !== id))
        toast.success('계정을 삭제했습니다')
      } catch {
        toast.error('계정 삭제에 실패했습니다')
      }
    },
  })

  const activeJobs = jobs.filter(j => j.is_active)
  const inactiveJobs = jobs.filter(j => !j.is_active)

  const renderRow = (job) => (
    <JobRow
      key={job.id}
      job={job}
      senders={senders}
      selected={selectedIds.has(job.id)}
      toggling={togglingIds.has(job.id)}
      onSelect={checked => setSelectedIds(prev => {
        const s = new Set(prev)
        if (checked) s.add(job.id); else s.delete(job.id)
        return s
      })}
      onToggle={() => handleToggle(job)}
      onEdit={() => { setEditJob(job); setShowModal(true) }}
      onDuplicate={() => handleDuplicate(job)}
      onDelete={() => requestDelete(job)}
      onResetCount={() => requestResetCount(job)}
    />
  )

  return (
    <div className="app">
      <AppHeader toolName="Mailer">
        {page === 'jobs' ? (
          <button className="app-new-btn" onClick={() => { setEditJob(null); setShowModal(true) }}>
            <Plus size={14} /> 새 작업
          </button>
        ) : (
          <button className="app-new-btn" onClick={() => setShowSenderModal(true)}>
            <Plus size={14} /> 계정 추가
          </button>
        )}
      </AppHeader>

      <nav className="nav-tabs">
        <button className={`nav-tab${page === 'jobs' ? ' active' : ''}`} onClick={() => setPage('jobs')}>스케줄</button>
        <button className={`nav-tab${page === 'senders' ? ' active' : ''}`} onClick={() => setPage('senders')}>발신 계정</button>
      </nav>

      {page === 'jobs' ? (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={jobs.map(j => j.id)} strategy={verticalListSortingStrategy}>
              <div className="job-list">
                {jobs.length > 0 && (
                  <div className="bulk-bar">
                    <label className="bulk-select-all">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === jobs.length}
                        onChange={e => setSelectedIds(e.target.checked ? new Set(jobs.map(j => j.id)) : new Set())}
                      />
                      전체 선택
                    </label>
                    {selectedIds.size > 0 && (
                      <button className="bulk-delete-btn" onClick={requestDeleteSelected}>
                        <Trash2 size={12} /> {selectedIds.size}개 삭제
                      </button>
                    )}
                  </div>
                )}
                {initialLoading ? (
                  <>
                    <div className="job-skeleton" />
                    <div className="job-skeleton" />
                    <div className="job-skeleton" />
                  </>
                ) : jobs.length === 0 ? (
                  <div className="job-empty">
                    <p>발송 작업이 없습니다.</p>
                    <button className="app-new-btn" onClick={() => { setEditJob(null); setShowModal(true) }}>
                      <Plus size={14} /> 새 작업
                    </button>
                  </div>
                ) : (
                  <>
                    {activeJobs.length > 0 && <div className="job-group-head">활성 ({activeJobs.length})</div>}
                    {activeJobs.map(renderRow)}
                    {inactiveJobs.length > 0 && <div className="job-group-head">중지됨 ({inactiveJobs.length})</div>}
                    {inactiveJobs.map(renderRow)}
                  </>
                )}
              </div>
            </SortableContext>
          </DndContext>

          {showModal && (
            <JobModal
              job={editJob}
              senders={senders}
              onSubmit={editJob ? (data) => handleUpdate(editJob.id, data) : handleCreate}
              onClose={() => { setShowModal(false); setEditJob(null) }}
              loading={loading}
            />
          )}
        </>
      ) : (
        <SenderPage senders={senders} onDelete={requestDeleteSender} />
      )}

      {showSenderModal && (
        <SenderModal
          onSubmit={handleCreateSender}
          onClose={() => setShowSenderModal(false)}
          loading={senderLoading}
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
