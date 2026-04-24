'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCourtShortLabel, formatCaseNumber } from '@/lib/constants/courts'
import Link from 'next/link'
import { Search, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'

interface CaseRow {
  id: string
  court_code: string | null
  court_name: string
  case_number: string
  case_year: number | null
  case_type: string | null
  party_plaintiff: string
  party_defendant: string
  client_name: string | null
  case_stage: string | null
  status: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:      { bg: '#d1fae5', text: '#065f46' },
  disposed:    { bg: '#f3f4f6', text: '#6b7280' },
  stayed:      { bg: '#fef3c7', text: '#92400e' },
  withdrawn:   { bg: '#fee2e2', text: '#991b1b' },
  transferred: { bg: '#dbeafe', text: '#1e40af' },
  reserved:    { bg: '#ede9fe', text: '#5b21b6' },
}

const PAGE_SIZE = 30

export default function AllCasesPage() {
  const [allCases, setAllCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('cases')
        .select('id, court_code, court_name, case_number, case_year, case_type, party_plaintiff, party_defendant, client_name, case_stage, status')
        .order('party_plaintiff', { ascending: true })
      setAllCases((data as CaseRow[]) || [])
      setLoading(false)
    }
    load()
    inputRef.current?.focus()
  }, [])

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1) }, [query])

  const filtered = useMemo(() => {
    if (!query.trim()) return allCases
    const q = query.toLowerCase()
    return allCases.filter(c =>
      [c.party_plaintiff, c.party_defendant, c.case_number, c.client_name, c.case_stage, c.case_type]
        .some(v => v && v.toLowerCase().includes(q))
    )
  }, [allCases, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageCases = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>All Cases</h1>
          {!loading && (
            <p className="text-sm text-gray-400 mt-0.5">
              {filtered.length === allCases.length
                ? `${allCases.length} cases total`
                : `${filtered.length} of ${allCases.length} cases`}
            </p>
          )}
        </div>
        <Link
          href="/diary/cases/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#1e3a5f' }}
        >
          <Plus className="w-4 h-4" />
          New Case
        </Link>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by party name, case number, client, stage…"
          className="w-full pl-11 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">Loading cases…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm mb-4">No cases found for &ldquo;{query}&rdquo;</p>
          <Link href="/diary/cases/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#1e3a5f' }}>
            <Plus className="w-4 h-4" /> Add New Case
          </Link>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200" style={{ background: '#e8e8e0' }}>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-600 w-24">Court</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-600 w-28">Case No.</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-600">Party 1 (Plaintiff)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-600">Party 2 (Defendant)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-600 w-32">Stage</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-600 w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageCases.map((c, i) => {
                  const sc = STATUS_COLORS[c.status] || STATUS_COLORS.active
                  const court = getCourtShortLabel(c.court_code || '') || c.court_name
                  return (
                    <tr key={c.id} className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">{court}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/diary/cases/${c.id}`} className="font-mono text-sm font-semibold hover:underline" style={{ color: '#1e3a5f' }}>
                          {formatCaseNumber(c.case_number, c.case_year)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800 max-w-[200px]">
                        <Link href={`/diary/cases/${c.id}`} className="block truncate hover:underline" style={{ color: '#1e3a5f' }} title={c.party_plaintiff}>{c.party_plaintiff}</Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800 max-w-[200px]">
                        <Link href={`/diary/cases/${c.id}`} className="block truncate hover:text-[#1e3a5f] text-gray-700" title={c.party_defendant}>{c.party_defendant}</Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {c.case_stage || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={{ background: sc.bg, color: sc.text }}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages} &nbsp;·&nbsp; showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className="w-9 h-9 rounded-lg text-sm font-medium transition-colors"
                      style={page === p ? { background: '#1e3a5f', color: '#fff' } : { color: '#374151' }}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
