// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import HubPage from './pages/HubPage.jsx'
import MailerPage from './pages/MailerPage.jsx'
import GrafanaPage from './pages/GrafanaPage.jsx'
import ChatbotPage from './pages/ChatbotPage.jsx'
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'
import AppLayout from './components/shared/AppLayout.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<HubPage />} />
          <Route path="/mailer" element={<MailerPage />} />
          <Route path="/grafana" element={<GrafanaPage />} />
          <Route path="/chatbot" element={<ChatbotPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
