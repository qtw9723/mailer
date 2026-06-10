import { useNavigate, useLocation } from 'react-router-dom'
import { Mail, BarChart3, Bot, LogOut, Hexagon } from 'lucide-react'
import { clearCookie } from '../../lib/auth.js'

const TOOLS = [
  { path: '/mailer', icon: Mail, label: 'Mailer' },
  { path: '/grafana', icon: BarChart3, label: 'Grafana 리포트' },
  { path: '/chatbot', icon: Bot, label: '챗봇 모니터링 (준비 중)', disabled: true },
]

export default function IconRail() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const handleLogout = () => { clearCookie(); navigate('/login') }

  return (
    <nav className="icon-rail" aria-label="도구 탐색">
      <button className="rail-logo" onClick={() => navigate('/')} aria-label="허브 홈" title="CS SmartHub">
        <Hexagon size={20} />
      </button>
      <div className="rail-tools">
        {TOOLS.map(({ path, icon, label, disabled }) => {
          const Icon = icon
          return (
            <button
              key={path}
              className={`rail-item${pathname === path ? ' active' : ''}${disabled ? ' disabled' : ''}`}
              onClick={() => !disabled && navigate(path)}
              aria-label={label}
              title={label}
              aria-current={pathname === path ? 'page' : undefined}
              disabled={disabled}
            >
              <Icon size={18} />
            </button>
          )
        })}
      </div>
      <button className="rail-item rail-logout" onClick={handleLogout} aria-label="로그아웃" title="로그아웃">
        <LogOut size={17} />
      </button>
    </nav>
  )
}
