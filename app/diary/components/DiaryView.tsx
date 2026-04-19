'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  format,
  parseISO,
  addDays,
  subDays,
  isToday,
  isPast,
  startOfDay,
} from 'date-fns'
import {
  getCourtLabel,
  getCourtColor,
  eCourtsDeepLink,
  formatCaseNumber,
  DISTRICT_STAGES,
  HC_STAGES,
} from '@/lib/constants/courts'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Printer,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  CalendarDays,
  Search,
  X,
} from 'lucide-react'

// ──────────────────────────────── Types ────────────────────────────────

interface CaseRecord {
  id: string
  advocate_id: string
  court_level: string
  court_name: string
  court_code: string | null
  case_number: string
  case_year: number | null
  case_type: string | null
  party_plaintiff: string
  party_defendant: string
  full_title: string
  client_name: string | null
  client_side: string | null
  our_role: string | null
  opposite_advocate: string | null
  case_stage: string | null
  status: string
  ecourts_cnr: string | null
  hc_bench: string | null
}

interface HearingRow {
  id: string
  case_id: string
  hearing_date: string
  previous_hearing_date: string | null
  next_hearing_date: string | null
  stage_on_date: string | null
  purpose: string | null
  appearing_advocate_name: string | null
  happened: boolean
  adjournment_reason: string | null
  outcome_notes: string | null
}

interface HearingWithCase extends HearingRow {
  caseData: CaseRecord
}

interface SearchResult {
  id: string
  full_title: string
  case_number: string
  case_year: number | null
  case_type: string | null
  court_code: string | null
  court_name: string
  court_level: string
}

// ──────────────────────────────── Helpers ────────────────────────────────

function rowBorderColor(hearing: HearingRow, selectedDate: Date): string {
  if (hearing.happened) return '#22c55e' // green
  const hDate = parseISO(hearing.hearing_date)
  if (isToday(hDate)) return '#f59e0b' // amber
  if (isPast(startOfDay(hDate))) return '#ef4444' // red
  return '#d1d5db' // gray - future
}

function formatDD_MM(dateStr: string | null): string {
  if (!dateStr) return '--'
  try {
    return format(parseISO(dateStr), 'dd/MM')
  } catch {
    return '--'
  }
}

function toYMD(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

// ──────────────────────────────── Main Component ────────────────────────────────

export default function DiaryView({ initialDate }: { initialDate: Date }) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate)
  const [advocateId, setAdvocateId] = useState<string | null>(null)
  const [hearings, setHearings] = useState<HearingWithCase[]>([])
  const [loading, setLoading] = useState(true)

  // Inline editing states
  const [editingStage, setEditingStage] = useState<string | null>(null)
  const [editingNextDate, setEditingNextDate] = useState<string | null>(null)

  // Adjournment form
  const [adjournHearingId, setAdjournHearingId] = useState<string | null>(null)
  const [adjournDate, setAdjournDate] = useState('')
  const [adjournReason, setAdjournReason] = useState('')
  const [adjournSaving, setAdjournSaving] = useState(false)

  // Add hearing modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedCase, setSelectedCase] = useState<SearchResult | null>(null)
  const [newHearingForm, setNewHearingForm] = useState({
    hearing_date: '',
    stage_on_date: '',
    next_hearing_date: '',
    purpose: '',
    appearing_advocate_name: 'self',
    notes: '',
  })
  const [addSaving, setAddSaving] = useState(false)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ──── Load advocate ID on mount ────
  useEffect(() => {
    async function loadAdvocate() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('advocates')
        .select('id')
        .eq('user_id', user.id)
        .single()
      if (data) setAdvocateId(data.id)
    }
    loadAdvocate()
  }, [])

  // ──── Fetch hearings for the selected date ────
  const fetchHearings = useCallback(async () => {
    if (!advocateId) return
    setLoading(true)
    const supabase = createClient()
    const dateStr = toYMD(selectedDate)

    // 1. Get all hearings for this date
    const { data: hearingRows, error: hErr } = await supabase
      .from('hearings')
      .select('*')
      .eq('hearing_date', dateStr)
      .order('created_at', { ascending: true })

    if (hErr || !hearingRows || hearingRows.length === 0) {
      setHearings([])
      setLoading(false)
      return
    }

    // 2. Get unique case_ids
    const caseIds = [...new Set(hearingRows.map((h: HearingRow) => h.case_id))]

    // 3. Fetch those cases (RLS ensures we only get our own)
    const { data: cases } = await supabase
      .from('cases')
      .select('id, advocate_id, court_level, court_name, court_code, case_number, case_year, case_type, party_plaintiff, party_defendant, full_title, client_name, client_side, our_role, opposite_advocate, case_stage, status, ecourts_cnr, hc_bench')
      .in('id', caseIds)

    if (!cases) {
      setHearings([])
      setLoading(false)
      return
    }

    const caseMap = new Map<string, CaseRecord>()
    for (const c of cases) {
      caseMap.set(c.id, c as CaseRecord)
    }

    // 4. Combine — only include hearings whose case belongs to this advocate
    const combined: HearingWithCase[] = []
    for (const h of hearingRows as HearingRow[]) {
      const c = caseMap.get(h.case_id)
      if (c && c.advocate_id === advocateId) {
        combined.push({ ...h, caseData: c })
      }
    }

    setHearings(combined)
    setLoading(false)
  }, [advocateId, selectedDate])

  useEffect(() => {
    if (advocateId) fetchHearings()
  }, [advocateId, fetchHearings])

  // ──── Navigation ────
  function goDay(offset: number) {
    const newDate = offset > 0 ? addDays(selectedDate, offset) : subDays(selectedDate, Math.abs(offset))
    setSelectedDate(newDate)
    // Update URL if not today
    if (isToday(newDate)) {
      router.push('/diary')
    } else {
      router.push(`/diary/date/${toYMD(newDate)}`)
    }
  }

  function goToday() {
    setSelectedDate(new Date())
    router.push('/diary')
  }

  // ──── Inline stage edit ────
  async function saveStage(hearingId: string, newStage: string) {
    const supabase = createClient()
    await supabase.from('hearings').update({ stage_on_date: newStage }).eq('id', hearingId)
    // Also update the case's case_stage
    const hearing = hearings.find(h => h.id === hearingId)
    if (hearing) {
      await supabase.from('cases').update({ case_stage: newStage }).eq('id', hearing.case_id)
    }
    setEditingStage(null)
    fetchHearings()
  }

  // ──── Inline next date edit ────
  async function saveNextDate(hearingId: string, newDate: string) {
    const supabase = createClient()
    await supabase.from('hearings').update({ next_hearing_date: newDate || null }).eq('id', hearingId)
    setEditingNextDate(null)
    fetchHearings()
  }

  // ──── Mark attended ────
  async function markAttended(hearingId: string) {
    const supabase = createClient()
    await supabase.from('hearings').update({ happened: true }).eq('id', hearingId)
    fetchHearings()
  }

  // ──── Mark adjourned ────
  async function submitAdjourn(hearingId: string) {
    if (!adjournDate) return
    setAdjournSaving(true)
    const supabase = createClient()
    const hearing = hearings.find(h => h.id === hearingId)
    if (!hearing) { setAdjournSaving(false); return }

    // 1. Mark current hearing as happened + set adjournment reason
    await supabase.from('hearings').update({
      happened: true,
      adjournment_reason: adjournReason || 'Adjourned',
      next_hearing_date: adjournDate,
    }).eq('id', hearingId)

    // 2. Create NEW hearing on the adjourned date
    await supabase.from('hearings').insert({
      case_id: hearing.case_id,
      hearing_date: adjournDate,
      previous_hearing_date: hearing.hearing_date,
      stage_on_date: hearing.stage_on_date,
      purpose: hearing.purpose,
      appearing_advocate_name: hearing.appearing_advocate_name || 'self',
      happened: false,
    })

    setAdjournHearingId(null)
    setAdjournDate('')
    setAdjournReason('')
    setAdjournSaving(false)
    fetchHearings()
  }

  // ──── Case search (debounced) ────
  function handleSearch(q: string) {
    setSearchQuery(q)
    setSelectedCase(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.trim().length < 2) {
      setSearchResults([])
      return
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const supabase = createClient()
      // Search by party names or case number
      const { data } = await supabase
        .from('cases')
        .select('id, full_title, case_number, case_year, case_type, court_code, court_name, court_level')
        .eq('advocate_id', advocateId!)
        .or(`full_title.ilike.%${q}%,case_number.ilike.%${q}%`)
        .limit(10)
      setSearchResults((data as SearchResult[]) || [])
      setSearching(false)
    }, 300)
  }

  // ──── Add hearing ────
  async function addHearing(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCase || !newHearingForm.hearing_date) return
    setAddSaving(true)
    const supabase = createClient()

    await supabase.from('hearings').insert({
      case_id: selectedCase.id,
      hearing_date: newHearingForm.hearing_date,
      stage_on_date: newHearingForm.stage_on_date || null,
      next_hearing_date: newHearingForm.next_hearing_date || null,
      purpose: newHearingForm.purpose || null,
      appearing_advocate_name: newHearingForm.appearing_advocate_name || 'self',
      outcome_notes: newHearingForm.notes || null,
      happened: false,
    })

    setAddSaving(false)
    resetAddModal()
    fetchHearings()
  }

  function resetAddModal() {
    setShowAddModal(false)
    setSearchQuery('')
    setSearchResults([])
    setSelectedCase(null)
    setNewHearingForm({
      hearing_date: toYMD(selectedDate),
      stage_on_date: '',
      next_hearing_date: '',
      purpose: '',
      appearing_advocate_name: 'self',
      notes: '',
    })
  }

  function openAddModal() {
    setNewHearingForm({
      hearing_date: toYMD(selectedDate),
      stage_on_date: '',
      next_hearing_date: '',
      purpose: '',
      appearing_advocate_name: 'self',
      notes: '',
    })
    setSearchQuery('')
    setSearchResults([])
    setSelectedCase(null)
    setShowAddModal(true)
  }

  // ──── Print ────
  function handlePrint() {
    window.print()
  }

  // ──── Stats ────
  const totalHearings = hearings.length
  const attended = hearings.filter(h => h.happened).length
  const pending = hearings.filter(h => !h.happened && !h.adjournment_reason).length
  const adjourned = hearings.filter(h => h.adjournment_reason).length

  // ──── Date display ────
  const dateDisplay = format(selectedDate, 'EEEE, d MMMM yyyy')
  const isTodayDate = isToday(selectedDate)

  // ──────────────────────────────── Render ────────────────────────────────

  return (
    <div className="max-w-6xl">
      {/* ═══ Header Bar ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goDay(-1)}
            className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            title="Previous day"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>

          <div>
            <h1
              className="text-xl sm:text-2xl font-bold text-gray-900"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              {dateDisplay}
            </h1>
            {isTodayDate && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Today
              </span>
            )}
          </div>

          <button
            onClick={() => goDay(1)}
            className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            title="Next day"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>

          {!isTodayDate && (
            <button
              onClick={goToday}
              className="ml-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-gray-700"
            >
              Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
            style={{ background: '#1e3a5f' }}
          >
            <Plus className="w-4 h-4" />
            Add Hearing
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* ═══ Main Table ═══ */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : hearings.length === 0 ? (
        /* ── Empty State ── */
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <CalendarDays className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2
            className="text-xl font-bold text-gray-700 mb-2"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            No hearings scheduled for {format(selectedDate, 'd MMMM yyyy')}
          </h2>
          <p className="text-gray-500 mb-6">Add a hearing to get started.</p>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium"
            style={{ background: '#1e3a5f' }}
          >
            <Plus className="w-4 h-4" />
            Add Hearing
          </button>
        </div>
      ) : (
        <>
          {/* ── Desktop Table ── */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200" style={{ background: '#f8f8f5' }}>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Pre Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Court</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Case No.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Party Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hearings.map((h) => {
                  const borderColor = rowBorderColor(h, selectedDate)
                  const courtCode = h.caseData.court_code || ''
                  const courtBg = getCourtColor(courtCode)
                  const stages = h.caseData.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES
                  const ecLink = eCourtsDeepLink(h.caseData.ecourts_cnr)

                  return (
                    <tr
                      key={h.id}
                      className="hover:bg-gray-50/50 transition-colors"
                      style={{ borderLeft: `4px solid ${borderColor}` }}
                    >
                      {/* Pre Date */}
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs whitespace-nowrap">
                        {formatDD_MM(h.previous_hearing_date)}
                      </td>

                      {/* Court */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-medium text-gray-700 whitespace-nowrap"
                          style={{ background: courtBg }}
                        >
                          {getCourtLabel(courtCode || h.caseData.court_name)}
                        </span>
                      </td>

                      {/* Case No. */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-800 whitespace-nowrap">
                        {h.caseData.case_type ? `${h.caseData.case_type} ` : ''}
                        {formatCaseNumber(h.caseData.case_number, h.caseData.case_year)}
                      </td>

                      {/* Party Name */}
                      <td className="px-4 py-3 max-w-[250px]">
                        <Link
                          href={`/diary/cases/${h.case_id}`}
                          className="text-sm font-medium hover:underline transition-colors"
                          style={{ color: '#1e3a5f' }}
                        >
                          {h.caseData.party_plaintiff}
                          <span className="text-gray-400 font-normal"> vs </span>
                          {h.caseData.party_defendant}
                          {h.caseData.case_type && (
                            <span className="text-gray-400 font-normal text-xs ml-1">
                              ({h.caseData.case_type})
                            </span>
                          )}
                        </Link>
                        {h.appearing_advocate_name && (
                          <p className="text-xs text-gray-400 italic mt-0.5">
                            {h.appearing_advocate_name === 'self' ? 'Self' : h.appearing_advocate_name}
                          </p>
                        )}
                      </td>

                      {/* Stage — Inline Editable */}
                      <td className="px-4 py-3">
                        {editingStage === h.id ? (
                          <select
                            autoFocus
                            defaultValue={h.stage_on_date || ''}
                            onChange={(e) => saveStage(h.id, e.target.value)}
                            onBlur={() => setEditingStage(null)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 max-w-[140px]"
                          >
                            <option value="">--</option>
                            {stages.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingStage(h.id)}
                            className="text-xs px-2 py-1 rounded hover:bg-gray-100 transition-colors text-gray-700 text-left"
                            title="Click to change stage"
                          >
                            {h.stage_on_date || <span className="text-gray-300">--</span>}
                          </button>
                        )}
                      </td>

                      {/* Next Date — Inline Editable */}
                      <td className="px-4 py-3">
                        {editingNextDate === h.id ? (
                          <input
                            type="date"
                            autoFocus
                            defaultValue={h.next_hearing_date || ''}
                            onChange={(e) => saveNextDate(h.id, e.target.value)}
                            onBlur={() => setEditingNextDate(null)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900"
                          />
                        ) : (
                          <button
                            onClick={() => setEditingNextDate(h.id)}
                            className="text-xs font-mono px-2 py-1 rounded hover:bg-gray-100 transition-colors text-gray-700"
                            title="Click to set next date"
                          >
                            {formatDD_MM(h.next_hearing_date)}
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* Attended */}
                          {!h.happened ? (
                            <button
                              onClick={() => markAttended(h.id)}
                              className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                              title="Mark attended"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="p-1.5 text-green-500" title="Attended">
                              <Check className="w-4 h-4" />
                            </span>
                          )}

                          {/* Adjourn */}
                          {!h.happened && (
                            <button
                              onClick={() => {
                                setAdjournHearingId(h.id)
                                setAdjournDate('')
                                setAdjournReason('')
                              }}
                              className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors"
                              title="Adjourn"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                          )}

                          {/* eCourts link */}
                          {ecLink && (
                            <a
                              href={ecLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
                              title="View on eCourts"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>

                        {/* Adjournment inline form */}
                        {adjournHearingId === h.id && (
                          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-xs font-medium text-amber-800 mb-2">Adjourn to:</p>
                            <input
                              type="date"
                              value={adjournDate}
                              onChange={(e) => setAdjournDate(e.target.value)}
                              className="w-full px-2 py-1 border border-amber-300 rounded text-xs bg-white text-gray-900 mb-2"
                            />
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={adjournReason}
                              onChange={(e) => setAdjournReason(e.target.value)}
                              className="w-full px-2 py-1 border border-amber-300 rounded text-xs bg-white text-gray-900 mb-2"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => submitAdjourn(h.id)}
                                disabled={!adjournDate || adjournSaving}
                                className="px-3 py-1 rounded text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"
                              >
                                {adjournSaving ? 'Saving...' : 'Adjourn'}
                              </button>
                              <button
                                onClick={() => setAdjournHearingId(null)}
                                className="px-3 py-1 rounded text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Cards ── */}
          <div className="md:hidden space-y-3">
            {hearings.map((h) => {
              const borderColor = rowBorderColor(h, selectedDate)
              const courtCode = h.caseData.court_code || ''
              const courtBg = getCourtColor(courtCode)
              const stages = h.caseData.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES
              const ecLink = eCourtsDeepLink(h.caseData.ecourts_cnr)

              return (
                <div
                  key={h.id}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                  style={{ borderLeft: `4px solid ${borderColor}` }}
                >
                  {/* Top: Court + Case No */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-medium text-gray-700"
                      style={{ background: courtBg }}
                    >
                      {getCourtLabel(courtCode || h.caseData.court_name)}
                    </span>
                    <span className="text-xs font-mono text-gray-500">
                      {h.caseData.case_type ? `${h.caseData.case_type} ` : ''}
                      {formatCaseNumber(h.caseData.case_number, h.caseData.case_year)}
                    </span>
                  </div>

                  {/* Party Name */}
                  <Link
                    href={`/diary/cases/${h.case_id}`}
                    className="block text-sm font-medium mb-1 hover:underline"
                    style={{ color: '#1e3a5f' }}
                  >
                    {h.caseData.party_plaintiff}
                    <span className="text-gray-400 font-normal"> vs </span>
                    {h.caseData.party_defendant}
                  </Link>
                  {h.appearing_advocate_name && (
                    <p className="text-xs text-gray-400 italic mb-2">
                      {h.appearing_advocate_name === 'self' ? 'Self' : h.appearing_advocate_name}
                    </p>
                  )}

                  {/* Info row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
                    <span>Pre: {formatDD_MM(h.previous_hearing_date)}</span>
                    <span>
                      Stage:{' '}
                      {editingStage === h.id ? (
                        <select
                          autoFocus
                          defaultValue={h.stage_on_date || ''}
                          onChange={(e) => saveStage(h.id, e.target.value)}
                          onBlur={() => setEditingStage(null)}
                          className="px-1 py-0.5 border border-gray-300 rounded text-xs bg-white text-gray-900"
                        >
                          <option value="">--</option>
                          {stages.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingStage(h.id)}
                          className="underline decoration-dotted"
                        >
                          {h.stage_on_date || '--'}
                        </button>
                      )}
                    </span>
                    <span>
                      Next:{' '}
                      {editingNextDate === h.id ? (
                        <input
                          type="date"
                          autoFocus
                          defaultValue={h.next_hearing_date || ''}
                          onChange={(e) => saveNextDate(h.id, e.target.value)}
                          onBlur={() => setEditingNextDate(null)}
                          className="px-1 py-0.5 border border-gray-300 rounded text-xs bg-white text-gray-900"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingNextDate(h.id)}
                          className="underline decoration-dotted"
                        >
                          {formatDD_MM(h.next_hearing_date)}
                        </button>
                      )}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!h.happened ? (
                      <button
                        onClick={() => markAttended(h.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Attended
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-green-700 bg-green-100">
                        <Check className="w-3.5 h-3.5" />
                        Done
                      </span>
                    )}

                    {!h.happened && (
                      <button
                        onClick={() => {
                          setAdjournHearingId(h.id)
                          setAdjournDate('')
                          setAdjournReason('')
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Adjourn
                      </button>
                    )}

                    {ecLink && (
                      <a
                        href={ecLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        eCourts
                      </a>
                    )}
                  </div>

                  {/* Adjournment inline form (mobile) */}
                  {adjournHearingId === h.id && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs font-medium text-amber-800 mb-2">Adjourn to:</p>
                      <input
                        type="date"
                        value={adjournDate}
                        onChange={(e) => setAdjournDate(e.target.value)}
                        className="w-full px-2 py-1.5 border border-amber-300 rounded text-xs bg-white text-gray-900 mb-2"
                      />
                      <input
                        type="text"
                        placeholder="Reason (optional)"
                        value={adjournReason}
                        onChange={(e) => setAdjournReason(e.target.value)}
                        className="w-full px-2 py-1.5 border border-amber-300 rounded text-xs bg-white text-gray-900 mb-2"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => submitAdjourn(h.id)}
                          disabled={!adjournDate || adjournSaving}
                          className="flex-1 px-3 py-1.5 rounded text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"
                        >
                          {adjournSaving ? 'Saving...' : 'Adjourn'}
                        </button>
                        <button
                          onClick={() => setAdjournHearingId(null)}
                          className="px-3 py-1.5 rounded text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ═══ Stats Strip ═══ */}
          <div
            className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 rounded-xl text-sm"
            style={{ background: '#f3f3ee' }}
          >
            <span className="font-medium text-gray-700">
              Today: <span className="font-bold" style={{ color: '#1e3a5f' }}>{totalHearings}</span> hearings
            </span>
            <span className="text-gray-400">|</span>
            <span className="text-green-700">
              Attended: <span className="font-bold">{attended}</span>
            </span>
            <span className="text-gray-400">|</span>
            <span className="text-amber-700">
              Pending: <span className="font-bold">{pending}</span>
            </span>
            <span className="text-gray-400">|</span>
            <span className="text-red-700">
              Adjourned: <span className="font-bold">{adjourned}</span>
            </span>
          </div>
        </>
      )}

      {/* ═══ Add Hearing Modal ═══ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={resetAddModal}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2
                className="text-lg font-bold text-gray-800"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                Add Hearing
              </h2>
              <button
                onClick={resetAddModal}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Step 1: Search for case */}
              {!selectedCase ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search for a case
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      autoFocus
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder="Type party name or case number..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                    />
                  </div>

                  {/* Search Results */}
                  {searching && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Searching...
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                      {searchResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCase(c)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <p className="text-sm font-medium text-gray-800">{c.full_title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {c.case_type ? `${c.case_type} ` : ''}
                            {formatCaseNumber(c.case_number, c.case_year)}
                            {' — '}
                            {getCourtLabel(c.court_code || c.court_name)}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                    <p className="mt-2 text-sm text-gray-400">No cases found.</p>
                  )}

                  {/* Create new case link */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <Link
                      href="/diary/cases/new"
                      className="text-sm font-medium hover:underline"
                      style={{ color: '#1e3a5f' }}
                    >
                      Case not found? Create new case
                    </Link>
                  </div>
                </div>
              ) : (
                /* Step 2: Hearing form */
                <div>
                  {/* Selected case summary */}
                  <div className="p-3 rounded-lg mb-4" style={{ background: '#f0f4f8' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{selectedCase.full_title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {selectedCase.case_type ? `${selectedCase.case_type} ` : ''}
                          {formatCaseNumber(selectedCase.case_number, selectedCase.case_year)}
                          {' — '}
                          {getCourtLabel(selectedCase.court_code || selectedCase.court_name)}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedCase(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>

                  <form onSubmit={addHearing} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Hearing Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={newHearingForm.hearing_date}
                          onChange={(e) => setNewHearingForm({ ...newHearingForm, hearing_date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Stage on Date
                        </label>
                        <select
                          value={newHearingForm.stage_on_date}
                          onChange={(e) => setNewHearingForm({ ...newHearingForm, stage_on_date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                        >
                          <option value="">-- Select --</option>
                          {(selectedCase.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Next Hearing Date
                        </label>
                        <input
                          type="date"
                          value={newHearingForm.next_hearing_date}
                          onChange={(e) => setNewHearingForm({ ...newHearingForm, next_hearing_date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Purpose
                        </label>
                        <input
                          type="text"
                          value={newHearingForm.purpose}
                          onChange={(e) => setNewHearingForm({ ...newHearingForm, purpose: e.target.value })}
                          placeholder="e.g., Arguments"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Appearing Advocate
                      </label>
                      <input
                        type="text"
                        value={newHearingForm.appearing_advocate_name}
                        onChange={(e) => setNewHearingForm({ ...newHearingForm, appearing_advocate_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Notes
                      </label>
                      <textarea
                        value={newHearingForm.notes}
                        onChange={(e) => setNewHearingForm({ ...newHearingForm, notes: e.target.value })}
                        rows={2}
                        placeholder="Optional notes..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={addSaving}
                        className="flex-1 px-5 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
                        style={{ background: '#1e3a5f' }}
                      >
                        {addSaving ? 'Saving...' : 'Save Hearing'}
                      </button>
                      <button
                        type="button"
                        onClick={resetAddModal}
                        className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
