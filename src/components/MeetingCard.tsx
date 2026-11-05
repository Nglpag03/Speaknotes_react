import { useState, type ReactNode } from 'react'
import type { Meeting } from '../lib/types'

export type IconName =
  | 'home' | 'calendar' | 'settings' | 'plus'
  | 'arrow' | 'logout' | 'copy' | 'check'
  | 'search' | 'x' | 'refresh'

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h6a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6" /></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></>,
    check: <polyline points="20 6 9 17 4 12"></polyline>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    refresh: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>,
  }

  return (
    <svg aria-hidden="true" className="home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

export function sortMeetings(meetings: Meeting[]) {
  return [...meetings].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (a.status !== 'active' && b.status === 'active') return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

export function useCopyCode(setError: (msg: string | null) => void) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setError('Could not copy automatically. Please select the code and copy manually.')
    }
  }

  return { copiedId, copy }
}

export function MeetingSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="bento-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bento-card" style={{ opacity: 0.6, animation: 'pulse 1.5s infinite' }}>
          <div className="bento-header">
            <div style={{ height: '12px', width: '12px', borderRadius: '4px', background: '#e2e8f0' }} />
            <div style={{ height: '20px', width: '60px', borderRadius: '10px', background: '#e2e8f0' }} />
          </div>
          <div style={{ height: '24px', width: '80%', borderRadius: '4px', background: '#e2e8f0', marginTop: '16px' }} />
          <div style={{ height: '16px', width: '40%', borderRadius: '4px', background: '#e2e8f0', marginTop: '8px' }} />
          <div className="bento-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ height: '24px', width: '80px', borderRadius: '6px', background: '#e2e8f0' }} />
            <div style={{ height: '24px', width: '60px', borderRadius: '6px', background: '#e2e8f0' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function MeetingCard({
  meeting,
  index,
  copiedId,
  onCopy,
  navigate,
  isHost,
}: {
  meeting: Meeting
  index: number
  copiedId: string | null
  onCopy: (id: string) => void
  navigate: (path: string) => void
  isHost: boolean
}) {
  // ✅ FIX: Route correctly based on both role and status
  const targetPath = isHost
    ? (meeting.status === 'active' ? `/host/${meeting.id}` : `/meeting/${meeting.id}`)
    : (meeting.status === 'active' ? `/join/${meeting.id}` : `/meeting/${meeting.id}`);

  const handleCardClick = () => navigate(targetPath)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCardClick()
    }
  }

  return (
    <div
      className={`bento-card ${meeting.status === 'active' ? 'active' : ''}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Open meeting ${meeting.title ?? meeting.id}`}
    >
      <div className="bento-header">
        <span className={`bento-color color-${index % 4}`} />
        <span className={`meeting-state ${meeting.status?.toLowerCase()}`}>
          <i />
          {meeting.status === 'active' ? 'Live Now' : 'Ended'}
        </span>
      </div>

      <div>
        <div className="bento-title">{meeting.title ?? 'Untitled meeting'}</div>
        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
          {isHost ? 'Hosted by you' : 'Joined meeting'} ·{' '}
          {new Date(meeting.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </p>
      </div>

      <div className="bento-footer">
        <span className="bento-code">{meeting.id}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className={`copy-btn ${copiedId === meeting.id ? 'copied' : ''}`}
            onClick={(e) => { e.stopPropagation(); onCopy(meeting.id); }}
            title="Click to copy code"
          >
            {copiedId === meeting.id ? <Icon name="check" /> : <Icon name="copy" />}
          </button>
          <span className="bento-open">
            Open <Icon name="arrow" />
          </span>
        </div>
      </div>
    </div>
  )
}