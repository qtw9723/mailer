// src/pages/ChatbotPage.jsx
import { Bot } from 'lucide-react'
import AppHeader from '../components/shared/AppHeader.jsx'

export default function ChatbotPage() {
  return (
    <div className="app">
      <AppHeader toolName="챗봇 모니터링" />
      <div className="coming-soon">
        <Bot size={48} className="coming-soon-icon" />
        <p className="coming-soon-title">챗봇 모니터링을 준비하고 있어요</p>
        <p className="coming-soon-desc">챗봇 활성화 현황 추적과 응답 품질 리포트 기능이 추가될 예정입니다.</p>
      </div>
    </div>
  )
}
