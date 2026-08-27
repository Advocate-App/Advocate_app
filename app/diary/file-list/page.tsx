'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { Printer, Search } from 'lucide-react'
import { getCourtShortLabel } from '@/lib/constants/courts'
import { cityFor as cityForCourt } from '@/lib/cityFor'

interface CaseRow {
  id: string
  court_code: string
  court_name: string
  case_number: string | null
  case_year: number | null
  party_plaintiff: string
  party_defendant: string
  client_name: string | null
  is_company_case: boolean
  case_stage: string | null
  city: string | null
  hearing_date: string
}

function cityFor(c: CaseRow): string {
  return cityForCourt(c.court_code, c.city)
}

// Short court name for the printed list; custom courts have no short code
// so fall back to their saved full name instead of the raw CUSTOM_<uuid>.
function courtShortFor(c: CaseRow): string {
  const short = getCourtShortLabel(c.court_code || '')
  if (short && !short.startsWith('CUSTOM_')) return short
  return c.court_name
}

function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

function fmtDate(d: string) {
  try { return format(parseISO(d), 'EEE, d MMM yyyy') } catch { return d }
}

function shortCaseNumber(c: CaseRow): string {
  if (!c.case_number) return ''
  const yr = c.case_year ? `/${String(c.case_year).slice(-2)}` : ''
  return `${c.case_number}${yr}`
}

function isMactOrWc(courtCode: string): boolean {
  const c = (courtCode || '').toUpperCase()
  return c.startsWith('MACT') || c.startsWith('WC') || c.includes('_MACT') || c.includes('_WC')
}

function normalizeCompany(name: string): string {
  const n = name.trim().toLowerCase()
  if (n.includes('icici')) return 'ICICI'
  if (n.includes('hdfc')) return 'HDFC'
  if (n.includes('sbi') || n.includes('state bank')) return 'SBI'
  if (n.includes('bajaj')) return 'Bajaj'
  if (n.includes('tata')) return 'Tata'
  if (n.includes('new india')) return 'New India Assurance'
  if (n.includes('national insurance') || n.includes('national general')) return 'National Insurance'
  if (n.includes('oriental')) return 'Oriental Insurance'
  if (n.includes('united')) return 'United India Insurance'
  if (n.includes('universal sompo') || n.includes('sompo')) return 'Universal Sompo'
  if (n.includes('reliance')) return 'Reliance'
  if (n.includes('cholamandalam') || n.includes('chola')) return 'Cholamandalam'
  if (n.includes('royal sundaram')) return 'Royal Sundaram'
  if (n.includes('future generali') || n.includes('future genarali')) return 'Future Generali'
  if (n.includes('iffco')) return 'IFFCO-Tokio'
  if (n.includes('star health')) return 'Star Health'
  if (n.includes('niva bupa')) return 'Niva Bupa'
  if (n.includes('go digit') || n.includes('digit')) return 'Go Digit'
  if (n.includes('care health')) return 'Care Health'
  if (n.includes('lic') || n.includes('life insurance corporation')) return 'LIC'
  if (n.includes('punjab national') || n.includes('pnb')) return 'PNB'
  if (n.includes('bank of baroda')) return 'Bank of Baroda'
  if (n.includes('bank of india')) return 'Bank of India'
  if (n.includes('canara')) return 'Canara Bank'
  if (n.includes('union bank')) return 'Union Bank'
  if (n.includes('axis bank')) return 'Axis Bank'
  if (n.includes('kotak')) return 'Kotak'
  if (n.includes('indusind')) return 'IndusInd Bank'
  if (n.includes('shriram')) return 'Shriram'
  if (n.includes('mahindra finance') || n.includes('m&m fin')) return 'Mahindra Finance'
  if (n.includes('muthoot')) return 'Muthoot'
  return name.trim()
}

/** Private (non-MACT/WC), Private MACT, or the company name. */
function bucketFor(c: CaseRow): string {
  if (c.is_company_case) return normalizeCompany(c.client_name || 'Company')
  return isMactOrWc(c.court_code) ? 'Private MACT' : 'Private'
}

// One date sub-group per hearing date. City is handled one level up now —
// each city gets its own card instead of being buried inside a bucket's
// card, since a satellite city like Dungarpur usually has few enough
// cases to fit cleanly in one small list on its own.
function BucketList({ cases }: { cases: CaseRow[] }) {
  const byDate: Record<string, CaseRow[]> = {}
  for (const c of cases) {
    if (!byDate[c.hearing_date]) byDate[c.hearing_date] = []
    byDate[c.hearing_date].push(c)
  }
  const dates = Object.keys(byDate).sort()

  // Plain mb-* margins here, not space-y-* — Tailwind's space-y utility
  // uses margin-block (a logical property tied to :not(:last-child)) and
  // that combination is what was making Chrome's print/PDF export defer
  // an entire card to the next page instead of starting it where it
  // actually fit.
  return (
    <div>
      {dates.map((date) => (
        <div key={date} className="mb-3 print:mb-1.5 last:mb-0">
          <div className="text-sm font-bold text-gray-700 underline underline-offset-2 mb-1.5 print:text-[11px] print:mb-1 print:break-after-avoid">
            {fmtDate(date)}
          </div>
          <ol>
            {byDate[date].map((c) => (
              <li key={c.id} className="text-sm text-gray-800 leading-5 mb-1 print:text-[11px] print:leading-snug print:mb-0.5 print:break-inside-avoid">
                {c.case_number && (
                  <span className="font-mono text-gray-500">{shortCaseNumber(c)} </span>
                )}
                <span>{c.party_plaintiff} <span className="text-gray-400">vs</span> {c.party_defendant}</span>
                <span className="text-gray-400"> [{courtShortFor(c)}]</span>
                {c.case_stage && <span className="text-gray-400"> ({c.case_stage})</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

// Sort order for bucket titles: Private, Private MACT, then every company A→Z.
function bucketSortKey(name: string): string {
  if (name === 'Private') return '0'
  if (name === 'Private MACT') return '1'
  return `2${name.toLowerCase()}`
}

// Udaipur (head office) first, then Dungarpur, then everywhere else A→Z —
// so cases from the same city always print together.
function citySortKey(city: string): string {
  if (city === 'Udaipur') return '0'
  if (city === 'Dungarpur') return '1'
  return `2${city.toLowerCase()}`
}

export default function FileListPage() {
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(today())
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => { setIsMounted(true) }, [])

  async function fetchFiles() {
    if (!fromDate || !toDate) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: adv } = await supabase
      .from('advocates').select('id').eq('user_id', user.id).limit(1).single()
    if (!adv) { setLoading(false); return }

    // Get hearings in date range
    const { data: hearings } = await supabase
      .from('hearings')
      .select('case_id, hearing_date')
      .gte('hearing_date', fromDate)
      .lte('hearing_date', toDate)
      .order('hearing_date', { ascending: true })

    if (!hearings || hearings.length === 0) {
      setCases([]); setSearched(true); setLoading(false); return
    }

    const caseIds = [...new Set(hearings.map((h: { case_id: string }) => h.case_id))]
    const { data: casesData } = await supabase
      .from('cases')
      .select('id, court_code, court_name, case_number, case_year, party_plaintiff, party_defendant, client_name, is_company_case, case_stage, city')
      .in('id', caseIds)
      .eq('advocate_id', adv.id)

    if (!casesData) { setCases([]); setSearched(true); setLoading(false); return }

    // Attach hearing_date to each case (earliest in range)
    const caseHearingDate: Record<string, string> = {}
    for (const h of hearings as { case_id: string; hearing_date: string }[]) {
      if (!caseHearingDate[h.case_id]) caseHearingDate[h.case_id] = h.hearing_date
    }

    const result: CaseRow[] = casesData.map((c) => ({
      ...(c as unknown as CaseRow),
      hearing_date: caseHearingDate[c.id] || fromDate,
    }))

    setCases(result)
    setSearched(true)
    setLoading(false)
  }

  // Group everything by city first, then by bucket within that city — so
  // when printed, one city's cards all sit together in reading order. No
  // forced page break between cities: a city with only a couple of files
  // just shares the page with the next one instead of wasting a whole
  // sheet on it.
  const byCity: Record<string, CaseRow[]> = {}
  for (const c of cases) {
    const city = cityFor(c)
    if (!byCity[city]) byCity[city] = []
    byCity[city].push(c)
  }
  const cityNames = Object.keys(byCity).sort((a, b) => citySortKey(a).localeCompare(citySortKey(b)))
  const multiCity = cityNames.length > 1

  function bucketsFor(rows: CaseRow[]): { name: string; rows: CaseRow[] }[] {
    const map: Record<string, CaseRow[]> = {}
    for (const c of rows) {
      const key = bucketFor(c)
      if (!map[key]) map[key] = []
      map[key].push(c)
    }
    return Object.keys(map)
      .sort((a, b) => bucketSortKey(a).localeCompare(bucketSortKey(b)))
      .map((name) => ({ name, rows: map[name] }))
  }

  // A busy bucket like "Private" can easily run to 50+ cases — printed as
  // one card, that's simply taller than a single A4 page, so there's no
  // page break "break-inside: avoid" could ever honour and it splits
  // anyway. Cut anything past a safe number of cases into extra numbered
  // cards (each still whole hearing-dates only, never splitting a date's
  // cases in half) so every single card is guaranteed to fit on one page.
  const MAX_ROWS_PER_CARD = 25
  function chunkByDate(rows: CaseRow[], maxPerChunk: number): CaseRow[][] {
    const byDate: Record<string, CaseRow[]> = {}
    for (const c of rows) {
      if (!byDate[c.hearing_date]) byDate[c.hearing_date] = []
      byDate[c.hearing_date].push(c)
    }
    const dates = Object.keys(byDate).sort()
    const chunks: CaseRow[][] = []
    let current: CaseRow[] = []
    for (const date of dates) {
      const dateRows = byDate[date]
      if (current.length > 0 && current.length + dateRows.length > maxPerChunk) {
        chunks.push(current)
        current = []
      }
      current.push(...dateRows)
    }
    if (current.length > 0) chunks.push(current)
    return chunks
  }

  // Straight 3-column newspaper flow: pour every card in one after another,
  // in city then bucket order. A big bucket like Private just fills out
  // whatever's left of column 1, then carries straight on at the top of
  // column 2 — no separate "part 2" cards, nothing held back to a whole
  // fresh page while there's still room going in this one. Individual
  // case lines and card headers still won't split mid-line (the
  // break-inside/after-avoid below); only the space between cards is
  // free to fall wherever it lands.
  const allCards: ReactNode[] = []
  for (const city of cityNames) {
    if (multiCity) {
      allCards.push(
        <div key={`city-${city}`} className="text-sm font-bold mt-3 mb-1 first:mt-0 print:text-[13px] print:mt-0 print:mb-1.5 print:break-after-avoid" style={{ color: '#1e3a5f' }}>
          {city}
        </div>
      )
    }
    for (const { name, rows } of bucketsFor(byCity[city])) {
      const chunks = chunkByDate(rows, MAX_ROWS_PER_CARD)
      chunks.forEach((chunkRows, chunkIdx) => {
        const title = chunks.length > 1 ? `${name} (${chunkIdx + 1}/${chunks.length})` : name
        allCards.push(
          <div key={`${city}::${name}::${chunkIdx}`} className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden mb-4 print:mb-[3mm] print:rounded-md print:border print:break-inside-avoid">
            <div className="px-4 py-3 border-b-2 border-gray-200 flex items-center gap-2 print:px-2 print:py-1.5 print:break-after-avoid" style={{ background: '#1e3a5f' }}>
              <span className="text-sm font-bold text-white uppercase tracking-widest print:text-[13px]">{title}</span>
              <span className="text-xs text-blue-200 print:text-[11px]">({chunkRows.length})</span>
            </div>
            <div className="p-4 print:p-2">
              <BucketList cases={chunkRows} />
            </div>
          </div>
        )
      })
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header — hidden when printing, there's a dedicated print-only
          heading further down so the title doesn't print twice and waste
          a chunk of the first page. */}
      <div className="print:hidden mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>
          File Pull List
        </h1>
        <p className="text-sm text-gray-500 mt-1">Select a date range to see which files to pull out</p>
      </div>

      {/* Date picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-4 print:hidden mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
          <input
            type="date"
            value={fromDate}
            min={today()}
            onChange={e => setFromDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={e => setToDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>
        <button
          onClick={fetchFiles}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
          style={{ background: '#1e3a5f' }}
        >
          <Search className="w-4 h-4" />
          {loading ? 'Loading...' : 'Get File List'}
        </button>
        {searched && cases.length > 0 && (
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        )}
      </div>

      {/* Results */}
      {searched && (
        <>
          {cases.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              No hearings found for selected dates
            </div>
          ) : (
            <div>

              {/* On-screen only — the print version below is a separate
                  copy rendered straight onto <body> via a portal. Chrome's
                  print/PDF export defers a multi-column block to a whole
                  fresh (blank) page if *anything* — even one hidden div —
                  precedes it in the DOM, so the print copy can't live
                  inside this page's normal layout at all; it has to be
                  the very first thing on <body>. */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 print:hidden">
                {allCards}
              </div>

              {/* Summary */}
              <div className="text-xs text-gray-400 text-right mt-4 print:hidden">
                Total: {cases.length} files across {fromDate === toDate ? '1 day' : `${fromDate} to ${toDate}`}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
