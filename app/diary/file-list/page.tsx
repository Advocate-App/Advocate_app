'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { Printer, Search } from 'lucide-react'
import { DISTRICT_COURTS, getCourtShortLabel } from '@/lib/constants/courts'

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

// Prefer the case's own saved city; fall back to the court's district for
// older cases that don't have one, and finally the High Court bench.
const DISTRICT_BY_CODE = new Map(DISTRICT_COURTS.map((c) => [c.code, c.district]))
const HC_BENCH_CITY: Record<string, string> = { jodhpur: 'Jodhpur', jaipur: 'Jaipur' }
function cityFor(c: CaseRow): string {
  if (c.city?.trim()) return c.city.trim()
  return DISTRICT_BY_CODE.get(c.court_code) || HC_BENCH_CITY[c.court_code] || 'Other'
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

// One section per bucket, then one city sub-group, then one date sub-group
// per hearing date within that city.
function BucketList({ cases }: { cases: CaseRow[] }) {
  const byCity: Record<string, CaseRow[]> = {}
  for (const c of cases) {
    const city = cityFor(c)
    if (!byCity[city]) byCity[city] = []
    byCity[city].push(c)
  }
  const cities = Object.keys(byCity).sort((a, b) => a.localeCompare(b))
  const singleCity = cities.length === 1

  return (
    <div className="space-y-4">
      {cities.map((city) => {
        const byDate: Record<string, CaseRow[]> = {}
        for (const c of byCity[city]) {
          if (!byDate[c.hearing_date]) byDate[c.hearing_date] = []
          byDate[c.hearing_date].push(c)
        }
        const dates = Object.keys(byDate).sort()

        return (
          <div key={city}>
            {/* Only show the city heading when there's more than one — no
                point labelling it when everything in this bucket is from
                the same place. */}
            {!singleCity && (
              <div className="text-xs font-bold text-white uppercase tracking-wide mb-2 px-2 py-1 rounded inline-block" style={{ background: '#7c8a9a' }}>
                {city}
              </div>
            )}
            <div className="space-y-3">
              {dates.map((date) => (
                <div key={date}>
                  <div className="text-sm font-bold text-gray-700 underline underline-offset-2 mb-1.5">
                    {fmtDate(date)}
                  </div>
                  <ol className="space-y-1">
                    {byDate[date].map((c) => (
                      <li key={c.id} className="text-sm text-gray-800 leading-5">
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
          </div>
        )
      })}
    </div>
  )
}

// Sort order for bucket titles: Private, Private MACT, then every company A→Z.
function bucketSortKey(name: string): string {
  if (name === 'Private') return '0'
  if (name === 'Private MACT') return '1'
  return `2${name.toLowerCase()}`
}

export default function FileListPage() {
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(today())
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

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

  // Group everything into buckets: Private / Private MACT / each company
  const buckets: Record<string, CaseRow[]> = {}
  for (const c of cases) {
    const key = bucketFor(c)
    if (!buckets[key]) buckets[key] = []
    buckets[key].push(c)
  }
  const bucketNames = Object.keys(buckets).sort((a, b) => bucketSortKey(a).localeCompare(bucketSortKey(b)))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>
          File Pull List
        </h1>
        <p className="text-sm text-gray-500 mt-1">Select a date range to see which files to pull out</p>
      </div>

      {/* Date picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-4 print:hidden">
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
            <div className="space-y-4 print:space-y-3">

              {/* Print header */}
              <div className="hidden print:block text-center mb-4">
                <div className="font-bold text-base">File Pull List</div>
                <div className="text-xs text-gray-600">
                  {fromDate === toDate ? fmtDate(fromDate) : `${fmtDate(fromDate)} – ${fmtDate(toDate)}`}
                </div>
              </div>

              {/* One section per bucket: Private, Private MACT, each company */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-2">
                {bucketNames.map((name) => (
                  <div key={name} className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden self-start">
                    <div className="px-4 py-3 border-b-2 border-gray-200 flex items-center gap-2" style={{ background: '#1e3a5f' }}>
                      <span className="text-sm font-bold text-white uppercase tracking-widest">{name}</span>
                      <span className="text-xs text-blue-200">({buckets[name].length})</span>
                    </div>
                    <div className="p-4">
                      <BucketList cases={buckets[name]} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="text-xs text-gray-400 text-right print:hidden">
                Total: {cases.length} files across {fromDate === toDate ? '1 day' : `${fromDate} to ${toDate}`}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
