import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createMeeting, joinMeeting, listMyMeetings, listJoinedMeetings, deleteMeeting } from '../lib/data'
import type { Meeting } from '../lib/types'
import { Icon, MeetingCard, MeetingSkeletons, sortMeetings } from '../components/MeetingCard'

const VISIBLE_LIMIT = 3
const CODE_LENGTH = 8

function cleanCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, CODE_LENGTH)
}

export default function Home() {
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [joinedMeetings, setJoinedMeetings] = useState<Meeting[]>([])
  const [title, setTitle] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const mounted = useRef(true)
  const copyTimer = useRef<number | undefined>(undefined)

  const [meetingToDelete, setMeetingToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [hosted, joined] = await Promise.all([listMyMeetings(), listJoinedMeetings()])
      if (!mounted.current) return
      setMeetings(hosted)
      setJoinedMeetings(joined)
    } catch (err) {
      if (mounted.current) setLoadError(err instanceof Error ? err.message : 'Could not load your meetings.')
    } finally {
      if (mounted.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted.current) return
      if (!user) {
        navigate('/auth', { replace: true })
        return
      }
      setJoinName(user.user_metadata?.full_name ?? '')
      load()
    })()
    return () => {
      mounted.current = false
      window.clearTimeout(copyTimer.current)
    }
  }, [navigate, load])

  // Press "N" to jump to the title field. (Cmd/Ctrl+N is reserved by browsers and can't be overridden.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.matches('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      document.getElementById('meeting-title')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleCopy = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setError('Couldn’t copy automatically. Select the code and copy it manually.')
    }
  }, [])

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isCreating) return
    setError(null)
    setIsCreating(true)
    try {
      const code = await createMeeting(title.trim() || undefined)
      navigate(`/host/${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t create the meeting. Try again.')
      setIsCreating(false)
    }
  }

  async function handleDelete() {
  if (!meetingToDelete) return
  setIsDeleting(true)
  try {
    await deleteMeeting(meetingToDelete)
    
    // Remove from UI immediately without reloading
    setMeetings((current) => current.filter((m) => m.id !== meetingToDelete))
    setJoinedMeetings((current) => current.filter((m) => m.id !== meetingToDelete))
    
    setMeetingToDelete(null)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to delete meeting')
  } finally {
    setIsDeleting(false)
  }
}

  async function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isJoining) return
    setError(null)
    setIsJoining(true)
    try {
      await joinMeeting(joinCode, joinName.trim())
      navigate(`/join/${joinCode}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t join. Check the code and try again.')
      setIsJoining(false)
    }
  }

  const sortedHosted = useMemo(() => sortMeetings(meetings), [meetings])
  const liveMeeting = sortedHosted.find((m) => m.status === 'active')
  const visibleHosted = sortedHosted.slice(0, VISIBLE_LIMIT)
  const visibleJoined = joinedMeetings.slice(0, VISIBLE_LIMIT)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = joinName.trim().split(' ')[0]
  const canJoin = joinCode.length >= 4 && joinName.trim().length > 0

  return (
    <>
      <header className="home-topbar">
        <div>
          <h1>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p>Start a meeting or join one with a code.</p>
        </div>
      </header>

      {error && (
        <div className="home-error" role="alert">
          <strong>Something went wrong</strong>
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {liveMeeting && (
        <div style={{ 
          position: 'fixed', 
          top: '24px', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          zIndex: 100,
          background: '#1e293b', 
          color: '#fff',
          padding: '8px 16px', 
          borderRadius: '24px',
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          animation: 'slideDown 0.3s ease'
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: '13px', fontWeight: 500 }}>
            You have a live meeting: <strong>{liveMeeting.title || 'Untitled'}</strong>
          </span>
          <button 
            onClick={() => navigate(`/host/${liveMeeting.id}`)}
            style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer' }}
          >
            Resume
          </button>
          <style>{`@keyframes slideDown { from { top: -50px; opacity: 0; } to { top: 24px; opacity: 1; } }`}</style>
        </div>
      )}

      <section className="meeting-actions" aria-label="Meeting actions">
        <article className="meeting-action-card create-card">
          <div className="action-icon create"><Icon name="plus" /></div>
          <div className="action-copy">
            <h2>Start a new meeting</h2>
            <p>Create a room, then share the code with everyone joining.</p>
          </div>
          <form onSubmit={onCreate}>
            <label htmlFor="meeting-title">
              Meeting title <span>Optional · press <kbd>N</kbd> to focus</span>
            </label>
            <div className="action-input-row">
              <input
                id="meeting-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Weekly product sync"
                maxLength={80}
                autoComplete="off"
              />
              <button type="submit" disabled={isCreating} aria-busy={isCreating}>
                {isCreating ? <span className="home-spinner" aria-label="Creating" /> : <><span>Create meeting</span><Icon name="arrow" /></>}
              </button>
            </div>
          </form>
        </article>

        <article className="meeting-action-card join-card">
          <div className="action-icon join"><Icon name="arrow" /></div>
          <div className="action-copy">
            <h2>Join with a code</h2>
            <p>Enter the code your host shared with you.</p>
          </div>
          <form onSubmit={onJoin}>
            <div className="join-fields">
              <label htmlFor="join-code">
                Meeting code
                <input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(cleanCode(e.target.value))}
                  onPaste={(e) => {
                    e.preventDefault()
                    setJoinCode(cleanCode(e.clipboardData.getData('text')))
                  }}
                  placeholder="ABCD1234"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                />
              </label>
              <label htmlFor="join-name">
                Display name
                <input
                  id="join-name"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </label>
            </div>
            <button className="join-submit" type="submit" disabled={isJoining || !canJoin} aria-busy={isJoining}>
              {isJoining ? <span className="home-spinner dark" aria-label="Joining" /> : <><span>Join meeting</span><Icon name="arrow" /></>}
            </button>
          </form>
        </article>
      </section>

      <section className="recent-meetings" aria-labelledby="hosted-heading">
        <div className="section-title-row">
          <h2 id="hosted-heading">Your meetings</h2>
          {meetings.length > VISIBLE_LIMIT && (
            <button type="button" onClick={() => navigate('/meetings?tab=hosted')}>
              View all {meetings.length} <Icon name="arrow" />
            </button>
          )}
        </div>

        {loadError ? (
          <div className="home-error" role="alert">
            <strong>Couldn’t load your meetings</strong>
            <span>{loadError}</span>
            <button type="button" className="retry-btn" onClick={load}>
              <Icon name="refresh" /> Retry
            </button>
          </div>
        ) : isLoading ? (
          <MeetingSkeletons />
        ) : meetings.length === 0 ? (
          <div className="meetings-empty">
            <div className="empty-illustration" aria-hidden="true">
              <span className="empty-wave one" />
              <span className="empty-wave two" />
              <span className="empty-wave three" />
            </div>
            <div>
              <h3>No meetings yet</h3>
              <p>Meetings you host will show up here with their transcript and notes.</p>
            </div>
            <button type="button" onClick={() => document.getElementById('meeting-title')?.focus()}>
              <Icon name="plus" /> Start a meeting
            </button>
          </div>
        ) : (
          <ul className="mtg-grid">
            {visibleHosted.map((m, i) => (
              <MeetingCard 
              key={m.id} 
              meeting={m} 
              index={i} 
              isHost 
              copiedId={copiedId} 
              onCopy={handleCopy} 
              navigate={navigate} 
              onDelete={(id) => setMeetingToDelete(id)} 
            />
            ))}
          </ul>
        )}
      </section>

      {!isLoading && !loadError && joinedMeetings.length > 0 && (
        <section className="recent-meetings" aria-labelledby="joined-heading">
          <div className="section-title-row">
            <h2 id="joined-heading">Recently joined</h2>
            {joinedMeetings.length > VISIBLE_LIMIT && (
              <button type="button" onClick={() => navigate('/meetings?tab=joined')}>
                View all {joinedMeetings.length} <Icon name="arrow" />
              </button>
            )}
          </div>
          <ul className="mtg-grid">
            {visibleJoined.map((m, i) => (
              <MeetingCard key={m.id} meeting={m} index={i} isHost={false} copiedId={copiedId} onCopy={handleCopy} navigate={navigate} />
            ))}
          </ul>
        </section>
      )}

      {meetingToDelete && (
  <div className="end-dialog-backdrop" role="presentation">
    <div className="end-dialog" role="alertdialog" aria-modal="true">
      <span className="end-dialog-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        </svg>
      </span>
      <h2>Delete this meeting?</h2>
      <p>This will permanently delete the meeting, its transcript, and the AI minutes. This action cannot be undone.</p>
      <div>
        <button type="button" onClick={() => setMeetingToDelete(null)} disabled={isDeleting}>
          Cancel
        </button>
        <button type="button" onClick={handleDelete} disabled={isDeleting} style={{ background: '#ad5143', borderColor: '#ad5143', color: '#fff' }}>
          {isDeleting ? 'Deleting…' : 'Delete meeting'}
        </button>
      </div>
    </div>
  </div>
)}

    </>
  )
}