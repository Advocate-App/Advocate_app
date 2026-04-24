'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  setMonth,
  setYear,
  getDaysInMonth,
} from 'date-fns'
import {
  getCourtLabel,
  getCourtShortLabel,
  getCourtColor,
  getCourtSortPriority,
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
  MessageSquare,
  ExternalLink,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import TaskBar from './TaskBar'

const HINDI_DAYS: Record<string, string> = {
  Sunday: 'रविवार',
  Monday: 'सोमवार',
  Tuesday: 'मंगलवार',
  Wednesday: 'बुधवार',
  Thursday: 'गुरुवार',
  Friday: 'शुक्रवार',
  Saturday: 'शनिवार',
}

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

interface CustomCourtRow { id: string; name: string; short_name: string | null; builtin_code: string | null }

interface SearchResult {
  id: string
  full_title: string
  case_number: string
  case_year: number | null
  case_type: string | null
  court_code: string | null
  court_name: string
  court_level: string
  party_plaintiff?: string
  party_defendant?: string
}

function rowBorderColor(hearing: HearingRow): string {
  if (hearing.happened) return '#22c55e'
  const hDate = parseISO(hearing.hearing_date)
  if (isToday(hDate)) return '#f59e0b'
  if (isPast(startOfDay(hDate))) return '#ef4444'
  return '#d1d5db'
}

function formatDD_MM(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return format(parseISO(dateStr), 'dd/MM')
  } catch {
    return ''
  }
}

function toYMD(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function slipShortName(name: string): string {
  const n = name.trim()
  const bracketMatch = n.match(/^(.+?)\s*\((.+)\)\s*$/)
  if (bracketMatch) {
    const parts = bracketMatch[1].trim().split(/\s+/)
    const first = parts[0].length <= 2 && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0]
    const company = bracketMatch[2].trim().split(' ')[0]
    return `${first} (${company})`
  }
  const companyWords = /\b(ltd|llp|corp|bank|insurance|finance|assurance|company|pvt|inc|authority|corporation|general|sompo|lombard|allianz|tokio|ergo)\b/i
  if (companyWords.test(n)) return n.split(' ')[0]
  const parts = n.split(/\s+/)
  return parts[0].length <= 2 && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0]
}

export default function DiaryView({ initialDate }: { initialDate: Date }) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate)
  const [advocateId, setAdvocateId] = useState<string | null>(null)
  const [advocateName, setAdvocateName] = useState('')
  const [slipPrinting, setSlipPrinting] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [hearings, setHearings] = useState<HearingWithCase[]>([])
  const [loading, setLoading] = useState(true)

  // Month hearing dates for navigator
  const [monthHearingDates, setMonthHearingDates] = useState<Set<string>>(new Set())

  // Inline editing
  const [editingStage, setEditingStage] = useState<string | null>(null)
  const [editingNextDate, setEditingNextDate] = useState<string | null>(null)

  // Comment
  const [commentHearingId, setCommentHearingId] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  // Inline custom stage
  const [inlineCustomStage, setInlineCustomStage] = useState('')
  const [inlineCustomStageId, setInlineCustomStageId] = useState<string | null>(null)

  // Custom court short labels
  const [customCourtMap, setCustomCourtMap] = useState<Record<string, string>>({})

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

  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [diaryFilter, setDiaryFilter] = useState('')
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setIsMounted(true) }, [])

  // Load advocate
  useEffect(() => {
    async function loadAdvocate() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('advocates')
        .select('id, full_name')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      if (data) {
        setAdvocateId(data.id)
        setAdvocateName(data.full_name || '')
        // Load custom court short labels
        const { data: cc } = await supabase
          .from('custom_courts')
          .select('id, name, short_name')
          .eq('advocate_id', data.id)
        if (cc) {
          const map: Record<string, string> = {}
          for (const c of cc as CustomCourtRow[]) {
            if (c.builtin_code) {
              // Override for a built-in court
              map[c.builtin_code] = c.short_name || c.name
            } else {
              map[`CUSTOM_${c.id}`] = c.short_name || c.name
            }
          }
          setCustomCourtMap(map)
        }
      }
    }
    loadAdvocate()
  }, [])

  // Fetch month hearing dates for navigator
  const fetchMonthDates = useCallback(async () => {
    if (!advocateId) return
    const supabase = createClient()
    const start = toYMD(startOfMonth(selectedDate))
    const end = toYMD(endOfMonth(selectedDate))
    const { data } = await supabase
      .from('hearings')
      .select('hearing_date, case_id')
      .gte('hearing_date', start)
      .lte('hearing_date', end)
    if (data) {
      setMonthHearingDates(new Set(data.map((h: { hearing_date: string }) => h.hearing_date)))
    }
  }, [advocateId, selectedDate])

  // Fetch hearings for selected date
  const fetchHearings = useCallback(async () => {
    if (!advocateId) return
    setLoading(true)
    const supabase = createClient()
    const dateStr = toYMD(selectedDate)

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

    const caseIds = [...new Set(hearingRows.map((h: HearingRow) => h.case_id))]
    const { data: cases } = await supabase
      .from('cases')
      .select('id, advocate_id, court_level, court_name, court_code, case_number, case_year, case_type, party_plaintiff, party_defendant, full_title, client_name, client_side, our_role, opposite_advocate, case_stage, status, ecourts_cnr, hc_bench')
      .in('id', caseIds)

    if (!cases) { setHearings([]); setLoading(false); return }

    const caseMap = new Map<string, CaseRecord>()
    for (const c of cases) caseMap.set(c.id, c as CaseRecord)

    const combined: HearingWithCase[] = []
    for (const h of hearingRows as HearingRow[]) {
      const c = caseMap.get(h.case_id)
      if (c && c.advocate_id === advocateId) combined.push({ ...h, caseData: c })
    }

    // Sort: MACT-1 → MACT-2 → Udaipur courts → other cities
    combined.sort((a, b) =>
      getCourtSortPriority(a.caseData.court_code || '') - getCourtSortPriority(b.caseData.court_code || '')
    )

    setHearings(combined)
    setLoading(false)
  }, [advocateId, selectedDate])

  useEffect(() => {
    if (advocateId) { fetchHearings(); fetchMonthDates() }
  }, [advocateId, fetchHearings, fetchMonthDates])

  function goDay(offset: number) {
    const newDate = offset > 0 ? addDays(selectedDate, offset) : subDays(selectedDate, Math.abs(offset))
    setSelectedDate(newDate)
    if (isToday(newDate)) router.push('/diary')
    else router.push(`/diary/date/${toYMD(newDate)}`)
  }

  function goToDate(d: Date) {
    setSelectedDate(d)
    if (isToday(d)) router.push('/diary')
    else router.push(`/diary/date/${toYMD(d)}`)
  }

  async function saveStage(hearingId: string, newStage: string) {
    const supabase = createClient()
    await supabase.from('hearings').update({ stage_on_date: newStage }).eq('id', hearingId)
    const hearing = hearings.find(h => h.id === hearingId)
    if (hearing) {
      const updates: Record<string, string> = { case_stage: newStage }
      if (newStage === 'Disposed') updates.status = 'disposed'
      await supabase.from('cases').update(updates).eq('id', hearing.case_id)
    }
    setEditingStage(null)
    fetchHearings()
  }

  async function saveNextDate(hearingId: string, newDate: string) {
    const supabase = createClient()
    const hearing = hearings.find(h => h.id === hearingId)
    await supabase.from('hearings').update({ next_hearing_date: newDate || null }).eq('id', hearingId)
    if (newDate && hearing) {
      const { data: existing } = await supabase
        .from('hearings').select('id').eq('case_id', hearing.case_id).eq('hearing_date', newDate).limit(1)
      if (!existing || existing.length === 0) {
        await supabase.from('hearings').insert({
          case_id: hearing.case_id,
          hearing_date: newDate,
          previous_hearing_date: hearing.hearing_date,
          stage_on_date: hearing.stage_on_date,
          appearing_advocate_name: hearing.appearing_advocate_name || 'self',
          happened: false,
        })
      }
    }
    setEditingNextDate(null)
    fetchHearings()
  }

  async function saveComment(hearingId: string) {
    setCommentSaving(true)
    const supabase = createClient()
    await supabase.from('hearings').update({ outcome_notes: commentText.trim() || null }).eq('id', hearingId)
    setCommentHearingId(null)
    setCommentText('')
    setCommentSaving(false)
    fetchHearings()
  }

  function handleSearch(q: string) {
    setSearchQuery(q)
    setSelectedCase(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.trim().length < 2) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('cases')
        .select('id, full_title, case_number, case_year, case_type, court_code, court_name, court_level, party_plaintiff, party_defendant')
      if (error) console.error('Case search error:', error)
      const qLow = q.toLowerCase()
      const filtered = (data || []).filter((c: SearchResult) =>
        [c.full_title, c.party_plaintiff, c.party_defendant, c.case_number]
          .some(v => v && v.toLowerCase().includes(qLow))
      )
      setSearchResults(filtered.slice(0, 10) as SearchResult[])
      setSearching(false)
    }, 300)
  }

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
    if (newHearingForm.next_hearing_date) {
      const { data: existing } = await supabase
        .from('hearings').select('id').eq('case_id', selectedCase.id).eq('hearing_date', newHearingForm.next_hearing_date).limit(1)
      if (!existing || existing.length === 0) {
        await supabase.from('hearings').insert({
          case_id: selectedCase.id,
          hearing_date: newHearingForm.next_hearing_date,
          previous_hearing_date: newHearingForm.hearing_date,
          stage_on_date: newHearingForm.stage_on_date || null,
          appearing_advocate_name: newHearingForm.appearing_advocate_name || 'self',
          happened: false,
        })
      }
    }
    setAddSaving(false)
    resetAddModal()
    fetchHearings()
    fetchMonthDates()
  }

  function resetAddModal() {
    setShowAddModal(false)
    setSearchQuery('')
    setSearchResults([])
    setSelectedCase(null)
    setNewHearingForm({ hearing_date: toYMD(selectedDate), stage_on_date: '', next_hearing_date: '', purpose: '', appearing_advocate_name: 'self', notes: '' })
  }

  function openAddModal() {
    setNewHearingForm({ hearing_date: toYMD(selectedDate), stage_on_date: '', next_hearing_date: '', purpose: '', appearing_advocate_name: 'self', notes: '' })
    setSearchQuery('')
    setSearchResults([])
    setSelectedCase(null)
    setShowAddModal(true)
  }

  function courtShortLabel(courtCode: string, fallback: string): string {
    if (customCourtMap[courtCode]) return customCourtMap[courtCode]
    const builtin = getCourtShortLabel(courtCode)
    return builtin || fallback
  }

  // Filtered hearings for diary search
  const filteredHearings = diaryFilter.trim()
    ? hearings.filter(h =>
        `${h.caseData.party_plaintiff} ${h.caseData.party_defendant}`
          .toLowerCase()
          .includes(diaryFilter.toLowerCase())
      )
    : hearings

  // Date display parts
  const monthName = format(selectedDate, 'MMMM').toUpperCase()
  const dayNum = format(selectedDate, 'd')
  const dayEnglish = format(selectedDate, 'EEEE')
  const dayHindi = HINDI_DAYS[dayEnglish] || ''
  const yearNum = format(selectedDate, 'yyyy')
  const isTodayDate = isToday(selectedDate)

  // Month calendar days
  const monthDays = eachDayOfInterval({ start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) })

  return (
    <div className="max-w-6xl print:max-w-none">

      {/* ═══ Print-only date heading ═══ */}
      <div className="hidden print:block mb-2 text-center">
        <div style={{ fontSize: '15px', fontWeight: 'bold', fontFamily: 'Georgia,serif' }}>
          Court Diary — {format(selectedDate, 'd MMMM yyyy')} ({format(selectedDate, 'EEEE')})
        </div>
        {advocateName && <div style={{ fontSize: '11px', color: '#555' }}>Adv. {advocateName}</div>}
      </div>

      {/* ═══ Spreadsheet-style Header ═══ */}
      <div className="bg-white border border-gray-300 rounded-xl overflow-hidden mb-4 print:hidden">
        <div className="grid grid-cols-[1fr_2fr_auto_2fr] divide-x divide-gray-300 border-b border-gray-300">

          {/* Month */}
          <div className="relative flex flex-col items-center justify-center py-4 px-3 bg-gray-50">
            <button
              onClick={() => { setShowMonthPicker(v => !v); setShowYearPicker(false) }}
              className="text-2xl font-bold tracking-widest text-gray-800 hover:text-blue-700 transition-colors cursor-pointer"
              style={{ fontFamily: 'Georgia, serif' }}
              title="Click to change month"
            >
              {monthName}
            </button>
            {isTodayDate && (
              <span className="mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 uppercase tracking-wide">
                Today
              </span>
            )}
            {showMonthPicker && (
              <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-2 grid grid-cols-3 gap-1 w-48">
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                  <button
                    key={m}
                    onClick={() => {
                      const capped = Math.min(selectedDate.getDate(), getDaysInMonth(setMonth(selectedDate, i)))
                      const d = new Date(selectedDate)
                      d.setMonth(i)
                      d.setDate(capped)
                      setSelectedDate(d)
                      setShowMonthPicker(false)
                    }}
                    className={`text-xs py-1.5 rounded-lg font-medium transition-colors ${
                      selectedDate.getMonth() === i
                        ? 'text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    style={selectedDate.getMonth() === i ? { background: '#1e3a5f' } : undefined}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date + Day */}
          <div className="flex flex-col items-center justify-center py-4 px-3 relative">
            <div className="text-5xl font-bold text-gray-900 leading-none" style={{ fontFamily: 'Georgia, serif' }}>
              {dayNum}
            </div>
            <div className="mt-1 text-sm text-gray-600">
              {dayEnglish} <span className="text-gray-800 font-medium">({dayHindi})</span>
            </div>
            {/* Nav arrows */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1">
              <button onClick={() => goDay(-1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors" title="Previous day">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1">
              <button onClick={() => goDay(1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors" title="Next day">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Year */}
          <div className="relative flex flex-col items-center justify-center py-4 px-5 bg-gray-50">
            <button
              onClick={() => { setShowYearPicker(v => !v); setShowMonthPicker(false) }}
              className="text-2xl font-bold text-gray-800 hover:text-blue-700 transition-colors cursor-pointer"
              style={{ fontFamily: 'Georgia, serif' }}
              title="Click to change year"
            >
              {yearNum}
            </button>
            {showYearPicker && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-2 grid grid-cols-3 gap-1 w-44">
                {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                  <button
                    key={y}
                    onClick={() => {
                      const d = setYear(selectedDate, y)
                      setSelectedDate(d)
                      setShowYearPicker(false)
                    }}
                    className={`text-xs py-1.5 rounded-lg font-medium transition-colors ${
                      selectedDate.getFullYear() === y
                        ? 'text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    style={selectedDate.getFullYear() === y ? { background: '#1e3a5f' } : undefined}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* To-Do list */}
          <div className="py-2 px-3 min-h-[80px]">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">To-Do list</div>
            {advocateId && <TaskBar advocateId={advocateId} selectedDate={toYMD(selectedDate)} />}
          </div>
        </div>
      </div>

      {/* ═══ Month Calendar Strip ═══ */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 overflow-x-auto print:hidden">
        <div className="flex items-center gap-1 min-w-max">
          {monthDays.map((day) => {
            const ymd = toYMD(day)
            const hasHearings = monthHearingDates.has(ymd)
            const isSelected = ymd === toYMD(selectedDate)
            const isT = isToday(day)
            return (
              <button
                key={ymd}
                onClick={() => goToDate(day)}
                className={`flex flex-col items-center px-2 py-1 rounded-lg text-xs transition-colors min-w-[32px] ${
                  isSelected
                    ? 'text-white font-bold'
                    : isT
                    ? 'bg-amber-50 text-amber-700 font-semibold'
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
                style={isSelected ? { background: '#1e3a5f' } : {}}
                title={hasHearings ? `${format(day, 'd MMM')} — has hearings` : format(day, 'd MMM')}
              >
                <span className="text-[9px] opacity-60">{format(day, 'EEE').toUpperCase()}</span>
                <span>{format(day, 'd')}</span>
                {hasHearings ? (
                  <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
                ) : (
                  <span className="w-1.5 h-1.5 mt-0.5" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══ Action Bar ═══ */}
      <div className="flex items-center justify-between mb-3 print:hidden">
        <div className="text-sm text-gray-500">
          {hearings.length > 0 ? (
            <span>
              <span className="font-semibold text-gray-800">{hearings.length}</span> hearings &nbsp;·&nbsp;
              <span className="text-green-600">{hearings.filter(h => h.happened).length} attended</span> &nbsp;·&nbsp;
              <span className="text-amber-600">{hearings.filter(h => !h.happened).length} pending</span>
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            disabled={slipPrinting}
            onClick={() => {
              if (slipPrinting) return
              setSlipPrinting(true)
              document.body.classList.add('print-slip-mode')
              setTimeout(() => {
                window.print()
                const reset = () => {
                  document.body.classList.remove('print-slip-mode')
                  setSlipPrinting(false)
                }
                window.addEventListener('afterprint', reset, { once: true })
                setTimeout(reset, 60000)
              }, 150)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              slipPrinting
                ? 'border-blue-300 bg-blue-50 text-blue-600 cursor-wait'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Printer className="w-4 h-4" />
            {slipPrinting ? 'Preparing...' : 'Print Slip'}
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: '#1e3a5f' }}
          >
            <Plus className="w-4 h-4" />
            Add Hearing
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* ═══ Diary Filter Bar ═══ */}
      {hearings.length > 0 && !loading && (
        <div className="relative mb-3 print:hidden">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={diaryFilter}
            onChange={(e) => setDiaryFilter(e.target.value)}
            placeholder="Filter by party name…"
            className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
          />
          {diaryFilter && (
            <button
              onClick={() => setDiaryFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* ═══ Main Table ═══ */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : hearings.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center print:hidden">
          <p className="text-gray-400 text-sm mb-4">No hearings scheduled for {format(selectedDate, 'd MMMM yyyy')}</p>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium text-sm"
            style={{ background: '#1e3a5f' }}
          >
            <Plus className="w-4 h-4" />
            Add Hearing
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block print:block bg-white rounded-xl border border-gray-200 overflow-hidden print:rounded-none print:border-black">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: '#e8e8e0' }}>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-center w-16">Pre.</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-left w-24">Court</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-center w-24">Case No.</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-left w-36">Party 1</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-left w-36">Party 2</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-center w-28">Stage</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-center w-20">Next</th>
                  <th className="border border-gray-300 px-2 py-2 w-20 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {filteredHearings.map((h) => {
                  const borderColor = rowBorderColor(h)
                  const courtCode = h.caseData.court_code || ''
                  const courtBg = getCourtColor(courtCode)
                  const stages = h.caseData.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES
                  const ecLink = eCourtsDeepLink(h.caseData.ecourts_cnr)

                  return (
                    <>
                      <tr
                        key={h.id}
                        className="hover:bg-gray-50/50 transition-colors"
                        style={{ borderLeft: `4px solid ${borderColor}` }}
                      >
                        {/* Pre Date */}
                        <td className="border border-gray-200 px-2 py-2 text-center font-mono text-sm text-gray-600">
                          {h.purpose === 'Case Commenced' ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs font-bold text-white bg-emerald-500">NEW</span>
                          ) : (
                            formatDD_MM(h.previous_hearing_date)
                          )}
                        </td>

                        {/* Court Name */}
                        <td className="border border-gray-200 px-2 py-2">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-sm font-medium text-gray-700 whitespace-nowrap"
                            style={{ background: courtBg }}
                          >
                            {courtShortLabel(courtCode, h.caseData.court_name)}
                          </span>
                        </td>

                        {/* Case No. */}
                        <td className="border border-gray-200 px-2 py-2 text-center font-mono text-sm text-gray-800 whitespace-nowrap">
                          <Link href={`/diary/cases/${h.case_id}`} className="font-semibold hover:underline" style={{ color: '#1e3a5f' }}>
                            {formatCaseNumber(h.caseData.case_number, h.caseData.case_year)}
                          </Link>
                        </td>

                        {/* Party 1 */}
                        <td className="border border-gray-200 px-2 py-2 text-sm text-gray-800 max-w-[144px]">
                          <Link href={`/diary/cases/${h.case_id}`} className="block truncate hover:underline" style={{ color: '#1e3a5f' }} title={h.caseData.party_plaintiff}>{h.caseData.party_plaintiff}</Link>
                        </td>

                        {/* Party 2 */}
                        <td className="border border-gray-200 px-2 py-2 text-sm text-gray-800 max-w-[144px]">
                          <Link href={`/diary/cases/${h.case_id}`} className="block truncate text-gray-700 hover:text-[#1e3a5f] hover:underline" title={h.caseData.party_defendant}>{h.caseData.party_defendant}</Link>
                        </td>

                        {/* Stage */}
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          {editingStage === h.id ? (
                            inlineCustomStageId === h.id ? (
                              <input
                                autoFocus
                                type="text"
                                value={inlineCustomStage}
                                onChange={(e) => setInlineCustomStage(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && inlineCustomStage.trim()) {
                                    saveStage(h.id, inlineCustomStage.trim())
                                    setInlineCustomStageId(null)
                                    setInlineCustomStage('')
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingStage(null)
                                    setInlineCustomStageId(null)
                                    setInlineCustomStage('')
                                  }
                                }}
                                onBlur={() => { setEditingStage(null); setInlineCustomStageId(null); setInlineCustomStage('') }}
                                className="px-1 py-0.5 border border-gray-300 rounded text-sm bg-white text-gray-900 w-full"
                                placeholder="Type stage…"
                              />
                            ) : (
                              <select
                                autoFocus
                                defaultValue={h.stage_on_date || ''}
                                onChange={(e) => {
                                  if (e.target.value === 'Custom...') {
                                    setInlineCustomStageId(h.id)
                                    setInlineCustomStage('')
                                  } else {
                                    saveStage(h.id, e.target.value)
                                  }
                                }}
                                onBlur={() => setEditingStage(null)}
                                className="px-1 py-0.5 border border-gray-300 rounded text-sm bg-white text-gray-900 w-full"
                              >
                                <option value=""></option>
                                {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            )
                          ) : (
                            <button
                              onClick={() => setEditingStage(h.id)}
                              className="text-sm px-1 py-0.5 rounded hover:bg-gray-100 transition-colors text-gray-700 w-full text-center"
                              title="Click to change stage"
                            >
                              {h.stage_on_date || <span className="text-gray-300">—</span>}
                            </button>
                          )}
                        </td>

                        {/* Next Date */}
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          {editingNextDate === h.id ? (
                            <input
                              type="date"
                              autoFocus
                              defaultValue={h.next_hearing_date || ''}
                              onChange={(e) => saveNextDate(h.id, e.target.value)}
                              onBlur={() => setEditingNextDate(null)}
                              className="px-1 py-0.5 border border-gray-300 rounded text-sm bg-white text-gray-900 w-full"
                            />
                          ) : (
                            <button
                              onClick={() => setEditingNextDate(h.id)}
                              className="text-sm font-mono px-1 py-0.5 rounded hover:bg-gray-100 transition-colors text-gray-700 w-full text-center"
                              title="Click to set next date"
                            >
                              {formatDD_MM(h.next_hearing_date) || <span className="text-gray-300">—</span>}
                            </button>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="border border-gray-200 px-1 py-2 print:hidden">
                          <div className="flex items-center gap-0.5 justify-center">
                            <button
                              onClick={() => { setCommentHearingId(h.id); setCommentText(h.outcome_notes || '') }}
                              className={`p-1.5 rounded transition-colors ${h.outcome_notes ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                              title={h.outcome_notes ? h.outcome_notes : 'Add comment'}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            {ecLink && (
                              <a href={ecLink} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors" title="eCourts">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Comment row */}
                      {commentHearingId === h.id && (
                        <tr key={`cmt-${h.id}`}>
                          <td colSpan={8} className="border border-gray-200 px-3 py-2 print:hidden bg-blue-50/40">
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Add a comment or note for this hearing…"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveComment(h.id); if (e.key === 'Escape') { setCommentHearingId(null); setCommentText('') } }}
                                className="flex-1 px-3 py-1.5 border border-blue-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                              <button onClick={() => saveComment(h.id)} disabled={commentSaving} className="px-3 py-1.5 rounded text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                                {commentSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button onClick={() => { setCommentHearingId(null); setCommentText('') }} className="px-3 py-1.5 rounded text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50">
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3 print:hidden">
            {filteredHearings.map((h) => {
              const borderColor = rowBorderColor(h)
              const courtCode = h.caseData.court_code || ''
              const courtBg = getCourtColor(courtCode)
              const stages = h.caseData.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES
              const ecLink = eCourtsDeepLink(h.caseData.ecourts_cnr)

              return (
                <div key={h.id} className="bg-white rounded-xl border border-gray-200 p-4" style={{ borderLeft: `4px solid ${borderColor}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block px-2.5 py-0.5 rounded text-sm font-medium text-gray-700" style={{ background: courtBg }}>
                      {customCourtMap[courtCode] || getCourtLabel(courtCode || h.caseData.court_name)}
                    </span>
                    <span className="text-sm font-mono text-gray-500">
                      {formatCaseNumber(h.caseData.case_number, h.caseData.case_year)}
                    </span>
                  </div>
                  <Link href={`/diary/cases/${h.case_id}`} className="block text-base font-semibold mb-2 hover:underline" style={{ color: '#1e3a5f' }}>
                    {h.caseData.party_plaintiff} <span className="text-gray-400 font-normal">vs</span> {h.caseData.party_defendant}
                  </Link>
                  <div className="text-sm text-gray-500 mb-2">
                    Pre: {h.purpose === 'Case Commenced' ? <span className="text-emerald-600 font-bold">NEW</span> : (formatDD_MM(h.previous_hearing_date) || '—')}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Stage</label>
                      <select
                        value={inlineCustomStageId === h.id ? 'Custom...' : (h.stage_on_date || '')}
                        onChange={(e) => {
                          if (e.target.value === 'Custom...') {
                            setInlineCustomStageId(h.id)
                            setInlineCustomStage('')
                          } else {
                            setInlineCustomStageId(null)
                            saveStage(h.id, e.target.value)
                          }
                        }}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 appearance-none"
                        style={{ minHeight: '44px' }}
                      >
                        <option value="">— Select —</option>
                        {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {inlineCustomStageId === h.id && (
                        <div className="mt-1 flex gap-1">
                          <input
                            autoFocus
                            type="text"
                            value={inlineCustomStage}
                            onChange={(e) => setInlineCustomStage(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && inlineCustomStage.trim()) {
                                saveStage(h.id, inlineCustomStage.trim())
                                setInlineCustomStageId(null)
                                setInlineCustomStage('')
                              }
                              if (e.key === 'Escape') { setInlineCustomStageId(null); setInlineCustomStage('') }
                            }}
                            placeholder="Type stage…"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
                          />
                          <button
                            onClick={() => { if (inlineCustomStage.trim()) { saveStage(h.id, inlineCustomStage.trim()); setInlineCustomStageId(null); setInlineCustomStage('') } }}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                          >OK</button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Next Date</label>
                      <input
                        type="date"
                        value={h.next_hearing_date || ''}
                        onChange={(e) => saveNextDate(h.id, e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
                        style={{ minHeight: '44px' }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setCommentHearingId(h.id); setCommentText(h.outcome_notes || '') }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium ${h.outcome_notes ? 'text-blue-700 bg-blue-100' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      {h.outcome_notes ? 'View note' : 'Add note'}
                    </button>
                    {ecLink && (
                      <a href={ecLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100">
                        <ExternalLink className="w-4 h-4" /> eCourts
                      </a>
                    )}
                  </div>
                  {commentHearingId === h.id && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <input
                        autoFocus
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveComment(h.id); if (e.key === 'Escape') { setCommentHearingId(null); setCommentText('') } }}
                        placeholder="Add a comment…"
                        className="w-full px-3 py-2 border border-blue-300 rounded text-sm bg-white text-gray-900 mb-2"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveComment(h.id)} disabled={commentSaving} className="flex-1 px-3 py-1.5 rounded text-xs font-medium text-white bg-blue-600 disabled:opacity-50">
                          {commentSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => { setCommentHearingId(null); setCommentText('') }} className="px-3 py-1.5 rounded text-xs text-gray-600 bg-white border border-gray-200">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ═══ Add Hearing Modal ═══ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={resetAddModal} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>Add Hearing</h2>
              <button onClick={resetAddModal} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {!selectedCase ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search for a case</label>
                  {!advocateId ? (
                    <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading profile...</p>
                  ) : (<>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="text" autoFocus value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder="Type party name or case number..." className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                    </div>
                    {searching && <div className="mt-2 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Searching...</div>}
                    {searchResults.length > 0 && (
                      <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                        {searchResults.map((c) => (
                          <button key={c.id} onClick={() => setSelectedCase(c)} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
                            <p className="text-sm font-medium text-gray-800">{c.full_title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{c.case_type ? `${c.case_type} ` : ''}{formatCaseNumber(c.case_number, c.case_year)} — {getCourtLabel(c.court_code || c.court_name)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchQuery.length >= 2 && !searching && searchResults.length === 0 && <p className="mt-2 text-sm text-gray-400">No cases found.</p>}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <Link href="/diary/cases/new" className="text-sm font-medium hover:underline" style={{ color: '#1e3a5f' }}>Case not found? Create new case →</Link>
                    </div>
                  </>)}
                </div>
              ) : (
                <div>
                  <div className="p-3 rounded-lg mb-4" style={{ background: '#f0f4f8' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{selectedCase.full_title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{selectedCase.case_type ? `${selectedCase.case_type} ` : ''}{formatCaseNumber(selectedCase.case_number, selectedCase.case_year)} — {getCourtLabel(selectedCase.court_code || selectedCase.court_name)}</p>
                      </div>
                      <button onClick={() => setSelectedCase(null)} className="text-xs text-gray-500 hover:text-gray-700 underline">Change</button>
                    </div>
                  </div>
                  <form onSubmit={addHearing} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Hearing Date *</label>
                        <input type="date" required value={newHearingForm.hearing_date} onChange={(e) => setNewHearingForm({ ...newHearingForm, hearing_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
                        <select value={newHearingForm.stage_on_date} onChange={(e) => setNewHearingForm({ ...newHearingForm, stage_on_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                          <option value="">-- Select --</option>
                          {(selectedCase.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Next Hearing Date</label>
                        <input type="date" value={newHearingForm.next_hearing_date} onChange={(e) => setNewHearingForm({ ...newHearingForm, next_hearing_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Purpose</label>
                        <input type="text" value={newHearingForm.purpose} onChange={(e) => setNewHearingForm({ ...newHearingForm, purpose: e.target.value })} placeholder="e.g., Arguments" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Appearing Advocate</label>
                      <input type="text" value={newHearingForm.appearing_advocate_name} onChange={(e) => setNewHearingForm({ ...newHearingForm, appearing_advocate_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                      <textarea value={newHearingForm.notes} onChange={(e) => setNewHearingForm({ ...newHearingForm, notes: e.target.value })} rows={2} placeholder="Optional notes..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none" />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button type="submit" disabled={addSaving} className="flex-1 px-5 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: '#1e3a5f' }}>
                        {addSaving ? 'Saving...' : 'Save Hearing'}
                      </button>
                      <button type="button" onClick={resetAddModal} className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Global print styles injected once ═══ */}
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          aside, header { display: none !important; }
          body:not(.print-slip-mode) #diary-slip { display: none !important; }
          body:not(.print-slip-mode) table th { font-size: 12px !important; padding: 2px 4px !important; }
          body:not(.print-slip-mode) table td { font-size: 12px !important; padding: 2px 4px !important; }
          body.print-slip-mode > *:not(#diary-slip) { display: none !important; }
          body.print-slip-mode #diary-slip {
            display: block !important;
            position: absolute !important;
            top: 10mm !important;
            right: 8mm !important;
            left: auto !important;
            width: 92mm !important;
            max-height: 210mm !important;
            height: auto !important;
            overflow: hidden !important;
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 12.5px;
            line-height: 1.35;
            border: 0.5px solid #999;
            padding: 4mm 5mm 3mm;
            box-sizing: border-box;
            background: white;
          }
        }
      `}</style>

      {/* ═══ Slip rendered as direct body child via portal ═══ */}
      {isMounted && createPortal(
        <div id="diary-slip" style={{ display: 'none', pointerEvents: 'none', position: 'fixed', top: 0, left: '-9999px', width: 0, height: 0, overflow: 'hidden' }}>
        {(() => {
          const dayName = format(selectedDate, 'EEEE')
          const sorted = [...hearings].sort((a, b) =>
            getCourtSortPriority(a.caseData.court_code || '') - getCourtSortPriority(b.caseData.court_code || '')
          )
          return (
            <>
              <div style={{ textAlign: 'center', borderBottom: '1.5px solid #222', paddingBottom: '1.5mm', marginBottom: '1.5mm' }}>
                <div style={{ fontSize: '8px', letterSpacing: '1px', textTransform: 'uppercase', color: '#777' }}>Court Diary</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', margin: '0.5mm 0 0', lineHeight: 1.2 }}>{format(selectedDate, 'd MMMM yyyy')}</div>
                <div style={{ fontSize: '10px', color: '#444' }}>{dayName} · {HINDI_DAYS[dayName] || ''}</div>
                {advocateName && <div style={{ fontSize: '9px', color: '#666', fontStyle: 'italic' }}>Adv. {advocateName}</div>}
              </div>
              {sorted.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3mm 0', fontSize: '11px', color: '#999' }}>No hearings today</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {sorted.map((h, i) => (
                    <li key={h.id} style={{ display: 'flex', alignItems: 'baseline', gap: '1.5mm', padding: '0.4mm 0' }}>
                      <span style={{ minWidth: '5mm', fontWeight: 'bold', color: '#666', flexShrink: 0, fontSize: '11px' }}>{i + 1}.</span>
                      <span style={{ fontWeight: 'bold', flexShrink: 0 }}>{courtShortLabel(h.caseData.court_code || '', h.caseData.court_name)}</span>
                      <span style={{ color: '#bbb', flexShrink: 0 }}>–</span>
                      <span style={{ color: '#222' }}>{slipShortName(h.caseData.party_plaintiff)} / {slipShortName(h.caseData.party_defendant)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: '2mm', paddingTop: '1.5mm', borderTop: '0.5px solid #bbb', textAlign: 'center', fontSize: '9px', color: '#888' }}>
                {sorted.length} matter{sorted.length !== 1 ? 's' : ''} · {format(selectedDate, 'd MMMM yyyy')}
              </div>
            </>
          )
        })()}
        </div>,
        document.body
      )}
    </div>
  )
}
