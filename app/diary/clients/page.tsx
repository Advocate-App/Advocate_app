'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, User, Pencil, Check, X } from 'lucide-react'

interface ClientRecord { id: string; name: string; phone: string | null; email: string | null; city: string | null }

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState('')

  // Add form
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setAuthToken(session.access_token)
      const res = await fetch('/api/clients', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) setClients(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  async function addClient() {
    if (!name.trim()) { setError('Client name is required'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null, city: city.trim() || null }),
    })
    if (res.ok) {
      const client = await res.json()
      setClients(prev => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)))
      setName(''); setPhone(''); setCity('')
    } else {
      const j = await res.json()
      setError(j.error || 'Failed to save')
    }
    setSaving(false)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setEditSaving(true)
    const res = await fetch('/api/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id, name: editName.trim(), phone: editPhone.trim() || null, city: editCity.trim() || null }),
    })
    if (res.ok) {
      const updated = await res.json()
      setClients(prev => prev.map(c => c.id === id ? updated : c))
      setEditingId(null)
    }
    setEditSaving(false)
  }

  async function deleteClient(id: string) {
    setDeletingId(id)
    await fetch('/api/clients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id }),
    })
    setClients(prev => prev.filter(c => c.id !== id))
    setDeletingId(null)
  }

  function startEdit(c: ClientRecord) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditPhone(c.phone || '')
    setEditCity(c.city || '')
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>My Clients</h1>
        <p className="text-sm text-gray-400 mt-0.5">Save client profiles — link them to cases and update all at once when a name changes.</p>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add New Client</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') addClient() }}
              placeholder="e.g. Ramesh Kumar"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addClient() }}
              placeholder="e.g. 98000 00000"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addClient() }}
              placeholder="e.g. Udaipur"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <button
          onClick={addClient}
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
          style={{ background: '#1e3a5f' }}
        >
          <Plus className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Client'}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : clients.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <User className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No clients yet. Add one above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {clients.map((c) => (
            <div key={c.id} className="px-5 py-4">
              {editingId === c.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                      placeholder="Name *"
                    />
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                      placeholder="Phone"
                    />
                    <input
                      type="text"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                      placeholder="City"
                    />
                  </div>
                  <p className="text-xs text-gray-400">Updating the name will also update all linked cases automatically.</p>
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
                      <X className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[c.phone, c.city].filter(Boolean).join(' · ') || 'No details'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(c)}
                      className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Edit client"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteClient(c.id)}
                      disabled={deletingId === c.id}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Delete client"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
