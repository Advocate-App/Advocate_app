'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { formatCaseNumber, getCourtShortLabel } from '@/lib/constants/courts'
import { Printer, Search } from 'lucide-react'

interface CaseRow {
  id: string
  court_code: string
  court_name: string
  case_number: string
  case_year: number | null
  party_plaintiff: string
  party_defendant: string
  client_name: string | null
  hearing_date: string
}

// Court code group classification
const MACT_LC_WC = (c: string) =>
  c.startsWith('MACT') || c.startsWith('LC') || c.startsWith('WC')

const DCF_STATECOMM = (c: string) =>
  c.startsWith('DCF') || c === 'STATE_COMM'

const NI = (c: string) =>
  c.startsWith('NI')

const CIVIL_CRIMINAL = (c: string) =>
  c.startsWith('CJM') || c.startsWith('ACJM') || c.startsWith('DJ') ||
  c.startsWith('ADJ') || c === 'GRAM_NAYALAY' || c.startsWith('PCPNDT') ||
  c.startsWith('SESS') || c.startsWith('PLA') || c.startsWith('SAMB')

const PRIVATE_LABELS = new Set(['private', 'personal', 'nil', 'n/a', 'none', '-', ''])
const isPersonal = (row: CaseRow) =>
  !row.client_name || PRIVATE_LABELS.has(row.client_name.trim().toLowerCase())

function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

function fmtDate(d: string) {
  try { return format(parseISO(d), 'dd/MM/yy') } catch { return d }
}

const CITY_ORDER = ['Udaipur', 'Dungarpur', 'Banswara', 'Rajsamand', 'Nathdwara', 'Other']
const CITY_COLORS: Record<string, string> = {
  Udaipur: 'text-blue-700',
  Dungarpur: 'text-emerald-700',
  Banswara: 'text-orange-700',
  Rajsamand: 'text-purple-700',
  Nathdwara: 'text-rose-700',
  Other: 'text-gray-600',
}

function getCity(code: string): string {
  const c = code.toUpperCase()
  if (c.includes('_DGP') || c.includes('_DPR') || c.includes('_DNP')) return 'Dungarpur'
  if (c.includes('_BSW') || c.includes('_BNS') || c.includes('_BNW')) return 'Banswara'
  if (c.includes('_RJM') || c.includes('_RSM') || c.includes('_RAJ')) return 'Rajsamand'
  if (c.includes('_NDW') || c.includes('_NTH') || c.includes('_NAT')) return 'Nathdwara'
  if (c.includes('_UDR') || c.includes('_UDJ') || c.includes('_UDB')) return 'Udaipur'
  // fallback: if no suffix matches, assume Udaipur for common codes
  if (c.startsWith('MACT') || c.startsWith('DCF') || c.startsWith('NI') ||
      c.startsWith('CJM') || c.startsWith('ACJM') || c.startsWith('DJ') ||
      c.startsWith('ADJ') || c.startsWith('LC') || c.startsWith('WC') ||
      c.startsWith('SESS') || c.startsWith('PLA') || c === 'GRAM_NAYALAY' ||
      c === 'STATE_COMM') return 'Udaipur'
  return 'Other'
}

function CaseList({ cases, showDate }: { cases: CaseRow[]; showDate?: boolean }) {
  if (cases.length === 0) return <p className="text-xs text-gray-400 italic pl-2">None</p>

  // Group by city
  const byCity: Record<string, CaseRow[]> = {}
  for (const c of cases) {
    const city = getCity(c.court_code)
    if (!byCity[city]) byCity[city] = []
    byCity[city].push(c)
  }
  const cities = CITY_ORDER.filter(city => byCity[city]?.length > 0)

  if (cities.length === 1) {
    // All same city — no sub-header needed
    return (
      <ol className="space-y-0.5">
        {cases.map((c, i) => (
          <li key={c.id} className="flex items-baseline gap-1.5 text-xs text-gray-800 leading-5">
            <span className="text-gray-400 w-5 flex-shrink-0 text-right">{i + 1}.</span>
            <span className="font-semibold text-gray-600 flex-shrink-0">{getCourtShortLabel(c.court_code)}</span>
            <span className="text-gray-400">–</span>
            <span className="font-mono text-gray-700">{formatCaseNumber(c.case_number, c.case_year)}</span>
            <span className="text-gray-400">–</span>
            <span>{c.party_plaintiff} / {c.party_defendant}</span>
            {showDate && <span className="text-gray-400 flex-shrink-0 ml-1">({fmtDate(c.hearing_date)})</span>}
          </li>
        ))}
      </ol>
    )
  }

  // Multiple cities — show city sub-headers
  let globalIdx = 1
  return (
    <div className="space-y-2">
      {cities.map(city => (
        <div key={city}>
          <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${CITY_COLORS[city]}`}>
            — {city} —
          </div>
          <ol className="space-y-0.5">
            {byCity[city].map((c) => {
              const idx = globalIdx++
              return (
                <li key={c.id} className="flex items-baseline gap-1.5 text-xs text-gray-800 leading-5">
                  <span className="text-gray-400 w-5 flex-shrink-0 text-right">{idx}.</span>
                  <span className="font-semibold text-gray-600 flex-shrink-0">{getCourtShortLabel(c.court_code)}</span>
                  <span className="text-gray-400">–</span>
                  <span className="font-mono text-gray-700">{formatCaseNumber(c.case_number, c.case_year)}</span>
                  <span className="text-gray-400">–</span>
                  <span>{c.party_plaintiff} / {c.party_defendant}</span>
                  {showDate && <span className="text-gray-400 flex-shrink-0 ml-1">({fmtDate(c.hearing_date)})</span>}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
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
      .select('id, court_code, court_name, case_number, case_year, party_plaintiff, party_defendant, client_name')
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

  const byDate = (a: CaseRow, b: CaseRow) => a.hearing_date.localeCompare(b.hearing_date)

  function normalizeCompany(name: string): string {
    const n = name.trim().toLowerCase()
    if (n.includes('icici')) return 'ICICI'
    if (n.includes('hdfc')) return 'HDFC'
    if (n.includes('sbi') || n.includes('state bank')) return 'SBI'
    if (n.includes('bajaj')) return 'Bajaj'
    if (n.includes('tata')) return 'Tata'
    if (n.includes('new india')) return 'New India Assurance'
    if (n.includes('national insurance')) return 'National Insurance'
    if (n.includes('oriental')) return 'Oriental Insurance'
    if (n.includes('united india')) return 'United India Insurance'
    if (n.includes('universal sompo') || n.includes('sompo')) return 'Universal Sompo'
    if (n.includes('reliance')) return 'Reliance'
    if (n.includes('cholamandalam') || n.includes('chola')) return 'Cholamandalam'
    if (n.includes('royal sundaram')) return 'Royal Sundaram'
    if (n.includes('future generali')) return 'Future Generali'
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

  // Group by city first, then by case type within each city
  const cityCases: Record<string, CaseRow[]> = {}
  for (const c of cases.slice().sort(byDate)) {
    const city = getCity(c.court_code)
    if (!cityCases[city]) cityCases[city] = []
    cityCases[city].push(c)
  }
  const activeCities = CITY_ORDER.filter(city => cityCases[city]?.length > 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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

              {/* One section per city */}
              {activeCities.map(city => {
                const cityCaseList = cityCases[city]
                const personal = cityCaseList.filter(isPersonal)
                const company = cityCaseList.filter(c => !isPersonal(c))

                const g1 = personal.filter(c => MACT_LC_WC(c.court_code))
                const g2 = personal.filter(c => DCF_STATECOMM(c.court_code))
                const g3 = personal.filter(c => NI(c.court_code))
                const g4 = personal.filter(c => CIVIL_CRIMINAL(c.court_code))
                const g4Other = personal.filter(c =>
                  !MACT_LC_WC(c.court_code) && !DCF_STATECOMM(c.court_code) &&
                  !NI(c.court_code) && !CIVIL_CRIMINAL(c.court_code)
                )

                const companyGroups: Record<string, CaseRow[]> = {}
                for (const c of company) {
                  const key = normalizeCompany(c.client_name || 'Other')
                  if (!companyGroups[key]) companyGroups[key] = []
                  companyGroups[key].push(c)
                }
                const companyNames = Object.keys(companyGroups).sort()

                const cityColor = CITY_COLORS[city] || 'text-gray-700'

                return (
                  <div key={city} className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
                    {/* City header */}
                    <div className="px-4 py-3 border-b-2 border-gray-200 flex items-center gap-2" style={{ background: '#1e3a5f' }}>
                      <span className="text-sm font-bold text-white uppercase tracking-widest">{city}</span>
                      <span className="text-xs text-blue-200">({cityCaseList.length} files)</span>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {g1.length > 0 && (
                        <div>
                          <div className="px-4 py-2 border-b border-gray-100" style={{ background: '#dbeafe' }}>
                            <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">MACT / LC / WC</span>
                            <span className="ml-2 text-xs text-blue-600">({g1.length})</span>
                          </div>
                          <div className="px-4 py-3"><CaseList cases={g1} showDate={true} /></div>
                        </div>
                      )}

                      {g2.length > 0 && (
                        <div>
                          <div className="px-4 py-2 border-b border-gray-100" style={{ background: '#dcfce7' }}>
                            <span className="text-xs font-bold text-green-800 uppercase tracking-wide">DCF / State Commission</span>
                            <span className="ml-2 text-xs text-green-600">({g2.length})</span>
                          </div>
                          <div className="px-4 py-3"><CaseList cases={g2} showDate={true} /></div>
                        </div>
                      )}

                      {g3.length > 0 && (
                        <div>
                          <div className="px-4 py-2 border-b border-gray-100" style={{ background: '#fef9c3' }}>
                            <span className="text-xs font-bold text-yellow-800 uppercase tracking-wide">NI Cases</span>
                            <span className="ml-2 text-xs text-yellow-600">({g3.length})</span>
                          </div>
                          <div className="px-4 py-3"><CaseList cases={g3} showDate={true} /></div>
                        </div>
                      )}

                      {(g4.length > 0 || g4Other.length > 0) && (
                        <div>
                          <div className="px-4 py-2 border-b border-gray-100" style={{ background: '#f3f4f6' }}>
                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Civil / Criminal</span>
                            <span className="ml-2 text-xs text-gray-500">({g4.length + g4Other.length})</span>
                          </div>
                          <div className="px-4 py-3"><CaseList cases={[...g4, ...g4Other]} showDate={true} /></div>
                        </div>
                      )}

                      {companyNames.length > 0 && (
                        <div>
                          <div className="px-4 py-2 border-b border-gray-100" style={{ background: '#ede9fe' }}>
                            <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">Company Bundle</span>
                            <span className="ml-2 text-xs text-purple-600">({company.length} files, {companyNames.length} cos)</span>
                          </div>
                          <div className="divide-y divide-gray-50">
                            {companyNames.map(name => (
                              <div key={name} className="px-4 py-3">
                                <div className="text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                                  {name}
                                  <span className="font-normal text-gray-400 ml-1">({companyGroups[name].length})</span>
                                </div>
                                <CaseList cases={companyGroups[name]} showDate={true} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

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
