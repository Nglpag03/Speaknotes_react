import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase';
import { signOut } from '../lib/auth';
import { createMeeting, joinMeeting, listMyMeetings } from '../lib/data';
import type { Meeting } from '../lib/types';

type IconName = 'home' | 'calendar' | 'notes' | 'settings' | 'plus' | 'arrow' | 'logout'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    notes: <><path d="M5 3h11l3 3v15H5z" /><path d="M14 3v5h5M8 12h8M8 16h6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h6a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6" /></>,
  }

  return (
    <svg aria-hidden="true" className="home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

function BrandMark() {
  return (
    <span className="home-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d="m8 11.4 8-5 8 5v9.2l-8 5-8-5v-9.2Z" fill="currentColor" opacity=".2" />
        <path d="m11 13 5-3 5 3v6l-5 3-5-3v-6Z" fill="currentColor" />
        <path d="M16 10v12m-5-9 10 6m0-6-10 6" fill="none" stroke="white" strokeWidth="1.3" />
      </svg>
    </span>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [email, setEmail] = useState<string | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [title, setTitle] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // State for the dropdown menu
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth', { replace: true })
        return
      }

      if (cancelled) return

      setEmail(user.email ?? null)
      setJoinName(
        (user.user_metadata?.full_name as string | undefined) ?? '',
      )

      try {
        setMeetings(await listMyMeetings())
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load meetings',
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [navigate])

  // Close the dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-dropdown-wrapper')) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      const code = await createMeeting(title || undefined)
      navigate(`/host/${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      const normalizedCode = joinCode.trim().toUpperCase()
      await joinMeeting(normalizedCode, joinName)
      navigate(`/join/${normalizedCode}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Join failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSignOut() {
    await signOut()
    navigate('/auth', { replace: true })
  }

  const displayName = joinName.trim() || email?.split('@')[0] || 'there'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="home-layout">
      <aside className="home-sidebar">
        <button className="home-brand" type="button" onClick={() => navigate('/home')}>
          <BrandMark />
          <span>SpeakNote</span>
        </button>

        <nav className="home-nav" aria-label="Primary navigation">
          <button className="active" type="button">
            <Icon name="home" />
            <span>Overview</span>
          </button>
          <button type="button">
            <Icon name="calendar" />
            <span>Meetings</span>
          </button>
          <button type="button">
            <Icon name="notes" />
            <span>Notes</span>
          </button>
        </nav>

        <div className="home-sidebar-bottom">
          <button type="button">
            <Icon name="settings" />
            <span>Settings</span>
          </button>
          
          {/* DESKTOP USER DROPDOWN */}
          <div className="user-dropdown-wrapper">
            {showMenu && (
              <div className="user-dropdown-menu">
                <button type="button" onClick={onSignOut}>
                  <Icon name="logout" />
                  Sign out
                </button>
              </div>
            )}
            <button 
              className="home-user" 
              type="button" 
              onClick={() => setShowMenu(!showMenu)}
            >
              <span className="home-avatar">{initials}</span>
              <span className="home-user-copy">
                <strong>{displayName}</strong>
                <small>{email ?? 'Loading account…'}</small>
              </span>
            </button>
          </div>
          
        </div>
      </aside>

      <main className="home-main">
        
        <div className="mobile-brand-header">
          <BrandMark />
          <span>SpeakNote</span>
        </div>

        <header className="home-topbar">
          <div>
            <span className="home-kicker">WORKSPACE</span>
            <h1>Good morning, {displayName}</h1>
            <p>Ready to turn today’s conversations into clear notes?</p>
          </div>
          <div className="home-topbar-actions">
            <span className="home-status"><i /> All systems operational</span>
            
            {/* MOBILE USER DROPDOWN */}
            <div className="user-dropdown-wrapper mobile-wrapper">
              {showMenu && (
                <div className="user-dropdown-menu mobile-menu">
                  <button type="button" onClick={onSignOut}>
                    <Icon name="logout" />
                    Sign out
                  </button>
                </div>
              )}
              <button 
                className="home-avatar mobile-avatar" 
                onClick={() => setShowMenu(!showMenu)}
              >
                {initials}
              </button>
            </div>

          </div>
        </header>

        {error && (
          <div className="home-error" role="alert">
            <strong>Something went wrong</strong>
            <span>{error}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>
          </div>
        )}

        <section className="meeting-actions" aria-label="Meeting actions">
          <article className="meeting-action-card create-card">
            <span className="action-number">01</span>
            <div className="action-icon create">
              <Icon name="plus" />
            </div>
            <div className="action-copy">
              <h2>Start a new meeting</h2>
              <p>Create a room and invite others with a simple code.</p>
            </div>
            <form onSubmit={onCreate}>
              <label htmlFor="meeting-title">Meeting title <span>Optional</span></label>
              <div className="action-input-row">
                <input
                  id="meeting-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Weekly product sync"
                />
                <button type="submit" disabled={busy}>
                  {busy ? <span className="home-spinner" /> : <><span>Create meeting</span><Icon name="arrow" /></>}
                </button>
              </div>
            </form>
          </article>

          <article className="meeting-action-card join-card">
            <span className="action-number">02</span>
            <div className="action-icon join">
              <Icon name="arrow" />
            </div>
            <div className="action-copy">
              <h2>Join with a code</h2>
              <p>Enter the code shared by your meeting host.</p>
            </div>
            <form onSubmit={onJoin}>
              <div className="join-fields">
                <label htmlFor="join-code">
                  Meeting code
                  <input
                    id="join-code"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="ABCD1234"
                    required
                  />
                </label>
                <label htmlFor="join-name">
                  Display name
                  <input
                    id="join-name"
                    value={joinName}
                    onChange={(event) => setJoinName(event.target.value)}
                    placeholder="Your name"
                    required
                  />
                </label>
              </div>
              <button className="join-submit" type="submit" disabled={busy}>
                {busy ? <span className="home-spinner dark" /> : <><span>Join meeting</span><Icon name="arrow" /></>}
              </button>
            </form>
          </article>
        </section>

        <section className="recent-meetings">
          <div className="section-title-row">
            <div>
              <span className="home-kicker">RECENT ACTIVITY</span>
              <h2>Your hosted meetings</h2>
            </div>
            {meetings.length > 0 && <button type="button">View all <Icon name="arrow" /></button>}
          </div>

          {meetings.length === 0 ? (
            <div className="meetings-empty">
              <div className="empty-illustration">
                <span className="empty-wave one" />
                <span className="empty-wave two" />
                <span className="empty-wave three" />
              </div>
              <div>
                <h3>Your meeting history starts here</h3>
                <p>Create your first meeting and it will appear in this space.</p>
              </div>
              <button type="button" onClick={() => document.getElementById('meeting-title')?.focus()}>
                <Icon name="plus" />
                Create a meeting
              </button>
            </div>
          ) : (
            <div className="meeting-table">
              <div className="meeting-table-head">
                <span>Meeting</span>
                <span>Code</span>
                <span>Status</span>
                <span />
              </div>
              {meetings.map((meeting, index) => (
                <button
                  className="meeting-row"
                  type="button"
                  key={meeting.id}
                  onClick={() => navigate(`/host/${meeting.id}`)}
                >
                  <span className={`meeting-color color-${index % 4}`} />
                  <span className="meeting-name">
                    <strong>{meeting.title ?? 'Untitled meeting'}</strong>
                    <small>Hosted by you</small>
                  </span>
                  <code>{meeting.id}</code>
                  <span className={`meeting-state ${meeting.status?.toLowerCase()}`}>
                    <i />
                    {meeting.status}
                  </span>
                  <span className="row-arrow"><Icon name="arrow" /></span>
                </button>
              ))}
            </div>
          )}
        </section>

        <nav className="mobile-nav">
          <button className="active" type="button">
            <Icon name="home" />
            <span>Home</span>
          </button>
          <button type="button">
            <Icon name="calendar" />
            <span>Meetings</span>
          </button>
          <button type="button">
            <Icon name="notes" />
            <span>Notes</span>
          </button>
          {/* We can remove Sign out from bottom nav since it's now in the avatar dropdown */}
          <button type="button" onClick={() => setShowMenu(true)}>
            <Icon name="settings" />
            <span>Profile</span>
          </button>
        </nav>

      </main>
    </div>
  )
}