'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Building2 } from 'lucide-react'

interface CustomCourt { id: string; name: string; city: string | null }

export default function CourtsPage() {
  const [courts, setCourts] = useState<CustomCourt[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState('')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setAuthToken(session.access_token)
      const res = await fetch('/api/custom-courts', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) setCourts(await res.json())
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
      body: JSON.stringify({ name: name.trim(), city: city.trim() || null }),
    })
    if (res.ok) {
      const court = await res.json()
      setCourts(prev => [...prev, court])
      setName('')
      setCity('')
    } else {
      const j = await res.json()
      setError(j.error || 'Failed to save')
    }
    setSaving(false)
  }

  async function deleteCourt(id: string) {
    setDeletingId(id)
    await fetch('/api/custom-courts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id }),
    })
    setCourts(prev => prev.filter(c => c.id !== id))
    setDeletingId(null)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>My Courts</h1>
        <p className="text-sm text-gray-400 mt-0.5">Save courts you appear in — then pick from the list when adding a case.</p>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add New Court</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Court Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') addCourt() }}
              placeholder="e.g. ADJ Court No. 4, Pali"
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

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : courts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No custom courts yet. Add one above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {courts.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-800">{c.name}</p>
                {c.city && <p className="text-xs text-gray-400 mt-0.5">{c.city}</p>}
              </div>
              <button
                onClick={() => deleteCourt(c.id)}
                disabled={deletingId === c.id}
                className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                title="Delete court"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
