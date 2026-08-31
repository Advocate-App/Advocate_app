'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/fetchAll'
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
  addMonths,
  subMonths,
  getDay,
} from 'date-fns'
import {
  getCourtShortLabel,
  getCourtColor,
  getCourtSortPriority,
  eCourtsDeepLink,
  formatCaseNumber,
  formatCaseNumberShort,
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
  city: string | null
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
  set_by_name: string | null
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
  city: string | null
  party_plaintiff?: string
  party_defendant?: string
}

const FINAL_STAGES = new Set(['Ordered/Disposed', 'Judgment', 'Judgment Reserved'])
function isFinalStage(stage: string | null): boolean {
  return !!stage && FINAL_STAGES.has(stage)
}

// Short form for the Diary's Stage column only — the case detail page and
// the stage picker dropdown still show/use the full name. Anything not in
// this map (already-short values like "805", "EMI", "Other"…) is shown as-is.
const STAGE_ABBREV: Record<string, string> = {
  'Summons': 'Sum',
  'Appearance': 'App',
  'Written Statement': 'WS',
  'Issues': 'Iss',
  'Plaintiff Evidence': 'PE',
  'Defendant Evidence': 'DE',
  'Arguments': 'Arg',
  'Judgment Reserved': 'JR',
  'Judgment': 'Judg',
  'Execution': 'Exec',
  'Lok Adalat': 'LA',
  'Ordered/Disposed': 'Ord/Disp',
  'Adjourned': 'Adj',
  'Admission': 'Adm',
  'Regular Hearing': 'RH',
  'Final Hearing': 'FH',
  'Service Complete': 'SC',
  'Counter Affidavit': 'CA',
  'Rejoinder': 'Rej',
}
function stageAbbrev(stage: string): string {
  return STAGE_ABBREV[stage] || stage
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

// A real, controllable calendar to replace the browser's native <input
// type="date"> popup wherever picking a date benefits from seeing hearing
// counts — the native picker is OS-rendered and can't be decorated with
// anything at all. Used both for the header's "jump to any date" and for
// setting a hearing's next date inline.
function CalendarPickerModal({
  initialDate,
  selectedDate,
  hearingCounts,
  onMonthChange,
  onSelect,
  onClear,
  onClose,
  todayLabel = 'Jump to Today',
  courtLabel,
  caseTitle,
}: {
  initialDate: Date
  selectedDate: Date | null
  hearingCounts: Map<string, number>
  onMonthChange: (month: Date) => void
  onSelect: (d: Date) => void
  onClear?: () => void
  onClose: () => void
  todayLabel?: string
  courtLabel?: string
  caseTitle?: string
}) {
  const [viewDate, setViewDate] = useState<Date>(initialDate)
  const viewKey = `${viewDate.getFullYear()}-${viewDate.getMonth()}`

  useEffect(() => {
    onMonthChange(viewDate)
    // Deliberately keyed on the month/year only, not the callback or the
    // Date object's identity — re-fetching on every render would defeat
    // the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey])

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const leadingBlanks = getDay(monthStart) // 0 = Sunday

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 print:hidden"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Which case this date is for — so it's obvious at a glance, not
            just inferred from whatever row you clicked before this opened */}
        {(courtLabel || caseTitle) && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
            {courtLabel && (
              <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded shrink-0">{courtLabel}</span>
            )}
            {caseTitle && <span className="text-sm font-medium text-gray-800 truncate">{caseTitle}</span>}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mb-3">
          <button
            onClick={() => setViewDate((d) => subMonths(d, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <select
              value={viewDate.getMonth()}
              onChange={(e) => setViewDate((d) => setMonth(d, Number(e.target.value)))}
              className="text-sm font-semibold border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800"
            >
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
            <select
              value={viewDate.getFullYear()}
              onChange={(e) => setViewDate((d) => setYear(d, Number(e.target.value)))}
              className="text-sm font-semibold border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800"
            >
              {Array.from({ length: 36 }, (_, i) => new Date().getFullYear() - 30 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              title="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-gray-400 uppercase">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`blank-${i}`} />)}
          {days.map((day) => {
            const ymd = toYMD(day)
            const count = hearingCounts.get(ymd) || 0
            const isSelected = !!selectedDate && ymd === toYMD(selectedDate)
            const isT = isToday(day)
            const badgeClass =
              count === 0 ? '' :
              count <= 2 ? 'bg-emerald-100 text-emerald-700' :
              count <= 5 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            return (
              <button
                key={day.toISOString()}
                onClick={() => onSelect(day)}
                title={count > 0 ? `${format(day, 'd MMM')} — ${count} hearing${count !== 1 ? 's' : ''}` : format(day, 'd MMM')}
                className={`aspect-square rounded-lg text-sm font-medium transition-colors flex flex-col items-center justify-center gap-0.5 ${
                  isSelected
                    ? 'text-white'
                    : isT
                    ? 'bg-amber-50 text-amber-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                style={isSelected ? { background: '#1e3a5f' } : {}}
              >
                <span>{format(day, 'd')}</span>
                {count > 0 && (
                  <span
                    className={`min-w-[15px] px-1 rounded-full text-[9px] font-bold leading-[13px] ${
                      isSelected ? 'bg-white text-[#1e3a5f]' : badgeClass
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex gap-2 mt-3">
          {onClear && (
            <button
              onClick={onClear}
              className="flex-1 py-2 rounded-lg text-sm font-medium text-center border border-gray-200 hover:bg-gray-50 text-red-600 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => onSelect(new Date())}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-center border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors"
          >
            {todayLabel}
          </button>
        </div>
      </div>
    </div>
  )
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
  // Juniors don't own any cases themselves — they help out on Avi's and
  // Ratnesh's cases. So a junior's diary/calendar needs to show hearings
  // for *both* senior advocates, not just cases matching their own id
  // (which never matches anything and used to leave the diary empty).
  const [visibleAdvocateIds, setVisibleAdvocateIds] = useState<string[] | null>(null)
  const [slipPrinting, setSlipPrinting] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [hearings, setHearings] = useState<HearingWithCase[]>([])
  const [loading, setLoading] = useState(true)
  // Pairs of linked cases (from the "Linked Cases" feature) that both have
  // a hearing on the selected date — used to show them clubbed together as
  // one box instead of separate rows when they share a common party.
  const [caseLinkPairs, setCaseLinkPairs] = useState<{ case_id: string; linked_case_id: string }[]>([])

  // Month hearing dates for navigator — date (YYYY-MM-DD) -> hearing count,
  // so the calendar strip can show workload per day, not just "has any"
  const [monthHearingCounts, setMonthHearingCounts] = useState<Map<string, number>>(new Map())

  // Case history panel
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null)
  const [caseHistory, setCaseHistory] = useState<{ id: string; hearing_date: string; stage_on_date: string | null; outcome_notes: string | null }[]>([])

  // Inline editing
  const [editingStage, setEditingStage] = useState<string | null>(null)
  // Picking "Ordered/Disposed" asks for the actual order/disposal date
  // (which order was pronounced on, not necessarily today) before saving —
  // keyed by hearing id, same as editingStage. For a linked group this is
  // the group's shared representative id (group[0].id), same convention
  // as editingStage there.
  const [orderDatePromptId, setOrderDatePromptId] = useState<string | null>(null)
  const [orderDatePromptIds, setOrderDatePromptIds] = useState<string[] | null>(null) // group hearing ids, when set via the merged stage control
  const [orderDateValue, setOrderDateValue] = useState('')
  const [editingNextDate, setEditingNextDate] = useState<string | null>(null)
  // When set, the next-date picker applies the chosen date to every id in
  // this list instead of just editingNextDate — used for a linked-cases
  // group whose members already share the same next date, so setting a
  // new one for the group updates all of them in one go.
  const [editingNextDateGroupIds, setEditingNextDateGroupIds] = useState<string[] | null>(null)

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
  const [selectedCaseLastDate, setSelectedCaseLastDate] = useState<string | null | undefined>(undefined) // undefined = loading
  const [newHearingForm, setNewHearingForm] = useState({
    hearing_date: '',
    stage_on_date: '',
    next_hearing_date: '',
    purpose: '',
    appearing_advocate_name: 'self',
    notes: '',
  })
  const [addSaving, setAddSaving] = useState(false)

  // Full "jump to any date" calendar — opened by tapping the month or year.
  const [showCalendarPicker, setShowCalendarPicker] = useState(false)
  const [diaryFilter, setDiaryFilter] = useState('')
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setIsMounted(true) }, [])

  // Load advocate
  useEffect(() => {
    async function loadAdvocate() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data } = await supabase
          .from('advocates')
          .select('id, full_name, role')
          .eq('user_id', user.id)
          .limit(1)
          .single()
        if (data) {
          setAdvocateId(data.id)
          setAdvocateName(data.full_name || '')
          // Juniors see their own cases plus both seniors' — the seniors
          // lookup used to silently come back empty (RLS on `advocates`
          // only ever let you read your own row), which meant a junior's
          // ownerIds ended up as just [] and nothing showed at all. Fixed
          // via migration 014 (advocates table now readable by any
          // authenticated advocate, still only writable to your own row).
          let ownerIds = [data.id]
          if (data.role === 'junior') {
            const { data: seniors } = await supabase
              .from('advocates')
              .select('id')
              .eq('role', 'advocate')
            ownerIds = [data.id, ...(seniors || []).map((s: { id: string }) => s.id)]
          }
          setVisibleAdvocateIds(ownerIds)
          const { data: cc } = await supabase
            .from('custom_courts')
            .select('id, name, short_name, builtin_code')
            .in('advocate_id', ownerIds)
          if (cc) {
            const map: Record<string, string> = {}
            for (const c of cc as CustomCourtRow[]) {
              if (c.builtin_code) {
                map[c.builtin_code] = c.short_name || c.name
              } else {
                map[`CUSTOM_${c.id}`] = c.short_name || c.name
              }
            }
            setCustomCourtMap(map)
          }
        }
      } catch (err) {
        console.error('loadAdvocate error:', err)
        setLoading(false)
      }
    }
    loadAdvocate()
  }, [])

  const fetchedMonthsRef = useRef<Set<string>>(new Set())

  // Fetch hearing counts for a given month — this advocate's hearings (or,
  // for a junior, both senior advocates' combined). One query, filtered
  // server-side by joining to `cases` and matching advocate_id there —
  // this used to first fetch every one of this advocate's case ids
  // (1000+ rows) and then re-query hearings in batches of 200 case ids
  // at a time, which is what made the "next date" calendar feel so slow
  // to open. Takes the month to fetch explicitly so both the month strip
  // (selectedDate's month) and the "jump to any date" calendar (whatever
  // month it's browsing, which can be a different one) can each pull
  // counts for their own month. Skips the round-trip entirely if that
  // month's already been fetched — pass force to refetch anyway (e.g.
  // right after adding a hearing, when the cached count is now stale).
  const fetchMonthDates = useCallback(async (monthDate: Date, force = false) => {
    if (!visibleAdvocateIds || visibleAdvocateIds.length === 0) return
    const monthKey = format(monthDate, 'yyyy-MM')
    if (!force && fetchedMonthsRef.current.has(monthKey)) return
    try {
      const supabase = createClient()
      const start = toYMD(startOfMonth(monthDate))
      const end = toYMD(endOfMonth(monthDate))
      const { data, error } = await supabase
        .from('hearings')
        .select('hearing_date, cases!inner(advocate_id)')
        .in('cases.advocate_id', visibleAdvocateIds)
        .gte('hearing_date', start)
        .lte('hearing_date', end)
      if (error) throw error
      const counts = new Map<string, number>()
      for (const h of (data || []) as { hearing_date: string }[]) {
        counts.set(h.hearing_date, (counts.get(h.hearing_date) || 0) + 1)
      }
      fetchedMonthsRef.current.add(monthKey)
      // Merge into the existing map (keyed by date) rather than replace it
      // wholesale — the month strip and the calendar picker can have two
      // different months' worth of counts loaded at the same time.
      setMonthHearingCounts((prev) => {
        const next = new Map(prev)
        for (const key of next.keys()) {
          if (key >= start && key <= end) next.delete(key)
        }
        counts.forEach((v, k) => next.set(k, v))
        return next
      })
    } catch (err) {
      console.error('fetchMonthDates error:', err)
    }
  }, [visibleAdvocateIds])

  // Fetch hearings for selected date
  const fetchHearings = useCallback(async () => {
    if (!visibleAdvocateIds || visibleAdvocateIds.length === 0) return
    setLoading(true)
    try {
      const supabase = createClient()
      const dateStr = toYMD(selectedDate)

      // Tiebreak on id after created_at — a lot of hearing rows from the
      // bulk case import share the exact same created_at timestamp, and
      // without a fully unique secondary key Postgres doesn't promise the
      // same order on every fetch, which looked like cases randomly
      // swapping places. id is unique, so this order is now permanent —
      // and any newly-added hearing for this date always has a later id,
      // so it naturally lands at the bottom of its court's group.
      const { data: hearingRows, error: hErr } = await supabase
        .from('hearings')
        .select('*')
        .eq('hearing_date', dateStr)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })

      if (hErr || !hearingRows || hearingRows.length === 0) {
        setHearings([])
        setLoading(false)
        return
      }

      const caseIds = [...new Set(hearingRows.map((h: HearingRow) => h.case_id))]
      const { data: cases } = await supabase
        .from('cases')
        .select('id, advocate_id, court_level, court_name, court_code, case_number, case_year, case_type, party_plaintiff, party_defendant, full_title, client_name, client_side, our_role, opposite_advocate, case_stage, status, ecourts_cnr, hc_bench, city')
        .in('id', caseIds)

      if (!cases) { setHearings([]); setLoading(false); return }

      const caseMap = new Map<string, CaseRecord>()
      for (const c of cases) caseMap.set(c.id, c as CaseRecord)

      const combined: HearingWithCase[] = []
      for (const h of hearingRows as HearingRow[]) {
        const c = caseMap.get(h.case_id)
        if (c && visibleAdvocateIds && visibleAdvocateIds.includes(c.advocate_id)) combined.push({ ...h, caseData: c })
      }

      combined.sort((a, b) =>
        getCourtSortPriority(a.caseData.court_code || '') - getCourtSortPriority(b.caseData.court_code || '')
      )

      setHearings(combined)

      // Linked-case pairs where both sides have a hearing today — that's
      // what lets two rows below get clubbed into one box.
      const [{ data: links1 }, { data: links2 }] = await Promise.all([
        supabase.from('case_links').select('case_id, linked_case_id').in('case_id', caseIds),
        supabase.from('case_links').select('case_id, linked_case_id').in('linked_case_id', caseIds),
      ])
      const caseIdSet = new Set(caseIds)
      const relevantPairs = [...(links1 || []), ...(links2 || [])].filter(
        (p) => caseIdSet.has(p.case_id) && caseIdSet.has(p.linked_case_id)
      )
      setCaseLinkPairs(relevantPairs)
    } catch (err) {
      console.error('fetchHearings error:', err)
      setHearings([])
    } finally {
      setLoading(false)
    }
  }, [visibleAdvocateIds, selectedDate])

  useEffect(() => {
    if (visibleAdvocateIds && visibleAdvocateIds.length > 0) { fetchHearings(); fetchMonthDates(selectedDate) }
  }, [visibleAdvocateIds, selectedDate, fetchHearings, fetchMonthDates])

  // push (not replace) — each date you visit becomes a real back-button
  // stop. replace() was overwriting the same history entry every time,
  // so pressing back from anywhere in the diary skipped past every date
  // you'd browsed and landed wherever you were before you opened it —
  // that's the "back sometimes takes me to the main page" issue.
  function goDay(offset: number) {
    const newDate = offset > 0 ? addDays(selectedDate, offset) : subDays(selectedDate, Math.abs(offset))
    setSelectedDate(newDate)
    router.push(`/diary/date/${toYMD(newDate)}`, { scroll: false })
  }

  function goToDate(d: Date) {
    setSelectedDate(d)
    router.push(`/diary/date/${toYMD(d)}`, { scroll: false })
  }

  async function saveStage(hearingId: string, newStage: string, disposalDate?: string) {
    const supabase = createClient()
    // Recording a stage is just as clear a sign the hearing was actually
    // attended as giving a next date — mark it happened here too, so
    // "attended" in the day's summary reflects real work done, not a
    // separate checkbox nobody remembers to tick.
    await supabase.from('hearings').update({
      stage_on_date: newStage,
      set_by_advocate_id: advocateId,
      set_by_name: advocateName || null,
      happened: true,
    }).eq('id', hearingId)
    const hearing = hearings.find(h => h.id === hearingId)
    if (hearing) {
      const updates: Record<string, string> = { case_stage: newStage }
      if (newStage === 'Ordered/Disposed') {
        updates.status = 'disposed'
        if (disposalDate) updates.disposal_date = disposalDate
      } else if (hearing.caseData.status === 'disposed') {
        // Moving the stage away from Ordered/Disposed (correcting a
        // mistake, or the case genuinely reopened) un-disposes it —
        // otherwise it'd stay marked non-active forever.
        updates.status = 'active'
      }
      await supabase.from('cases').update(updates).eq('id', hearing.case_id)
    }
    setEditingStage(null)
    setOrderDatePromptId(null)
    setExpandedCaseId(null) // any action closes the open history panel
    // Optimistic update — no refetch, no scroll jump
    setHearings(prev => prev.map(h => h.id === hearingId ? { ...h, stage_on_date: newStage, set_by_name: advocateName || null, happened: true } : h))
  }

  async function saveNextDate(hearingId: string, newDate: string) {
    const supabase = createClient()
    const hearing = hearings.find(h => h.id === hearingId)
    // Giving a next date means this hearing was actually attended today —
    // mark it "happened" at the same time, instead of leaving that as a
    // separate manual checkbox nobody remembers to tick. That's what
    // "attended" in the day's summary is meant to count.
    const markHappened = !!newDate
    await supabase.from('hearings').update({
      next_hearing_date: newDate || null,
      set_by_advocate_id: advocateId,
      set_by_name: advocateName || null,
      ...(markHappened ? { happened: true } : {}),
    }).eq('id', hearingId)
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
          set_by_advocate_id: advocateId,
          set_by_name: advocateName || null,
        })
      }
    }
    setEditingNextDate(null)
    setExpandedCaseId(null) // any action closes the open history panel
    // Optimistic update — no refetch, no scroll jump
    setHearings(prev => prev.map(h => h.id === hearingId ? { ...h, next_hearing_date: newDate || null, set_by_name: advocateName || null, happened: markHappened ? true : h.happened } : h))
  }

  async function saveComment(hearingId: string) {
    setCommentSaving(true)
    const supabase = createClient()
    const text = commentText.trim() || null
    await supabase.from('hearings').update({ outcome_notes: text }).eq('id', hearingId)
    setCommentHearingId(null)
    setCommentText('')
    setCommentSaving(false)
    setExpandedCaseId(null) // any action closes the open history panel
    // Optimistic update — no refetch, no scroll jump
    setHearings(prev => prev.map(h => h.id === hearingId ? { ...h, outcome_notes: text } : h))
  }

  function handleSearch(q: string) {
    setSearchQuery(q)
    setSelectedCase(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.trim().length < 2) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const supabase = createClient()
      const data = await fetchAllRows<SearchResult>((from, to) =>
        supabase
          .from('cases')
          .select('id, full_title, case_number, case_year, case_type, court_code, court_name, court_level, city, party_plaintiff, party_defendant')
          .range(from, to)
      ).catch((err) => { console.error('Case search error:', err); return [] as SearchResult[] })
      const qLow = q.toLowerCase()
      const filtered = data.filter((c: SearchResult) =>
        [c.full_title, c.party_plaintiff, c.party_defendant, c.case_number]
          .some(v => v && v.toLowerCase().includes(qLow))
      )
      setSearchResults(filtered.slice(0, 10) as SearchResult[])
      setSearching(false)
    }, 300)
  }

  // Picking a case shows its last hearing date too, alongside court/case
  // number — so it's clear at a glance this is the right, active case
  // before a new hearing gets added to it.
  async function selectCase(c: SearchResult) {
    setSelectedCase(c)
    setSelectedCaseLastDate(undefined)
    const supabase = createClient()
    const { data } = await supabase
      .from('hearings')
      .select('hearing_date')
      .eq('case_id', c.id)
      .order('hearing_date', { ascending: false })
      .limit(1)
    setSelectedCaseLastDate(data && data.length > 0 ? data[0].hearing_date : null)
  }

  async function addHearing(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCase || !newHearingForm.hearing_date || addSaving) return
    setAddSaving(true)
    const supabase = createClient()

    // Guard against duplicates — a double-tap/double-Enter, or the date
    // already existing on this case (e.g. auto-created earlier from a
    // "next date"), used to silently create two rows for the same
    // case+date, which then showed the case twice in the diary.
    const { data: alreadyThere } = await supabase
      .from('hearings')
      .select('id')
      .eq('case_id', selectedCase.id)
      .eq('hearing_date', newHearingForm.hearing_date)
      .limit(1)

    if (!alreadyThere || alreadyThere.length === 0) {
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
    }
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
    fetchMonthDates(selectedDate, true) // force — this month's count just changed
  }

  function resetAddModal() {
    setShowAddModal(false)
    setSearchQuery('')
    setSearchResults([])
    setSelectedCase(null)
    setSelectedCaseLastDate(undefined)
    setNewHearingForm({ hearing_date: toYMD(selectedDate), stage_on_date: '', next_hearing_date: '', purpose: '', appearing_advocate_name: 'self', notes: '' })
  }

  function openAddModal() {
    setNewHearingForm({ hearing_date: toYMD(selectedDate), stage_on_date: '', next_hearing_date: '', purpose: '', appearing_advocate_name: 'self', notes: '' })
    setSearchQuery('')
    setSearchResults([])
    setSelectedCase(null)
    setSelectedCaseLastDate(undefined)
    setShowAddModal(true)
  }

  async function toggleHistory(caseId: string) {
    if (expandedCaseId === caseId) {
      setExpandedCaseId(null)
      return
    }
    const supabase = createClient()
    const { data } = await supabase
      .from('hearings')
      .select('id, hearing_date, stage_on_date, outcome_notes')
      .eq('case_id', caseId)
      .order('hearing_date', { ascending: false })
    setCaseHistory(data || [])
    setExpandedCaseId(caseId)
  }

  function courtShortLabel(courtCode: string, fallback: string): string {
    if (customCourtMap[courtCode]) return customCourtMap[courtCode]
    const builtin = getCourtShortLabel(courtCode)
    return builtin || fallback
  }

  // Stage / Next-date / Action cell content, extracted so the same
  // per-hearing controls can be reused both for a normal row and stacked
  // compactly inside a linked-cases group row (see the merged-row
  // rendering below the table).
  function renderStageCellContent(h: HearingWithCase) {
    const stages = h.caseData.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES
    // Picking Ordered/Disposed asks for the actual order date before it
    // actually saves.
    if (orderDatePromptId === h.id) {
      return (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="date"
            value={orderDateValue}
            onChange={(e) => setOrderDateValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && orderDateValue) saveStage(h.id, 'Ordered/Disposed', orderDateValue); if (e.key === 'Escape') setOrderDatePromptId(null) }}
            className="px-1 py-0.5 border border-gray-300 rounded text-xs bg-white text-gray-900 w-full"
          />
          <button
            onClick={() => saveStage(h.id, 'Ordered/Disposed', orderDateValue)}
            disabled={!orderDateValue}
            className="px-1.5 py-0.5 rounded text-xs font-medium text-white bg-[#1e3a5f] disabled:opacity-50"
          >✓</button>
        </div>
      )
    }
    if (editingStage === h.id) {
      if (inlineCustomStageId === h.id) {
        return (
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
        )
      }
      return (
        <select
          autoFocus
          defaultValue={h.stage_on_date || ''}
          onChange={(e) => {
            if (e.target.value === 'Custom...') {
              setInlineCustomStageId(h.id)
              setInlineCustomStage('')
            } else if (e.target.value === 'Ordered/Disposed') {
              setEditingStage(null)
              setOrderDatePromptId(h.id)
              setOrderDateValue(toYMD(new Date()))
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
    }
    return (
      <button
        onClick={() => setEditingStage(h.id)}
        className="text-xs md:text-sm px-1 py-0.5 rounded hover:bg-gray-100 transition-colors text-gray-700 w-full text-center"
        title={h.stage_on_date ? `${h.stage_on_date} — click to change` : 'Click to change stage'}
      >
        {h.stage_on_date ? stageAbbrev(h.stage_on_date) : <span className="text-gray-300">—</span>}
      </button>
    )
  }

  function renderNextDateButton(h: HearingWithCase) {
    if (isFinalStage(h.stage_on_date)) return <span className="text-xs text-gray-300 italic">—</span>
    return (
      <button
        onClick={() => { setEditingNextDate(h.id); setEditingNextDateGroupIds(null) }}
        className="text-sm font-mono px-1 py-0.5 rounded hover:bg-gray-100 transition-colors text-gray-700 w-full text-center"
        title={h.set_by_name ? `Set by ${h.set_by_name}` : 'Click to set next date'}
      >
        {formatDD_MM(h.next_hearing_date) || <span className="text-gray-300">—</span>}
        {h.next_hearing_date && h.set_by_name && (
          <span className="block text-[9px] font-sans text-gray-400 normal-case">by {h.set_by_name.split(' ')[0]}</span>
        )}
      </button>
    )
  }

  // Linked cases sharing the same stage and/or next date get ONE control
  // instead of one per case — editing it applies to every case in the
  // group at once, since in practice they always move together (same
  // adjournment, same next date). Falls back to per-case controls (via
  // renderStageCellContent / renderNextDateButton above) the moment they
  // actually diverge.
  async function saveStageForGroup(ids: string[], newStage: string, disposalDate?: string) {
    setEditingStage(null)
    setOrderDatePromptIds(null)
    await Promise.all(ids.map((id) => saveStage(id, newStage, disposalDate)))
  }

  function renderMergedStageCell(group: HearingWithCase[]) {
    const anchor = group[0]
    const ids = group.map((g) => g.id)
    const stages = anchor.caseData.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES
    if (orderDatePromptIds && orderDatePromptIds[0] === anchor.id) {
      return (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="date"
            value={orderDateValue}
            onChange={(e) => setOrderDateValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && orderDateValue) saveStageForGroup(ids, 'Ordered/Disposed', orderDateValue); if (e.key === 'Escape') setOrderDatePromptIds(null) }}
            className="px-1 py-0.5 border border-gray-300 rounded text-xs bg-white text-gray-900 w-full"
          />
          <button
            onClick={() => saveStageForGroup(ids, 'Ordered/Disposed', orderDateValue)}
            disabled={!orderDateValue}
            className="px-1.5 py-0.5 rounded text-xs font-medium text-white bg-[#1e3a5f] disabled:opacity-50"
          >✓</button>
        </div>
      )
    }
    if (editingStage === anchor.id) {
      if (inlineCustomStageId === anchor.id) {
        return (
          <input
            autoFocus
            type="text"
            value={inlineCustomStage}
            onChange={(e) => setInlineCustomStage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inlineCustomStage.trim()) {
                saveStageForGroup(ids, inlineCustomStage.trim())
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
        )
      }
      return (
        <select
          autoFocus
          defaultValue={anchor.stage_on_date || ''}
          onChange={(e) => {
            if (e.target.value === 'Custom...') {
              setInlineCustomStageId(anchor.id)
              setInlineCustomStage('')
            } else if (e.target.value === 'Ordered/Disposed') {
              setEditingStage(null)
              setOrderDatePromptIds(ids)
              setOrderDateValue(toYMD(new Date()))
            } else {
              saveStageForGroup(ids, e.target.value)
            }
          }}
          onBlur={() => setEditingStage(null)}
          className="px-1 py-0.5 border border-gray-300 rounded text-sm bg-white text-gray-900 w-full"
        >
          <option value=""></option>
          {stages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )
    }
    return (
      <button
        onClick={() => setEditingStage(anchor.id)}
        className="text-xs md:text-sm px-1 py-0.5 rounded hover:bg-gray-100 transition-colors text-gray-700 w-full text-center"
        title={anchor.stage_on_date ? `${anchor.stage_on_date} — same for all ${group.length} linked cases, click to change` : `Click to set stage for all ${group.length} linked cases`}
      >
        {anchor.stage_on_date ? stageAbbrev(anchor.stage_on_date) : <span className="text-gray-300">—</span>}
      </button>
    )
  }

  function renderMergedNextDateButton(group: HearingWithCase[]) {
    const anchor = group[0]
    if (isFinalStage(anchor.stage_on_date)) return <span className="text-xs text-gray-300 italic">—</span>
    return (
      <button
        onClick={() => { setEditingNextDate(anchor.id); setEditingNextDateGroupIds(group.map((g) => g.id)) }}
        className="text-sm font-mono px-1 py-0.5 rounded hover:bg-gray-100 transition-colors text-gray-700 w-full text-center"
        title={`Same next date for all ${group.length} linked cases — click to change`}
      >
        {formatDD_MM(anchor.next_hearing_date) || <span className="text-gray-300">—</span>}
        {anchor.next_hearing_date && anchor.set_by_name && (
          <span className="block text-[9px] font-sans text-gray-400 normal-case">by {anchor.set_by_name.split(' ')[0]}</span>
        )}
      </button>
    )
  }

  function renderActionCellContent(h: HearingWithCase) {
    const ecLink = eCourtsDeepLink(h.caseData.ecourts_cnr)
    if (isFinalStage(h.stage_on_date)) {
      if (commentHearingId === h.id) {
        return (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              placeholder="Type action…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveComment(h.id); if (e.key === 'Escape') { setCommentHearingId(null); setCommentText('') } }}
              className="flex-1 min-w-0 px-1.5 py-0.5 border border-emerald-300 rounded text-xs bg-white text-gray-900 focus:outline-none"
            />
            <button onClick={() => saveComment(h.id)} disabled={commentSaving} className="px-1.5 py-0.5 rounded text-xs font-medium text-white bg-emerald-600 disabled:opacity-50">✓</button>
          </div>
        )
      }
      if (h.outcome_notes) {
        return (
          <button
            onClick={() => { setCommentHearingId(h.id); setCommentText(h.outcome_notes || '') }}
            className="text-xs text-emerald-700 font-medium text-left w-full hover:text-emerald-900 truncate block"
            title={h.outcome_notes}
          >
            ✓ {h.outcome_notes}
          </button>
        )
      }
      return (
        <div className="flex flex-wrap gap-1">
          {['Appeal', 'Execution', 'Order Copy', 'Done'].map(action => (
            <button
              key={action}
              onClick={async () => {
                const supabase = createClient()
                await supabase.from('hearings').update({ outcome_notes: action }).eq('id', h.id)
                setHearings(prev => prev.map(x => x.id === h.id ? { ...x, outcome_notes: action } : x))
              }}
              className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap"
            >
              {action}
            </button>
          ))}
          <button
            onClick={() => { setCommentHearingId(h.id); setCommentText('') }}
            className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100"
          >+</button>
        </div>
      )
    }
    // Comment editing/display now lives entirely inside this one box —
    // typing a note replaces the icon button with the note text itself
    // (still clickable, to change or clear it), instead of opening a
    // separate row below the table.
    if (commentHearingId === h.id) {
      return (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="text"
            placeholder="Type a note…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveComment(h.id); if (e.key === 'Escape') { setCommentHearingId(null); setCommentText('') } }}
            className="flex-1 min-w-0 px-1.5 py-0.5 border border-blue-300 rounded text-xs bg-white text-gray-900 focus:outline-none"
          />
          <button onClick={() => saveComment(h.id)} disabled={commentSaving} className="px-1.5 py-0.5 rounded text-xs font-medium text-white bg-blue-600 disabled:opacity-50">✓</button>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-0.5 justify-center min-w-0">
        {h.outcome_notes ? (
          <button
            onClick={() => { setCommentHearingId(h.id); setCommentText(h.outcome_notes || '') }}
            className="flex items-center gap-1 min-w-0 max-w-full text-xs text-blue-700 font-medium hover:text-blue-900 px-1.5 py-1 rounded hover:bg-blue-50 transition-colors"
            title={`${h.outcome_notes} — click to change`}
          >
            <MessageSquare className="w-3 h-3 shrink-0" />
            <span className="truncate">{h.outcome_notes}</span>
          </button>
        ) : (
          <button
            onClick={() => { setCommentHearingId(h.id); setCommentText('') }}
            className="p-1.5 rounded transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="Add comment"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}
        {ecLink && (
          <a href={ecLink} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors shrink-0" title="eCourts">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    )
  }

  // Filtered hearings for diary search
  const filteredHearings = diaryFilter.trim()
    ? hearings.filter(h =>
        `${h.caseData.party_plaintiff} ${h.caseData.party_defendant}`
          .toLowerCase()
          .includes(diaryFilter.toLowerCase())
      )
    : hearings

  // Linked cases that share one common party (e.g. three different
  // plaintiffs all suing the same "Rahul") get clubbed into one box today —
  // that common party's cell spans all their rows instead of repeating it,
  // and the other party still lists once per row. Only clubs when the
  // common name is on the *same side* (all-plaintiff or all-defendant)
  // across the whole group; if the roles are reversed case to case there's
  // no clean column to merge, so those just stay as normal separate rows.
  function findCommonParty(group: HearingWithCase[]): { name: string; side: 'plaintiff' | 'defendant' } | null {
    const norm = (s: string) => s.trim().toLowerCase()
    const firstDef = norm(group[0].caseData.party_defendant)
    if (firstDef && group.every((g) => norm(g.caseData.party_defendant) === firstDef)) {
      return { name: group[0].caseData.party_defendant, side: 'defendant' }
    }
    const firstPl = norm(group[0].caseData.party_plaintiff)
    if (firstPl && group.every((g) => norm(g.caseData.party_plaintiff) === firstPl)) {
      return { name: group[0].caseData.party_plaintiff, side: 'plaintiff' }
    }
    return null
  }

  function buildDisplayHearings(list: HearingWithCase[], pairs: { case_id: string; linked_case_id: string }[]) {
    const idsToday = new Set(list.map((h) => h.case_id))
    const parent = new Map<string, string>()
    for (const id of idsToday) parent.set(id, id)
    function find(x: string): string {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r) as string
      return r
    }
    function union(a: string, b: string) {
      const ra = find(a); const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
    for (const p of pairs) {
      if (idsToday.has(p.case_id) && idsToday.has(p.linked_case_id)) union(p.case_id, p.linked_case_id)
    }

    const groups = new Map<string, HearingWithCase[]>()
    for (const h of list) {
      const root = find(h.case_id)
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root)!.push(h)
    }

    const ordered: HearingWithCase[] = []
    const groupSizeById = new Map<string, number>()
    const anchorIds = new Set<string>()
    const commonPartyById = new Map<string, { name: string; side: 'plaintiff' | 'defendant' }>()
    const groupMembersByAnchor = new Map<string, HearingWithCase[]>()
    const seenRoot = new Set<string>()
    for (const h of list) {
      const root = find(h.case_id)
      if (seenRoot.has(root)) continue
      seenRoot.add(root)
      const group = groups.get(root)!
      ordered.push(...group)
      if (group.length > 1) {
        const common = findCommonParty(group)
        if (common) {
          for (const g of group) { groupSizeById.set(g.id, group.length); commonPartyById.set(g.id, common) }
          anchorIds.add(group[0].id)
          groupMembersByAnchor.set(group[0].id, group)
        }
      }
    }
    return { ordered, groupSizeById, anchorIds, commonPartyById, groupMembersByAnchor }
  }

  const { ordered: displayHearings, groupSizeById, anchorIds, commonPartyById, groupMembersByAnchor } = buildDisplayHearings(filteredHearings, caseLinkPairs)

  // Date display parts
  const monthName = format(selectedDate, 'MMMM').toUpperCase()
  const dayNum = format(selectedDate, 'd')
  const dayEnglish = format(selectedDate, 'EEEE')
  const dayHindi = HINDI_DAYS[dayEnglish] || ''
  const yearNum = format(selectedDate, 'yyyy')
  const isTodayDate = isToday(selectedDate)

  // Month calendar days
  const monthDays = eachDayOfInterval({ start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) })

  // Print slip — one fixed, generously-sized layout (no more shrinking the
  // font as the day gets busier). When more cases show up than fit in one
  // column, the overflow spills into a second column on the same A4 sheet
  // instead of shrinking text or spilling onto a second printed page — so
  // it can be folded down the middle, giving two full sides to carry
  // instead of one.
  // Linked cases get one slip line, same as the on-screen compact view —
  // otherwise the slip lists Rahul/Ganesh/Sehjal as 3 separate lines
  // when the diary itself shows them clubbed into one.
  const slipSorted = [...hearings]
    .filter((h) => {
      const gs = groupSizeById.get(h.id) || 1
      return gs === 1 || anchorIds.has(h.id)
    })
    .sort((a, b) =>
      getCourtSortPriority(a.caseData.court_code || '') - getCourtSortPriority(b.caseData.court_code || '')
    )
  const SLIP_ROWS_PER_COLUMN = 20
  const slipRightCases = slipSorted.slice(0, SLIP_ROWS_PER_COLUMN)
  const slipLeftCases = slipSorted.slice(SLIP_ROWS_PER_COLUMN) // empty on a normal day

  // Combines a linked group's case numbers into one compact string —
  // "232, 234, 235/24" when they all share a year (the usual case),
  // falling back to a full "num/yy" per case, comma-separated, when they
  // don't. Used by both the table's Case No. column and the print slip.
  function combineCaseNumbers(group: { caseData: { case_number: string; case_year: number | null } }[]): string {
    if (group.every((g) => !g.caseData.case_number)) return '—' // none allotted yet — one dash, not one per case
    const year = group[0].caseData.case_year
    const sameYear = group.every((g) => g.caseData.case_year === year)
    if (sameYear && year) {
      return `${group.map((g) => g.caseData.case_number || '—').join(', ')}/${String(year).slice(-2)}`
    }
    return group.map((g) => formatCaseNumberShort(g.caseData.case_number, g.caseData.case_year) || '—').join(', ')
  }

  function slipLineContent(h: HearingWithCase) {
    const groupSize = groupSizeById.get(h.id) || 1
    if (groupSize > 1) {
      const group = groupMembersByAnchor.get(h.id) || [h]
      const common = commonPartyById.get(h.id)
      const caseNos = combineCaseNumbers(group)
      let partyLine: string
      if (common?.side === 'plaintiff') {
        partyLine = `${slipShortName(common.name)} / ${group.map((g) => slipShortName(g.caseData.party_defendant)).join(', ')}`
      } else if (common?.side === 'defendant') {
        partyLine = `${group.map((g) => slipShortName(g.caseData.party_plaintiff)).join(', ')} / ${slipShortName(common.name)}`
      } else {
        partyLine = group.map((g) => `${slipShortName(g.caseData.party_plaintiff)}/${slipShortName(g.caseData.party_defendant)}`).join('; ')
      }
      // A group's note — whichever member actually has one; in practice
      // linked cases carry one shared comment, not one each.
      const note = group.map((g) => g.outcome_notes).find(Boolean) || null
      return { caseNos, partyLine, note }
    }
    return {
      caseNos: formatCaseNumberShort(h.caseData.case_number, h.caseData.case_year),
      partyLine: `${slipShortName(h.caseData.party_plaintiff)} / ${slipShortName(h.caseData.party_defendant)}`,
      note: h.outcome_notes,
    }
  }

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
              onClick={() => setShowCalendarPicker(true)}
              className="text-2xl font-bold tracking-widest text-gray-800 hover:text-blue-700 transition-colors cursor-pointer"
              style={{ fontFamily: 'Georgia, serif' }}
              title="Click to jump to any date"
            >
              {monthName}
            </button>
            {isTodayDate && (
              <span className="mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 uppercase tracking-wide">
                Today
              </span>
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
              onClick={() => setShowCalendarPicker(true)}
              className="text-2xl font-bold text-gray-800 hover:text-blue-700 transition-colors cursor-pointer"
              style={{ fontFamily: 'Georgia, serif' }}
              title="Click to jump to any date"
            >
              {yearNum}
            </button>
          </div>

          {/* To-Do list */}
          <div className="py-2 px-3 min-h-[80px]">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">To-Do list</div>
            {advocateId && <TaskBar advocateId={advocateId} selectedDate={toYMD(selectedDate)} />}
          </div>
        </div>
      </div>

      {/* ═══ Jump to any date ═══ */}
      {showCalendarPicker && (
        <CalendarPickerModal
          initialDate={selectedDate}
          selectedDate={selectedDate}
          hearingCounts={monthHearingCounts}
          onMonthChange={fetchMonthDates}
          onSelect={(d) => { goToDate(d); setShowCalendarPicker(false) }}
          onClose={() => setShowCalendarPicker(false)}
        />
      )}

      {/* ═══ Set a hearing's next date — same real calendar, with counts,
           instead of the browser's plain native date popup ═══ */}
      {editingNextDate && (() => {
        const h = hearings.find((x) => x.id === editingNextDate)
        if (!h) return null
        const current = h.next_hearing_date ? parseISO(h.next_hearing_date) : null
        const targetIds = editingNextDateGroupIds && editingNextDateGroupIds.length > 0 ? editingNextDateGroupIds : [h.id]
        return (
          <CalendarPickerModal
            initialDate={current || new Date()}
            selectedDate={current}
            hearingCounts={monthHearingCounts}
            onMonthChange={fetchMonthDates}
            onSelect={(d) => {
              const newYmd = toYMD(d)
              // Already has a date and you're picking a different one —
              // confirm it's deliberate, not a stray tap.
              if (current && toYMD(current) !== newYmd) {
                const ok = window.confirm(`This case already has a next date of ${formatDD_MM(toYMD(current))}. Change it to ${formatDD_MM(newYmd)}?`)
                if (!ok) return
              }
              targetIds.forEach((id) => saveNextDate(id, newYmd))
              setEditingNextDate(null)
              setEditingNextDateGroupIds(null)
            }}
            onClear={() => { targetIds.forEach((id) => saveNextDate(id, '')); setEditingNextDate(null); setEditingNextDateGroupIds(null) }}
            onClose={() => { setEditingNextDate(null); setEditingNextDateGroupIds(null) }}
            todayLabel="Today"
            courtLabel={courtShortLabel(h.caseData.court_code || '', h.caseData.court_name)}
            caseTitle={`${h.caseData.party_plaintiff} vs ${h.caseData.party_defendant}`}
          />
        )
      })()}

      {/* ═══ Month Calendar Strip ═══ */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 overflow-x-auto print:hidden">
        <div className="flex items-center gap-1 min-w-max">
          {monthDays.map((day) => {
            const ymd = toYMD(day)
            const count = monthHearingCounts.get(ymd) || 0
            const isSelected = ymd === toYMD(selectedDate)
            const isT = isToday(day)
            // Light/moderate/heavy so a busy vs. clean day is visible at a
            // glance, not just readable as a number.
            const badgeClass =
              count === 0 ? '' :
              count <= 2 ? 'bg-emerald-100 text-emerald-700' :
              count <= 5 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
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
                title={count > 0 ? `${format(day, 'd MMM')} — ${count} hearing${count !== 1 ? 's' : ''}` : format(day, 'd MMM')}
              >
                <span className="text-[9px] opacity-60">{format(day, 'EEE').toUpperCase()}</span>
                <span>{format(day, 'd')}</span>
                {count > 0 ? (
                  <span
                    className={`min-w-[16px] px-1 rounded-full text-[9px] font-bold leading-[14px] mt-0.5 ${
                      isSelected ? 'bg-white text-[#1e3a5f]' : badgeClass
                    }`}
                  >
                    {count}
                  </span>
                ) : (
                  <span className="h-[14px] mt-0.5" />
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
          {/* Table — same layout on phone and desktop; scrolls sideways on narrow screens */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden print:overflow-visible print:rounded-none print:border-black">
            <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: '#e8e8e0' }}>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-center w-16">Pre.</th>
                  {/* w-[1%] is the standard "shrink to fit content" trick
                      for an auto-layout table — combined with
                      whitespace-nowrap below, the column ends up exactly
                      as wide as the longest court label needs and no
                      wider, instead of getting stretched out by other
                      columns. */}
                  <th className="border border-gray-300 px-1.5 py-2 text-xs font-bold text-gray-700 text-left whitespace-nowrap w-[1%]">Court</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-center w-16 md:w-20">Case No.</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-left w-40">Party 1</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-left w-40">Party 2</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-center w-14 md:w-28">Stage</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-center w-20">Next</th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-bold text-gray-700 text-center w-40 print:hidden">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayHearings.map((h) => {
                  const groupSize = groupSizeById.get(h.id) || 1
                  const isAnchor = anchorIds.has(h.id)

                  // Non-anchor members of a linked-cases group are folded
                  // into the anchor's single merged row below — nothing to
                  // render for them here.
                  if (groupSize > 1 && !isAnchor) return null

                  // Linked cases sharing a common party (e.g. three
                  // plaintiffs all suing "Vikram") get ONE compact row
                  // instead of one full-height row each: the shared party
                  // shows once, the other party's names run together
                  // comma-separated (wrapping naturally, e.g. "Rahul,
                  // Ganesh" then "Sehjal" on the next line), and anything
                  // that differs per case (stage, next date, actions)
                  // stacks as small aligned lines within the same cells.
                  if (groupSize > 1 && isAnchor) {
                    const group = groupMembersByAnchor.get(h.id) || [h]
                    const common = commonPartyById.get(h.id)
                    const anchorCourtCode = group[0].caseData.court_code || ''
                    const anchorCourtBg = getCourtColor(anchorCourtCode)
                    const sameCourt = group.every((g) => (g.caseData.court_code || '') === anchorCourtCode)
                    // Linked cases almost always move together — if the
                    // whole group already shares the same stage/next date,
                    // show and edit it once instead of one line per case.
                    const sameStage = group.every((g) => (g.stage_on_date || '') === (group[0].stage_on_date || ''))
                    const sameNext = group.every((g) => (g.next_hearing_date || '') === (group[0].next_hearing_date || ''))
                    const sameCaseYear = group.every((g) => g.caseData.case_year === group[0].caseData.case_year)
                    const samePreDate = group.every((g) => (g.previous_hearing_date || '') === (group[0].previous_hearing_date || '') && g.purpose === group[0].purpose)

                    return (
                      <Fragment key={h.id}>
                        <tr className="hover:bg-amber-50/20 transition-colors" style={{ borderLeft: '4px solid #f59e0b' }}>
                          {/* Pre. — one merged value when every linked case
                              shares the same previous date (the usual
                              case), else one line per case */}
                          <td className="border border-gray-200 px-2 py-1.5 text-center align-middle">
                            {samePreDate ? (
                              <div className="font-mono text-xs text-gray-600">
                                {group[0].purpose === 'Case Commenced' ? (
                                  <span className="inline-block px-1 py-0.5 rounded text-[10px] font-bold text-white bg-emerald-500">NEW</span>
                                ) : (
                                  formatDD_MM(group[0].previous_hearing_date)
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1 justify-center">
                                {group.map((g) => (
                                  <div key={g.id} className="font-mono text-xs text-gray-600">
                                    {g.purpose === 'Case Commenced' ? (
                                      <span className="inline-block px-1 py-0.5 rounded text-[10px] font-bold text-white bg-emerald-500">NEW</span>
                                    ) : (
                                      formatDD_MM(g.previous_hearing_date)
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Court — shown once; linked cases are almost
                              always in the same court/tribunal. Vertically
                              centered (not top-aligned) so a single short
                              value doesn't look like it's floating with
                              empty space below it when other columns in
                              this row stack to several lines. */}
                          <td className="border border-gray-200 px-1.5 py-1.5 align-middle whitespace-nowrap">
                            <span
                              className="inline-block whitespace-nowrap align-bottom px-1 py-0.5 rounded text-[9px] md:text-[10.5px] font-semibold text-gray-700"
                              style={{ background: anchorCourtBg }}
                              title={courtShortLabel(anchorCourtCode, group[0].caseData.court_name)}
                            >
                              {courtShortLabel(anchorCourtCode, group[0].caseData.court_name)}
                            </span>
                            {!sameCourt && <div className="text-[9px] text-gray-400 mt-0.5">+ other courts</div>}
                          </td>

                          {/* Case No. — combined into one compact line when
                              every linked case shares the same year, e.g.
                              "232, 234, 235/24"; click opens the case (or a
                              blank "—" box if no number's been entered
                              yet, still clickable). */}
                          <td className="border border-gray-200 px-2 py-1.5 text-center align-middle">
                            {sameCaseYear ? (
                              <Link
                                href={`/diary/cases/${group[0].case_id}`}
                                className="block font-mono text-xs hover:underline"
                                style={{ color: '#1e3a5f' }}
                                title="Click to open the lead case"
                              >
                                {combineCaseNumbers(group)}
                              </Link>
                            ) : (
                              <div className="flex flex-col gap-1 justify-center">
                                {group.map((g) => (
                                  <Link
                                    key={g.id}
                                    href={`/diary/cases/${g.case_id}`}
                                    className="block font-mono text-xs hover:underline"
                                    style={{ color: '#1e3a5f' }}
                                    title="Click to open"
                                  >
                                    {formatCaseNumberShort(g.caseData.case_number, g.caseData.case_year) || '—'}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Party 1 — the shared party shows once (click to
                              set a date for the whole group); the other
                              side's names run together and wrap naturally,
                              e.g. "Rahul, Ganesh" / "Sehjal" — click any
                              one to set that case's own date. */}
                          <td className="border border-gray-200 px-2 py-1.5 max-w-[144px] bg-amber-50/30 align-middle">
                            {common?.side === 'plaintiff' ? (
                              <button
                                onClick={() => { setEditingNextDate(group[0].id); setEditingNextDateGroupIds(group.map((g) => g.id)) }}
                                className="text-sm font-medium text-left hover:underline"
                                style={{ color: '#1e3a5f' }}
                                title="Click to set the next date for all linked cases"
                              >
                                {common.name}
                              </button>
                            ) : (
                              <div className="text-sm leading-snug">
                                {group.map((g, i) => (
                                  <span key={g.id}>
                                    <button
                                      onClick={() => { setEditingNextDate(g.id); setEditingNextDateGroupIds(null) }}
                                      className="hover:underline font-medium"
                                      style={{ color: '#1e3a5f' }}
                                      title="Click to set this case's next date"
                                    >
                                      {g.caseData.party_plaintiff}
                                    </button>
                                    {i < group.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Party 2 — mirrors Party 1 */}
                          <td className="border border-gray-200 px-2 py-1.5 max-w-[144px] bg-amber-50/30 align-middle">
                            {common?.side === 'defendant' ? (
                              <button
                                onClick={() => { setEditingNextDate(group[0].id); setEditingNextDateGroupIds(group.map((g) => g.id)) }}
                                className="text-sm font-medium text-left text-gray-700 hover:underline"
                                title="Click to set the next date for all linked cases"
                              >
                                {common.name}
                              </button>
                            ) : (
                              <div className="text-sm leading-snug text-gray-700">
                                {group.map((g, i) => (
                                  <span key={g.id}>
                                    <button
                                      onClick={() => { setEditingNextDate(g.id); setEditingNextDateGroupIds(null) }}
                                      className="hover:underline hover:text-[#1e3a5f]"
                                      title="Click to set this case's next date"
                                    >
                                      {g.caseData.party_defendant}
                                    </button>
                                    {i < group.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Stage — one merged control when every linked
                              case already shares the same stage, else one
                              compact line per case. Vertically centered
                              when merged, so it doesn't float at the top
                              of a taller row with empty space below. */}
                          <td className="border border-gray-200 px-2 py-1.5 align-middle">
                            {sameStage ? (
                              renderMergedStageCell(group)
                            ) : (
                              <div className="divide-y divide-gray-100">
                                {group.map((g) => (
                                  <div key={g.id} className="py-1 first:pt-0 last:pb-0 text-center">
                                    {renderStageCellContent(g)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Next Date — same idea: merged when identical, else per-case */}
                          <td className="border border-gray-200 px-2 py-1.5 align-middle">
                            {sameNext ? (
                              renderMergedNextDateButton(group)
                            ) : (
                              <div className="divide-y divide-gray-100">
                                {group.map((g) => (
                                  <div key={g.id} className="py-1 first:pt-0 last:pb-0 text-center">
                                    {renderNextDateButton(g)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Action — one control for the whole group
                              (the shared "comment" icon applies to the
                              lead case; open any linked case's own page
                              for a case-specific note), not one button
                              per linked case */}
                          <td className="border border-gray-200 px-2 py-1.5 print:hidden align-middle">
                            {renderActionCellContent(group[0])}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  }

                  const borderColor = rowBorderColor(h)
                  const courtCode = h.caseData.court_code || ''
                  const courtBg = getCourtColor(courtCode)

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

                        {/* Court Name — click to open/close this case's
                            history, right here where you clicked (not
                            anywhere else in the row anymore) */}
                        <td className="border border-gray-200 px-1.5 py-2 whitespace-nowrap">
                          <button
                            onClick={() => toggleHistory(h.case_id)}
                            className="inline-block whitespace-nowrap align-bottom px-1 py-0.5 rounded text-[9px] md:text-[12px] font-semibold text-gray-700 hover:opacity-80 transition-opacity"
                            style={{ background: courtBg }}
                            title={`${courtShortLabel(courtCode, h.caseData.court_name)} — click for case history`}
                          >
                            {courtShortLabel(courtCode, h.caseData.court_name)}
                          </button>
                        </td>

                        {/* Case No. — click to open the case (Overview);
                            a blank/not-yet-allotted number is still a
                            clickable box, so it's easy to give it one */}
                        <td className="border border-gray-200 px-2 py-2 text-center font-mono text-sm md:text-base text-gray-800">
                          <Link
                            href={`/diary/cases/${h.case_id}`}
                            className="inline-block max-w-[70px] md:max-w-none truncate align-bottom font-bold hover:underline"
                            style={{ color: '#1e3a5f' }}
                            title="Click to open"
                          >
                            {formatCaseNumberShort(h.caseData.case_number, h.caseData.case_year) || '—'}
                          </Link>
                        </td>

                        {/* Party 1 — click to set this case's next date */}
                        <td className="border border-gray-200 px-2 py-2 text-base font-medium text-gray-800 max-w-[144px]">
                          <button
                            onClick={() => { setEditingNextDate(h.id); setEditingNextDateGroupIds(null) }}
                            className="block w-full text-left truncate hover:underline"
                            style={{ color: '#1e3a5f' }}
                            title="Click to set the next date"
                          >
                            {h.caseData.party_plaintiff}
                          </button>
                        </td>

                        {/* Party 2 — same as Party 1 */}
                        <td className="border border-gray-200 px-2 py-2 text-base font-medium text-gray-800 max-w-[144px]">
                          <button
                            onClick={() => { setEditingNextDate(h.id); setEditingNextDateGroupIds(null) }}
                            className="block w-full text-left truncate text-gray-700 hover:text-[#1e3a5f] hover:underline"
                            title="Click to set the next date"
                          >
                            {h.caseData.party_defendant}
                          </button>
                        </td>

                        {/* Stage */}
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          {renderStageCellContent(h)}
                        </td>

                        {/* Next Date — hidden when stage is final */}
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          {renderNextDateButton(h)}
                        </td>

                        {/* Action column — final-stage quick actions, or the everyday comment/eCourts icons */}
                        <td className="border border-gray-200 px-2 py-2 print:hidden">
                          {renderActionCellContent(h)}
                        </td>
                      </tr>

                      {/* Case history row */}
                      {expandedCaseId === h.case_id && (
                        <tr key={`hist-${h.id}`}>
                          <td colSpan={8} className="border border-gray-200 px-3 py-2 print:hidden bg-gray-50">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Case History</div>
                            {caseHistory.length === 0 ? (
                              <p className="text-xs text-gray-400">No history found.</p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {caseHistory.map(ch => (
                                  <div key={ch.id} className="text-xs text-gray-600">
                                    <span className="font-mono text-gray-500">{formatDD_MM(ch.hearing_date)}</span>
                                    {ch.stage_on_date && <span className="text-gray-800"> — {ch.stage_on_date}</span>}
                                    {ch.outcome_notes && <span className="text-blue-600 italic"> ({ch.outcome_notes})</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
            </div>
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
                          <button key={c.id} onClick={() => selectCase(c)} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
                            <p className="text-sm font-medium text-gray-800">{c.full_title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {c.case_type ? `${c.case_type} ` : ''}{formatCaseNumber(c.case_number, c.case_year)} — {c.court_name}{c.city ? `, ${c.city}` : ''}
                            </p>
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{selectedCase.full_title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {selectedCase.case_type ? `${selectedCase.case_type} ` : ''}{formatCaseNumber(selectedCase.case_number, selectedCase.case_year)}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          <span className="text-gray-400">Court:</span> {selectedCase.court_name}
                          {selectedCase.city && <>, {selectedCase.city}</>}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          <span className="text-gray-400">Last date:</span>{' '}
                          {selectedCaseLastDate === undefined ? (
                            <Loader2 className="inline w-3 h-3 animate-spin text-gray-400" />
                          ) : selectedCaseLastDate ? (
                            formatDD_MM(selectedCaseLastDate)
                          ) : (
                            'No hearings yet'
                          )}
                        </p>
                      </div>
                      <button onClick={() => { setSelectedCase(null); setSelectedCaseLastDate(undefined) }} className="text-xs text-gray-500 hover:text-gray-700 underline shrink-0">Change</button>
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
        @page { size: A4 portrait; margin: 6mm; }
        @media print {
          html, body { height: auto !important; overflow: visible !important; }
          aside, header { display: none !important; }
          main { overflow: visible !important; height: auto !important; max-height: none !important; }
          body:not(.print-slip-mode) #diary-slip { display: none !important; }
          body:not(.print-slip-mode) table th { font-size: 11px !important; padding: 2px 4px !important; }
          body:not(.print-slip-mode) table td { font-size: 11px !important; padding: 2px 4px !important; }
          body.print-slip-mode > *:not(#diary-slip) { display: none !important; }
          body.print-slip-mode { display: flex; justify-content: flex-end; padding: 18mm 8mm 0 8mm; }
          body.print-slip-mode #diary-slip {
            display: flex !important;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8mm;
            position: static !important;
            width: 100% !important;
            height: auto !important;
          }
          body.print-slip-mode .slip-col {
            width: 92mm;
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 14px;
            line-height: 1.6;
            border: 0.5px solid #999;
            padding: 4mm 4mm 3mm;
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
          const headerLine = (
            <div style={{ textAlign: 'center', borderBottom: '1.5px solid #222', paddingBottom: '1.5mm', marginBottom: '2mm' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold' }}>
                {advocateName ? `Adv. ${advocateName} · ` : ''}{format(selectedDate, 'd MMM yyyy')} ({dayName.slice(0, 3)} · {HINDI_DAYS[dayName] || ''})
              </div>
            </div>
          )
          const footerLine = (count: number) => (
            <div style={{ marginTop: '2mm', paddingTop: '1.5mm', borderTop: '0.5px solid #bbb', textAlign: 'center', fontSize: '10px', color: '#888' }}>
              {count} matter{count !== 1 ? 's' : ''} · {format(selectedDate, 'd MMMM yyyy')}
            </div>
          )
          // The empty left column is still rendered (just invisible) rather
          // than omitted — with only one flex child, space-between would
          // pack it to the left edge instead of the right, breaking the
          // normal-day layout where the slip has always sat on the right.
          const renderColumn = (cases: typeof slipSorted, hideIfEmpty = false) => (
            <div className="slip-col" style={hideIfEmpty && cases.length === 0 ? { visibility: 'hidden' } : undefined}>
              {headerLine}
              {cases.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3mm 0', fontSize: '14px', color: '#999' }}>No hearings today</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {cases.map((h) => {
                    const { caseNos, partyLine, note } = slipLineContent(h)
                    return (
                      <li key={h.id} style={{ padding: '1.5mm 0', borderBottom: '0.3px dotted #ddd', breakInside: 'avoid' }}>
                        {/* Fixed court + case-number prefix, then party
                            names + stage. Names are never truncated — they
                            wrap onto a second line if the entry is long
                            (a linked group, or just a long name) rather
                            than getting cut off with an ellipsis. */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5mm', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 'bold', flexShrink: 0 }}>{courtShortLabel(h.caseData.court_code || '', h.caseData.court_name)}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#555', flexShrink: 0 }}>{caseNos}</span>
                          <span style={{ color: '#222', minWidth: 0, flex: '1 1 auto', wordBreak: 'break-word' }}>
                            {partyLine}
                            {h.caseData.case_stage && <span style={{ fontSize: '10px', color: '#888' }}> ({stageAbbrev(h.caseData.case_stage)})</span>}
                          </span>
                        </div>
                        {/* The action/comment noted for today — one compact
                            line under the entry, kept short so the slip
                            still fits its half of the page for folding. */}
                        {note && (
                          <div style={{ fontSize: '10px', color: '#1e40af', fontStyle: 'italic', marginTop: '0.5mm', wordBreak: 'break-word' }}>
                            → {note}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              {footerLine(cases.length)}
            </div>
          )
          return (
            <>
              {renderColumn(slipLeftCases, true)}
              {renderColumn(slipRightCases)}
            </>
          )
        })()}
        </div>,
        document.body
      )}
    </div>
  )
}
