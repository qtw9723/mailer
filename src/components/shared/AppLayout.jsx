import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import IconRail from './IconRail.jsx'
import CommandPalette from './CommandPalette.jsx'

export default function AppLayout() {
  return (
    <div className="layout">
      <IconRail />
      <div className="layout-main">
        <Outlet />
      </div>
      <CommandPalette />
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  )
}
