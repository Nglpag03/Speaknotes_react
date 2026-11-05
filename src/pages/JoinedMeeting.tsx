import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useScribe } from '@elevenlabs/react'
import { supabase } from '../lib/supabase'
import { getMeeting, listParticipants } from '../lib/data'
import { createRoomChannel } from '../lib/realtime'
import type { Meeting, Participant } from '../lib/types'

type RoomIconName = 'arrow-left' | 'copy' | 'mic' | 'mic-off' | 'users' | 'shield' | 'wave' | 'close'

function RoomIcon({ name }: { name: RoomIconName }) {
  const paths: Record<RoomIconName, React.ReactNode> = {
    'arrow-left': <path d="m15 18-6-6 6-6" />,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
    'mic-off': <><path d="m3 3 18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9V6a3 3 0 0 0-5.6-1.5M5 11a7 7 0 0 0 11.7 5.2M19 11a7 7 0 0 1-.5 2.6M12 18v3M9 21h6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4" />,
    wave: <path d="M3 12h2l2-6 4 12 3-9 3 6 2-3h2" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  }
  return (
    <svg aria-hidden="true" className="room-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export default function JoinedMeeting() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [liveText, setLiveText] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [copied, setCopied] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  
  const channelRef = useRef<RealtimeChannel | null>(null)

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    onPartialTranscript: (data) => {
      setLiveText(data.text ?? '')
      if (channelRef.current && data.text) {
        channelRef.current.send({ type: 'broadcast', event: 'live-text', payload: { text: data.text } })
      }
    },
    onCommittedTranscript: async (data) => {
      if (data.text) {
        await supabase.from('transcripts').insert({
          meeting_id: code,
          content: data.text,
        })
      }
      setLiveText('')
      if (channelRef.current) {
        channelRef.current.send({ type: 'broadcast', event: 'live-text', payload: { text: '' } })
      }
    },
  })

  // 1. Initial Fetch
  useEffect(() => {
    if (!code) return
    ;(async () => {
      const currentMeeting = await getMeeting(code)
      if (!currentMeeting) {
        navigate('/', { replace: true })
        return
      }
      if (currentMeeting.status === 'ended') {
        navigate(`/meeting/${code}`, { replace: true })
        return
      }
      setMeeting(currentMeeting)
      setParticipants(await listParticipants(code))
    })()
  }, [code, navigate])

  // 2. Presence Tracking
  useEffect(() => {
    if (!code || !meeting) return
    const channel = createRoomChannel(code)
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {})
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data: { user } } = await supabase.auth.getUser()
          await channel.track({ user_id: user?.id })
        }
      })

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [code, meeting])

  // 3. Timer for active broadcast
  useEffect(() => {
    if (!isBroadcasting) {
      setElapsedSeconds(0)
      return
    }
    const timer = window.setInterval(() => setElapsedSeconds((c) => c + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isBroadcasting])

  async function toggleMic() {
    const nextState = !isBroadcasting
    if (nextState) {
      try {
        setAudioError(null)
        if (scribe.status === 'connected' || scribe.status === 'connecting') return

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No active session')

        const response = await fetch('/api/scribe-token', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!response.ok) throw new Error('Unable to start transcription')
        
        const { token } = await response.json()
        await scribe.connect({
          token,
          modelId: 'scribe_v2_realtime',
          languageCode: 'fil',
          microphone: { echoCancellation: true, noiseSuppression: true },
        })

        await channelRef.current?.send({
          type: 'broadcast',
          event: 'speaking',
          payload: { user_id: session.user.id, state: true },
        })
        setIsBroadcasting(true)
      } catch (err) {
        setAudioError(err instanceof Error ? err.message : 'Microphone connection failed')
        setIsBroadcasting(false)
      }
    } else {
      await scribe.disconnect()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await channelRef.current?.send({
          type: 'broadcast',
          event: 'speaking',
          payload: { user_id: session.user.id, state: false },
        })
      }
      setLiveText('')
      setIsBroadcasting(false)
    }
  }

  async function copyCode() {
    if (!meeting) return
    await navigator.clipboard.writeText(meeting.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function handleLeave() {
    // Optional: Disconnect audio before leaving
    if (isBroadcasting) scribe.disconnect()
    navigate('/home')
  }

  if (!meeting) {
    return (
      <main className="room-loading">
        <div className="room-loading-mark"><span /><span /><span /><span /></div>
        <p>Preparing your meeting room…</p>
      </main>
    )
  }

  const activeParticipants = participants.filter((p) => !p.kicked_at)

  return (
    <main className={`joined-room ${isBroadcasting ? 'is-live' : ''}`}>
      <header className="room-topbar">
        <button className="room-back" type="button" onClick={() => setShowLeaveConfirm(true)}>
          <RoomIcon name="arrow-left" />
          <span>Leave room</span>
        </button>

        <div className="room-title">
          <span className="room-live-dot" />
          <div>
            <h1>{meeting.title ?? 'Untitled meeting'}</h1>
            <button type="button" onClick={copyCode} aria-label="Copy meeting code">
              Room {meeting.id}
              <RoomIcon name="copy" />
              {copied && <span className="copy-message">Copied</span>}
            </button>
          </div>
        </div>

        <div className="room-security">
          <RoomIcon name="shield" />
          <span>Private room</span>
        </div>
      </header>

      <div className="room-content">
        <section className="recording-stage" aria-label="Microphone controls">
          <div className="stage-status">
            <span className={isBroadcasting ? 'active' : ''}>
              <i />
              {isBroadcasting ? `Live · ${formatTime(elapsedSeconds)}` : 'Microphone is off'}
            </span>
          </div>

          <div className={`mic-visualizer ${isBroadcasting ? 'active' : ''}`}>
            <div className="mic-ring ring-three" />
            <div className="mic-ring ring-two" />
            <div className="mic-ring ring-one" />
            
            <button
              className="mic-control"
              type="button"
              onClick={toggleMic}
              aria-pressed={isBroadcasting}
              aria-label={isBroadcasting ? 'Stop microphone' : 'Start microphone'}
            >
              <RoomIcon name={isBroadcasting ? 'mic-off' : 'mic'} />
            </button>

            {isBroadcasting && (
              <div className="audio-bars" aria-hidden="true">
                {[18, 34, 24, 44, 28, 38, 20].map((height, index) => (
                  <i key={index} style={{ '--bar-height': `${height}px`, '--bar-delay': `${index * 90}ms` } as React.CSSProperties} />
                ))}
              </div>
            )}
          </div>

          <div className="mic-instructions">
            <h2>{isBroadcasting ? 'We’re listening' : 'Ready when you are'}</h2>
            <p>
              {isBroadcasting
                ? 'Speak naturally. Your words are being transcribed and shared with the host.'
                : 'Tap the microphone to begin sharing your voice with the meeting host.'}
            </p>
          </div>

          <div className={`live-transcript ${liveText ? 'has-text' : ''}`} aria-live="polite">
            <div className="transcript-label">
              <RoomIcon name="wave" />
              <span>Live transcript</span>
              {isBroadcasting && <i>Listening in Filipino</i>}
            </div>
            <p>
              {liveText || (isBroadcasting ? 'Start speaking and your words will appear here…' : 'Your live transcription will appear here when the microphone is on.')}
            </p>
          </div>

          {audioError && (
            <div className="room-audio-error" role="alert">
              <span className="error-symbol">!</span>
              <div>
                <strong>We couldn’t access your microphone</strong>
                <p>{audioError}. Check your browser permissions and try again.</p>
              </div>
              <button type="button" onClick={() => setAudioError(null)} aria-label="Dismiss error">
                <RoomIcon name="close" />
              </button>
            </div>
          )}

          <p className="room-privacy-note">
            <RoomIcon name="shield" />
            Audio is transcribed securely and is not stored.
          </p>
        </section>

        <aside className="participants-panel">
          <div className="participants-heading">
            <div>
              <span className="panel-kicker">IN THIS ROOM</span>
              <h2>Participants</h2>
            </div>
            <span className="participant-count">
              <RoomIcon name="users" />
              {activeParticipants.length}
            </span>
          </div>

          <div className="participant-list">
            {participants.map((participant, index) => {
              const name = participant.full_name || 'Guest'
              const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
              return (
                <div className={`participant ${participant.kicked_at ? 'inactive' : ''}`} key={participant.user_id}>
                  <span className={`participant-avatar avatar-${index % 4}`}>
                    {initials}
                    {!participant.kicked_at && <i />}
                  </span>
                  <span className="participant-details">
                    <strong>{name}</strong>
                    <small>{participant.kicked_at ? 'Removed from room' : index === 0 ? 'Host' : 'In the room'}</small>
                  </span>
                  {!participant.kicked_at && index === 0 && <span className="host-badge">HOST</span>}
                </div>
              )
            })}
          </div>

          <div className="participants-footer">
            <div className="participant-wave"><i /><i /><i /><i /><i /></div>
            <p>Everyone in this room can see when your microphone is active.</p>
          </div>
        </aside>
      </div>

      {/* Leave Room Confirmation */}
      {showLeaveConfirm && (
        <div className="end-dialog-backdrop" role="presentation">
          <div className="end-dialog" role="alertdialog" aria-modal="true">
            <h2>Leave the meeting?</h2>
            <p>You will stop broadcasting your microphone and disconnect from the room.</p>
            <div>
              <button type="button" onClick={() => setShowLeaveConfirm(false)}>Stay</button>
              <button type="button" onClick={handleLeave}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}