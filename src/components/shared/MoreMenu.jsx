import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'

export default function MoreMenu({ items, label = '더보기' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="more-menu" ref={ref}>
      <button type="button" className="more-trigger" onClick={() => setOpen(o => !o)} aria-label={label} aria-expanded={open} aria-haspopup="menu">
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="more-list" role="menu">
          {items.filter(Boolean).map(({ icon, text, danger, onClick }) => {
            const Icon = icon
            return (
              <button key={text} type="button" role="menuitem" className={`more-item${danger ? ' danger' : ''}`}
                onClick={() => { setOpen(false); onClick() }}>
                {Icon && <Icon size={13} />} {text}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
