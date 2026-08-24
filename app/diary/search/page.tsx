'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCourtShortLabel, formatCaseNumber } from '@/lib/constants/courts'
import { fuzzyMatch } from '@/lib/fuzzy'
import { fetchAllRows } from '@/lib/fetchAll'
import Link from 'next/link'
import { Search, ChevronLeft, ChevronRight, Plus, X, SlidersHorizontal } from 'lucide-react'

interface CaseRow {
  id: string
  court_code: string | null
  court_name: string
  city: string | null
  case_number: string | null
  case_year: number | null
  case_type: string | null
  party_plaintiff: string
  party_defendant: string
  client_name: string | null
  case_stage: string | null
  status: string
  is_company_case: boolean
  payment_received: boolean
  bills_generated: boolean
  order_passed: boolean
  appeal_filed: boolean
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

const CITIES = ['Udaipur', 'Dungarpur', 'Rajsamand', 'Salumber', 'Banswara', 'Nathdwara']
const PAGE_SIZE = 30
const TRI_STATE = [
  { value: 'all', label: 'Any' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

function TriSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
    >
      {TRI_STATE.map((o) => (
        <option key={o.value} value={o.value}>{label}: {o.label}</option>
      ))}
    </select>
  )
}

export default function AllCasesPage() {
  const [allCases, setAllCases] = useState<CaseRow[]>([])
  const [customCourts, setCustomCourts] = useState<CustomCourtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filters
  const [courtFilter, setCourtFilter] = useState('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('all') // all | company | private
  const [stageFilter, setStageFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [billsFilter, setBillsFilter] = useState('all')
  const [orderFilter, setOrderFilter] = useState('all')
  const [appealFilter, setAppealFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [cases, { data: cc }] = await Promise.all([
        fetchAllRows<CaseRow>((from, to) =>
          supabase
            .from('cases')
            .select('id, court_code, court_name, city, case_number, case_year, case_type, party_plaintiff, party_defendant, client_name, case_stage, status, is_company_case, payment_received, bills_generated, order_passed, appeal_filed')
            .order('party_plaintiff', { ascending: true })
            .range(from, to)
        ),
        supabase.from('custom_courts').select('id, name, short_name, builtin_code'),
      ])
      setAllCases(cases)
      setCustomCourts((cc as CustomCourtRow[]) || [])
      setLoading(false)
    }
    load()
    inputRef.current?.focus()
  }, [])

  // court_code -> short label (DB override first, then built-in, then raw name)
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

  // Distinct filter options, built from the cases actually on file
  const courtOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of allCases) {
      const code = c.court_code || c.court_name
      if (!seen.has(code)) seen.set(code, courtLabel(c.court_code, c.court_name))
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [allCases, courtLabel])

  const stageOptions = useMemo(() => {
    const set = new Set<string>()
    for (const c of allCases) if (c.case_stage) set.add(c.case_stage)
    return Array.from(set).sort()
  }, [allCases])

  const activeFilterCount = [
    courtFilter, cityFilter, statusFilter, companyFilter, stageFilter,
    paymentFilter, billsFilter, orderFilter, appealFilter,
  ].filter((v) => v !== 'all').length

  function clearFilters() {
    setCourtFilter('all'); setCityFilter('all'); setStatusFilter('all')
    setCompanyFilter('all'); setStageFilter('all')
    setPaymentFilter('all'); setBillsFilter('all'); setOrderFilter('all'); setAppealFilter('all')
  }

  function triMatch(filter: string, value: boolean) {
    if (filter === 'all') return true
    return filter === 'yes' ? value : !value
  }

  // Reset to page 1 whenever search or filters change
  useEffect(() => { setPage(1) }, [query, courtFilter, cityFilter, statusFilter, companyFilter, stageFilter, paymentFilter, billsFilter, orderFilter, appealFilter])

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

    return allCases.filter((c) => {
      if (courtFilter !== 'all' && (c.court_code || c.court_name) !== courtFilter) return false
      if (cityFilter !== 'all' && c.city !== cityFilter) return false
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (companyFilter !== 'all' && (companyFilter === 'company') !== c.is_company_case) return false
      if (stageFilter !== 'all' && c.case_stage !== stageFilter) return false
      if (!triMatch(paymentFilter, c.payment_received)) return false
      if (!triMatch(billsFilter, c.bills_generated)) return false
      if (!triMatch(orderFilter, c.order_passed)) return false
      if (!triMatch(appealFilter, c.appeal_filed)) return false

      if (terms.length === 0) return true
      const fields = [
        c.case_number, c.party_plaintiff, c.party_defendant, c.client_name,
        c.case_stage, c.case_type, c.court_name,
      ].filter(Boolean) as string[]
      return terms.every((term) => fields.some((f) => fuzzyMatch(term, f)))
    })
  }, [allCases, query, courtFilter, cityFilter, statusFilter, companyFilter, stageFilter, paymentFilter, billsFilter, orderFilter, appealFilter])

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

      {/* Search bar + filter toggle */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by party name, case number, client, stage…"
            className="w-full pl-11 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-0 rounded-xl border text-sm font-medium transition-colors"
          style={showFilters || activeFilterCount > 0
            ? { background: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' }
            : { background: '#fff', color: '#374151', borderColor: '#e5e7eb' }}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap gap-2">
            <select value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]">
              <option value="all">All Courts</option>
              {courtOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>

            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]">
              <option value="all">All Cities</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="disposed">Disposed</option>
              <option value="stayed">Stayed</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="transferred">Transferred</option>
              <option value="reserved">Reserved</option>
            </select>

            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]">
              <option value="all">Company + Private</option>
              <option value="company">Company Cases</option>
              <option value="private">Private Cases</option>
            </select>

            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]">
              <option value="all">All Stages</option>
              {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <TriSelect label="Payment Received" value={paymentFilter} onChange={setPaymentFilter} />
            <TriSelect label="Bills Generated" value={billsFilter} onChange={setBillsFilter} />
            <TriSelect label="Order Passed" value={orderFilter} onChange={setOrderFilter} />
            <TriSelect label="Appeal Filed" value={appealFilter} onChange={setAppealFilter} />

            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                <X className="w-3.5 h-3.5" /> Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">Loading cases…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm mb-4">
            {query ? <>No cases found for &ldquo;{query}&rdquo;</> : 'No cases match your filters.'}
          </p>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-sm font-medium mb-4" style={{ color: '#1e3a5f' }}>Clear filters</button>
          )}
          <Link href="/diary/cases/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#1e3a5f' }}>
            <Plus className="w-4 h-4" /> Add New Case
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2.5">
            {pageCases.map((c) => {
              const sc = STATUS_COLORS[c.status] || STATUS_COLORS.active
              const court = courtLabel(c.court_code, c.court_name)
              return (
                <Link
                  key={c.id}
                  href={`/diary/cases/${c.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 active:bg-gray-50"
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{court}</span>
                    <span className="font-mono text-sm font-semibold" style={{ color: '#1e3a5f' }}>
                      {c.case_number ? formatCaseNumber(c.case_number, c.case_year) : 'No number yet'}
                    </span>
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ml-auto" style={{ background: sc.bg, color: sc.text }}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-base leading-snug text-gray-800">
                    {c.party_plaintiff} <span className="text-gray-400">vs</span> {c.party_defendant}
                  </p>
                  {c.case_stage && (
                    <p className="text-sm text-gray-500 mt-1">{c.case_stage}</p>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Table (desktop) */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
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
                    const court = courtLabel(c.court_code, c.court_name)
                    return (
                      <tr key={c.id} className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">{court}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/diary/cases/${c.id}`} className="font-mono text-sm font-semibold hover:underline" style={{ color: '#1e3a5f' }}>
                            {c.case_number ? formatCaseNumber(c.case_number, c.case_year) : <span className="text-gray-300 font-sans font-normal">No number yet</span>}
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
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3 mt-4">
              <p className="text-sm text-gray-500 order-2 sm:order-1">
                Page {page} of {totalPages} &nbsp;·&nbsp; showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1 order-1 sm:order-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const cap = Math.min(totalPages, 5)
                  const p = totalPages <= cap ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - cap + 1 + i : page - 2 + i
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
