import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { listMyMeetings, listJoinedMeetings } from '../lib/data'
import type { Meeting } from '../lib/types'
import { Icon, MeetingCard, MeetingSkeletons, sortMeetings, useCopyCode } from '../components/MeetingCard'

type Tab = 'hosted' | 'joined'
type StatusFilter = 'all' | 'active' | 'ended'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Live' },
  { value: 'ended', label: 'Ended' },
]

function searchText(m: Meeting) {
  const d = new Date(m.created_at)
  return [
    m.title ?? '',
    m.id,
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
  ].join(' ').toLowerCase()
}

export default function Meetings() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'joined' ? 'joined' : 'hosted'

  const [hosted, setHosted] = useState<Meeting[]>([])
  const [joined, setJoined] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  
  // Search State
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  
  const searchRef = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)

  const { copiedId, copy } = useCopyCode(setCopyError)

  // 1. Debounce the search input (prevents lag on every keystroke)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [h, j] = await Promise.all([listMyMeetings(), listJoinedMeetings()])
      if (!mounted.current) return
      setHosted(sortMeetings(h))
      setJoined(sortMeetings(j))
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not load your meetings.')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted.current) return
      if (!user) { navigate('/auth', { replace: true }); return }
      load()
    })()
    return () => { mounted.current = false }
  }, [navigate, load])

  // Press "/" to jump to search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).matches('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 2. Search & Filter Logic
  const source = tab === 'hosted' ? hosted : joined
  const results = useMemo(() => {
    const tokens = debouncedQuery.toLowerCase().split(/\s+/).filter(Boolean)
    return source.filter((m) => {
      if (status !== 'all' && (status === 'active') !== (m.status === 'active')) return false
      if (tokens.length === 0) return true
      const text = searchText(m)
      return tokens.every((t) => text.includes(t))
    })
  }, [source, debouncedQuery, status])

  const isFiltering = debouncedQuery.trim() !== '' || status !== 'all'

  function clearFilters() {
    setQuery('')
    setStatus('all')
    searchRef.current?.focus()
  }

  const countLabel = isFiltering
    ? `${results.length} of ${source.length} ${source.length === 1 ? 'meeting' : 'meetings'}`
    : `${source.length} ${source.length === 1 ? 'meeting' : 'meetings'}`

  return (
    <>
      <header className="home-topbar">
        <div>
          <h1>All meetings</h1>
          <p>Every meeting you’ve hosted or joined.</p>
        </div>
      </header>

      <div className="dir-toolbar">
        <div className="dir-tabs" role="tablist" aria-label="Meeting type">
          {(['hosted', 'joined'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls="meeting-results"
              onClick={() => setSearchParams({ tab: t }, { replace: true })}
            >
              {t === 'hosted' ? 'Hosted' : 'Joined'}
              <span className="count">{t === 'hosted' ? hosted.length : joined.length}</span>
            </button>
          ))}
        </div>

        <div className="search-field" role="search">
          <span className="lead"><Icon name="search" /></span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
            placeholder="Search title, date or code  ( / )"
            aria-label="Search meetings by title, date or code"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setQuery(''); searchRef.current?.focus() }}>
              <Icon name="x" />
            </button>
          )}
        </div>
      </div>

      <div className="filter-row">
        <div className="filter-chips" role="group" aria-label="Filter by status">
          {STATUS_OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={status === o.value} onClick={() => setStatus(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        {!loading && !error && <span className="results-count" role="status" aria-live="polite">{countLabel}</span>}
      </div>

      {copyError && (
        <div className="home-error" role="alert">
          <span>{copyError}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setCopyError(null)}>×</button>
        </div>
      )}

      <div id="meeting-results" role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={loading}>
        {error ? (
          <div className="home-error" role="alert">
            <strong>Couldn’t load your meetings</strong>
            <span>{error}</span>
            <button type="button" className="retry-btn" onClick={load}>
              <Icon name="refresh" /> Retry
            </button>
          </div>
        ) : loading ? (
          <MeetingSkeletons count={6} />
        ) : results.length === 0 ? (
          <div className="meetings-empty">
            <div className="empty-illustration" aria-hidden="true">
              <span className="empty-wave one" />
              <span className="empty-wave two" />
              <span className="empty-wave three" />
            </div>
            <div>
              {isFiltering ? (
                <>
                  <h3>{query.trim() ? `No results for “${query.trim()}”` : `No ${status === 'active' ? 'live' : 'ended'} meetings`}</h3>
                  <p>Check the spelling, or search by a different title, date or code.</p>
                </>
              ) : (
                <>
                  <h3>No {tab} meetings yet</h3>
                  <p>{tab === 'hosted' ? 'Meetings you start will show up here.' : 'Meetings you join with a code will show up here.'}</p>
                </>
              )}
            </div>
            {isFiltering ? (
              <button type="button" onClick={clearFilters}><Icon name="x" /> Clear filters</button>
            ) : (
              <button type="button" onClick={() => navigate('/home')}><Icon name="home" /> Back to Home</button>
            )}
          </div>
        ) : (
          <ul className="bento-grid" style={{ animation: 'fadeIn 0.3s ease' }}>
            {results.map((m, i) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                index={i}
                isHost={tab === 'hosted'}
                copiedId={copiedId}
                onCopy={copy}
                navigate={navigate}
              />
            ))}
          </ul>
        )}
      </div>
      
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </>
  )
}