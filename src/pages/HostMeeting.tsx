import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getMeeting, listParticipants, listTranscripts, endMeeting, getMinutes, requestSummary } from '../lib/data';
import { exportMinutesPdf, exportTranscriptPdf } from '../lib/pdf';
import type { Meeting, Participant, TranscriptRow, Minutes } from '../lib/types';

export default function HostMeeting() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([]);
  const [minutes, setMinutes] = useState<Minutes | null>(null);
  
  // Realtime state
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [liveText, setLiveText] = useState<string>('');
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial Load
  useEffect(() => {
    if (!code) return;
    (async () => {
      const m = await getMeeting(code);
      if (!m) { navigate('/'); return; }
      setMeeting(m);
      setParticipants(await listParticipants(code));
      setTranscripts(await listTranscripts(code));
      setMinutes(await getMinutes(code));
    })().catch(err => setError(err.message));
  }, [code, navigate]);

  // Realtime Subscriptions
  useEffect(() => {
    if (!code || !meeting) return;

    // 1. Listen for live transcripts AND new participants (postgres_changes)
    const pgChannel = supabase
      .channel(`db-changes-${code}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'transcripts', filter: `meeting_id=eq.${code}` },
        (payload) => {
          setTranscripts(prev => [...prev, payload.new as TranscriptRow]);
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `meeting_id=eq.${code}` },
        (payload) => {
          setParticipants(prev => [...prev, payload.new as Participant]);
        }
      )
      .subscribe();

    // 2. Presence channel to see who is online AND listen for live text
    const roomChannel = supabase.channel(`room:${code}`);
    roomChannel
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState();
        const ids = new Set<string>();
        Object.values(state).flat().forEach((p: any) => ids.add(p.user_id));
        setOnlineUsers(ids);
      })
      .on('broadcast', { event: 'live-text' }, (payload) => {
        setLiveText(payload.payload.text);
      })
      .subscribe();

    // 3. Host channel to listen for "speaking" broadcasts
    const hostChannel = supabase.channel(`host:${code}`);
    hostChannel
      .on('broadcast', { event: 'speaking' }, (payload) => {
        const { user_id, state } = payload.payload;
        setSpeakingUsers(prev => {
          const next = new Set(prev);
          if (state) next.add(user_id);
          else next.delete(user_id);
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(pgChannel);
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(hostChannel);
    };
  }, [code, meeting]);

  async function handleEnd() {
    if (!code || !confirm('End meeting? Participants will not be able to join.')) return;
    setBusy(true); setError(null);
    try {
      await endMeeting(code);
      setMeeting(prev => prev ? { ...prev, status: 'ended' } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end');
    } finally { setBusy(false); }
  }

  async function handleSummarize() {
    if (!code) return;
    setBusy(true); setError(null);
    try {
      const res = await requestSummary(code);
      setMinutes(res.minutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to summarize');
    } finally { setBusy(false); }
  }

  if (!meeting) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Host: {meeting.title ?? 'Untitled'}</h1>
          <p style={{ margin: 0, fontSize: '1.2rem' }}>Code: <strong>{meeting.id}</strong></p>
        </div>
        <div>
          <button onClick={() => navigate('/home')} className="link">Back to Home</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
        <section style={{ flex: 1 }}>
          <h3>Participants</h3>
          <ul>
            {participants.map(p => {
              const isOnline = onlineUsers.has(p.user_id);
              const isSpeaking = speakingUsers.has(p.user_id);
              return (
                <li key={p.user_id} style={{ color: p.kicked_at ? '#999' : 'inherit' }}>
                  {isOnline ? '🟢' : '⚪️'} {p.full_name}
                  {isSpeaking && <strong style={{ color: 'green', marginLeft: '8px' }}>(speaking...)</strong>}
                </li>
              );
            })}
          </ul>
        </section>

        <section style={{ flex: 2 }}>
          <h3>Live Transcript</h3>
          <div style={{ height: '300px', overflowY: 'auto', border: '1px solid #ddd', padding: '12px', borderRadius: '6px' }}>
            {transcripts.length === 0 ? <p>No transcripts yet.</p> : null}
            {transcripts.map(t => (
              <div key={t.id} style={{ marginBottom: '8px' }}>
                <strong>{t.full_name}</strong>: {t.content}
              </div>
            ))}
            {/* Show the live text in gray at the bottom */}
            {liveText && (
              <div style={{ marginTop: '12px', color: '#888', fontStyle: 'italic' }}>
                (speaking...): {liveText}
              </div>
            )}
          </div>
        </section>
      </div>

      <section style={{ borderTop: '1px solid #ddd', paddingTop: '24px' }}>
        <h3>Meeting Controls</h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          {meeting.status === 'active' && (
            <button onClick={handleEnd} disabled={busy} style={{ background: '#b00020', color: 'white' }}>
              End Meeting
            </button>
          )}
          <button onClick={handleSummarize} disabled={busy || transcripts.length === 0}>
            {minutes ? 'Regenerate Summary' : 'Generate AI Minutes'}
          </button>
          {minutes && (
            <button onClick={() => exportMinutesPdf(meeting, minutes)}>
              Download Minutes PDF
            </button>
          )}
          <button onClick={() => exportTranscriptPdf(meeting, transcripts)} disabled={transcripts.length === 0}>
            Download Transcript PDF
          </button>
        </div>
      </section>

      {minutes && (
        <section style={{ marginTop: '32px', background: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
          <h3>Minutes: {minutes.content.title}</h3>
          <p>{minutes.content.summary}</p>
          <h4>Decisions</h4>
          <ul>{minutes.content.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
          <h4>Action Items</h4>
          <ul>{minutes.content.action_items.map((a, i) => <li key={i}><strong>{a.owner}</strong>: {a.task}</li>)}</ul>
        </section>
      )}
    </div>
  );
}