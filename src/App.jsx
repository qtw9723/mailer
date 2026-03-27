// src/App.jsx
import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { getJobs, createJob, updateJob, deleteJob } from './lib/api.js'
import JobCard from './components/JobCard.jsx'
import JobModal from './components/JobModal.jsx'

const PW_KEY = 'mailer-password'

export default function App() {
  const [password, setPassword] = useState(() => localStorage.getItem(PW_KEY) ?? '')
  const [authenticated, setAuthenticated] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState('')
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editJob, setEditJob] = useState(null)

  const fetchJobs = useCallback(async (pw = password) => {
    try {
      const data = await getJobs(pw)
      setJobs(data)
      setAuthenticated(true)
      localStorage.setItem(PW_KEY, pw)
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') {
        setAuthenticated(false)
        localStorage.removeItem(PW_KEY)
      }
    }
  }, [password])

  useEffect(() => {
    if (password) fetchJobs(password)
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setPwError('')
    try {
      const data = await getJobs(pwInput)
      setJobs(data)
      setPassword(pwInput)
      setAuthenticated(true)
      localStorage.setItem(PW_KEY, pwInput)
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
