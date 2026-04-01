// src/App.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus } from 'lucide-react'
import { getJobs, createJob, updateJob, deleteJob } from './lib/api.js'
import JobCard from './components/JobCard.jsx'
import JobModal from './components/JobModal.jsx'

const COOKIE_NAME = 'mailer-password'
const COOKIE_MINUTES = 10

function getCookie() {
  const match = document.cookie.split('; ').find(r => r.startsWith(COOKIE_NAME + '='))
  return match ? decodeURIComponent(match.split('=')[1]) : ''
}

function setCookie(value) {
  const expires = new Date(Date.now() + COOKIE_MINUTES * 60 * 1000).toUTCString()
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`
}

function clearCookie() {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`
}

export default function App() {
  const [password, setPassword] = useState(() => getCookie())
  const [authenticated, setAuthenticated] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState('')
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editJob, setEditJob] = useState(null)
  const pollRef = useRef(null)

  const refreshJobs = useCallback(async (pw) => {
    try {
      const data = await getJobs(pw)
      setJobs(data)
      setCookie(pw)
      return true
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') {
        setAuthenticated(false)
        clearCookie()
        if (pollRef.current) clearInterval(pollRef.current)
      }
      return false
    }
  }, [])

  const startPolling = useCallback((pw) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => refreshJobs(pw), 60_000)
  }, [refreshJobs])

  useEffect(() => {
    const pw = getCookie()
    if (pw) {
      refreshJobs(pw).then(ok => {
        if (ok) {
          setAuthenticated(true)
          startPolling(pw)
        }
      })
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setPwError('')
    try {
      const data = await getJobs(pwInput)
      setJobs(data)
      setPassword(pwInput)
      setAuthenticated(true)
      setCookie(pwInput)
      startPolling(pwInput)
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') setPwError('비밀번호가 틀렸습니다.')
      else setPwError('연결 오류가 발생했습니다.')
    }
  }

  const handleCreate = async (formData) => {
    setLoading(true)
    try {
      const job = await createJob(formData, password)
      setJobs(prev => [job, ...prev])
      setShowModal(false)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (id, patch) => {
    const job = await updateJob(id, patch, password)
    setJobs(prev => prev.map(j => j.id === id ? job : j))
    setEditJob(null)
    setShowModal(false)
  }

  const handleDelete = async (id) => {
    await deleteJob(id, password)
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  const handleDuplicate = async (job) => {
    const { name, sender, subject, body, recipients, interval_minutes, use_index, attachments } = job
    const match = name.match(/^\[(\d+)\] (.+)$/)
    const newName = match ? `[${Number(match[1]) + 1}] ${match[2]}` : `[0] ${name}`
    const newJob = await createJob({ name: newName, sender, subject, body, recipients, interval_minutes, use_index, attachments }, password)
    setJobs(prev => [newJob, ...prev])
  }

  const handleToggle = (job) => {
    handleUpdate(job.id, { is_active: !job.is_active })
  }

  if (!authenticated) {
    return (
      <div className="gate-wrapper">
        <div className="gate-card">
          <h1 className="gate-title">Mailer</h1>
          <p className="gate-subtitle">비밀번호를 입력하세요</p>
          <form onSubmit={handleLogin}>
            <input
              className="gate-input"
              type="password"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              placeholder="비밀번호"
              autoFocus
            />
            <button className="gate-btn" type="submit">확인</button>
            {pwError && <p className="gate-error">{pwError}</p>}
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">Mailer</span>
        <button className="app-new-btn" onClick={() => { setEditJob(null); setShowModal(true) }}>
          <Plus size={14} /> 새 작업
        </button>
      </header>

      <div className="job-list">
        {jobs.length === 0 ? (
          <p className="job-empty">작업이 없습니다. 새 작업을 만들어보세요.</p>
        ) : (
          jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onToggle={() => handleToggle(job)}
              onEdit={() => { setEditJob(job); setShowModal(true) }}
              onDuplicate={() => handleDuplicate(job)}
              onDelete={() => handleDelete(job.id)}
            />
          ))
        )}
      </div>

      {showModal && (
        <JobModal
          job={editJob}
          onSubmit={editJob ? (data) => handleUpdate(editJob.id, data) : handleCreate}
          onClose={() => { setShowModal(false); setEditJob(null) }}
          loading={loading}
        />
      )}
    </div>
  )
}
