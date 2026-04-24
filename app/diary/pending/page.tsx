'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { DISTRICT_STAGES, HC_STAGES, getCourtShortLabel } from '@/lib/constants/courts'

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

export default function PendingPage() {
  const [items, setItems] = useState<PendingCase[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [nextDate, setNextDate] = useState<Record<string, string>>({})
  const [stage, setStage] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: adv } = await supabase.from('advocates').select('id').eq('user_id', user.id).limit(1).single()
    if (!adv) return

    // All past/today hearings with no next date set
    const { data } = await supabase
      .from('hearings')
      .select('id, hearing_date, stage_on_date, case_id, cases(court_code, court_name, court_level, case_number, case_year, party_plaintiff, party_defendant, advocate_id, status)')
      .lte('hearing_date', today)
      .is('next_hearing_date', null)
      .order('hearing_date', { ascending: false })

    if (!data) { setLoading(false); return }

    // Keep only advocate's active cases; deduplicate to most recent hearing per case
    const seen = new Set<string>()
    const rows: PendingCase[] = []
    for (const h of data as any[]) {
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

    setItems(rows)
    setLoading(false)
  }

  async function saveRow(item: PendingCase) {
    const nd = nextDate[item.hearingId]
    const sg = stage[item.hearingId]
    if (!nd) return
    setSavingId(item.hearingId)
    const supabase = createClient()

    // Update this hearing: set next_hearing_date + optional stage
    await supabase.from('hearings').update({
      next_hearing_date: nd,
      ...(sg !== undefined ? { stage_on_date: sg || null } : {}),
    }).eq('id', item.hearingId)

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
      })
    }

    // Remove from list
    setItems(prev => prev.filter(r => r.hearingId !== item.hearingId))
    setNextDate(p => { const n = { ...p }; delete n[item.hearingId]; return n })
    setStage(p => { const n = { ...p }; delete n[item.hearingId]; return n })
    setSavingId(null)
  }

  async function markDisposed(item: PendingCase) {
    setSavingId(item.hearingId)
    const supabase = createClient()
    await supabase.from('cases').update({ status: 'disposed' }).eq('id', item.caseId)
    setItems(prev => prev.filter(r => r.hearingId !== item.hearingId))
    setSavingId(null)
  }

  const courtLabel = (c: PendingCase) => {
    const s = getCourtShortLabel(c.courtCode || '')
    return s !== (c.courtCode || '') ? s : c.courtName
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Pending Cases</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Cases where a hearing has passed but no next date is set. Give each a next date or mark disposed.
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">All cases are up to date.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: '#f5f5f0' }}>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-20">Court</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-24">Case No.</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Parties</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-28">Last Heard</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-36">Stage</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-32">Next Date *</th>
                <th className="px-3 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
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
                    <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">
                      {format(new Date(item.hearingDate), 'd MMM yy')}
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
                        onChange={e => setNextDate(p => ({ ...p, [item.hearingId]: e.target.value }))}
                        className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => saveRow(item)}
                          disabled={!nd || savingId === item.hearingId}
                          className="px-2.5 py-1 rounded text-xs font-medium text-white bg-[#1e3a5f] hover:opacity-90 disabled:opacity-30"
                        >
                          {savingId === item.hearingId ? '…' : 'Set Date'}
                        </button>
                        <button
                          onClick={() => markDisposed(item)}
                          disabled={savingId === item.hearingId}
                          className="px-2.5 py-1 rounded text-xs font-medium text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30"
                        >
                          Disposed
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
