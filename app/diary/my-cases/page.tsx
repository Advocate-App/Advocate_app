'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCourtShortLabel, formatCaseNumber } from '@/lib/constants/courts'
import Link from 'next/link'
import { Plus, Loader2 } from 'lucide-react'

interface CaseRow {
  id: string
  court_code: string | null
  court_name: string
  case_number: string | null
  case_year: number | null
  party_plaintiff: string
  party_defendant: string
  case_stage: string | null
  status: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:      { bg: '#d1fae5', text: '#065f46' },
  disposed:    { bg: '#f3f4f6', text: '#6b7280' },
  stayed:      { bg: '#fef3c7', text: '#92400e' },
  withdrawn:   { bg: '#fee2e2', text: '#991b1b' },
  transferred: { bg: '#dbeafe', text: '#1e40af' },
  reserved:    { bg: '#ede9fe', text: '#5b21b6' },
}

// Your own personal cases — separate from the firm's shared caseload.
// You add these yourself and they're yours to track; they still show up
// in the main diary on their hearing dates like any other case.
export default function MyCasesPage() {
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: adv } = await supabase
        .from('advocates')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      if (!adv) { setLoading(false); return }
      const { data } = await supabase
        .from('cases')
        .select('id, court_code, court_name, case_number, case_year, party_plaintiff, party_defendant, case_stage, status')
        .eq('advocate_id', adv.id)
        .order('created_at', { ascending: false })
      setCases((data as CaseRow[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>My Cases</h1>
          <p className="text-sm text-gray-400 mt-0.5">Your own cases — add and track them here.</p>
        </div>
        <Link
          href="/diary/cases/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#1e3a5f' }}
        >
          <Plus className="w-4 h-4" />
          Add Case
        </Link>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm mb-4">You haven&apos;t added any cases yet.</p>
          <Link href="/diary/cases/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#1e3a5f' }}>
            <Plus className="w-4 h-4" /> Add Your First Case
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {cases.map((c) => {
            const sc = STATUS_COLORS[c.status] || STATUS_COLORS.active
            const court = getCourtShortLabel(c.court_code || '') || c.court_name
            return (
              <Link key={c.id} href={`/diary/cases/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded shrink-0">{court}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">
                    {c.party_plaintiff} <span className="text-gray-400">vs</span> {c.party_defendant}
                  </p>
                  <p className="text-xs text-gray-400">
                    {c.case_number ? formatCaseNumber(c.case_number, c.case_year) : 'No number yet'}
                    {c.case_stage ? ` · ${c.case_stage}` : ''}
                  </p>
                </div>
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize shrink-0" style={{ background: sc.bg, color: sc.text }}>
                  {c.status}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
