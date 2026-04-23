'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCourtLabel, eCourtsDeepLink, formatCaseNumber } from '@/lib/constants/courts'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Eye,
  ChevronLeft,
  ChevronRight,
  Briefcase,
} from 'lucide-react'

const PAGE_SIZE = 25

type Case = {
  id: string
  court_level: string
  court_code: string | null
  court_name: string
  case_number: string
  case_year: number | null
  case_type: string | null
  party_plaintiff: string
  party_defendant: string
  full_title: string | null
  client_name: string | null
  client_side: string | null
  case_stage: string | null
  status: string
  ecourts_cnr: string | null
  hc_bench: string | null
  created_at: string
}

type SortKey = 'court_code' | 'case_number' | 'full_title' | 'client_name' | 'case_stage' | 'status'
type SortDir = 'asc' | 'desc'

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  active:      { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500' },
  disposed:    { bg: 'bg-gray-100',  text: 'text-gray-600',   dot: 'bg-gray-400' },
  stayed:      { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  withdrawn:   { bg: 'bg-red-50',    text: 'text-red-600',    dot: 'bg-red-400' },
  transferred: { bg: 'bg-blue-50',   text: 'text-blue-600',   dot: 'bg-blue-400' },
  reserved:    { bg: 'bg-purple-50', text: 'text-purple-600', dot: 'bg-purple-400' },
}

function StatusPill({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.active
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function CasesPage() {
  const router = useRouter()

  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [courtLevelFilter, setCourtLevelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('case_number')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Pagination
  const [page, setPage] = useState(1)

  // Fetch cases
  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not logged in')
        setLoading(false)
        return
      }

      const { data: advocate, error: advErr } = await supabase
        .from('advocates')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (advErr || !advocate) {
        setError('Advocate profile not found. Please set up your profile first.')
        setLoading(false)
        return
      }

      // Get all cases for this advocate
      const { data: casesData, error: casesErr } = await supabase
        .from('cases')
        .select('id, court_level, court_code, court_name, case_number, case_year, case_type, party_plaintiff, party_defendant, full_title, client_name, client_side, case_stage, status, ecourts_cnr, hc_bench, created_at')
        .eq('advocate_id', advocate.id)
        .order('created_at', { ascending: false })

      if (casesErr) {
        setError(casesErr.message)
        setLoading(false)
        return
      }

      setCases(casesData || [])
      setLoading(false)
    }

    load()
  }, [])

  // Apply filters
  const filtered = useMemo(() => {
    let result = cases

    // Court level filter
    if (courtLevelFilter !== 'all') {
      result = result.filter(c => c.court_level === courtLevelFilter)
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter)
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(c => {
        const title = (c.full_title || `${c.party_plaintiff} vs ${c.party_defendant}`).toLowerCase()
        const caseNum = formatCaseNumber(c.case_number, c.case_year).toLowerCase()
        const client = (c.client_name || '').toLowerCase()
        return title.includes(q) || caseNum.includes(q) || client.includes(q)
      })
    }

    return result
  }, [cases, courtLevelFilter, statusFilter, search])

  // Apply sorting
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let aVal = ''
      let bVal = ''

      switch (sortKey) {
        case 'court_code':
          aVal = a.court_code ? getCourtLabel(a.court_code) : a.court_name
          bVal = b.court_code ? getCourtLabel(b.court_code) : b.court_name
          break
        case 'case_number':
          aVal = formatCaseNumber(a.case_number, a.case_year)
          bVal = formatCaseNumber(b.case_number, b.case_year)
          break
        case 'full_title':
          aVal = a.full_title || `${a.party_plaintiff} vs ${a.party_defendant}`
          bVal = b.full_title || `${b.party_plaintiff} vs ${b.party_defendant}`
          break
        case 'client_name':
          aVal = a.client_name || ''
          bVal = b.client_name || ''
          break
        case 'case_stage':
          aVal = a.case_stage || ''
          bVal = b.case_stage || ''
          break
        case 'status':
          aVal = a.status
          bVal = b.status
          break
      }

      const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return sorted.slice(start, start + PAGE_SIZE)
  }, [sorted, page])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [courtLevelFilter, statusFilter, search])

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }, [sortKey])

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) {
      return <ChevronUp className="w-3.5 h-3.5 text-gray-300" />
    }
    return sortDir === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 text-[#1e3a5f]" />
      : <ChevronDown className="w-3.5 h-3.5 text-[#1e3a5f]" />
  }

  function ColumnHeader({ column, label, className }: { column: SortKey; label: string; className?: string }) {
    return (
      <th
        className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 transition-colors ${className || ''}`}
        onClick={() => handleSort(column)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <SortIcon column={column} />
        </span>
      </th>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>
              All Cases
            </h2>
            <p className="text-gray-500 mt-1 text-sm">Loading your cases...</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="inline-block w-8 h-8 border-2 border-gray-300 border-t-[#1e3a5f] rounded-full animate-spin" />
          <p className="mt-3 text-gray-400 text-sm">Fetching cases...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-6xl">
        <h2 className="text-2xl font-bold text-gray-800 mb-4" style={{ fontFamily: 'Georgia, serif' }}>
          All Cases
        </h2>
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>
            All Cases
          </h2>
          <p className="text-gray-500 mt-1 text-sm">
            {filtered.length} case{filtered.length !== 1 ? 's' : ''}{filtered.length !== cases.length ? ` (filtered from ${cases.length})` : ''}
          </p>
        </div>
        <Link
          href="/diary/cases/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors hover:opacity-90"
          style={{ background: '#1e3a5f' }}
        >
          <Plus className="w-4 h-4" />
          Add New Case
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Court Level */}
          <select
            value={courtLevelFilter}
            onChange={e => setCourtLevelFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
          >
            <option value="all">All Courts</option>
            <option value="district">District Court</option>
            <option value="high_court">High Court</option>
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="disposed">Disposed</option>
            <option value="stayed">Stayed</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="transferred">Transferred</option>
            <option value="reserved">Reserved</option>
          </select>

          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by party name, case number, or client..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>
        </div>
      </div>

      {/* Empty state */}
      {cases.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No cases yet</h3>
          <p className="text-gray-500 text-sm mb-6">
            Start by adding your first case to the diary.
          </p>
          <Link
            href="/diary/cases/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors hover:opacity-90"
            style={{ background: '#1e3a5f' }}
          >
            <Plus className="w-4 h-4" />
            Add Your First Case
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No cases match your filters. Try adjusting your search or filters.</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <ColumnHeader column="court_code" label="Court" />
                    <ColumnHeader column="case_number" label="Case No." />
                    <ColumnHeader column="full_title" label="Title" className="min-w-[200px]" />
                    <ColumnHeader column="client_name" label="Client" />
                    <ColumnHeader column="case_stage" label="Stage" />
                    <ColumnHeader column="status" label="Status" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map((c) => {
                    const eLink = eCourtsDeepLink(c.ecourts_cnr)
                    const courtLabel = c.court_code ? getCourtLabel(c.court_code) : c.court_name
                    const title = c.full_title || `${c.party_plaintiff} vs ${c.party_defendant}`
                    return (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/diary/cases/${c.id}`)}
                        className="hover:bg-gray-50/70 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          <span className="font-medium">{courtLabel}</span>
                          {c.court_level === 'high_court' && c.hc_bench && (
                            <span className="block text-xs text-gray-400 mt-0.5">
                              {c.hc_bench === 'jodhpur' ? 'Jodhpur' : 'Jaipur'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800 font-mono whitespace-nowrap">
                          {formatCaseNumber(c.case_number, c.case_year)}
                          {c.case_type && (
                            <span className="block text-xs text-gray-400 mt-0.5 font-sans">
                              {c.case_type}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800 max-w-[280px]">
                          <span className="line-clamp-2">{title}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {c.client_name || <span className="text-gray-300">--</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {c.case_stage || <span className="text-gray-300">--</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusPill status={c.status} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <Link
                              href={`/diary/cases/${c.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </Link>
                            {eLink && (
                              <a
                                href={eLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                eCourts
                              </a>
                            )}
                          </div>
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
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-sm text-gray-500">
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </button>
                <span className="text-sm text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
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
