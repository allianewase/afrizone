import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import './Shell.css'

/** Chrome shared by every screen after the landing page. */
export default function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  return (
    <div className="sh">
      <header className="sh-top">
        <Link className="sh-brand" to="/">
          <span className="sh-mark" aria-hidden="true">A</span>
          <span className="sh-word">
            AfriZone <b>Part Time</b>
          </span>
        </Link>
        {user ? (
          <div className="sh-who">
            <span>{user.name}</span>
            <button className="btn ghost" style={{ width: 'auto', height: 36, padding: '0 14px' }} onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>
      <div className="sh-body">{children}</div>
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="err" role="alert">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flex: 'none', marginTop: 1 }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.2v.4" strokeLinecap="round" />
      </svg>
      <span>{message}</span>
    </div>
  )
}
