'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCourtLabel, formatCaseNumber } from '@/lib/constants/courts'
import Link from 'next/link'
import { Search, Briefcase, Calendar } from 'lucide-react'

// ───── Types ─────

interface CaseResult {
  id: string
  court_code: string | null
  court_name: string
  case_number: string
  case_year: number | null
  party_plaintiff: string
  party_defendant: string
  client_name: string | null
  opposite_advocate: string | null
  notes: string | null
  status: string
  matchField: string
  matchText: string
}

interface HearingResult {
  id: string
  case_id: string
  hearing_date: string
  outcome_notes: string | null
  purpose: string | null
  case_plaintiff: string
  case_defendant: string
  matchField: string
  matchText: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  active:      { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500' },
  disposed:    { bg: 'bg-gray-100',  text: 'text-gray-600',   dot: 'bg-gray-400' },
  stayed:      { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  withdrawn:   { bg: 'bg-red-50',    text: 'text-red-600',    dot: 'bg-red-400' },
  transferred: { bg: 'bg-blue-50',   text: 'text-blue-600',   dot: 'bg-blue-400' },
  reserved:    { bg: 'bg-purple-50', text: 'text-purple-600', dot: 'bg-purple-400' },
}

// ───── Highlight helper ─────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim() || !text) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function formatDate(d: string | null): string {
  if (!d) return '--'
  try {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

// ───── Main Component ─────

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [caseResults, setCaseResults] = useState<CaseResult[]>([])
  const [hearingResults, setHearingResults] = useState<HearingResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search bar on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounce: update debouncedQuery 300ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Run search when debouncedQuery changes
  const runSearch = useCallback(async (searchTerm: string) => {
    if (!searchTerm) {
      setCaseResults([])
      setHearingResults([])
      setHasSearched(false)
      return
    }

    setLoading(true)
    setHasSearched(true)

    const supabase = createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    // Get advocate_id for security filtering
    const { data: advocate } = await supabase
      .from('advocates')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!advocate) {
      setLoading(false)
      return
    }

    const q = searchTerm.toLowerCase()

    // ── Search cases ──
    // Fetch all user's cases and filter client-side for multi-field search
    const { data: cases } = await supabase
      .from('cases')
      .select('id, court_code, court_name, case_number, case_year, party_plaintiff, party_defendant, client_name, opposite_advocate, notes, status')
      .eq('advocate_id', advocate.id)

    const matchedCases: CaseResult[] = []
    if (cases) {
      for (const c of cases) {
        // Check each searchable field
        const fields: { field: string; value: string | null }[] = [
          { field: 'Party (Plaintiff)', value: c.party_plaintiff },
          { field: 'Party (Defendant)', value: c.party_defendant },
          { field: 'Case Number', value: formatCaseNumber(c.case_number, c.case_year) },
          { field: 'Client', value: c.client_name },
          { field: 'Opposite Advocate', value: c.opposite_advocate },
          { field: 'Notes', value: c.notes },
        ]

        for (const f of fields) {
          if (f.value && f.value.toLowerCase().includes(q)) {
            matchedCases.push({
              ...c,
              matchField: f.field,
              matchText: f.value,
            })
            break // one match per case is enough
          }
        }
      }
    }

    // ── Search hearings ──
    // Get case IDs belonging to this advocate
    const caseIds = cases?.map(c => c.id) || []

    let matchedHearings: HearingResult[] = []

    if (caseIds.length > 0) {
      const { data: hearings } = await supabase
        .from('hearings')
        .select('id, case_id, hearing_date, outcome_notes, purpose')
        .in('case_id', caseIds)

      if (hearings) {
        // Build a lookup for case titles
        const caseMap = new Map<string, { plaintiff: string; defendant: string }>()
        if (cases) {
          for (const c of cases) {
            caseMap.set(c.id, { plaintiff: c.party_plaintiff, defendant: c.party_defendant })
          }
        }

        for (const h of hearings) {
          const fields: { field: string; value: string | null }[] = [
            { field: 'Outcome Notes', value: h.outcome_notes },
            { field: 'Purpose', value: h.purpose },
          ]

          for (const f of fields) {
            if (f.value && f.value.toLowerCase().includes(q)) {
              const caseInfo = caseMap.get(h.case_id)
              matchedHearings.push({
                ...h,
                case_plaintiff: caseInfo?.plaintiff || '',
                case_defendant: caseInfo?.defendant || '',
                matchField: f.field,
                matchText: f.value,
              })
              break
            }
          }
        }
      }
    }

    setCaseResults(matchedCases)
    setHearingResults(matchedHearings)
    setLoading(false)
  }, [])

  useEffect(() => {
    runSearch(debouncedQuery)
  }, [debouncedQuery, runSearch])

  const totalResults = caseResults.length + hearingResults.length

  return (
    <div className="max-w-4xl">
      {/* Heading */}
      <h2
        className="text-2xl font-bold text-gray-800 mb-6"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        Search
      </h2>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cases, hearings, documents..."
          className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-xl text-base text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="inline-block w-8 h-8 border-2 border-gray-300 border-t-[#1e3a5f] rounded-full animate-spin" />
          <span className="ml-3 text-sm text-gray-500">Searching...</span>
        </div>
      )}

      {/* Empty state: no search term */}
      {!loading && !hasSearched && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Start typing to search across all your cases and hearings</p>
        </div>
      )}

      {/* No results */}
      {!loading && hasSearched && totalResults === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            No results found for &lsquo;{debouncedQuery}&rsquo;
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && hasSearched && totalResults > 0 && (
        <>
          {/* Result counts */}
          <div className="flex items-center gap-3 mb-5 text-sm">
            <span className="text-gray-500">
              <span className="font-semibold text-gray-700">Cases</span> ({caseResults.length})
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">
              <span className="font-semibold text-gray-700">Hearings</span> ({hearingResults.length})
            </span>
          </div>

          {/* Cases section */}
          {caseResults.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4 text-[#1e3a5f]" />
                <h3
                  className="text-lg font-semibold text-gray-800"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  Cases
                </h3>
              </div>
              <div className="space-y-3">
                {caseResults.map((c) => {
                  const colors = STATUS_COLORS[c.status] || STATUS_COLORS.active
                  const courtLabel = c.court_code ? getCourtLabel(c.court_code) : c.court_name
                  return (
                    <Link
                      key={c.id}
                      href={`/diary/cases/${c.id}`}
                      className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-[#1e3a5f]/30 hover:shadow-sm transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {/* Title */}
                          <h4 className="text-base font-semibold text-[#1e3a5f]">
                            {highlightMatch(c.party_plaintiff, debouncedQuery)}
                            <span className="text-gray-400 font-normal"> vs </span>
                            {highlightMatch(c.party_defendant, debouncedQuery)}
                          </h4>

                          {/* Court & Case Number */}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-sm text-gray-600">{courtLabel}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-sm text-gray-600 font-mono">
                              {highlightMatch(formatCaseNumber(c.case_number, c.case_year), debouncedQuery)}
                            </span>
                          </div>

                          {/* Matching text */}
                          <p className="text-sm text-gray-500 mt-2">
                            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                              {c.matchField}:
                            </span>{' '}
                            {highlightMatch(
                              c.matchText.length > 120 ? c.matchText.slice(0, 120) + '...' : c.matchText,
                              debouncedQuery
                            )}
                          </p>
                        </div>

                        {/* Status pill */}
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${colors.bg} ${colors.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                          {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Hearings section */}
          {hearingResults.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-[#1e3a5f]" />
                <h3
                  className="text-lg font-semibold text-gray-800"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  Hearings
                </h3>
              </div>
              <div className="space-y-3">
                {hearingResults.map((h) => (
                  <Link
                    key={h.id}
                    href={`/diary/cases/${h.case_id}`}
                    className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-[#1e3a5f]/30 hover:shadow-sm transition-all"
                  >
                    <div className="min-w-0">
                      {/* Date */}
                      <div className="flex flex-wrap items-center gap-3 mb-1.5">
                        <span className="text-sm font-semibold text-gray-800">
                          {formatDate(h.hearing_date)}
                        </span>
                        <span className="text-gray-300">|</span>
                        <span className="text-sm text-[#1e3a5f] font-medium">
                          {h.case_plaintiff} vs {h.case_defendant}
                        </span>
                      </div>

                      {/* Matching text */}
                      <p className="text-sm text-gray-500">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                          {h.matchField}:
                        </span>{' '}
                        {highlightMatch(
                          h.matchText.length > 150 ? h.matchText.slice(0, 150) + '...' : h.matchText,
                          debouncedQuery
                        )}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
