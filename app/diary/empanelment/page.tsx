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
  Loader2,
  Search,
} from 'lucide-react'
import { FATHER_EMPANELLED_COMPANIES } from '@/lib/constants/empanelment'

type Priority = 'high' | 'medium' | 'low'
type AppStatus = 'new' | 'drafted' | 'ready_to_send' | 'sent' | 'under_review' | 'empanelled' | 'father_empanelled'

interface Organization {
  id: string
  organization_name: string
  segment: string
  priority: Priority
}

interface Application {
  id: string
  organization_id: string
  advocate_id: string | null
  status: string
}

interface Advocate {
  id: string
  full_name: string
  email: string | null
}

const PRIORITY_COLORS: Record<Priority, { bg: string; text: string }> = {
  high:   { bg: '#fee2e2', text: '#991b1b' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  low:    { bg: '#f3f4f6', text: '#6b7280' },
}

const STATUS_CONFIG: Record<AppStatus, { label: string; bg: string; text: string }> = {
  new:             { label: 'New',          bg: '#f3f4f6', text: '#9ca3af' },
  drafted:         { label: 'Drafted',      bg: '#fef3c7', text: '#92400e' },
  ready_to_send:   { label: 'Ready',        bg: '#fce7f3', text: '#9d174d' },
  sent:            { label: 'Sent',         bg: '#dbeafe', text: '#1e40af' },
  under_review:    { label: 'Under Review', bg: '#e0e7ff', text: '#3730a3' },
  empanelled:      { label: 'Empanelled',   bg: '#d1fae5', text: '#065f46' },
  father_empanelled: { label: 'Father ✓',  bg: '#d1fae5', text: '#065f46' },
}

const SEGMENT_ORDER: Record<string, number> = {
  insurance: 1, bank: 2, nbfc: 3, psu_central: 4, psu_state: 5, govt_dept: 6,
}

const SEGMENT_LABELS: Record<string, string> = {
  insurance:  'Insurance Companies',
  bank:       'Banks',
  nbfc:       'NBFCs',
  psu_central:'Central PSUs',
  psu_state:  'State PSUs',
  govt_dept:  'Govt. Departments',
}

export default function EmpanelmentPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [advocates, setAdvocates] = useState<Advocate[]>([])
  const [selectedAdvocateId, setSelectedAdvocateId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSegment, setActiveSegment] = useState('all')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: advData } = await supabase.from('advocates').select('id, full_name, email').eq('user_id', user.id)
      if (advData && advData.length > 0) {
        setAdvocates(advData)
        setSelectedAdvocateId(advData[0].id)
      }
      const [orgsRes, appsRes] = await Promise.all([
        supabase.from('target_organizations').select('*').order('organization_name'),
        supabase.from('applications').select('id, organization_id, status, advocate_id'),
      ])
      if (orgsRes.data) setOrganizations(orgsRes.data)
      if (appsRes.data) setApplications(appsRes.data)
      setLoading(false)
    }
    load()
  }, [])

  function getStatus(org: Organization): AppStatus {
    if ((FATHER_EMPANELLED_COMPANIES as readonly string[]).includes(org.organization_name)) return 'father_empanelled'
    const app = applications.find(a => a.organization_id === org.id && a.advocate_id === selectedAdvocateId)
    if (!app) return 'new'
    return app.status as AppStatus
  }

  const orgsWithStatus = useMemo(() => {
    return organizations.map(org => ({ ...org, appStatus: getStatus(org) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizations, applications, selectedAdvocateId])

  const filtered = useMemo(() => {
    let list = orgsWithStatus
    if (activeSegment !== 'all') list = list.filter(o => o.segment === activeSegment)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(o => o.organization_name.toLowerCase().includes(q))
    }
    return list
  }, [orgsWithStatus, activeSegment, searchQuery])

  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {}
    for (const org of filtered) {
      if (!map[org.segment]) map[org.segment] = []
      map[org.segment].push(org)
    }
    return Object.entries(map).sort(([a], [b]) => (SEGMENT_ORDER[a] || 99) - (SEGMENT_ORDER[b] || 99))
  }, [filtered])

  const stats = useMemo(() => {
    let drafted = 0, sent = 0, review = 0, empanelled = 0
    for (const o of orgsWithStatus) {
      if (o.appStatus === 'drafted' || o.appStatus === 'ready_to_send') drafted++
      else if (o.appStatus === 'sent') sent++
      else if (o.appStatus === 'under_review') review++
      else if (o.appStatus === 'empanelled') empanelled++
    }
    return { total: orgsWithStatus.length, drafted, sent, review, empanelled }
  }, [orgsWithStatus])

  const segments = [
    { key: 'all', label: 'All' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'bank', label: 'Banks' },
    { key: 'nbfc', label: 'NBFCs' },
    { key: 'psu_central', label: 'PSUs' },
    { key: 'govt_dept', label: 'Govt' },
  ]

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1e3a5f' }} /></div>
  }

  const selectedAdvocate = advocates.find(a => a.id === selectedAdvocateId)

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Title + Advocate Toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>
          Empanelment CRM
        </h1>
        {advocates.length > 1 && (
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            {advocates.map(adv => (
              <button
                key={adv.id}
                onClick={() => setSelectedAdvocateId(adv.id)}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                style={selectedAdvocateId === adv.id
                  ? { background: '#1e3a5f', color: '#fff' }
                  : { color: '#6b7280' }}
              >
                {adv.full_name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected advocate label */}
      {selectedAdvocate && (
        <p className="text-sm text-gray-500 -mt-2">
          Showing applications for <strong>{selectedAdvocate.full_name}</strong>
          {selectedAdvocate.email && <span className="text-gray-400"> · {selectedAdvocate.email}</span>}
        </p>
      )}

      {/* Stats for selected advocate */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',     value: stats.total,    icon: Building2,    color: '#1e3a5f' },
          { label: 'Drafted',   value: stats.drafted,  icon: FileText,     color: '#92400e' },
          { label: 'Sent',      value: stats.sent,     icon: Send,         color: '#1e40af' },
          { label: 'Review',    value: stats.review,   icon: Clock,        color: '#7c3aed' },
          { label: 'Empanelled',value: stats.empanelled,icon: CheckCircle2,color: '#065f46' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: s.color }} />
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Segment filter + search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1 flex-wrap">
          {segments.map(s => (
            <button key={s.key} onClick={() => setActiveSegment(s.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={activeSegment === s.key
                ? { background: '#1e3a5f', color: '#fff' }
                : { background: '#f3f4f6', color: '#374151' }}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search organizations..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
        </div>
      </div>

      {/* Tables grouped by segment */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">No organizations found</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([segment, orgs]) => (
            <div key={segment} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 flex items-center gap-2 bg-gray-50 border-b border-gray-100">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">{SEGMENT_LABELS[segment] || segment}</span>
                <span className="text-xs text-gray-400">({orgs.length})</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {orgs.map(org => {
                    const priColor = PRIORITY_COLORS[org.priority] || PRIORITY_COLORS.low
                    const conf = STATUS_CONFIG[org.appStatus] || STATUS_CONFIG.new
                    const isFather = org.appStatus === 'father_empanelled'
                    return (
                      <tr key={org.id} className="border-b border-gray-50 hover:bg-gray-50/60 last:border-none">
                        <td className="py-3 px-4 font-medium text-gray-800">{org.organization_name}</td>
                        <td className="py-3 px-3 w-24">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={{ background: priColor.bg, color: priColor.text }}>
                            {org.priority}
                          </span>
                        </td>
                        <td className="py-3 px-3 w-36">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: conf.bg, color: conf.text }}>
                            {conf.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 w-36 text-right">
                          {isFather ? (
                            <span className="text-xs text-gray-300">Already empanelled</span>
                          ) : (
                            <Link
                              href={`/diary/empanelment/draft/${org.id}?advocate=${selectedAdvocateId}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80"
                              style={{ background: '#1e3a5f' }}
                            >
                              <FileText className="w-3 h-3" />
                              {org.appStatus === 'new' ? 'Draft Application' : 'View Application'}
                            </Link>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
