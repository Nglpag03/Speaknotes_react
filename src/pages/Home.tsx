import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { signOut } from '../lib/auth';
import { createMeeting, joinMeeting, listMyMeetings } from '../lib/data';
import type { Meeting } from '../lib/types';

export default function Home() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [title, setTitle] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth', { replace: true }); return; }
      if (cancelled) return;
      setEmail(user.email ?? null);
      setJoinName((user.user_metadata?.full_name as string | undefined) ?? '');
      try {
        setMeetings(await listMyMeetings());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'failed to load meetings');
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const code = await createMeeting(title || undefined);
      navigate(`/host/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create failed');
    } finally { setBusy(false); }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await joinMeeting(joinCode.trim().toUpperCase(), joinName);
      navigate(`/join/${joinCode.trim().toUpperCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'join failed');
    } finally { setBusy(false); }
  }

  async function onSignOut() {
    await signOut();
    navigate('/auth', { replace: true });
  }

  return (
    <div className="page">
      <header className="topbar">
        <span>{email ?? '…'}</span>
        <button className="link" onClick={onSignOut}>Sign out</button>
      </header>

      {error && <p className="error">{error}</p>}

      <section>
        <h2>Start a meeting</h2>
        <form onSubmit={onCreate} className="form">
          <label>
            Title (optional)
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <button type="submit" disabled={busy}>Create meeting</button>
        </form>
      </section>

      <section>
        <h2>Join a meeting</h2>
        <form onSubmit={onJoin} className="form">
          <label>
            Meeting code
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={8}
              required
            />
          </label>
          <label>
            Your name in this meeting
            <input value={joinName} onChange={(e) => setJoinName(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>Join</button>
        </form>
      </section>

      <section>
        <h2>Your hosted meetings</h2>
        {meetings.length === 0 ? (
          <p>No meetings yet.</p>
        ) : (
          <ul className="meeting-list">
            {meetings.map((m) => (
              <li key={m.id}>
                <button className="link" onClick={() => navigate(`/host/${m.id}`)}>
                  {m.title ?? '(untitled)'} — {m.id} — {m.status}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}