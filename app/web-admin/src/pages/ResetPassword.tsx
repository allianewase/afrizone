import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import Button from '../components/ui/Button'
import Icon from '../components/Icon'
import AuthSplitShell from '../components/AuthSplitShell'
import './Login.css'
import PasswordInput from '../components/ui/PasswordInput'
import { Label } from '@/components/shadcn/label'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await api.passwordReset(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthSplitShell>
        {done ? (
          <>
            <h1>Password updated</h1>
            <p className="lede">
              Your password has been changed. You can now sign in with your new
              credentials.
            </p>
            <Button
              variant="primary"
              icon="arrow-right"
              style={{ width: '100%' }}
              onClick={() => navigate('/login', { replace: true })}
            >
              Go to sign in
            </Button>
          </>
        ) : !token ? (
          <>
            <h1>Invalid link</h1>
            <p className="lede">
              This reset link is missing its token. Request a new one from the
              forgot-password page.
            </p>
            <Link
              to="/forgot-password"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1>Set a new password</h1>
            <p className="lede">Choose a strong password for your admin account.</p>

            <form onSubmit={onSubmit} noValidate>
              <div className="field" style={{ marginBottom: 14 }}>
                <Label htmlFor="pw">New password</Label>
                <PasswordInput
                  id="pw"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="field" style={{ marginBottom: 18 }}>
                <Label htmlFor="pw2">Confirm password</Label>
                <PasswordInput
                  id="pw2"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="login-error" role="alert">
                  <Icon name="alert" size={15} />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                icon="check"
                style={{ width: '100%' }}
              >
                Update password
              </Button>
            </form>

            <Link to="/login" className="login-link login-back">
              Back to sign in
            </Link>
          </>
        )}
    </AuthSplitShell>
  )
}
