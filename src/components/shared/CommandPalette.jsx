import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { Mail, BarChart3, Home, LogOut, Plus, Users, RefreshCw } from 'lucide-react'
import { clearCookie } from '../../lib/auth.js'

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const run = (fn) => { setOpen(false); fn() }

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="명령 팔레트" className="cmdk">
      <Command.Input placeholder="명령 검색…" />
      <Command.List>
        <Command.Empty>결과 없음</Command.Empty>
        <Command.Group heading="이동">
          <Command.Item onSelect={() => run(() => navigate('/'))}><Home size={14} /> 허브 홈</Command.Item>
          <Command.Item onSelect={() => run(() => navigate('/mailer'))}><Mail size={14} /> Mailer로 이동</Command.Item>
          <Command.Item onSelect={() => run(() => navigate('/grafana'))}><BarChart3 size={14} /> Grafana 리포트로 이동</Command.Item>
        </Command.Group>
        <Command.Group heading="작업">
          <Command.Item onSelect={() => run(() => navigate('/mailer?new=1'))}><Plus size={14} /> 새 작업 만들기</Command.Item>
          <Command.Item onSelect={() => run(() => navigate('/mailer?tab=senders'))}><Users size={14} /> 발신 계정 관리</Command.Item>
          <Command.Item onSelect={() => run(() => navigate('/grafana'))}><RefreshCw size={14} /> 리포트 새로고침</Command.Item>
        </Command.Group>
        <Command.Group heading="계정">
          <Command.Item onSelect={() => run(() => { clearCookie(); navigate('/login') })}><LogOut size={14} /> 로그아웃</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
