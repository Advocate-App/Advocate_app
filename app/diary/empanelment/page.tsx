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

const FATHER_EMPANELLED = [
  'SBI General Insurance',
  'New India Assurance',
  'Oriental Insurance',
  'National Insurance',
  'United India Insurance',
  'ICICI Lombard',
  'Bajaj Allianz General Insurance',
  'IFFCO-Tokio',
  'Future Generali India Insurance',
  'Universal Sompo General Insurance',
]

type Segment = 'insurance' | 'bank' | 'nbfc' | 'psu' | 'govt'
type Priority = 'high' | 'medium' | 'low'
type AppStatus = 'new' | 'drafted' | 'ready_to_send' | 'sent' | 'under_review' | 'empanelled' | 'father_empanelled'

interface Organization {
  id: string
  name: string
  segment: Segment
  priority: Priority
  contact_role: string | null
  empanelment_process: string | null
  email: string | null
  created_at: string
}

interface Application {
  id: string
  organization_id: string
  status: string
}

type FilterTab = 'all' | Segment

const SEGMENT_COLORS: Record<Segment, { bg: string; text: string }> = {
  insurance: { bg: '#dbeafe', text: '#1e40af' },
  bank: { bg: '#d1fae5', text: '#065f46' },
  nbfc: { bg: '#ede9fe', text: '#5b21b6' },
  psu: { bg: '#fef3c7', text: '#92400e' },
  govt: { bg: '#f3f4f6', text: '#374151' },
}

const PRIORITY_COLORS: Record<Priority, { bg: string; text: string }> = {
  high: { bg: '#fee2e2', text: '#991b1b' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  low: { bg: '#f3f4f6', text: '#6b7280' },
}

const STATUS_CONFIG: Record<AppStatus, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: '#e0e7ff', text: '#3730a3' },
  drafted: { label: 'Drafted', bg: '#fef3c7', text: '#92400e' },
  ready_to_send: { label: 'Ready to Send', bg: '#fce7f3', text: '#9d174d' },
  sent: { label: 'Sent', bg: '#dbeafe', text: '#1e40af' },
  under_review: { label: 'Under Review', bg: '#e0e7ff', text: '#3730a3' },
  empanelled: { label: 'Empanelled', bg: '#d1fae5', text: '#065f46' },
  father_empanelled: { label: 'Father Empanelled', bg: '#d1fae5', text: '#065f46' },
}

export default function EmpanelmentPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [orgsRes, appsRes] = await Promise.all([
        supabase.from('target_organizations').select('*').order('priority', { ascending: true }).order('name'),
        supabase.from('applications').select('id, organization_id, status'),
      ])
      if (orgsRes.data) setOrganizations(orgsRes.data)
      if (appsRes.data) setApplications(appsRes.data)
      setLoading(false)
    }
    load()
  }, [])

  function getStatus(org: Organization): AppStatus {
    if (FATHER_EMPANELLED.includes(org.name)) return 'father_empanelled'
    const app = applications.find((a) => a.organization_id === org.id)
    if (!app) return 'new'
    return app.status as AppStatus
  }

  const orgWithStatus = useMemo(() => {
    return organizations.map((org) => ({
      ...org,
      appStatus: getStatus(org),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizations, applications])

  const filtered = useMemo(() => {
    let list = orgWithStatus
    if (activeTab !== 'all') {
      list = list.filter((o) => o.segment === activeTab)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((o) => o.name.toLowerCase().includes(q))
    }
    return list
  }, [orgWithStatus, activeTab, searchQuery])

  const stats = useMemo(() => {
    const counts = {
      total: orgWithStatus.length,
      new: 0,
      drafted: 0,
      sent: 0,
      under_review: 0,
      empanelled: 0,
      father_empanelled: 0,
    }
    orgWithStatus.forEach((o) => {
      if (o.appStatus === 'new') counts.new++
      else if (o.appStatus === 'drafted' || o.appStatus === 'ready_to_send') counts.drafted++
      else if (o.appStatus === 'sent') counts.sent++
      else if (o.appStatus === 'under_review') counts.under_review++
      else if (o.appStatus === 'empanelled') counts.empanelled++
      else if (o.appStatus === 'father_empanelled') counts.father_empanelled++
    })
    return counts
  }, [orgWithStatus])

  const statCards = [
    { label: 'Total Targets', value: stats.total, icon: Building2, color: '#1e3a5f' },
    { label: 'New', value: stats.new, icon: FileText, color: '#3730a3' },
    { label: 'Drafted', value: stats.drafted, icon: FileText, color: '#92400e' },
    { label: 'Sent', value: stats.sent, icon: Send, color: '#1e40af' },
    { label: 'Under Review', value: stats.under_review, icon: Clock, color: '#7c3aed' },
    { label: 'Empanelled', value: stats.empanelled, icon: CheckCircle2, color: '#065f46' },
    { label: 'Already Empanelled', value: stats.father_empanelled, icon: ShieldCheck, color: '#059669' },
  ]

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'bank', label: 'Banks' },
    { key: 'nbfc', label: 'NBFCs' },
    { key: 'psu', label: 'PSUs' },
    { key: 'govt', label: 'Govt' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1e3a5f' }} />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1
        className="text-2xl font-bold"
        style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}
      >
        Empanelment CRM
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: s.color }} />
                <span className="text-xs text-gray-500 font-medium">{s.label}</span>
              </div>
              <p className="text-2xl font-bold" style={{ color: s.color }}>
                {s.value}
              </p>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Tabs */}
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

          {/* Search */}
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

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Name</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Segment</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Priority</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    No organizations found
                  </td>
                </tr>
              ) : (
                filtered.map((org) => {
                  const segColor = SEGMENT_COLORS[org.segment] || SEGMENT_COLORS.govt
                  const priColor = PRIORITY_COLORS[org.priority] || PRIORITY_COLORS.low
                  const statusConf = STATUS_CONFIG[org.appStatus] || STATUS_CONFIG.new
                  const isFatherEmpanelled = org.appStatus === 'father_empanelled'

                  return (
                    <tr key={org.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-4 font-medium text-gray-800">{org.name}</td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-block px-2.5 py-1 rounded-full text-xs font-medium capitalize"
                          style={{ background: segColor.bg, color: segColor.text }}
                        >
                          {org.segment}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-block px-2.5 py-1 rounded-full text-xs font-medium capitalize"
                          style={{ background: priColor.bg, color: priColor.text }}
                        >
                          {org.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-block px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ background: statusConf.bg, color: statusConf.text }}
                        >
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isFatherEmpanelled ? (
                          <span className="text-xs text-gray-400">Already empanelled</span>
                        ) : (
                          <Link
                            href={`/diary/empanelment/draft/${org.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
                            style={{ background: '#1e3a5f' }}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            {org.appStatus === 'new' ? 'Draft Application' : 'View Application'}
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
