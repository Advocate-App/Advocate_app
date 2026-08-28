'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Printer } from 'lucide-react'
import { DISTRICT_STAGES, HC_STAGES, getCourtShortLabel } from '@/lib/constants/courts'
import { fetchAllRows } from '@/lib/fetchAll'

interface PendingCase {
  hearingId: string
  caseId: string
  hearingDate: string
  stageOnDate: string | null
  courtCode: string | null
  courtName: string
  courtLevel: string
  caseNumber: string
  caseYear: number | null
  plaintiff: string
  defendant: string
}

interface CustomCourtRow {
  id: string
  name: string
  short_name: string | null
  builtin_code: string | null
}

export default function PendingPage() {
  const [items, setItems] = useState<PendingCase[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [nextDate, setNextDate] = useState<Record<string, string>>({})
  const [stage, setStage] = useState<Record<string, string>>({})
  const [customCourts, setCustomCourts] = useState<CustomCourtRow[]>([])
  const [history, setHistory] = useState<Record<string, string[]>>({}) // caseId -> last 3 hearing dates, newest first
  const [me, setMe] = useState<{ id: string; name: string } | null>(null)
  const [courtFilter, setCourtFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'date' | 'court'>('date')

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: adv } = await supabase.from('advocates').select('id, full_name').eq('user_id', user.id).limit(1).single()
    if (!adv) return
    setMe({ id: adv.id, name: adv.full_name })

    const { data: cc } = await supabase.from('custom_courts').select('id, name, short_name, builtin_code')
    setCustomCourts((cc as CustomCourtRow[]) || [])

    // All past/today hearings with no next date set
    const data = await fetchAllRows<any>((from, to) =>
      supabase
        .from('hearings')
        .select('id, hearing_date, stage_on_date, case_id, cases(court_code, court_name, court_level, case_number, case_year, party_plaintiff, party_defendant, advocate_id, status)')
        .lte('hearing_date', today)
        .is('next_hearing_date', null)
        .order('hearing_date', { ascending: false })
        .range(from, to)
    )

    // Keep only advocate's active cases; deduplicate to most recent hearing per case
    const seen = new Set<string>()
    let rows: PendingCase[] = []
    for (const h of data) {
      if (!h.cases || h.cases.advocate_id !== adv.id) continue
      if (h.cases.status === 'disposed') continue
      if (seen.has(h.case_id)) continue
      seen.add(h.case_id)
      rows.push({
        hearingId: h.id,
        caseId: h.case_id,
        hearingDate: h.hearing_date,
        stageOnDate: h.stage_on_date,
        courtCode: h.cases.court_code,
        courtName: h.cases.court_name,
        courtLevel: h.cases.court_level,
        caseNumber: h.cases.case_number,
        caseYear: h.cases.case_year,
        plaintiff: h.cases.party_plaintiff,
        defendant: h.cases.party_defendant,
      })
    }

    // A case can end up with a stray old hearing row whose own
    // next_hearing_date was never linked, even though a genuinely later
    // hearing already exists for it (e.g. added a fresh hearing instead
    // of using "give next date" on the old one). Those aren't actually
    // pending — drop any case that already has a hearing dated after
    // today, regardless of whether that specific old row points to it.
    if (rows.length > 0) {
      const futureHearings = await fetchAllRows<{ case_id: string }>((from, to) =>
        supabase
          .from('hearings')
          .select('case_id')
          .in('case_id', rows.map((r) => r.caseId))
          .gt('hearing_date', today)
          .range(from, to)
      )
      const hasFuture = new Set(futureHearings.map((f) => f.case_id))
      rows = rows.filter((r) => !hasFuture.has(r.caseId))
    }

    setItems(rows)

    // Last 3 hearing dates per case, so it's easier to recognize the case
    // and judge what date to give next
    if (rows.length > 0) {
      const hist = await fetchAllRows<{ case_id: string; hearing_date: string }>((from, to) =>
        supabase
          .from('hearings')
          .select('case_id, hearing_date')
          .in('case_id', rows.map(r => r.caseId))
          .order('hearing_date', { ascending: false })
          .range(from, to)
      )

      const byCase: Record<string, string[]> = {}
      for (const h of hist) {
        if (!byCase[h.case_id]) byCase[h.case_id] = []
        if (byCase[h.case_id].length < 3) byCase[h.case_id].push(h.hearing_date)
      }
      setHistory(byCase)
    }

    setLoading(false)
  }

  async function saveRow(item: PendingCase) {
    const nd = nextDate[item.hearingId]
    const sg = stage[item.hearingId]
    const wrappedUp = sg === 'Ordered/Disposed'
    // A wrapped-up case still needs a date — just the order/disposal date,
    // not a next hearing date. Everything else needs a real next date,
    // that's what "pending" is asking for.
    if (!nd) return
    setSavingId(item.hearingId)
    const supabase = createClient()

    // Update this hearing: set next_hearing_date (or leave it, for a
    // wrapped-up case) + the stage
    await supabase.from('hearings').update({
      ...(wrappedUp ? {} : { next_hearing_date: nd }),
      ...(sg !== undefined ? { stage_on_date: sg || null } : {}),
      set_by_advocate_id: me?.id || null,
      set_by_name: me?.name || null,
      happened: true,
    }).eq('id', item.hearingId)

    if (!wrappedUp) {
      // Check if a hearing already exists for that next date
      const { data: existing } = await supabase
        .from('hearings').select('id').eq('case_id', item.caseId).eq('hearing_date', nd).limit(1)
      if (!existing || existing.length === 0) {
        await supabase.from('hearings').insert({
          case_id: item.caseId,
          hearing_date: nd,
          previous_hearing_date: item.hearingDate,
          appearing_advocate_name: 'self',
          happened: false,
          set_by_advocate_id: me?.id || null,
          set_by_name: me?.name || null,
        })
      }
    }

    // Ordered/Disposed marks the case non-active automatically, with the
    // date entered above saved as the actual order/disposal date — that's
    // what actually takes it off this list (and everywhere else), instead
    // of a separate "Disposed" button.
    if (wrappedUp) {
      await supabase.from('cases').update({ status: 'disposed', case_stage: sg, disposal_date: nd }).eq('id', item.caseId)
    }

    // Remove from list
    setItems(prev => prev.filter(r => r.hearingId !== item.hearingId))
    setNextDate(p => { const n = { ...p }; delete n[item.hearingId]; return n })
    setStage(p => { const n = { ...p }; delete n[item.hearingId]; return n })
    setSavingId(null)
  }

  const courtLabel = (c: PendingCase) => {
    const code = c.courtCode || ''
    const override = customCourts.find((cc) => (cc.builtin_code || `CUSTOM_${cc.id}`) === code)
    if (override) return override.short_name || override.name
    const s = getCourtShortLabel(code)
    return s !== code ? s : c.courtName
  }

  // Every court that actually shows up, for the filter dropdown.
  const courtNames = Array.from(new Set(items.map((i) => courtLabel(i)))).sort((a, b) => a.localeCompare(b))

  const filtered = courtFilter === 'all' ? items : items.filter((i) => courtLabel(i) === courtFilter)

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'court') {
      const c = courtLabel(a).localeCompare(courtLabel(b))
      return c !== 0 ? c : a.hearingDate.localeCompare(b.hearingDate)
    }
    return a.hearingDate.localeCompare(b.hearingDate)
  })

  // Print always groups by court regardless of the on-screen sort — that's
  // what's actually useful for carrying to court, so you can work through
  // one court's whole stack before moving to the next.
  const printGroups: { court: string; rows: PendingCase[] }[] = []
  for (const court of courtNames) {
    const rows = filtered.filter((i) => courtLabel(i) === court).sort((a, b) => a.hearingDate.localeCompare(b.hearingDate))
    if (rows.length > 0) printGroups.push({ court, rows })
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Pending Cases</h1>
            {!loading && items.length > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full text-sm font-bold text-white"
                style={{ background: '#1e3a5f' }}
              >
                {items.length}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {!loading && items.length > 0
              ? `${items.length} case${items.length !== 1 ? 's' : ''} pending${courtFilter !== 'all' ? ` · ${filtered.length} shown for ${courtFilter}` : ''} — give each a next date, or set its stage to Ordered/Disposed.`
              : 'Cases where a hearing has passed but no next date is set. Give each a next date, or set its stage to Ordered/Disposed.'}
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={courtFilter}
              onChange={(e) => setCourtFilter(e.target.value)}
              className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
            >
              <option value="all">All Courts</option>
              {courtNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'court')}
              className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
            >
              <option value="date">Sort: Date-wise</option>
              <option value="court">Sort: Court-wise</option>
            </select>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        )}
      </div>

      {/* Print-only view — always grouped by court (see printGroups above),
          each case showing up to 3 previous dates so you can recognize it
          and gauge how long it's been pending, at a glance in court. */}
      {items.length > 0 && (
        <div className="hidden print:block">
          <div className="text-center mb-4">
            <div className="font-bold text-base">Pending Cases</div>
            <div className="text-xs text-gray-600">{format(new Date(), 'd MMMM yyyy')}</div>
          </div>
          {printGroups.map((g) => (
            <div key={g.court} className="mb-4 break-inside-avoid">
              <div className="text-sm font-bold uppercase tracking-wide mb-1.5 px-2 py-1 text-white" style={{ background: '#1e3a5f' }}>
                {g.court} <span className="font-normal opacity-75">({g.rows.length})</span>
              </div>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {g.rows.map((item, i) => (
                    <tr key={item.hearingId} className={i > 0 ? 'border-t border-gray-200' : ''}>
                      <td className="py-1 pr-2 font-mono align-top whitespace-nowrap">
                        {item.caseNumber}{item.caseYear ? `/${item.caseYear}` : ''}
                      </td>
                      <td className="py-1 pr-2 align-top">
                        {item.plaintiff} <span className="text-gray-400">vs</span> {item.defendant}
                        {item.stageOnDate && <span className="text-gray-400"> ({item.stageOnDate})</span>}
                      </td>
                      <td className="py-1 align-top whitespace-nowrap text-gray-500">
                        {(history[item.caseId] || [item.hearingDate]).map((d) => format(new Date(d), 'd MMM yy')).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400 print:hidden">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center print:hidden">
          <p className="text-sm text-gray-400">All cases are up to date.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center print:hidden">
          <p className="text-sm text-gray-400">No pending cases for that court.</p>
        </div>
      ) : (
        <>
        {/* Mobile cards */}
        <div className="md:hidden space-y-3 print:hidden">
          {sorted.map((item) => {
            const stages = item.courtLevel === 'high_court' ? HC_STAGES : DISTRICT_STAGES
            const nd = nextDate[item.hearingId] || ''
            const sg = stage[item.hearingId] !== undefined ? stage[item.hearingId] : (item.stageOnDate || '')
            return (
              <div key={item.hearingId} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-sm font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                    {courtLabel(item)}
                  </span>
                  <span className="font-mono text-sm text-gray-600">
                    {item.caseNumber}{item.caseYear ? `/${item.caseYear}` : ''}
                  </span>
                </div>
                <p className="text-base text-gray-800 mb-2">
                  {item.plaintiff} <span className="text-gray-400">vs</span> {item.defendant}
                </p>
                <div className="text-xs text-gray-400 mb-3">
                  {(history[item.caseId] || [item.hearingDate]).map((d, i) => (
                    <div key={d}>{i === 0 ? 'Last heard: ' : ''}{format(new Date(d), 'd MMM yy')}</div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Stage</label>
                    <select
                      value={sg}
                      onChange={e => setStage(p => ({ ...p, [item.hearingId]: e.target.value }))}
                      className="w-full px-2.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
                      style={{ minHeight: '44px' }}
                    >
                      <option value="">Stage…</option>
                      {stages.filter(s => s !== 'Custom...').map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {sg === 'Ordered/Disposed' ? 'Order/Disposal Date *' : 'Next Date *'}
                    </label>
                    <input
                      type="date"
                      value={nd}
                      onChange={e => setNextDate(p => ({ ...p, [item.hearingId]: e.target.value }))}
                      className="w-full px-2.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
                      style={{ minHeight: '44px' }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => saveRow(item)}
                  disabled={!nd || savingId === item.hearingId}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white bg-[#1e3a5f] hover:opacity-90 disabled:opacity-30"
                  style={{ minHeight: '44px' }}
                >
                  {savingId === item.hearingId ? '…' : sg === 'Ordered/Disposed' ? 'Mark Ordered/Disposed' : 'Set Date'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Table (desktop) */}
        <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden print:hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: '#f5f5f0' }}>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-20">Court</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-24">Case No.</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Parties</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-28">Previous Dates</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-36">Stage</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-32">Next / Order Date *</th>
                <th className="px-3 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => {
                const stages = item.courtLevel === 'high_court' ? HC_STAGES : DISTRICT_STAGES
                const nd = nextDate[item.hearingId] || ''
                const sg = stage[item.hearingId] !== undefined ? stage[item.hearingId] : (item.stageOnDate || '')

                return (
                  <tr key={item.hearingId} className={`${i > 0 ? 'border-t border-gray-100' : ''} hover:bg-gray-50/40`}>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                        {courtLabel(item)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">
                      {item.caseNumber}{item.caseYear ? `/${item.caseYear}` : ''}
                    </td>
                    <td className="px-3 py-2.5 text-gray-800 max-w-[180px]">
                      <div className="truncate">{item.plaintiff}</div>
                      <div className="truncate text-xs text-gray-400">vs {item.defendant}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 font-mono leading-relaxed">
                      {(history[item.caseId] || [item.hearingDate]).map((d) => (
                        <div key={d}>{format(new Date(d), 'd MMM yy')}</div>
                      ))}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={sg}
                        onChange={e => setStage(p => ({ ...p, [item.hearingId]: e.target.value }))}
                        className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
                      >
                        <option value="">Stage…</option>
                        {stages.filter(s => s !== 'Custom...').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="date"
                        value={nd}
                        title={sg === 'Ordered/Disposed' ? 'Order/Disposal date' : 'Next hearing date'}
                        onChange={e => setNextDate(p => ({ ...p, [item.hearingId]: e.target.value }))}
                        className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => saveRow(item)}
                          disabled={!nd || savingId === item.hearingId}
                          className="px-2.5 py-1 rounded text-xs font-medium text-white bg-[#1e3a5f] hover:opacity-90 disabled:opacity-30"
                        >
                          {savingId === item.hearingId ? '…' : sg === 'Ordered/Disposed' ? 'Mark Ordered/Disposed' : 'Set Date'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
