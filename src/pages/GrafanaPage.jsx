// src/pages/GrafanaPage.jsx
import AppHeader from '../components/shared/AppHeader.jsx'

export default function GrafanaPage() {
  return (
    <div className="app">
      <AppHeader toolName="Grafana 리포트" />
      <div className="job-empty" style={{ marginTop: '80px' }}>
        🚧 준비 중입니다.
      </div>
    </div>
  )
}
