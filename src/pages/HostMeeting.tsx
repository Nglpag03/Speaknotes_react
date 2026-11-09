import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { endMeeting, getMeeting,  listParticipants, listTranscripts } from '../lib/data'
import { exportTranscriptPdf } from '../lib/pdf'
import type { Meeting,  Participant, TranscriptRow } from '../lib/types'

type HostIconName = 'arrow-left' | 'copy' | 'download' | 'users' | 'wave' | 'stop' | 'close'
function HostIcon({ name }: { name: HostIconName }) {
  const paths: Record<HostIconName, React.ReactNode> = {
    'arrow-left': <path d="m15 18-6-6 6-6" />,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 21h14" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    wave: <path d="M3 12h2l2-6 4 12 3-9 3 6 2-3h2" />,
    stop: <rect x="7" y="7" width="10" height="10" rx="1" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  }
  return (
    <svg aria-hidden="true" className="host-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

export default function HostMeeting() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([])
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set())
  const [liveText, setLiveText] = useState('')
  
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)

  useEffect(() => {
    if (!code) return
    ;(async () => {
      const currentMeeting = await getMeeting(code)
      if (!currentMeeting) { navigate('/'); return }
      setMeeting(currentMeeting)
      setParticipants(await listParticipants(code))
      setTranscripts(await listTranscripts(code))
    })().catch((err) => setError(err instanceof Error ? err.message : 'Unable to load meeting'))
  }, [code, navigate])

  useEffect(() => {
    if (!code || !meeting) return
    const pgChannel = supabase.channel(`db-changes-${code}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transcripts', filter: `meeting_id=eq.${code}` }, (payload) => {
        setTranscripts((current) => [...current, payload.new as TranscriptRow])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `meeting_id=eq.${code}` }, (payload) => {
        setParticipants((current) => [...current, payload.new as Participant])
      })
      .subscribe()

    const roomChannel = supabase.channel(`room:${code}`)
    roomChannel
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState()
        const ids = new Set<string>()
        Object.values(state).flat().forEach((participant: any) => ids.add(participant.user_id))
        setOnlineUsers(ids)
      })
      .on('broadcast', { event: 'live-text' }, (payload) => setLiveText(payload.payload.text))
      .subscribe()

    const hostChannel = supabase.channel(`host:${code}`)
    hostChannel.on('broadcast', { event: 'speaking' }, (payload) => {
      const { user_id, state } = payload.payload
      setSpeakingUsers((current) => {
        const next = new Set(current)
        if (state) next.add(user_id)
        else next.delete(user_id)
        return next
      })
    }).subscribe()

    return () => {
      supabase.removeChannel(pgChannel)
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(hostChannel)
    }
  }, [code, meeting])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [transcripts, liveText])

  async function handleEnd() {
    if (!code) return
    setBusy(true)
    setError(null)
    
    try {
      await endMeeting(code)
      navigate(`/meeting/${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end meeting')
      setBusy(false)
      setShowEndConfirm(false)
    }
  }

  async function copyCode() {
    if (!meeting) return
    await navigator.clipboard.writeText(meeting.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  if (!meeting) {
    return (
      <main className="host-loading">
        <span className="host-loading-orbit"><i /><i /><i /></span>
        <p>Opening your host workspace…</p>
      </main>
    )
  }

  const activeParticipants = participants.filter((participant) => !participant.kicked_at)

  return (
    <main className="host-room">
      <header className="host-topbar">
        <button className="host-back" type="button" onClick={() => navigate('/home')}>
          <HostIcon name="arrow-left" />
          <span>Back to home</span>
        </button>
        <div className="host-meeting-title">
          <div>
            <span className="host-eyebrow">HOSTING NOW</span>
            <h1>{meeting.title ?? 'Untitled meeting'}</h1>
          </div>
          <span className={`host-meeting-state ${meeting.status}`}>
            <i />{meeting.status}
          </span>
        </div>
        <div className="host-code">
          <span>Meeting code</span>
          <button className="host-code-badge" type="button" onClick={copyCode}>
            {meeting.id}
            <HostIcon name="copy" />
            {copied && <i className="host-copy-tip">Copied</i>}
          </button>
        </div>
      </header>

      {error && (
        <div className="host-error" role="alert">
          <span>!</span>
          <div>
            <strong>Something went wrong</strong>
            <p>{error}</p>
          </div>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
            <HostIcon name="close" />
          </button>
        </div>
      )}

      <div className="host-workspace">
        <aside className="host-participants">
          <div className="host-panel-title">
            <div>
              <span className="host-eyebrow">IN THIS ROOM</span>
              <h2>Participants</h2>
            </div>
            <span className="host-count">
              <HostIcon name="users" />
              {onlineUsers.size}/{activeParticipants.length}
            </span>
          </div>
          <div className="host-participant-list">
            {participants.length === 0 ? (
              <div className="host-participants-empty">
                <HostIcon name="users" />
                <p>Waiting for people to join…</p>
              </div>
            ) : (
              participants.map((participant, index) => {
                const isOnline = onlineUsers.has(participant.user_id)
                const isSpeaking = speakingUsers.has(participant.user_id)
                const name = participant.full_name || 'Guest'
                const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div className={`host-participant ${participant.kicked_at ? 'removed' : ''} ${isSpeaking ? 'speaking' : ''}`} key={participant.user_id}>
                    <span className={`host-participant-avatar color-${index % 4}`}>
                      {initials}
                      <i className={isOnline ? 'online' : ''} />
                    </span>
                    <span className="host-participant-copy">
                      <strong>{name}</strong>
                      <small>{participant.kicked_at ? 'Removed' : isSpeaking ? 'Speaking now' : isOnline ? 'In the room' : 'Offline'}</small>
                    </span>
                    {isSpeaking && <span className="speaking-bars"><i /><i /><i /></span>}
                  </div>
                )
              })
            )}
          </div>
          <div className="host-participants-foot">
            <span><i /> Online now</span>
            <p>Presence updates automatically as people enter and leave.</p>
          </div>
        </aside>

        <section className="host-main-panel">
          <div className="host-transcript-panel">
            {transcripts.length === 0 && !liveText ? (
              <div className="transcript-empty">
                <span className="transcript-empty-wave"><i /><i /><i /><i /><i /></span>
                <h3>Listening for the conversation</h3>
                <p>Transcribed speech will appear here in real time.</p>
              </div>
            ) : (
              <>
                <div className="transcript-toolbar">
                  <div>
                    <span className="transcript-live-label"><i /> Live</span>
                    <span>{transcripts.length} captured segments</span>
                  </div>
                  <button type="button" disabled={transcripts.length === 0} onClick={() => exportTranscriptPdf(meeting, transcripts)}>
                    <HostIcon name="download" /> Export transcript
                  </button>
                </div>
                <div className="host-transcript-feed">
                  <div className="transcript-entries">
                    {transcripts.map((transcript, index) => {
                      const name = transcript.full_name || 'Participant'
                      const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
                      return (
                        <article className="transcript-entry" key={transcript.id}>
                          <span className={`transcript-avatar color-${index % 4}`}>{initials}</span>
                          <div>
                            <span className="transcript-meta"><strong>{name}</strong><time>Just now</time></span>
                            <p>{transcript.content}</p>
                          </div>
                        </article>
                      )
                    })}
                    {liveText && (
                      <article className="transcript-entry live-entry">
                        <span className="transcript-avatar live"><HostIcon name="wave" /></span>
                        <div>
                          <span className="transcript-meta"><strong>Speaking now</strong><span className="typing-dots"><i /><i /><i /></span></span>
                          <p>{liveText}</p>
                        </div>
                      </article>
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <footer className="host-controls">
        <div className="host-controls-status">
          <span className={meeting.status === 'active' ? 'active' : ''}><i /></span>
          <div>
            <strong>{meeting.status === 'active' ? 'Meeting in progress' : 'Meeting ended'}</strong>
            <small>{meeting.status === 'active' ? `${onlineUsers.size} participant${onlineUsers.size === 1 ? '' : 's'} online` : 'This room is now closed'}</small>
          </div>
        </div>
        <div className="host-control-actions">
          <button className="host-export-button" type="button" disabled={transcripts.length === 0} onClick={() => exportTranscriptPdf(meeting, transcripts)}>
            <HostIcon name="download" /> <span>Transcript</span>
          </button>
          
          <button className="host-end-button" type="button" onClick={() => setShowEndConfirm(true)} disabled={busy}>
            <HostIcon name="stop" /> <span>End meeting</span>
          </button>
        </div>
      </footer>

      {/* END MEETING MODAL */}
      {showEndConfirm && (
        <div className="end-dialog-backdrop" role="presentation">
          <div className="end-dialog" role="alertdialog" aria-modal="true">
            <span className="end-dialog-icon"><HostIcon name="stop" /></span>
            <h2>End this meeting?</h2>
            <p>Participants will be disconnected. You can generate the AI minutes from the next page.</p>
            <div>
              <button type="button" onClick={() => setShowEndConfirm(false)} disabled={busy}>Keep open</button>
              <button type="button" onClick={handleEnd} disabled={busy}>{busy ? 'Ending…' : 'End meeting'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}