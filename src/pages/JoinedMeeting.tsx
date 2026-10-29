import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getMeeting, listParticipants } from '../lib/data';
import { createRoomChannel } from '../lib/realtime';
import type { Meeting, Participant } from '../lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useScribe } from '@elevenlabs/react';

export default function JoinedMeeting() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Initialize ElevenLabs Scribe
  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    onPartialTranscript: (data) => {
      // Send the "live" text to the host via Broadcast
      if (channelRef.current && data.text) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'live-text',
          payload: { text: data.text },
        });
      }
    },
    onCommittedTranscript: async (data) => {
      // Save the final sentence to the database
      if (data.text) {
        const { error } = await supabase.from('transcripts').insert({
          meeting_id: code,
          content: data.text,
        });
        if (error) console.error('Failed to save transcript:', error);
      }
      // Clear the live text on the host screen
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'live-text',
          payload: { text: '' },
        });
      }
    },
  });

  // Load initial data
  useEffect(() => {
    if (!code) return;
    (async () => {
      const m = await getMeeting(code);
      if (!m || m.status === 'ended') {
        navigate('/', { replace: true });
        return;
      }
      setMeeting(m);
      setParticipants(await listParticipants(code));
    })();
  }, [code, navigate]);

  // Setup Realtime Presence & Channel for live text
  useEffect(() => {
    if (!code || !meeting) return;

    const channel = createRoomChannel(code);
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        // Just for console logging presence
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data: { user } } = await supabase.auth.getUser();
          await channel.track({ user_id: user?.id });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [code, meeting]);

  async function toggleMic() {
    const nextState = !isBroadcasting;
    
    if (nextState) {
      try {
        setAudioError(null);

            if (scribe.status === 'connected' || scribe.status === 'connecting') return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No session');
        
        const res = await fetch('/api/scribe-token', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const { token } = await res.json();

        await scribe.connect({
          token,
          modelId: 'scribe_v2_realtime',
          languageCode: 'fil', // Force it to listen for Filipino/Tagalog
          microphone: { echoCancellation: true, noiseSuppression: true },
        });
        
        // Broadcast to the host that we are speaking
        await channelRef.current?.send({
          type: 'broadcast',
          event: 'speaking',
          payload: { user_id: session.user.id, state: true },
        });

        setIsBroadcasting(true);
      } catch (err) {
        setAudioError(err instanceof Error ? err.message : 'Mic connection failed');
        setIsBroadcasting(false);
      }
    } else {
      await scribe.disconnect();
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await channelRef.current?.send({
          type: 'broadcast',
          event: 'speaking',
          payload: { user_id: session.user.id, state: false },
        });
      }
      
      setIsBroadcasting(false);
    }
  } 

  if (!meeting) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h2>Joined: {meeting.title ?? 'Untitled Meeting'}</h2>
          <p>Code: {meeting.id}</p>
        </div>
      </header>

      <section>
        <h3>Participants ({participants.length})</h3>
        <ul>
          {participants.map((p) => (
            <li key={p.user_id}>{p.full_name} {p.kicked_at ? '(Kicked)' : ''}</li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '40px', textAlign: 'center' }}>
        <button 
          onClick={toggleMic} 
          style={{ 
            padding: '20px 40px', 
            fontSize: '1.2rem', 
            borderRadius: '50px',
            background: isBroadcasting ? '#b00020' : '#222' 
          }}
        >
          {isBroadcasting ? 'Stop Mic (Recording...)' : 'Start Mic'}
        </button>
        
        {audioError && <p style={{ marginTop: '12px', color: 'red' }}>{audioError}</p>}
      </section>
    </div>
  );
}