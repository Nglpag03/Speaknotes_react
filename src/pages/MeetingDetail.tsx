import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMeeting, listParticipants, listTranscripts, getMinutes, requestSummary } from '../lib/data'
import { exportMinutesPdf, exportTranscriptPdf } from '../lib/pdf'
import type { Meeting, Participant, TranscriptRow, Minutes } from '../lib/types'
import { FormalMinutes } from '../components/FormalMinutes'

export default function MeetingDetail() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const minutesRef = useRef<HTMLDivElement>(null)

  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([])
  const [minutes, setMinutes] = useState<Minutes | null>(null)
  const [loading, setLoading] = useState(true)

  // Venue & Generation State
  const [showVenuePrompt, setShowVenuePrompt] = useState(false)
  const [venue, setVenue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    let cancelled = false

    ;(async () => {
      try {
        const m = await getMeeting(code)
        if (!m) { navigate('/meetings'); return }
        if (cancelled) return
        setMeeting(m)
        
        const [p, t, min] = await Promise.all([listParticipants(code), listTranscripts(code), getMinutes(code)])
        if (cancelled) return
        setParticipants(p)
        setTranscripts(t)
        setMinutes(min)
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [code, navigate])

  function handleGenerateClick() {
    setShowVenuePrompt(true)
  }

  async function submitGenerate() {
    if (!code || isGenerating) return
    setShowVenuePrompt(false)
    setIsGenerating(true)
    setGenError(null)
    try {
      const response = await requestSummary(code, venue || 'N/A')
      setMinutes(response.minutes)
      setTimeout(() => { minutesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 100)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate minutes')
    } finally {
      setIsGenerating(false)
    }
  }

  if (loading || !meeting) {
    return (
      <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ height: '20px', width: '120px', background: '#e2e8f0', borderRadius: '4px', marginBottom: '24px', animation: 'pulse 1.5s infinite' }} />
        <div style={{ height: '40px', width: '60%', background: '#e2e8f0', borderRadius: '8px', marginBottom: '12px', animation: 'pulse 1.5s infinite' }} />
        <div style={{ height: '400px', width: '100%', background: '#e2e8f0', borderRadius: '13px', animation: 'pulse 1.5s infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
      </div>
    )
  }

  const start = new Date(meeting.created_at).getTime()
  const end = meeting.ended_at ? new Date(meeting.ended_at).getTime() : Date.now()
  const durationMin = Math.max(1, Math.round((end - start) / 60000))

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => navigate('/meetings?tab=hosted')} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: 0, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1e293b'} onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to meetings
        </button>
      </div>

      <header className="home-topbar">
        <div>
          <span className="home-kicker">MEETING RECORD</span>
          <h1>{meeting.title ?? 'Untitled meeting'}</h1>
          <p>{new Date(meeting.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {durationMin} min</p>
        </div>
        <div className="home-topbar-actions">
          <button className="host-export-button" onClick={() => exportTranscriptPdf(meeting, transcripts)} disabled={transcripts.length === 0} style={{ opacity: transcripts.length === 0 ? 0.5 : 1, cursor: transcripts.length === 0 ? 'not-allowed' : 'pointer' }}>Export transcript</button>
        </div>
      </header>

      <div className="meeting-detail-grid">
        <section className="meeting-detail-transcript">
          <h2 style={{ marginBottom: '16px', fontSize: '16px', fontFamily: 'Manrope, sans-serif' }}>Transcript</h2>
          {transcripts.length === 0 ? (
            <p style={{ color: '#89928f' }}>No transcript was captured for this meeting.</p>
          ) : (
            <div className="transcript-entries" style={{ padding: 0 }}>
              {transcripts.map((t, i) => {
                const name = t.full_name ?? 'Guest'
                const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <article className="transcript-entry" key={t.id}>
                    <span className={`transcript-avatar color-${i % 4}`}>{initials}</span>
                    <div><span className="transcript-meta"><strong>{name}</strong></span><p>{t.content}</p></div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <aside className="meeting-detail-sidebar">
          <h2 style={{ marginBottom: '12px', fontSize: '16px', fontFamily: 'Manrope, sans-serif' }}>Participants</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {participants.map((p, i) => (
              <li key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
                <span className={`host-participant-avatar color-${i % 4}`}>{(p.full_name ?? 'G').slice(0, 2).toUpperCase()}</span>
                <span style={{ flex: 1, fontSize: '13px' }}>{p.full_name ?? 'Guest'}</span>
              </li>
            ))}
          </ul>
          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e2e5e1' }} />
          <h2 style={{ marginBottom: '12px', fontSize: '16px', fontFamily: 'Manrope, sans-serif' }}>Details</h2>
          <dl style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
            <dt style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>Meeting Code</dt>
            <dd style={{ margin: '0 0 12px', fontFamily: 'monospace', fontWeight: 600 }}>{meeting.id}</dd>
            <dt style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>Status</dt>
            <dd style={{ margin: '0 0 12px', textTransform: 'capitalize' }}>{meeting.status}</dd>
          </dl>
        </aside>
      </div>

<div ref={minutesRef}>
  {minutes ? (
    <section style={{ marginTop: '48px', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontFamily: 'Manrope, sans-serif', margin: 0 }}>Official Minutes</h2>
        <button className="host-export-button" onClick={() => exportMinutesPdf(meeting, minutes)} style={{ padding: '8px 14px', height: '36px', borderRadius: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 21h14" /></svg>
          Download minutes
        </button>
      </div>
      <FormalMinutes meeting={meeting} minutes={minutes} />
      <div className="minutes-document" style={{ padding: 0, marginTop: '24px' }}>
        <section className="minutes-summary"><div><h3>Meeting summary</h3><p>{minutes.content.summary}</p></div></section>
      </div>
    </section>
  ) : (
    <section className="minutes-empty" style={{ marginTop: '48px', position: 'relative', overflow: 'hidden', background: '#fff', borderRadius: '13px', border: '1px solid #e2e5e1', animation: 'fadeIn 0.4s ease' }}>
      
      {/* When generating: show a premium loading experience */}
      {isGenerating ? (
        <div style={{ textAlign: 'center', padding: '20px', position: 'relative', zIndex: 1 }}>
          <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '24px' }}>
            <span style={{ 
              position: 'absolute', inset: -12, borderRadius: '50%', 
              background: 'conic-gradient(from 0deg, transparent, #31685c, transparent)', 
              animation: 'spin 1.5s linear infinite' 
            }} />
            <span style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              width: '64px', height: '64px', borderRadius: '50%', 
              background: '#fff', position: 'relative',
              border: '1px solid #e2e5e1'
            }}>
              <svg className="host-icon" style={{ width: '28px', height: '28px', color: '#31685c' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
              </svg>
            </span>
          </div>
          <h2 style={{ fontFamily: 'Manrope, sans-serif', fontSize: '22px', fontWeight: 700, color: '#1e2f2a', marginBottom: '8px' }}>
            Crafting your minutes
          </h2>
          <p style={{ color: '#6b7a76', fontSize: '13px', maxWidth: '360px', margin: '0 auto 20px' }}>
            Analyzing the transcript for key decisions, action items, and a summary.
          </p>
          
          {/* Step indicators */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#31685c', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#e2f0ea', animation: 'pulse 1.5s infinite' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              Reading transcript
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
              <span style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px dashed #cbd5e1' }} />
              Extracting decisions
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
              <span style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px dashed #cbd5e1' }} />
              Writing summary
            </div>
          </div>
        </div>
      ) : (
        <>
          <span className="minutes-spark"><svg className="host-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg></span>
          <h2>Generate AI minutes</h2>
          <p>Turn this transcript into a clear summary, decisions, and action items.</p>
          {genError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '8px', color: '#b91c1c', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '400px', margin: '0 auto 20px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {genError}
            </div>
          )}
          <button type="button" onClick={handleGenerateClick} disabled={transcripts.length === 0} style={{ opacity: (transcripts.length === 0) ? 0.6 : 1, cursor: (transcripts.length === 0) ? 'not-allowed' : 'pointer' }}>
            Generate now
          </button>
          {transcripts.length === 0 && <small>A transcript is needed before minutes can be generated.</small>}
        </>
      )}
    </section>
  )}
</div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* VENUE PROMPT MODAL */}
      {showVenuePrompt && (
        <div className="end-dialog-backdrop" role="presentation">
          <div className="end-dialog" role="alertdialog" aria-modal="true">
            <h2>Where was the meeting held?</h2>
            <p>This will appear on the official document.</p>
            <input 
              type="text" 
              value={venue} 
              onChange={(e) => setVenue(e.target.value)} 
              placeholder="e.g. CICS Faculty Room, Zoom" 
              autoFocus
              className="set-input"
              style={{ width: '100%', marginBottom: '16px' }}
              onKeyDown={(e) => { 
                if (e.key === 'Enter' && venue.trim()) submitGenerate() 
              }}
            />
            <div>
              <button type="button" onClick={() => setShowVenuePrompt(false)} disabled={isGenerating}>Cancel</button>
              <button 
                type="button" 
                onClick={submitGenerate} 
                disabled={isGenerating || !venue.trim()}
              >
                {isGenerating ? 'Generating…' : 'Generate Notes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}