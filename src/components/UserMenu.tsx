import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { avatarColor, fetchSettings, getInitials, SETTINGS_EVENT } from '../lib/settings'

export function Avatar({ name, email, color, large }: { name?: string | null; email?: string | null; color?: string | null; large?: boolean }) {
  return (
    <span
      className={`home-avatar ${large ? 'avatar-lg' : ''}`}
      style={{ background: avatarColor(email || name || '', color) }}
      aria-hidden="true"
    >
      {getInitials(name, email)}
    </span>
  )
}

export function UserMenu({ variant = 'sidebar' }: { variant?: 'sidebar' | 'mobile' }) {
  const navigate = useNavigate()
  const mobile = variant === 'mobile'
  const [user, setUser] = useState<User | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setUser(user)
      try {
        const s = await fetchSettings()
        if (alive) setColor(s.avatar_color)
      } catch { /* avatar falls back to derived color */ }
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED') setTimeout(load, 0)
    })
    window.addEventListener(SETTINGS_EVENT, load)
    return () => {
      alive = false
      sub.subscription.unsubscribe()
      window.removeEventListener(SETTINGS_EVENT, load)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function confirmSignOut() {
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
      navigate('/auth', { replace: true })
    } catch {
      setSigningOut(false)
      setShowSignOutConfirm(false)
    }
  }

  const name: string = user?.user_metadata?.full_name ?? ''
  const email = user?.email ?? ''
  const label = name || email || 'Account'

  return (
    <>
      <div className={`user-dropdown-wrapper ${mobile ? 'mobile-wrapper' : ''}`} ref={wrapRef}>
        {open && (
          <div className={`user-dropdown-menu ${mobile ? 'mobile-menu' : ''}`} role="menu" aria-label="Account">
            <button
              type="button"
              role="menuitem"
              className="neutral"
              autoFocus
              onClick={() => { setOpen(false); navigate('/settings') }}
            >
              Settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); setShowSignOutConfirm(true) }}
            >
              Sign out
            </button>
          </div>
        )}

        <button
          ref={triggerRef}
          type="button"
          className={mobile ? 'mobile-trigger' : 'home-user'}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Account menu for ${label}`}
          title={label}
          onClick={() => setOpen((o) => !o)}
        >
          <Avatar name={name} email={email} color={color} />
          {!mobile && (
            <span className="home-user-copy">
              <strong>{name || 'Your account'}</strong>
              <small>{email}</small>
            </span>
          )}
        </button>
      </div>

      {/* SIGN OUT CONFIRMATION MODAL — rendered via portal at body level */}
      {showSignOutConfirm && createPortal(
        <div
          className="end-dialog-backdrop"
          role="presentation"
          onClick={() => !signingOut && setShowSignOutConfirm(false)}
        >
          <div
            className="end-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="signout-title"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="end-dialog-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 17l5-5-5-5M15 12H3" />
                <path d="M14 3h6a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6" />
              </svg>
            </span>
            <h2 id="signout-title">Sign out?</h2>
            <p>You'll be signed out of SpeakNote. Your meetings and minutes are saved.</p>
            <div>
              <button type="button" onClick={() => setShowSignOutConfirm(false)} disabled={signingOut}>
                Cancel
              </button>
              <button type="button" onClick={confirmSignOut} disabled={signingOut}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}