import { useEffect, useRef } from 'react'

// 공용 모달 셸: 오버레이 + dialog 시맨틱 + ESC/오버레이 클릭 닫기.
// dirty-check가 필요한 모달은 onClose에서 자체 확인 후 닫는다.
export default function Modal({ title, onClose, children, maxWidth = 500 }) {
  const ref = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={{ maxWidth }}>
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
