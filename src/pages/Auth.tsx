import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, signUp, signInWithGoogle, resetPassword } from '../lib/auth'

type Mode = 'signin' | 'signup'

function LogoMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32">
      <path
        d="M7.5 11.3 16 6l8.5 5.3v9.4L16 26l-8.5-5.3v-9.4Z"
        fill="currentColor"
        opacity=".18"
      />
      <path
        d="m10.8 13.1 5.2-3.2 5.2 3.2v5.8L16 22.1l-5.2-3.2v-5.8Z"
        fill="currentColor"
      />
      <path
        d="M16 9.9v12.2m-5.2-9 10.4 5.8m0-5.8-10.4 5.8"
        fill="none"
        stroke="white"
        strokeWidth="1.4"
      />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.7h3.3c1.9-1.8 2.9-4.4 2.9-7.7Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.7c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.8A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.5 13.8a6 6 0 0 1 0-3.6V7.4H3.1a10 10 0 0 0 0 9.2l3.4-2.8Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.1c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3.1 7.4l3.4 2.8A5.9 5.9 0 0 1 12 6.1Z"
      />
    </svg>

  )
}

function DashboardPreview() {
  return (
    <section
      className="showcase"
      aria-label="SpeakNote dashboard preview"
    >
      <div className="showcase-copy">
        <span className="eyebrow">MEETING MINUTES, AUTOMATED</span>

        <h2>Capture every voice. Let AI write the minutes.</h2>

        <p>
          SpeakNote listens to your face-to-face meetings in real-time, transcribes Tagalog and English, and generates structured minutes instantly.
        </p>
      </div>

      <div className="dashboard-shell">
        <aside className="sidebar">
          <div className="mini-brand">
            <LogoMark />
          </div>

          <div className="nav-pill active">
            <span className="nav-icon grid-icon" />
          </div>

          <div className="nav-pill">
            <span className="nav-icon note-icon" />
          </div>

          <div className="nav-pill">
            <span className="nav-icon spark-icon" />
          </div>

          <div className="avatar">AP</div>
        </aside>

        <div className="dashboard">
          <header className="dashboard-header">
            <div>
              <span className="dashboard-label">HOST DASHBOARD</span>
              <h3>Thesis Defense Prep</h3>
            </div>

            <div className="header-actions">
              <button
                className="icon-button"
                type="button"
                aria-label="Notifications"
              >
                <span className="bell-icon" />
              </button>

              <button className="new-note-button" type="button">
                Code: U46G14IY
              </button>
            </div>
          </header>

          <div className="stat-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="stat-card" style={{ height: 'auto', paddingBottom: '16px' }}>
              <div className="stat-top">
                <span>Live Transcript</span>
                <span className="trend" style={{ color: '#4c8c7c' }}>● Recording</span>
              </div>
              
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '9px', color: '#5a6b68', lineHeight: 1.4 }}>
                  <strong>Angelo:</strong> Okay so for the thesis defense next week, kailangan na natin tapusin yung chapter 3.
                </div>
                <div style={{ fontSize: '9px', color: '#5a6b68', lineHeight: 1.4 }}>
                  <strong>Kenn:</strong> Yes, I agree. I will finish the database schema by Friday.
                </div>
                <div style={{ fontSize: '9px', color: '#888', fontStyle: 'italic', lineHeight: 1.4 }}>
                  (speaking...): Sige, ako na bahala sa UI design and the PDF...
                </div>
              </div>
            </div>
          </div>

          <div className="section-heading">
            <h4>Participants</h4>
            <button type="button">Manage</button>
          </div>

          <div className="notes-list">
            <article>
              <div className="note-play">
                <span />
              </div>

              <div className="note-content">
                <h5>Kenn</h5>
                <p>🟢 Online</p>
              </div>

              <span className="note-tag purple">Speaking</span>
            </article>

            <article>
              <div className="note-play coral">
                <span />
              </div>

              <div className="note-content">
                <h5>Angelo Paguila</h5>
                <p>🟢 Online</p>
              </div>

              <span className="note-tag orange">Listening</span>
            </article>
          </div>
        </div>
      </div>

      <div className="floating-status">
        <span />
        Realtime transcript synced
      </div>
    </section>  
  )
  
}

export default function Auth() {
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    // Password match validation
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)

    try {
      if (mode === 'signup') {
        await signUp(email, password, fullName)
        setSuccess('Account created. You can now sign in.')
        setMode('signin') // Automatically switch to sign in mode
        setPassword('')
        setConfirmPassword('')
      } else {
        await signIn(email, password)
        navigate('/home')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      if (msg.includes('Invalid login credentials')) {
        setError('Incorrect email or password. Please try again.')
      } else if (msg.includes('Email not confirmed')) {
        setError('Please check your email and click the confirmation link.')
      } else if (msg.includes('Password should be at least')) {
         setError('Password must be at least 8 characters long.')
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

async function onForgotPassword() {
  if (!email) {
    setError('Please enter your email address first.')
    return
  }
  try {
    setBusy(true)
    await resetPassword(email)
    setSuccess('Password reset link sent! Check your email.')
    setError(null)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to send reset link.')
  } finally {
    setBusy(false)
  }
}

  async function onGoogle() {
    setError(null)
    setGoogleBusy(true)

    try {
      await signInWithGoogle()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Google sign-in failed. Please try again.',
      )
      setGoogleBusy(false)
    }
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode)
    setPassword('')
    setConfirmPassword('')
    setError(null)
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <a className="brand" href="/" aria-label="SpeakNote home">
          <span className="brand-mark">
            <LogoMark />
          </span>

          <span>SpeakNote</span>
        </a>

        <div className="auth-content">
          <div className="auth-heading">
            <span className="mobile-eyebrow">
              MEETING MINUTES, AUTOMATED
            </span>

            <h1>
              {mode === 'signin'
                ? 'Welcome back'
                : 'Create your account'}
            </h1>

            <p>
              {mode === 'signin'
                ? 'Sign in to pick up right where you left off.'
                : 'Start turning your voice into clear, useful notes.'}
            </p>
          </div>

          <div
            className="mode-switch"
            aria-label="Account access type"
          >
            <button
              className={mode === 'signin' ? 'selected' : ''}
              onClick={() => switchMode('signin')}
              type="button"
            >
              Sign in
            </button>

            <button
              className={mode === 'signup' ? 'selected' : ''}
              onClick={() => switchMode('signup')}
              type="button"
            >
              Create account
            </button>
          </div>

          <button
            className="google-button"
            type="button"
            onClick={onGoogle}
            disabled={googleBusy || busy}
          >
            {googleBusy ? (
              <span className="spinner" />
            ) : (
              <GoogleIcon />
            )}

            {googleBusy
              ? 'Connecting to Google…'
              : 'Continue with Google'}
          </button>

          <div className="divider">
            <span>or continue with email</span>
          </div>

          <form onSubmit={onSubmit}>
            {mode === 'signup' && (
              <label>
                <span>Full name</span>
                <input
                  autoComplete="name"
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Alex Morgan"
                  required
                />
              </label>
            )}

            <label>
              <span>Email address</span>
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label>
              <div className="label-row">
                <span>Password</span>
                {mode === 'signin' && (
                  <button type="button" onClick={onForgotPassword}>
                    Forgot password?
                  </button>
                )}
              </div>

              <span className="password-field">
                <input
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  // We remove minLength={6} and let our custom validation handle it for better UX
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>

            {/* PASSWORD REQUIREMENTS CHECKLIST */}
            {mode === 'signup' && (
              <div className="password-requirements">
                <span className={password.length >= 8 ? 'valid' : ''}>
                  ✓ At least 8 characters
                </span>
                <span className={/[A-Z]/.test(password) ? 'valid' : ''}>
                  ✓ One uppercase letter
                </span>
                <span className={/[^A-Za-z0-9]/.test(password) ? 'valid' : ''}>
                  ✓ One special character (e.g. !@#$%)
                </span>
              </div>
            )}

            {/* CONFIRM PASSWORD FIELD */}
            {mode === 'signup' && (
              <label>
                <span>Confirm Password</span>
                <span className="password-field">
                  <input
                    autoComplete="new-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirm your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
            )}

            {error && (
              <p className="auth-alert auth-error" role="alert">
                {error}
              </p>
            )}

            {success && (
              <p className="auth-alert auth-success" role="status">
                {success}
              </p>
            )}

            <button
              className="submit-button"
              type="submit"
              disabled={busy || googleBusy}
            >
              {busy ? (
                <span className="spinner" />
              ) : mode === 'signin' ? (
                'Sign in to SpeakNote'
              ) : (
                'Create my account'
              )}
            </button>
          </form>

          <div className="secure-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Secure, encrypted authentication
          </div>

          <p className="account-prompt">
            {mode === 'signin'
              ? "Don't have an account?"
              : 'Already have an account?'}

            <button
              type="button"
              onClick={() =>
                switchMode(
                  mode === 'signin' ? 'signup' : 'signin',
                )
              }
            >
              {mode === 'signin'
                ? 'Create one for free'
                : 'Sign in'}
            </button>
          </p>
        </div>

        <footer>
          <span>© 2025 SpeakNote</span>

          <nav>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
        </footer>
      </section>
      <DashboardPreview />
    </main>
  )
}