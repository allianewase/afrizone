import { useEffect, type ReactNode } from 'react'
import Icon from '../Icon'

interface Props {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}

export default function Modal({ open, title, subtitle, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="glass modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <button
            className="btn btn-glass btn-sm"
            style={{ width: 38, height: 38, padding: 0, minHeight: 38 }}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
