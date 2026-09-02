import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import Logo from '../components/Logo'
import './Shell.css'

/** What kind of account is signed in, in the words the portal uses elsewhere. */
const ACCOUNT_LABEL: Record<string, string> = {
  STORE: 'Store',
  COURIER: 'Courier',
  INDIVIDUAL: 'Individual',
}

/** Chrome shared by every screen after the landing page. */
export default function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  return (
    <div className="sh">
      <header className="sh-top">
        <Link className="sh-brand" to="/">
          <Logo size={30} />
        </Link>
        {user ? (
          <div className="sh-who">
            <span className="sh-me">
              <b>{user.name}</b>
              <span>{(user.accountType && ACCOUNT_LABEL[user.accountType]) ?? 'Signed in'}</span>
            </span>
            <button className="btn ghost inline sm" onClick={signOut}>
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
