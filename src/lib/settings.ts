// src/lib/settings.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type ExportFormat = 'pdf' | 'md' | 'docx'

export interface UserSettings {
  avatar_color: string | null
  transcription_language: string
  mic_device_id: string | null
  auto_minutes: boolean
  export_format: ExportFormat
  show_timestamps: boolean
  retention_days: 30 | 90 | null
}

export const DEFAULT_SETTINGS: UserSettings = {
  avatar_color: null,
  transcription_language: 'en-US',
  mic_device_id: null,
  auto_minutes: true,
  export_format: 'pdf',
  show_timestamps: true,
  retention_days: null,
}

/** Fired after any settings change so other components (e.g. the sidebar avatar) can refresh. */
export const SETTINGS_EVENT = 'speaknote:settings'

export const AVATAR_COLORS = ['#d79b7f', '#7f9aab', '#7fa394', '#9686a7', '#c4a35a', '#c27c8a']

export function getInitials(name?: string | null, email?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (email ?? '?').slice(0, 2).toUpperCase()
}

/** The user's chosen colour, or a stable colour derived from their name/email. */
export function avatarColor(seed: string, chosen?: string | null) {
  if (chosen) return chosen
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export async function fetchSettings(): Promise<UserSettings> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You’re signed out. Sign in again.')
  const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
  if (error) throw error
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) }
}

export async function saveSettings(patch: Partial<UserSettings>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You’re signed out. Sign in again.')
  const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
  if (error) throw error
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** Loads settings once, then saves each change instantly (optimistic, rolls back on failure). */
export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timer = useRef<number | undefined>(undefined)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const s = await fetchSettings()
      if (mounted.current) setSettings(s)
    } catch (e) {
      if (mounted.current) setLoadError(e instanceof Error ? e.message : 'Could not load your settings.')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
      window.clearTimeout(timer.current)
    }
  }, [load])

  const update = useCallback(async (patch: Partial<UserSettings>) => {
    let previous: UserSettings | undefined
    setSettings((s) => {
      previous = s
      return { ...s, ...patch }
    })
    setStatus('saving')
    try {
      await saveSettings(patch)
      if (!mounted.current) return
      setStatus('saved')
      window.dispatchEvent(new Event(SETTINGS_EVENT))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setStatus('idle'), 2000)
    } catch {
      if (!mounted.current) return
      if (previous) setSettings(previous)
      setStatus('error')
    }
  }, [])

  return { settings, loading, loadError, status, update, reload: load }
}