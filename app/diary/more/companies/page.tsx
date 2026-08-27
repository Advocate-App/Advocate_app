'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/fetchAll'
import { getCourtShortLabel, formatCaseNumber } from '@/lib/constants/courts'
import { format } from 'date-fns'
import { ChevronLeft, Printer, Download, Building2 } from 'lucide-react'

interface CaseRow {
  id: string
  court_code: string | null
  court_name: string
  city: string | null
  case_number: string | null
  case_year: number | null
  party_plaintiff: string
  party_defendant: string
  client_name: string | null
  client_side: string | null
  case_stage: string | null
  status: string
  filed_date: string | null
  is_company_case: boolean
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

function formatDate(d: string | null): string {
  if (!d) return '—'
  return format(new Date(d), 'd MMM yyyy')
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`
  return v
}

export default function CompanyCasesPage() {
  const [allCases, setAllCases] = useState<CaseRow[]>([])
  const [customCourts, setCustomCourts] = useState<CustomCourtRow[]>([])
  const [loading, setLoading] = useState(true)

  const [company, setCompany] = useState('')
  const [cityFilter, setCityFilter] = useState('all')
  const [courtFilter, setCourtFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [filedFrom, setFiledFrom] = useState('')
  const [filedTo, setFiledTo] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [cases, { data: cc }] = await Promise.all([
        fetchAllRows<CaseRow>((from, to) =>
          supabase
            .from('cases')
            .select('id, court_code, court_name, city, case_number, case_year, party_plaintiff, party_defendant, client_name, client_side, case_stage, status, filed_date, is_company_case')
            .eq('is_company_case', true)
            .order('client_name', { ascending: true })
            .range(from, to)
        ),
        supabase.from('custom_courts').select('id, name, short_name, builtin_code'),
      ])
      setAllCases(cases)
      setCustomCourts((cc as CustomCourtRow[]) || [])
      setLoading(false)
    }
    load()
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

  const companyOptions = useMemo(() => {
    const set = new Set<string>()
    for (const c of allCases) if (c.client_name) set.add(c.client_name)
    return Array.from(set).sort()
  }, [allCases])

  const companyCases = useMemo(() => allCases.filter((c) => c.client_name === company), [allCases, company])

  const cityOptions = useMemo(() => {
    const set = new Set<string>()
    for (const c of companyCases) set.add(c.city || 'Other')
    return Array.from(set).sort()
  }, [companyCases])

  const courtOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of companyCases) {
      const code = c.court_code || c.court_name
      if (!seen.has(code)) seen.set(code, courtLabel(c.court_code, c.court_name))
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [companyCases, courtLabel])

  // Every filter (city, court, status, filed-date range) recomputes this,
  // and everything below — the stat cards and the table — reads from it,
  // so the stats always match exactly what's shown/printed/exported.
  const filtered = useMemo(() => {
    return companyCases.filter((c) => {
      if (cityFilter !== 'all' && (c.city || 'Other') !== cityFilter) return false
      if (courtFilter !== 'all' && (c.court_code || c.court_name) !== courtFilter) return false
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (filedFrom && (!c.filed_date || c.filed_date < filedFrom)) return false
      if (filedTo && (!c.filed_date || c.filed_date > filedTo)) return false
      return true
    }).sort((a, b) => courtLabel(a.court_code, a.court_name).localeCompare(courtLabel(b.court_code, b.court_name)))
  }, [companyCases, cityFilter, courtFilter, statusFilter, filedFrom, filedTo, courtLabel])

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {}
    for (const c of filtered) byStatus[c.status] = (byStatus[c.status] || 0) + 1
    return { total: filtered.length, byStatus }
  }, [filtered])

  function clearFilters() {
    setCityFilter('all'); setCourtFilter('all'); setStatusFilter('all')
    setFiledFrom(''); setFiledTo('')
  }

  function downloadCsv() {
    const headers = ['Court', 'City', 'Case Number', 'Party 1 (Plaintiff)', 'Party 2 (Defendant)', 'Side', 'Stage', 'Status', 'Filed Date']
    const rows = filtered.map((c) => [
      courtLabel(c.court_code, c.court_name),
      c.city || 'Other',
      c.case_number ? formatCaseNumber(c.case_number, c.case_year) : '',
      c.party_plaintiff,
      c.party_defendant,
      c.client_side || '',
      c.case_stage || '',
      c.status,
      c.filed_date || '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => csvEscape(String(v))).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${company.replace(/[^a-zA-Z0-9]+/g, '_')}_cases.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl">
      <Link href="/diary/more" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3 print:hidden">
        <ChevronLeft className="w-4 h-4" /> More
      </Link>

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Company Cases</h1>
          <p className="text-sm text-gray-400 mt-0.5">Pick a company to see its cases, filterable by city, court, status and filed date.</p>
        </div>
        {company && filtered.length > 0 && (
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={downloadCsv} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Download className="w-4 h-4" /> Excel (CSV)
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : companyOptions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          No company cases on file yet — mark a case as a Company Case in its Tracking section first.
        </div>
      ) : (
        <>
          {/* Company picker */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 print:hidden">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Company</label>
            <select
              value={company}
              onChange={(e) => { setCompany(e.target.value); clearFilters() }}
              className="w-full sm:w-96 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
            >
              <option value="">-- Select a company --</option>
              {companyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {!company ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Building2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Select a company above to see its cases.</p>
            </div>
          ) : (
            <>
              {/* Print header — company name + filters actually applied,
                  so a printed page is self-explanatory on its own. */}
              <div className="hidden print:block mb-3">
                <div className="font-bold text-base">{company} — Cases</div>
                <div className="text-xs text-gray-600">
                  {format(new Date(), 'd MMMM yyyy')}
                  {cityFilter !== 'all' ? ` · City: ${cityFilter}` : ''}
                  {courtFilter !== 'all' ? ` · Court: ${courtLabel(courtFilter, courtFilter)}` : ''}
                  {statusFilter !== 'all' ? ` · Status: ${statusFilter}` : ''}
                  {filedFrom ? ` · Filed from: ${filedFrom}` : ''}
                  {filedTo ? ` · Filed to: ${filedTo}` : ''}
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 print:hidden">
                <div className="flex flex-wrap gap-2">
                  <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]">
                    <option value="all">All Cities</option>
                    {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]">
                    <option value="all">All Courts</option>
                    {courtOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
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
                  <div className="flex items-center gap-1.5 px-1">
                    <label className="text-xs text-gray-500">Filed:</label>
                    <input type="date" value={filedFrom} onChange={(e) => setFiledFrom(e.target.value)}
                      className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]" />
                    <span className="text-xs text-gray-400">to</span>
                    <input type="date" value={filedTo} onChange={(e) => setFiledTo(e.target.value)}
                      className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]" />
                  </div>
                  {(cityFilter !== 'all' || courtFilter !== 'all' || statusFilter !== 'all' || filedFrom || filedTo) && (
                    <button onClick={clearFilters} className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              {/* Stats — recompute live from the exact filtered set above */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 break-inside-avoid">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold" style={{ color: '#1e3a5f' }}>{stats.total}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Total Cases</p>
                </div>
                {(['active', 'disposed', 'stayed'] as const).map((s) => (
                  <div key={s} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <p className="text-2xl font-bold text-gray-700">{stats.byStatus[s] || 0}</p>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">{s}</p>
                  </div>
                ))}
              </div>

              {/* Table — Excel-style bordered grid, readable font both on
                  screen and print (13px screen / 10.5pt print, not the
                  cramped ~10px some tables end up at). */}
              {filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
                  No cases match these filters.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#e8e8e0' }}>
                          <th className="text-left px-3 py-2 font-bold text-gray-700 border border-gray-300">Court</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-700 border border-gray-300">City</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-700 border border-gray-300">Case No.</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-700 border border-gray-300">Party 1</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-700 border border-gray-300">Party 2</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-700 border border-gray-300">Stage</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-700 border border-gray-300">Status</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-700 border border-gray-300">Filed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c, i) => {
                          const sc = STATUS_COLORS[c.status] || STATUS_COLORS.active
                          return (
                            <tr key={c.id} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                              <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{courtLabel(c.court_code, c.court_name)}</td>
                              <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{c.city || 'Other'}</td>
                              <td className="px-3 py-1.5 border border-gray-200 font-mono whitespace-nowrap">
                                <Link href={`/diary/cases/${c.id}`} className="hover:underline print:no-underline" style={{ color: '#1e3a5f' }}>
                                  {c.case_number ? formatCaseNumber(c.case_number, c.case_year) : '—'}
                                </Link>
                              </td>
                              <td className="px-3 py-1.5 border border-gray-200">{c.party_plaintiff}</td>
                              <td className="px-3 py-1.5 border border-gray-200">{c.party_defendant}</td>
                              <td className="px-3 py-1.5 border border-gray-200">{c.case_stage || '—'}</td>
                              <td className="px-3 py-1.5 border border-gray-200">
                                <span className="inline-block px-2 py-0.5 rounded-full font-medium capitalize print:px-0 print:py-0 print:rounded-none" style={{ background: sc.bg, color: sc.text }}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{formatDate(c.filed_date)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
