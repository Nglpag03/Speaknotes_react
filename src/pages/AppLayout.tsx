import { useEffect, useState } from 'react'
import { useNavigate, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { UserMenu } from '../components/UserMenu'

type IconName = 'home' | 'calendar' | 'settings'

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
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

export default function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [email, setEmail] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate('/auth', { replace: true })
        return
      }
      setEmail(user.email ?? null)
      setJoinName(user.user_metadata?.full_name ?? '')
    })
  }, [navigate])

  const displayName = joinName.trim() || email?.split('@')[0] || 'there'

  const isMeetings = pathname.startsWith('/meetings') || pathname.startsWith('/meeting/')
  const isHome = !isMeetings && !pathname.startsWith('/settings')

  return (
    <div className="home-layout">
      <aside className="home-sidebar">
        <button className="home-brand" type="button" onClick={() => navigate('/home')}>
          <BrandMark />
          <span>SpeakNote</span>
        </button>

        <nav className="home-nav" aria-label="Primary navigation">
          <button className={isHome ? 'active' : ''} type="button" aria-current={isHome ? 'page' : undefined} onClick={() => navigate('/home')}>
            <Icon name="home" />
            <span>Overview</span>
          </button>
          <button className={isMeetings ? 'active' : ''} type="button" aria-current={isMeetings ? 'page' : undefined} onClick={() => navigate('/meetings')}>
            <Icon name="calendar" />
            <span>Meetings</span>
          </button>
        </nav>

        <div className="home-sidebar-bottom">
          <UserMenu />
        </div>
      </aside>

      <main className="home-main">
        {/* ✅ NEW: sticky mobile header row (brand + avatar) */}
        <div className="mobile-header-row">
          <div className="mobile-brand-header">
            <BrandMark />
            <span>SpeakNote</span>
          </div>
          <div className="mobile-user">
            <UserMenu variant="mobile" />
          </div>
        </div>

        <Outlet context={{ displayName }} />
      </main>

      <nav className="mobile-nav" aria-label="Primary navigation">
        <button className={isHome ? 'active' : ''} type="button" onClick={() => navigate('/home')}>
          <Icon name="home" />
          <span>Home</span>
        </button>
        <button className={isMeetings ? 'active' : ''} type="button" onClick={() => navigate('/meetings')}>
          <Icon name="calendar" />
          <span>Meetings</span>
        </button>
        <button type="button" onClick={() => navigate('/settings')}>
          <Icon name="settings" />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  )
}