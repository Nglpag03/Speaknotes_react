import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updatePassword } from '../lib/auth'

function LogoMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32">
      <path d="M7.5 11.3 16 6l8.5 5.3v9.4L16 26l-8.5-5.3v-9.4Z" fill="currentColor" opacity=".18" />
      <path d="m10.8 13.1 5.2-3.2 5.2 3.2v5.8L16 22.1l-5.2-3.2v-5.8Z" fill="currentColor" />
      <path d="M16 9.9v12.2m-5.2-9 10.4 5.8m0-5.8-10.4 5.8" fill="none" stroke="white" strokeWidth="1.4" />
    </svg>
  )
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)

  // Supabase puts the recovery token in the URL hash when the user clicks the email link.
  // The SDK automatically exchanges it for a session on load. We just wait for that.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setChecking(false)
      }
    })

    // If already in a recovery session from a previous click, proceed
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setChecking(false)
      else setTimeout(() => setChecking(false), 1500) // fallback
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')

    setBusy(true)
    try {
      await updatePassword(password)
      setSuccess(true)
      setTimeout(() => navigate('/home', { replace: true }), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-layout" style={{ gridTemplateColumns: '1fr' }}>
      <section className="auth-panel" style={{ maxWidth: '100%' }}>
        <a className="brand" href="/" aria-label="SpeakNote home">
          <span className="brand-mark"><LogoMark /></span>
          <span>SpeakNote</span>
        </a>

        <div className="auth-content">
          <div className="auth-heading">
            <h1>Set a new password</h1>
            <p>Choose a strong password. You'll be signed in right after.</p>
          </div>

          {success ? (
            <div className="auth-alert auth-success" role="status">
              Password updated. Redirecting to your dashboard…
            </div>
          ) : checking ? (
            <p style={{ color: '#66706e', fontSize: '14px' }}>Verifying reset link…</p>
          ) : (
            <form onSubmit={onSubmit}>
              <label>
                <span>New password</span>
                <span className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((c) => !c)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>

              <label>
                <span>Confirm new password</span>
                <span className="password-field">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" onClick={() => setShowConfirm((c) => !c)}>
                    {showConfirm ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>

              {error && <p className="auth-alert auth-error" role="alert">{error}</p>}

              <button className="submit-button" type="submit" disabled={busy}>
                {busy ? <span className="spinner" /> : 'Update password'}
              </button>
            </form>
          )}
        </div>

        <footer>
          <span>© 2025 SpeakNote</span>
          <nav>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
        </footer>
      </section>
    </main>
  )
}