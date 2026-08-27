'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCourtShortLabel, formatCaseNumber } from '@/lib/constants/courts'
import { matchScore, suggestCorrections } from '@/lib/fuzzy'
import { fetchAllRows } from '@/lib/fetchAll'
import { cityFor } from '@/lib/cityFor'
import Link from 'next/link'
import { Search, X, Sparkles, ArrowRight } from 'lucide-react'

interface CaseRow {
  id: string
  court_code: string | null
  court_name: string
  case_number: string | null
  case_year: number | null
  party_plaintiff: string
  party_defendant: string
  client_name: string | null
  case_stage: string | null
  status: string
  advocate_id: string
  city: string | null
}

interface CustomCourtRow {
  id: string
  name: string
  short_name: string | null
  builtin_code: string | null
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:      { bg: '#d1fae5', text: '#065f46' },
  disposed:    { bg: '#f3f4f6', text: '#6b7280' },
  stayed:      { bg: '#fef3c7', text: '#92400e' },
  withdrawn:   { bg: '#fee2e2', text: '#991b1b' },
  transferred: { bg: '#dbeafe', text: '#1e40af' },
  reserved:    { bg: '#ede9fe', text: '#5b21b6' },
}

export default function FindCasePage() {
  const [allCases, setAllCases] = useState<CaseRow[]>([])
  const [customCourts, setCustomCourts] = useState<CustomCourtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      let myAdvocateId: string | null = null
      let isJunior = false
      if (user) {
        const { data: me } = await supabase.from('advocates').select('id, role').eq('user_id', user.id).limit(1).maybeSingle()
        if (me) { myAdvocateId = me.id; isJunior = me.role === 'junior' }
      }

      const [cases, { data: cc }] = await Promise.all([
        fetchAllRows<CaseRow>((from, to) =>
          supabase
            .from('cases')
            .select('id, advocate_id, court_code, court_name, case_number, case_year, party_plaintiff, party_defendant, client_name, case_stage, status, city')
            .order('party_plaintiff', { ascending: true })
            .range(from, to)
        ),
        supabase.from('custom_courts').select('id, name, short_name, builtin_code'),
      ])
      // A junior only sees Udaipur cases here — their own cases (any city)
      // still always show. Same rule as the main Diary.
      const visible = isJunior
        ? cases.filter((c) => c.advocate_id === myAdvocateId || cityFor(c.court_code, c.city) === 'Udaipur')
        : cases
      setAllCases(visible)
      setCustomCourts((cc as CustomCourtRow[]) || [])
      setLoading(false)
    }
    load()
    inputRef.current?.focus()
  }, [])

  const courtLabel = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of customCourts) {
      const key = c.builtin_code || `CUSTOM_${c.id}`
      map[key] = c.short_name || c.name
    }
    return (code: string | null, fallbackName: string) => {
      if (!code) return fallbackName
      if (map[code]) return map[code]
      const builtin = getCourtShortLabel(code)
      return builtin && builtin !== code ? builtin : fallbackName
    }
  }, [customCourts])

  const terms = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query])

  // Ranked, not just filtered — an exact/whole-word hit always outranks a
  // loose typo-tolerant one, so the right case shows up first.
  const results = useMemo(() => {
    if (terms.length === 0) return []
    const scored: { row: CaseRow; score: number }[] = []
    for (const c of allCases) {
      const fields = [
        c.case_number, c.party_plaintiff, c.party_defendant, c.client_name, c.court_name,
      ].filter(Boolean) as string[]

      let total = 0
      let matchedAll = true
      for (const term of terms) {
        let best: number | null = null
        for (const f of fields) {
          const s = matchScore(term, f)
          if (s !== null && (best === null || s < best)) best = s
        }
        if (best === null) { matchedAll = false; break }
        total += best
      }
      if (matchedAll) scored.push({ row: c, score: total })
    }
    scored.sort((a, b) => a.score - b.score)
    return scored.map((s) => s.row)
  }, [allCases, terms])

  // "Did you mean…" -- shown below the exact results (or instead of them,
  // when there are none) for a single-word query, so it's unambiguous
  // which word we're correcting. Always computed so a similarly-spelled
  // name doesn't get missed just because a few exact matches came back.
  const suggestions = useMemo(() => {
    if (terms.length !== 1 || !allCases.length) return []
    const pool: string[] = []
    for (const c of allCases) {
      if (c.party_plaintiff) pool.push(c.party_plaintiff)
      if (c.party_defendant) pool.push(c.party_defendant)
      if (c.client_name) pool.push(c.client_name)
    }
    return suggestCorrections(terms[0], pool, { limit: 3 })
  }, [terms, allCases])

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Find Case</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Type a case number, plaintiff name, defendant name — or any combination. Small typos are okay.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-5">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. 574/25, or Balkrishna, or Balkrishna Bajaj…"
          className="w-full pl-12 pr-10 py-4 bg-white border border-gray-200 rounded-xl text-base text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">Loading cases…</div>
      ) : terms.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400 text-sm">
          Start typing to find a case.
        </div>
      ) : results.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <p className="text-gray-500 text-sm mb-4">No cases found for &ldquo;{query}&rdquo;.</p>
          {suggestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Did you mean…
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setQuery(s)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                    style={{ borderColor: '#1e3a5f', color: '#1e3a5f' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-400 mb-2">{results.length} case{results.length !== 1 ? 's' : ''} found</p>
          {results.slice(0, 100).map((c) => {
            const sc = STATUS_COLORS[c.status] || STATUS_COLORS.active
            return (
              <Link
                key={c.id}
                href={`/diary/cases/${c.id}`}
                className="flex items-center justify-between gap-4 bg-white rounded-xl border border-gray-200 p-4 hover:border-[#1e3a5f]/40 hover:shadow-sm transition-all group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                      {courtLabel(c.court_code, c.court_name)}
                    </span>
                    <span className="font-mono text-sm font-semibold" style={{ color: '#1e3a5f' }}>
                      {c.case_number ? formatCaseNumber(c.case_number, c.case_year) : 'No number yet'}
                    </span>
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={{ background: sc.bg, color: sc.text }}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 truncate">
                    {c.party_plaintiff} <span className="text-gray-400">vs</span> {c.party_defendant}
                  </p>
                  {(c.client_name || c.case_stage) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c.client_name}{c.client_name && c.case_stage ? ' — ' : ''}{c.case_stage}
                    </p>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#1e3a5f] transition-colors shrink-0" />
              </Link>
            )
          })}
          {results.length > 100 && (
            <p className="text-xs text-gray-400 text-center pt-2">Showing first 100 of {results.length} — type more to narrow it down.</p>
          )}

          {suggestions.length > 0 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-4 mt-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Did you mean…
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setQuery(s)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                    style={{ borderColor: '#1e3a5f', color: '#1e3a5f' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
