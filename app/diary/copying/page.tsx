'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Trash2, Loader2 } from 'lucide-react'

type CopyStatus = 'sent' | 'ready' | 'collected' | 'cancelled'
type FilterTab = 'all' | CopyStatus

interface CopyingRecord {
  id: string
  advocate_id: string
  head_number: string
  court_name: string
  file_description: string
  sent_by: string
  sent_date: string
  status: CopyStatus
  collected_date: string | null
  notes: string | null
  created_at: string
}

const STATUS_COLORS: Record<CopyStatus, { bg: string; text: string }> = {
  sent: { bg: '#fef3c7', text: '#92400e' },
  ready: { bg: '#dbeafe', text: '#1e40af' },
  collected: { bg: '#d1fae5', text: '#065f46' },
  cancelled: { bg: '#f3f4f6', text: '#6b7280' },
}

export default function CopyingTrackerPage() {
  const [advocateId, setAdvocateId] = useState<string | null>(null)
  const [records, setRecords] = useState<CopyingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    head_number: '',
    court_name: '',
    file_description: '',
    sent_by: '',
    sent_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })
  const [showForm, setShowForm] = useState(false)

  // Load advocate
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('advocates')
        .select('id')
        .eq('user_id', user.id)
        .single()
      if (data) setAdvocateId(data.id)
    }
    load()
  }, [])

  // Fetch records
  useEffect(() => {
    if (advocateId) fetchRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advocateId])

  async function fetchRecords() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('copying_tracker')
      .select('*')
      .eq('advocate_id', advocateId!)
      .order('created_at', { ascending: false })
    if (data) setRecords(data as CopyingRecord[])
    setLoading(false)
  }

  // Counts
  const counts = {
    all: records.length,
    sent: records.filter(r => r.status === 'sent').length,
    ready: records.filter(r => r.status === 'ready').length,
    collected: records.filter(r => r.status === 'collected').length,
    cancelled: records.filter(r => r.status === 'cancelled').length,
  }

  const filtered = filter === 'all' ? records : records.filter(r => r.status === filter)

  // Add record
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!advocateId || !form.head_number || !form.court_name || !form.file_description || !form.sent_by) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('copying_tracker').insert({
      advocate_id: advocateId,
      head_number: form.head_number,
      court_name: form.court_name,
      file_description: form.file_description,
      sent_by: form.sent_by,
      sent_date: form.sent_date,
      status: 'sent',
      notes: form.notes || null,
    })
    setForm({
      head_number: '',
      court_name: '',
      file_description: '',
      sent_by: '',
      sent_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    })
    setShowForm(false)
    setSaving(false)
    fetchRecords()
  }

  // Actions
  async function markReady(id: string) {
    const supabase = createClient()
    await supabase.from('copying_tracker').update({ status: 'ready' }).eq('id', id)
    fetchRecords()
  }

  async function markCollected(id: string) {
    const supabase = createClient()
    await supabase.from('copying_tracker').update({
      status: 'collected',
      collected_date: format(new Date(), 'yyyy-MM-dd'),
    }).eq('id', id)
    fetchRecords()
  }

  async function deleteRecord(id: string) {
    if (!confirm('Delete this copying record?')) return
    const supabase = createClient()
    await supabase.from('copying_tracker').delete().eq('id', id)
    fetchRecords()
  }

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'sent', label: 'Sent' },
    { key: 'ready', label: 'Ready' },
    { key: 'collected', label: 'Collected' },
  ]

  return (
    <div className="max-w-6xl">
      {/* Heading */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Georgia, serif', color: '#1e3a5f' }}
        >
          Copying Tracker
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
          style={{ background: '#1e3a5f' }}
        >
          {showForm ? 'Cancel' : '+ Add New'}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Head Number *</label>
              <input
                type="text"
                required
                value={form.head_number}
                onChange={e => setForm({ ...form, head_number: e.target.value })}
                placeholder="e.g. 12/2024"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Court Name *</label>
              <input
                type="text"
                required
                value={form.court_name}
                onChange={e => setForm({ ...form, court_name: e.target.value })}
                placeholder="e.g. District Court Udaipur"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">File Description *</label>
              <input
                type="text"
                required
                value={form.file_description}
                onChange={e => setForm({ ...form, file_description: e.target.value })}
                placeholder="e.g. Judgement copy CS 45/2023"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sent By *</label>
              <input
                type="text"
                required
                value={form.sent_by}
                onChange={e => setForm({ ...form, sent_by: e.target.value })}
                placeholder="e.g. Clerk Ramesh, Self"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sent Date</label>
              <input
                type="date"
                value={form.sent_date}
                onChange={e => setForm({ ...form, sent_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
            style={{ background: '#1e3a5f' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === tab.key
                ? 'text-white'
                : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
            }`}
            style={filter === tab.key ? { background: '#1e3a5f' } : undefined}
          >
            {tab.label}
            <span className="ml-1 opacity-70">({counts[tab.key]})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No copying records found.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300" style={{ background: '#f0f0eb' }}>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Head No.</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Court</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">File Description</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Sent By</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Sent Date</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Collected</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => {
                  const statusStyle = STATUS_COLORS[r.status]
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-2 text-xs font-mono text-gray-800">{r.head_number}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{r.court_name}</td>
                      <td className="px-3 py-2 text-xs text-gray-700 max-w-[200px] truncate">{r.file_description}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{r.sent_by}</td>
                      <td className="px-3 py-2 text-xs font-mono text-gray-600">
                        {r.sent_date ? format(new Date(r.sent_date + 'T00:00:00'), 'dd/MM/yyyy') : '--'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                          style={{ background: statusStyle.bg, color: statusStyle.text }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-gray-600">
                        {r.collected_date ? format(new Date(r.collected_date + 'T00:00:00'), 'dd/MM/yyyy') : '--'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {r.status === 'sent' && (
                            <button
                              onClick={() => markReady(r.id)}
                              className="px-2 py-1 rounded text-[10px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                            >
                              Mark Ready
                            </button>
                          )}
                          {(r.status === 'sent' || r.status === 'ready') && (
                            <button
                              onClick={() => markCollected(r.id)}
                              className="px-2 py-1 rounded text-[10px] font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                            >
                              Mark Collected
                            </button>
                          )}
                          <button
                            onClick={() => deleteRecord(r.id)}
                            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(r => {
              const statusStyle = STATUS_COLORS[r.status]
              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{r.file_description}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Head: {r.head_number} | {r.court_name}
                      </p>
                    </div>
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase shrink-0"
                      style={{ background: statusStyle.bg, color: statusStyle.text }}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
                    <span>Sent by: {r.sent_by}</span>
                    <span>Sent: {r.sent_date ? format(new Date(r.sent_date + 'T00:00:00'), 'dd/MM/yy') : '--'}</span>
                    {r.collected_date && (
                      <span>Collected: {format(new Date(r.collected_date + 'T00:00:00'), 'dd/MM/yy')}</span>
                    )}
                  </div>
                  {r.notes && <p className="text-xs text-gray-400 italic mb-3">{r.notes}</p>}
                  <div className="flex items-center gap-2">
                    {r.status === 'sent' && (
                      <button
                        onClick={() => markReady(r.id)}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        Mark Ready
                      </button>
                    )}
                    {(r.status === 'sent' || r.status === 'ready') && (
                      <button
                        onClick={() => markCollected(r.id)}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                      >
                        Mark Collected
                      </button>
                    )}
                    <button
                      onClick={() => deleteRecord(r.id)}
                      className="px-2.5 py-1.5 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
