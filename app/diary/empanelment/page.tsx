'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  Building2,
  FileText,
  Send,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  Search,
} from 'lucide-react'
import { FATHER_EMPANELLED_COMPANIES } from '@/lib/constants/empanelment'

type Segment = 'insurance' | 'bank' | 'nbfc' | 'psu_central' | 'psu_state' | 'govt_dept'
type Priority = 'high' | 'medium' | 'low'
type AppStatus = 'new' | 'drafted' | 'ready_to_send' | 'sent' | 'under_review' | 'empanelled' | 'father_empanelled'

interface Organization {
  id: string
  organization_name: string
  segment: Segment
  priority: Priority
  target_contact_role: string | null
  empanelment_process: string | null
  contact_email: string | null
  created_at: string
}

interface Application {
  id: string
  organization_id: string
  advocate_id: string | null
  status: string
}

type FilterTab = 'all' | Segment | 'psu' | 'high_court' | 'district_court'

const SEGMENT_COLORS: Record<string, { bg: string; text: string }> = {
  insurance: { bg: '#dbeafe', text: '#1e40af' },
  bank: { bg: '#d1fae5', text: '#065f46' },
  nbfc: { bg: '#ede9fe', text: '#5b21b6' },
  psu_central: { bg: '#fef3c7', text: '#92400e' },
  psu_state: { bg: '#fef3c7', text: '#92400e' },
  govt_dept: { bg: '#f3f4f6', text: '#374151' },
}

const PRIORITY_COLORS: Record<Priority, { bg: string; text: string }> = {
  high: { bg: '#fee2e2', text: '#991b1b' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  low: { bg: '#f3f4f6', text: '#6b7280' },
}

const STATUS_CONFIG: Record<AppStatus, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: '#f3f4f6', text: '#6b7280' },
  drafted: { label: 'Drafted', bg: '#fef3c7', text: '#92400e' },
  ready_to_send: { label: 'Ready', bg: '#fce7f3', text: '#9d174d' },
  sent: { label: 'Sent', bg: '#dbeafe', text: '#1e40af' },
  under_review: { label: 'Review', bg: '#e0e7ff', text: '#3730a3' },
  empanelled: { label: 'Empanelled', bg: '#d1fae5', text: '#065f46' },
  father_empanelled: { label: 'Father ✓', bg: '#d1fae5', text: '#065f46' },
}

interface Advocate {
  id: string
  full_name: string
  email: string | null
}

const SEGMENT_ORDER: Record<string, number> = {
  insurance: 1,
  bank: 2,
  nbfc: 3,
  psu_central: 4,
  psu_state: 5,
  govt_dept: 6,
}

const SEGMENT_LABELS: Record<string, string> = {
  insurance: 'Insurance Companies',
  bank: 'Banks',
  nbfc: 'NBFCs',
  psu_central: 'Central PSUs',
  psu_state: 'State PSUs',
  govt_dept: 'Govt. Departments',
}

export default function EmpanelmentPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [advocates, setAdvocates] = useState<Advocate[]>([])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: advData } = await supabase
        .from('advocates')
        .select('id, full_name, email')
        .eq('user_id', user.id)

      if (advData && advData.length > 0) setAdvocates(advData)

      const [orgsRes, appsRes] = await Promise.all([
        supabase.from('target_organizations').select('*').order('priority', { ascending: true }).order('organization_name'),
        supabase.from('applications').select('id, organization_id, status, advocate_id').order('created_at', { ascending: false }),
      ])
      if (orgsRes.data) setOrganizations(orgsRes.data)
      if (appsRes.data) setApplications(appsRes.data)
      setLoading(false)
    }
    load()
  }, [])

  function getStatusForAdvocate(org: Organization, advocateId: string): AppStatus {
    if ((FATHER_EMPANELLED_COMPANIES as readonly string[]).includes(org.organization_name)) return 'father_empanelled'
    const app = applications.find((a) => a.organization_id === org.id && a.advocate_id === advocateId)
    if (!app) return 'new'
    return app.status as AppStatus
  }

  const orgWithStatus = useMemo(() => {
    return organizations.map((org) => ({
      ...org,
      statuses: advocates.map(adv => ({
        advocateId: adv.id,
        advocateName: adv.full_name.split(' ')[0],
        status: getStatusForAdvocate(org, adv.id),
      })),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizations, applications, advocates])

  const filtered = useMemo(() => {
    let list = orgWithStatus
    if (activeTab === 'psu') {
      list = list.filter((o) => o.segment === 'psu_central' || o.segment === 'psu_state')
    } else if (activeTab === 'high_court') {
      list = list.filter((o) => o.segment === 'govt_dept' && (o as unknown as { sub_segment: string }).sub_segment === 'High Court')
    } else if (activeTab === 'district_court') {
      list = list.filter((o) => o.segment === 'govt_dept' && (o as unknown as { sub_segment: string }).sub_segment === 'District Court')
    } else if (activeTab === 'govt_dept') {
      list = list.filter((o) => o.segment === 'govt_dept' && !(o as unknown as { sub_segment: string }).sub_segment?.includes('Court'))
    } else if (activeTab !== 'all') {
      list = list.filter((o) => o.segment === activeTab)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((o) => o.organization_name.toLowerCase().includes(q))
    }
    return list
  }, [orgWithStatus, activeTab, searchQuery])

  // Group by segment
  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {}
    for (const org of filtered) {
      if (!map[org.segment]) map[org.segment] = []
      map[org.segment].push(org)
    }
    return Object.entries(map).sort(([a], [b]) => (SEGMENT_ORDER[a] || 99) - (SEGMENT_ORDER[b] || 99))
  }, [filtered])

  const stats = useMemo(() => {
    const counts: Record<string, { new: number; drafted: number; sent: number; under_review: number; empanelled: number }> = {}
    for (const adv of advocates) {
      counts[adv.id] = { new: 0, drafted: 0, sent: 0, under_review: 0, empanelled: 0 }
    }
    for (const org of orgWithStatus) {
      for (const s of org.statuses) {
        if (!counts[s.advocateId]) continue
        if (s.status === 'new') counts[s.advocateId].new++
        else if (s.status === 'drafted' || s.status === 'ready_to_send') counts[s.advocateId].drafted++
        else if (s.status === 'sent') counts[s.advocateId].sent++
        else if (s.status === 'under_review') counts[s.advocateId].under_review++
        else if (s.status === 'empanelled') counts[s.advocateId].empanelled++
      }
    }
    return counts
  }, [orgWithStatus, advocates])

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'bank', label: 'Banks' },
    { key: 'nbfc', label: 'NBFCs' },
    { key: 'psu', label: 'PSUs' },
    { key: 'govt_dept', label: 'Govt' },
    { key: 'high_court', label: 'High Court' },
    { key: 'district_court', label: 'District Court' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1e3a5f' }} />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>
        Empanelment CRM
      </h1>

      {/* Stats — one card per advocate */}
      {advocates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {advocates.map(adv => {
            const s = stats[adv.id] || {}
            const firstName = adv.full_name.split(' ')[0]
            return (
              <div key={adv.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#1e3a5f' }}>
                    {firstName[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{adv.full_name}</p>
                    <p className="text-xs text-gray-400">{adv.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2 text-center">
                  {[
                    { label: 'New', value: s.new, icon: FileText, color: '#6b7280' },
                    { label: 'Drafted', value: s.drafted, icon: FileText, color: '#92400e' },
                    { label: 'Sent', value: s.sent, icon: Send, color: '#1e40af' },
                    { label: 'Review', value: s.under_review, icon: Clock, color: '#7c3aed' },
                    { label: 'Empanelled', value: s.empanelled, icon: CheckCircle2, color: '#065f46' },
                  ].map(st => {
                    const Icon = st.icon
                    return (
                      <div key={st.label} className="bg-gray-50 rounded-lg py-2">
                        <Icon className="w-3.5 h-3.5 mx-auto mb-0.5" style={{ color: st.color }} />
                        <p className="text-lg font-bold" style={{ color: st.color }}>{st.value ?? 0}</p>
                        <p className="text-[10px] text-gray-400">{st.label}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={
                activeTab === t.key
                  ? { background: '#1e3a5f', color: '#fff' }
                  : { background: '#f3f4f6', color: '#374151' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search organizations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]"
          />
        </div>
      </div>

      {/* Grouped Tables */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">No organizations found</div>
      ) : (
        grouped.map(([segment, orgs]) => (
          <div key={segment} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Section header */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2" style={{ background: '#f8f8f5' }}>
              <Building2 className="w-4 h-4 text-gray-500" />
              <span className="font-semibold text-gray-700 text-sm">{SEGMENT_LABELS[segment] || segment}</span>
              <span className="text-xs text-gray-400 ml-1">({orgs.length})</span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Organization</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs w-20">Priority</th>
                  {advocates.map(adv => (
                    <th key={adv.id} className="text-center py-2 px-3 text-xs font-semibold w-28" style={{ color: '#1e3a5f' }}>
                      {adv.full_name.split(' ')[0]}
                    </th>
                  ))}
                  {advocates.map(adv => (
                    <th key={`action-${adv.id}`} className="text-center py-2 px-3 text-xs font-medium text-gray-400 w-32">
                      {adv.full_name.split(' ')[0]} Action
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => {
                  const priColor = PRIORITY_COLORS[org.priority] || PRIORITY_COLORS.low
                  const isFatherEmpanelled = (FATHER_EMPANELLED_COMPANIES as readonly string[]).includes(org.organization_name)
                  return (
                    <tr key={org.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2.5 px-4 font-medium text-gray-800">{org.organization_name}</td>
                      <td className="py-2.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                          style={{ background: priColor.bg, color: priColor.text }}>
                          {org.priority}
                        </span>
                      </td>
                      {org.statuses.map(s => {
                        const conf = STATUS_CONFIG[s.status] || STATUS_CONFIG.new
                        return (
                          <td key={s.advocateId} className="py-2.5 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ background: conf.bg, color: conf.text }}>
                              {conf.label}
                            </span>
                          </td>
                        )
                      })}
                      {org.statuses.map(s => (
                        <td key={`action-${s.advocateId}`} className="py-2.5 px-3 text-center">
                          {isFatherEmpanelled ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            <Link
                              href={`/diary/empanelment/draft/${org.id}?advocate=${s.advocateId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
                              style={{ background: s.status === 'new' ? '#6b7280' : '#1e3a5f' }}
                            >
                              <FileText className="w-3 h-3" />
                              {s.status === 'new' ? 'Draft' : 'View'}
                            </Link>
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
