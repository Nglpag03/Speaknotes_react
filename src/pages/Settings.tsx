// src/pages/Settings.tsx
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { listMyMeetings, listJoinedMeetings } from '../lib/data'
import { AVATAR_COLORS, avatarColor, useSettings, type ExportFormat } from '../lib/settings'
import { Avatar } from '../components/UserMenu'

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'audio', label: 'Audio & transcription' },
  { id: 'meetings', label: 'Meeting defaults' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'data', label: 'Data & account' },
]

const LANGUAGES = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['fil-PH', 'Filipino'],
  ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['pt-BR', 'Portuguese (Brazil)'],
  ['hi-IN', 'Hindi'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['zh-CN', 'Chinese (Mandarin)'],
] as const

// ---------- small building blocks ----------

function Section({ id, title, desc, danger, children }: { id: string; title: string; desc?: string; danger?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`set-card ${danger ? 'danger' : ''}`} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {desc && <p className="set-desc">{desc}</p>}
      {children}
    </section>
  )
}

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="t">{label}</span>}
        {hint && <small>{hint}</small>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
  )
}

// ---------- microphone picker with live level meter ----------

function MicPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [level, setLevel] = useState(0)
  const [testing, setTesting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const all = await navigator.mediaDevices.enumerateDevices()
    setDevices(all.filter((d) => d.kind === 'audioinput'))
  }, [])

  useEffect(() => {
    refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
      stopRef.current?.()
    }
  }, [refresh])

  async function startTest() {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: value ? { deviceId: { exact: value } } : true })
      await refresh() // device names are only available after permission is granted
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)
      let raf = 0
      const tick = () => {
        analyser.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(Math.min(1, peak / 64))
        raf = requestAnimationFrame(tick)
      }
      tick()
      setTesting(true)
      stopRef.current = () => {
        cancelAnimationFrame(raf)
        stream.getTracks().forEach((t) => t.stop())
        ctx.close()
        setLevel(0)
        setTesting(false)
        stopRef.current = null
      }
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      setErr(
        name === 'NotAllowedError'
          ? 'Microphone access is blocked. Allow it in your browser’s site settings, then try again.'
          : 'That microphone isn’t available. Choose another one.',
      )
    }
  }

  const known = devices.some((d) => d.deviceId === value)

  return (
    <div className="mic-picker">
      <select
        id="mic-select"
        className="set-select"
        value={known ? (value as string) : ''}
        onChange={(e) => { stopRef.current?.(); onChange(e.target.value || null) }}
      >
        <option value="">System default</option>
        {devices.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
        ))}
      </select>
      <div className="mic-test">
        <button type="button" className="btn-secondary" onClick={testing ? () => stopRef.current?.() : startTest}>
          {testing ? 'Stop test' : 'Test microphone'}
        </button>
        <div className="level-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <span style={{ width: `${level * 100}%` }} />
        </div>
      </div>
      {testing && <p className="set-msg">Say something. The bar should move.</p>}
      {err && <p className="set-msg err" role="alert">{err}</p>}
    </div>
  )
}

// ---------- page ----------

export default function Settings() {
  const navigate = useNavigate()
  const { settings, loading, loadError, status, update, reload } = useSettings()
  const [user, setUser] = useState<User | null>(null)
  const [name, setName] = useState('')
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [savingName, setSavingName] = useState(false)

  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [savingPw, setSavingPw] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) {
        navigate('/auth', { replace: true })
        return
      }
      setUser(user)
      setName(user.user_metadata?.full_name ?? '')
    })()
    return () => { alive = false }
  }, [navigate])

  const email = user?.email ?? ''
  const savedName: string = user?.user_metadata?.full_name ?? ''
  const hasPassword = (user?.app_metadata?.providers as string[] | undefined)?.includes('email') ?? false

  async function saveName(e: FormEvent) {
    e.preventDefault()
    setSavingName(true)
    setNameMsg(null)
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } })
    setSavingName(false)
    if (error) return setNameMsg({ ok: false, text: error.message })
    setUser(data.user)
    setNameMsg({ ok: true, text: 'Name updated.' })
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (pw.length < 8) return setPwMsg({ ok: false, text: 'Use at least 8 characters.' })
    if (pw !== pw2) return setPwMsg({ ok: false, text: 'The two passwords don’t match.' })
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setSavingPw(false)
    if (error) return setPwMsg({ ok: false, text: error.message })
    setPw('')
    setPw2('')
    setPwMsg({ ok: true, text: 'Password changed.' })
  }

  async function exportData() {
    setExporting(true)
    setDataMsg(null)
    try {
      const [hosted, joined] = await Promise.all([listMyMeetings(), listJoinedMeetings()])
      const payload = { exported_at: new Date().toISOString(), account: { email, name: savedName }, settings, hosted, joined }
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `speaknote-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setDataMsg({ ok: true, text: 'Export downloaded.' })
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : 'Export failed. Try again.' })
    } finally {
      setExporting(false)
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    setDataMsg(null)
    const { error } = await supabase.functions.invoke('delete-account')
    if (error) {
      setDeleting(false)
      return setDataMsg({ ok: false, text: 'Couldn’t delete your account. Try again, or contact support.' })
    }
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  function jump(id: string) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const statusText = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Couldn’t save. Check your connection and try again.' : ''

  return (
    <>
      <header className="home-topbar">
        <div>
          <h1>Settings</h1>
          <p>Your profile, recording preferences and data.</p>
        </div>
        <span className={`save-status ${status}`} role="status" aria-live="polite">{statusText}</span>
      </header>

      {loadError ? (
        <div className="home-error" role="alert">
          <strong>Couldn’t load your settings</strong>
          <span>{loadError}</span>
          <button type="button" className="retry-btn" onClick={reload}>Retry</button>
        </div>
      ) : (
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" onClick={() => jump(s.id)}>{s.label}</button>
            ))}
          </nav>

          <div className="settings-sections" aria-busy={loading}>
            {loading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="set-card" aria-hidden="true">
                  <span className="skel skel-title" />
                  <span className="skel skel-line" style={{ marginTop: 14, width: '60%' }} />
                  <span className="skel skel-line" style={{ marginTop: 10, width: '45%' }} />
                </div>
              ))
            ) : (
              <>
                <Section id="profile" title="Profile">
                  <div className="profile-head">
                    <Avatar name={savedName} email={email} color={settings.avatar_color} large />
                    <div>
                      <strong>{savedName || 'Add your name'}</strong>
                      <small>{email}</small>
                    </div>
                  </div>

                  <form onSubmit={saveName} className="set-form">
                    <Row label="Display name" hint="Shown to others in meetings." htmlFor="set-name">
                      <div className="inline-field">
                        <input id="set-name" className="set-input" value={name} onChange={(e) => { setName(e.target.value); setNameMsg(null) }} maxLength={60} autoComplete="name" />
                        <button type="submit" className="btn-primary" disabled={savingName || !name.trim() || name.trim() === savedName}>
                          {savingName ? 'Saving…' : 'Save name'}
                        </button>
                      </div>
                      {nameMsg && <p className={`set-msg ${nameMsg.ok ? '' : 'err'}`} role="status">{nameMsg.text}</p>}
                    </Row>
                  </form>

                  <Row label="Email" hint="Used to sign in. It can’t be changed here.">
                    <span className="set-static">{email}</span>
                  </Row>

                  <Row label="Avatar colour">
                    <div className="swatches" role="group" aria-label="Avatar colour">
                      {AVATAR_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="swatch"
                          style={{ background: c }}
                          aria-label={`Colour ${c}`}
                          aria-pressed={avatarColor(email || savedName, settings.avatar_color) === c}
                          onClick={() => update({ avatar_color: c })}
                        />
                      ))}
                    </div>
                  </Row>
                </Section>

                <Section id="audio" title="Audio & transcription" desc="Choose what SpeakNote listens to and the language it expects.">
                  <Row label="Microphone" hint="Test it to make sure your voice is picked up." htmlFor="mic-select">
                    <MicPicker value={settings.mic_device_id} onChange={(id) => update({ mic_device_id: id })} />
                  </Row>
                  <Row label="Transcription language" hint="Pick the language people will mostly speak." htmlFor="set-lang">
                    <select id="set-lang" className="set-select" value={settings.transcription_language} onChange={(e) => update({ transcription_language: e.target.value })}>
                      {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </Row>
                </Section>

                <Section id="meetings" title="Meeting defaults" desc="Applied to every meeting you host.">
                  <Row label="Write minutes when a meeting ends" hint="Creates a summary, decisions and action items automatically.">
                    <Toggle id="set-auto" checked={settings.auto_minutes} onChange={(v) => update({ auto_minutes: v })} label="Write minutes when a meeting ends" />
                  </Row>
                  <Row label="Show timestamps in transcripts">
                    <Toggle id="set-ts" checked={settings.show_timestamps} onChange={(v) => update({ show_timestamps: v })} label="Show timestamps in transcripts" />
                  </Row>
                  <Row label="Export format" hint="Used when you export minutes." htmlFor="set-fmt">
                    <select id="set-fmt" className="set-select" value={settings.export_format} onChange={(e) => update({ export_format: e.target.value as ExportFormat })}>
                      <option value="pdf">PDF</option>
                      <option value="md">Markdown</option>
                      <option value="docx">Word</option>
                    </select>
                  </Row>
                </Section>

                <Section id="shortcuts" title="Shortcuts">
                  <dl className="shortcut-list">
                    <div><dt><kbd>N</kbd></dt><dd>Start a new meeting (focus the title field)</dd></div>
                    <div><dt><kbd>/</kbd></dt><dd>Search your meetings</dd></div>
                    <div><dt><kbd>Esc</kbd></dt><dd>Clear search, or close a menu</dd></div>
                  </dl>
                </Section>

                <Section id="data" title="Data & account">
                  <Row label="Delete transcripts automatically" hint="Transcripts older than this are removed." htmlFor="set-ret">
                    <select
                      id="set-ret"
                      className="set-select"
                      value={String(settings.retention_days ?? 'never')}
                      onChange={(e) => update({ retention_days: e.target.value === 'never' ? null : (Number(e.target.value) as 30 | 90) })}
                    >
                      <option value="never">Never</option>
                      <option value="90">After 90 days</option>
                      <option value="30">After 30 days</option>
                    </select>
                  </Row>

                  <Row label="Export my data" hint="Download your meetings and settings as a JSON file.">
                    <button type="button" className="btn-secondary" onClick={exportData} disabled={exporting}>
                      {exporting ? 'Preparing…' : 'Download export'}
                    </button>
                  </Row>
                  {dataMsg && <p className={`set-msg ${dataMsg.ok ? '' : 'err'}`} role="status">{dataMsg.text}</p>}

                  {hasPassword ? (
                    <form onSubmit={changePassword} className="set-form pw-form">
                      <span className="t">Change password</span>
                      <label htmlFor="set-pw">New password</label>
                      <input id="set-pw" type="password" className="set-input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
                      <label htmlFor="set-pw2">Confirm new password</label>
                      <input id="set-pw2" type="password" className="set-input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
                      <div>
                        <button type="submit" className="btn-primary" disabled={savingPw || !pw || !pw2}>{savingPw ? 'Saving…' : 'Change password'}</button>
                      </div>
                      {pwMsg && <p className={`set-msg ${pwMsg.ok ? '' : 'err'}`} role="status">{pwMsg.text}</p>}
                    </form>
                  ) : (
                    <Row label="Password" hint="You sign in with Google, so there’s no password to change.">
                      <span className="set-static">Managed by Google</span>
                    </Row>
                  )}
                </Section>

                <Section id="danger" title="Delete account" desc="This permanently deletes your account, meetings and transcripts. It can’t be undone." danger>
                  {!confirmDelete ? (
                    <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Delete my account…</button>
                  ) : (
                    <div className="confirm-delete">
                      <label htmlFor="del-confirm">Type <strong>DELETE</strong> to confirm</label>
                      <input id="del-confirm" className="set-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" autoFocus />
                      <div className="confirm-actions">
                        <button type="button" className="btn-secondary" onClick={() => { setConfirmDelete(false); setConfirmText('') }}>Cancel</button>
                        <button type="button" className="btn-danger solid" disabled={confirmText !== 'DELETE' || deleting} onClick={deleteAccount}>
                          {deleting ? 'Deleting…' : 'Delete account permanently'}
                        </button>
                      </div>
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}