import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, clearToken, getToken, setToken } from '../api/client'
import { isTwoFactorRequired, type AuthSuccess, type User } from '../api/types'
import Splash from '../components/Splash'

/** Outcome of a login attempt surfaced to the UI. */
export type LoginResult =
  | { kind: 'authenticated' }
  | { kind: '2fa'; challenge: string }

interface AuthState {
  user: User | null
  loading: boolean
  /** Step 1. Resolves with either an authenticated session or a 2FA challenge. */
  login: (email: string, password: string) => Promise<LoginResult>
  /** Step 2 (only when login returned a 2FA challenge). */
  verifyTwoFactor: (challenge: string, code: string) => Promise<void>
  /** Establish a session from a full auth response (e.g. Google SSO). */
  applySession: (res: AuthSuccess) => void
  /** Re-fetch the current user (e.g. after toggling 2FA in Settings). */
  refreshUser: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount: if a token is present, hydrate the user via /auth/me.
  useEffect(() => {
    let active = true
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .me()
      .then((res) => {
        if (active) setUser(res.user)
      })
      .catch(() => {
        clearToken()
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const applySession = useCallback((res: AuthSuccess) => {
    setToken(res.token)
    setUser(res.user)
  }, [])

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const res = await api.login(email, password)
      // 2FA-enabled accounts get a challenge instead of a session token.
      if (isTwoFactorRequired(res)) {
        return { kind: '2fa', challenge: res.challenge }
      }
      applySession(res)
      return { kind: 'authenticated' }
    },
    [applySession],
  )

  const verifyTwoFactor = useCallback(
    async (challenge: string, code: string) => {
      const res = await api.twoFactorVerify(challenge, code)
      applySession(res)
    },
    [applySession],
  )

  const refreshUser = useCallback(async () => {
    const res = await api.me()
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      verifyTwoFactor,
      applySession,
      refreshUser,
      logout,
    }),
    [user, loading, login, verifyTwoFactor, applySession, refreshUser, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <Splash />
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
