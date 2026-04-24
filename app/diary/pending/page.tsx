'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO, isToday, isTomorrow } from 'date-fns'
import { Check, ChevronDown } from 'lucide-react'
import { DISTRICT_STAGES, HC_STAGES, getCourtShortLabel } from '@/lib/constants/courts'

interface PendingHearing {
  id: string
  hearing_date: string
  stage_on_date: string | null
  next_hearing_date: string | null
  case_id: string
  court_code: string | null
  court_name: string
  court_level: string
  case_number: string
  case_year: number | null
  party_plaintiff: string
  party_defendant: string
}

function dateLabel(d: string) {
  const dt = parseISO(d)
  if (isToday(dt)) return 'Today'
  if (isTomorrow(dt)) return 'Tomorrow'
  return format(dt, 'EEE, d MMM yyyy')
}

export default function PendingPage() {
  const [hearings, setHearings] = useState<PendingHearing[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editDate, setEditDate] = useState<Record<string, string>>({})
  const [editStage, setEditStage] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: adv } = await supabase.from('advocates').select('id').eq('user_id', user.id).limit(1).single()
      if (!adv) return

      const { data } = await supabase
        .from('hearings')
        .select('id, hearing_date, stage_on_date, next_hearing_date, case_id, cases(court_code, court_name, court_level, case_number, case_year, party_plaintiff, party_defendant, advocate_id)')
        .gte('hearing_date', today)
        .order('hearing_date', { ascending: true })
        .order('created_at', { ascending: true })

      if (!data) { setLoading(false); return }

      const rows: PendingHearing[] = data
        .filter((h: any) => h.cases && h.cases.advocate_id === adv.id)
        .map((h: any) => ({
          id: h.id,
          hearing_date: h.hearing_date,
          stage_on_date: h.stage_on_date,
          next_hearing_date: h.next_hearing_date,
          case_id: h.case_id,
          court_code: h.cases.court_code,
          court_name: h.cases.court_name,
          court_level: h.cases.court_level,
          case_number: h.cases.case_number,
          case_year: h.cases.case_year,
          party_plaintiff: h.cases.party_plaintiff,
          party_defendant: h.cases.party_defendant,
        }))

      setHearings(rows)
      setLoading(false)
    }
    load()
  }, [])

  async function saveRow(h: PendingHearing) {
    setSaving(h.id)
    const supabase = createClient()
    const updates: Record<string, string | null> = {}
    const newDate = editDate[h.id]
    const newStage = editStage[h.id]
    if (newDate && newDate !== h.hearing_date) updates.hearing_date = newDate
    if (newStage !== undefined && newStage !== (h.stage_on_date || '')) updates.stage_on_date = newStage || null
    if (Object.keys(updates).length > 0) {
      await supabase.from('hearings').update(updates).eq('id', h.id)
      setHearings(prev => prev.map(r => r.id === h.id ? { ...r, ...updates } : r).sort((a, b) => a.hearing_date.localeCompare(b.hearing_date)))
    }
    setEditDate(p => { const n = { ...p }; delete n[h.id]; return n })
    setEditStage(p => { const n = { ...p }; delete n[h.id]; return n })
    setSaving(null)
  }

  // Group by date
  const byDate: Record<string, PendingHearing[]> = {}
  for (const h of hearings) {
    if (!byDate[h.hearing_date]) byDate[h.hearing_date] = []
    byDate[h.hearing_date].push(h)
  }
  const dates = Object.keys(byDate).sort()

  const courtLabel = (h: PendingHearing) =>
    getCourtShortLabel(h.court_code || '') !== (h.court_code || '') ? getCourtShortLabel(h.court_code || '') : h.court_name

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Pending Dates</h1>
        <p className="text-sm text-gray-400 mt-0.5">All upcoming hearings. Set date or stage here — changes appear in the diary automatically.</p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : dates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">No upcoming hearings.</div>
      ) : dates.map(date => (
        <div key={date} className="mb-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            {dateLabel(date)}
            <span className="font-normal text-gray-300">({byDate[date].length})</span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {byDate[date].map((h, i) => {
              const stages = h.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES
              const pendingDate = editDate[h.id] ?? h.hearing_date
              const pendingStage = editStage[h.id] !== undefined ? editStage[h.id] : (h.stage_on_date || '')
              const isDirty = (editDate[h.id] && editDate[h.id] !== h.hearing_date) || (editStage[h.id] !== undefined && editStage[h.id] !== (h.stage_on_date || ''))

              return (
                <div key={h.id} className={`px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Court badge */}
                    <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded shrink-0">
                      {courtLabel(h)}
                    </span>
                    {/* Case number */}
                    <span className="text-xs font-mono text-gray-500 shrink-0">
                      {h.case_number}{h.case_year ? `/${h.case_year}` : ''}
                    </span>
                    {/* Parties */}
                    <span className="text-sm text-gray-800 truncate flex-1 min-w-[120px]">
                      {h.party_plaintiff} / {h.party_defendant}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {/* Date picker */}
                    <input
                      type="date"
                      value={pendingDate}
                      onChange={e => setEditDate(p => ({ ...p, [h.id]: e.target.value }))}
                      className="px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
                    />
                    {/* Stage picker */}
                    <div className="relative">
                      <select
                        value={pendingStage}
                        onChange={e => setEditStage(p => ({ ...p, [h.id]: e.target.value }))}
                        className="appearance-none pl-2 pr-7 py-1 border border-gray-300 rounded text-sm bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
                      >
                        <option value="">Stage…</option>
                        {stages.filter(s => s !== 'Custom...').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                    {/* Save */}
                    {isDirty && (
                      <button
                        onClick={() => saveRow(h)}
                        disabled={saving === h.id}
                        className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" />{saving === h.id ? 'Saving…' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
