'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { fetchAllRows } from '@/lib/fetchAll'

interface ClosedHearing {
  id: string
  hearing_date: string
  stage_on_date: string
  outcome_notes: string | null
  case_id: string
  court_code: string
  court_name: string
  case_number: string
  case_year: number | null
  party_plaintiff: string
  party_defendant: string
  // Every hearing on this case that also has a final stage — a case can
  // legitimately have more than one (re-disposed, duplicate entries from
  // the original import, etc.). Marking an action updates all of them, so
  // the case doesn't stay half-tagged and reappear as "still pending".
  allHearingIds: string[]
}

const FINAL_STAGES = ['Disposed', 'For Orders', 'Judgment', 'Judgment Reserved']
const QUICK_ACTIONS = ['Appeal Filed', 'Execution', 'Got Order Copy', 'Do Nothing']

const SECTIONS: { key: string; label: string; color: string; bg: string; border: string }[] = [
  { key: 'pending',        label: 'Pending Action',  color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200' },
  { key: 'Appeal Filed',   label: 'Appeal Filed',    color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
  { key: 'Execution',      label: 'Execution',       color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
  { key: 'Got Order Copy', label: 'Got Order Copy',  color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200'},
  { key: 'Do Nothing',     label: 'Do Nothing',      color: 'text-gray-600',   bg: 'bg-gray-50',    border: 'border-gray-200'   },
  { key: 'other',          label: 'Other / Custom',  color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
]

function sectionKey(notes: string | null): string {
  if (!notes) return 'pending'
  if (QUICK_ACTIONS.includes(notes)) return notes
  return 'other'
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

function formatCaseNo(num: string, year: number | null) {
  if (!num || num === 'NEW' || num === '') return year ? `NEW/${year}` : 'NEW'
  return year ? `${num}/${year}` : num
}

export default function ClosedCasesPage() {
  const [hearings, setHearings] = useState<ClosedHearing[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [advocateId, setAdvocateId] = useState<string | null>(null)

  const load = useCallback(async (advId: string) => {
    const supabase = createClient()
    // fetch all hearings with final stage for this advocate's cases
    const cases = await fetchAllRows<{ id: string; court_code: string; court_name: string; case_number: string; case_year: number | null; party_plaintiff: string; party_defendant: string }>((from, to) =>
      supabase
        .from('cases')
        .select('id, court_code, court_name, case_number, case_year, party_plaintiff, party_defendant')
        .eq('advocate_id', advId)
        .range(from, to)
    )

    if (cases.length === 0) { setLoading(false); return }

    const caseMap = new Map(cases.map((c: { id: string; court_code: string; court_name: string; case_number: string; case_year: number | null; party_plaintiff: string; party_defendant: string }) => [c.id, c]))
    const caseIds = cases.map((c: { id: string }) => c.id)

    // batch fetch hearings with final stages
    const BATCH = 200
    type RawHearing = { id: string; hearing_date: string; stage_on_date: string; outcome_notes: string | null; case_id: string }
    const rawHearings: RawHearing[] = []
    for (let i = 0; i < caseIds.length; i += BATCH) {
      const batch = caseIds.slice(i, i + BATCH)
      const { data: hs } = await supabase
        .from('hearings')
        .select('id, hearing_date, stage_on_date, outcome_notes, case_id')
        .in('case_id', batch)
        .in('stage_on_date', FINAL_STAGES)
        .order('hearing_date', { ascending: false })

      if (hs) rawHearings.push(...(hs as RawHearing[]))
    }

    // A case can have more than one hearing row with a final stage (a
    // re-disposed matter, duplicate entries from the original import,
    // etc.) — dedupe to one row per case, otherwise it shows up twice and
    // marking an action on one instance leaves the other stuck showing as
    // pending. Prefer a hearing that's already tagged with an action so
    // existing status keeps showing correctly; otherwise the latest one.
    const byCase = new Map<string, RawHearing[]>()
    for (const h of rawHearings) {
      const arr = byCase.get(h.case_id) || []
      arr.push(h)
      byCase.set(h.case_id, arr)
    }
    const allHearings: ClosedHearing[] = []
    for (const [caseId, hs] of byCase) {
      const c = caseMap.get(caseId)
      if (!c) continue
      const tagged = hs.find((h) => h.outcome_notes)
      const rep = tagged || [...hs].sort((a, b) => b.hearing_date.localeCompare(a.hearing_date))[0]
      allHearings.push({ ...c, ...rep, allHearingIds: hs.map((h) => h.id) })
    }
    allHearings.sort((a, b) => b.hearing_date.localeCompare(a.hearing_date))

    setHearings(allHearings)
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: adv } = await supabase.from('advocates').select('id').eq('user_id', user.id).limit(1).single()
      if (!adv) { setLoading(false); return }
      setAdvocateId(adv.id)
      await load(adv.id)
    }
    init()
  }, [load])

  async function setAction(caseRowId: string, allHearingIds: string[], action: string) {
    setSaving(caseRowId)
    const supabase = createClient()
    // Every final-stage hearing on this case gets the same tag — not just
    // the one shown — so no duplicate instance is left behind still
    // looking "pending" after this one's been marked.
    await supabase.from('hearings').update({ outcome_notes: action || null }).in('id', allHearingIds)
    setHearings(prev => prev.map(h => h.id === caseRowId ? { ...h, outcome_notes: action || null } : h))
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const grouped = SECTIONS.map(sec => ({
    ...sec,
    items: hearings.filter(h => sectionKey(h.outcome_notes) === sec.key),
  }))

  const total = hearings.length
  const pending = hearings.filter(h => !h.outcome_notes).length

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>Closed Cases</h1>
        <p className="text-sm text-gray-500 mt-1">
          {total} disposed / ordered cases &nbsp;·&nbsp;
          <span className="text-orange-600 font-medium">{pending} pending action</span>
        </p>
      </div>

      {total === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">No disposed or ordered cases yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(sec => {
            if (sec.items.length === 0) return null
            return (
              <div key={sec.key} className={`rounded-xl border ${sec.border} ${sec.bg}`}>
                {/* Section header */}
                <div className={`px-4 py-3 border-b ${sec.border} flex items-center justify-between`}>
                  <h2 className={`text-sm font-bold ${sec.color} uppercase tracking-wide`}>{sec.label}</h2>
                  <span className={`text-xs font-semibold ${sec.color} bg-white px-2 py-0.5 rounded-full border ${sec.border}`}>
                    {sec.items.length}
                  </span>
                </div>

                {/* Cases */}
                <div className="divide-y divide-gray-100">
                  {sec.items.map(h => (
                    <div key={h.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 bg-white/70">
                      {/* Date */}
                      <div className="sm:w-16 shrink-0 flex items-center gap-2 sm:flex-col sm:text-center">
                        <div className="text-xs font-mono text-gray-500">{formatDate(h.hearing_date)}</div>
                        <div className="text-[10px] text-gray-400">{h.stage_on_date}</div>
                      </div>

                      {/* Case info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-500">{h.court_code}</span>
                          <span className="text-xs text-gray-400">{formatCaseNo(h.case_number, h.case_year)}</span>
                        </div>
                        <Link
                          href={`/diary/cases/${h.case_id}`}
                          className="text-base sm:text-sm font-semibold hover:underline block truncate"
                          style={{ color: '#1e3a5f' }}
                        >
                          {h.party_plaintiff} <span className="text-gray-400 font-normal">vs</span> {h.party_defendant}
                        </Link>
                      </div>

                      {/* Action picker */}
                      <div className="shrink-0">
                        {h.outcome_notes ? (
                          <div className="flex items-center gap-1">
                            <span className={`text-xs font-medium ${sec.color}`}>{h.outcome_notes}</span>
                            <button
                              onClick={() => setAction(h.id, h.allHearingIds, '')}
                              className="text-[10px] text-gray-400 hover:text-gray-600 underline ml-1"
                            >Clear</button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1 sm:justify-end">
                            {saving === h.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            ) : QUICK_ACTIONS.map(action => (
                              <button
                                key={action}
                                onClick={() => setAction(h.id, h.allHearingIds, action)}
                                className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors whitespace-nowrap"
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
