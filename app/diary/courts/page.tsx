'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { DISTRICT_COURTS, HC_BENCHES } from '@/lib/constants/courts'

interface CustomCourt { id: string; name: string; short_name: string | null; city: string | null }

export default function CourtsPage() {
  const [customCourts, setCustomCourts] = useState<CustomCourt[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState('')

  // Add form
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editShortName, setEditShortName] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setAuthToken(session.access_token)
      const res = await fetch('/api/custom-courts', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) setCustomCourts(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  async function addCourt() {
    if (!name.trim()) { setError('Court name is required'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/custom-courts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: name.trim(), short_name: shortName.trim() || null, city: city.trim() || null }),
    })
    if (res.ok) {
      const court = await res.json()
      setCustomCourts(prev => [...prev, court])
      setName(''); setShortName(''); setCity('')
    } else {
      const j = await res.json()
      setError(j.error || 'Failed to save')
    }
    setSaving(false)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setEditSaving(true)
    const res = await fetch('/api/custom-courts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id, name: editName.trim(), short_name: editShortName.trim() || null, city: editCity.trim() || null }),
    })
    if (res.ok) {
      const updated = await res.json()
      setCustomCourts(prev => prev.map(c => c.id === id ? updated : c))
      setEditingId(null)
    }
    setEditSaving(false)
  }

  async function deleteCourt(id: string) {
    setDeletingId(id)
    await fetch('/api/custom-courts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id }),
    })
    setCustomCourts(prev => prev.filter(c => c.id !== id))
    setDeletingId(null)
  }

  function startEdit(c: CustomCourt) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditShortName(c.short_name || '')
    setEditCity(c.city || '')
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>My Courts</h1>
        <p className="text-sm text-gray-400 mt-0.5">All courts available when adding a case. Short form shows in the diary column.</p>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add a Court</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Court Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') addCourt() }}
              placeholder="e.g. ADJ Court No. 4"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Short Form (diary label)</label>
            <input
              type="text"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCourt() }}
              placeholder="e.g. ADJ-4"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City / District</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCourt() }}
              placeholder="e.g. Udaipur"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <button
          onClick={addCourt}
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
          style={{ background: '#1e3a5f' }}
        >
          <Plus className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Court'}
        </button>
      </div>

      {/* Custom courts — editable */}
      {(loading || customCourts.length > 0) && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">My Added Courts</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {loading ? (
              <div className="px-5 py-4 text-sm text-gray-400">Loading…</div>
            ) : customCourts.map((c) => (
              <div key={c.id} className="px-5 py-4">
                {editingId === c.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Court name *"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                      />
                      <input
                        type="text"
                        value={editShortName}
                        onChange={(e) => setEditShortName(e.target.value)}
                        placeholder="Short form (diary)"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                      />
                      <input
                        type="text"
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        placeholder="City"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                      />
                    </div>
                    <p className="text-xs text-gray-400">Saving will update the court name on all existing cases.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(c.id)}
                        disabled={editSaving || !editName.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs text-gray-600 bg-gray-100 hover:bg-gray-200"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800">{c.name}</p>
                        {c.short_name && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">{c.short_name}</span>
                        )}
                      </div>
                      {c.city && <p className="text-xs text-gray-400 mt-0.5">{c.city}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(c)}
                        className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteCourt(c.id)}
                        disabled={deletingId === c.id}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Built-in High Court — read only */}
      <div className="mb-6">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">High Court</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {HC_BENCHES.map((b) => (
            <div key={b.code} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="text-sm font-medium text-gray-800">{b.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{b.code === 'jodhpur' ? 'Jodhpur' : 'Jaipur'}</p>
              </div>
              <span className="text-xs text-gray-300 font-mono">{b.code === 'jodhpur' ? 'HC-Jod' : 'HC-Jpr'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Built-in District Courts — read only */}
      <div>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">District & Other Courts</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {DISTRICT_COURTS.filter(c => c.code !== 'OTHER').map((c) => (
            <div key={c.code} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="text-sm font-medium text-gray-800">{c.name}</p>
                {c.district && <p className="text-xs text-gray-400 mt-0.5">{c.district}</p>}
              </div>
              <span className="text-xs text-gray-300 font-mono">{c.code}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
