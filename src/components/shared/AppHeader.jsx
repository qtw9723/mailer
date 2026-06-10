export default function AppHeader({ toolName, children }) {
  return (
    <header className="app-header">
      <span className="app-title">{toolName}</span>
      <div className="header-actions">{children}</div>
    </header>
  )
}
