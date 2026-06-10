// src/pages/HubPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJobs } from '../lib/api/mailer.js'
import { getBots } from '../lib/api/chatbot.js'
import { getCookie } from '../lib/auth.js'

const TOOLS = [
  {
    id: 'mailer',
    icon: '📧',
    name: 'Mailer',
    description: '메일 발송 스케줄 관리',
    path: '/mailer',
    active: true,
  },
  {
    id: 'grafana',
    icon: '📊',
    name: 'Grafana 리포트',
    description: '모니터링 리포트 생성',
    path: '/grafana',
    active: true,
  },
  {
    id: 'chatbot',
    icon: '🤖',
    name: '챗봇 모니터링',
    description: '챗봇 일일 시나리오 체크',
    path: '/chatbot',
    active: true,
  },
]

function lastFailed(checks) {
  const last = checks?.[checks.length - 1]
  return !!last && !last.ok
}

export default function HubPage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState(null)   // null = 로딩/실패 → 배너에서 제외
  const [bots, setBots] = useState(null)

  useEffect(() => {
    getJobs(getCookie()).then(setJobs).catch(() => {})
    getBots(getCookie()).then(setBots).catch(() => {})
  }, [])

  const mailFailCount = jobs?.filter(j => lastFailed(j.recent_sends)).length ?? 0
  const botFailCount = bots?.filter(b => lastFailed(b.recent_checks)).length ?? 0
  const activeCount = jobs?.filter(j => j.is_active).length ?? 0

  const failParts = []
  if (mailFailCount) failParts.push(`Mailer: 최근 발송 ${mailFailCount}건 실패`)
  if (botFailCount) failParts.push(`챗봇: 최근 체크 ${botFailCount}건 실패`)
  const hasFail = failParts.length > 0

  return (
    <div className="hub-wrapper">
      <header className="hub-header">
        <span className="hub-title">CS SmartHub</span>
      </header>

      <main className="hub-main">
        {(jobs || bots) && (
          <div className={`hub-status-banner ${hasFail ? 'alert' : 'ok'}`}>
            <span className={`status-dot ${hasFail ? 'fail' : 'ok'}`} />
            {hasFail
              ? `${failParts.join(' · ')} — 확인이 필요합니다`
              : `모두 정상입니다 · 활성 작업 ${activeCount}개`}
          </div>
        )}

        <p className="hub-subtitle">어떤 툴을 사용할까요?</p>
        <div className="hub-grid">
          {TOOLS.map(tool => (
            <button
              key={tool.id}
              className={`hub-card${tool.active ? '' : ' hub-card-disabled'}`}
              onClick={() => tool.active && navigate(tool.path)}
              disabled={!tool.active}
            >
              {!tool.active && <span className="hub-badge">준비 중</span>}
              {tool.id === 'mailer' && jobs && (
                <span className={`status-dot hub-card-dot ${mailFailCount ? 'fail' : 'ok'}`} />
              )}
              {tool.id === 'chatbot' && bots && (
                <span className={`status-dot hub-card-dot ${botFailCount ? 'fail' : 'ok'}`} />
              )}
              <span className="hub-card-icon">{tool.icon}</span>
              <span className="hub-card-name">{tool.name}</span>
              <span className="hub-card-desc">{tool.description}</span>
            </button>
          ))}
          <div className="hub-card hub-card-empty">
            <span className="hub-card-icon">＋</span>
            <span className="hub-card-empty-name">추가 예정</span>
          </div>
        </div>
      </main>
    </div>
  )
}
