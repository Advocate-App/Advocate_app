'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'

interface ClientRecord { id: string; name: string; phone: string | null; city: string | null; is_company: boolean }

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState('')

  // Add form
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [isCompany, setIsCompany] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editIsCompany, setEditIsCompany] = useState(false)
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
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null, city: city.trim() || null, is_company: isCompany }),
    })
    if (res.ok) {
      const client = await res.json()
      setClients(prev => [...prev, client].sort((a, b) => {
        if (a.is_company !== b.is_company) return a.is_company ? -1 : 1
        return a.name.localeCompare(b.name)
      }))
      setName(''); setPhone(''); setCity(''); setIsCompany(false)
    } else {
      const j = await res.json(); setError(j.error || 'Failed')
    }
    setSaving(false)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setEditSaving(true)
    const res = await fetch('/api/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id, name: editName.trim(), phone: editPhone.trim() || null, city: editCity.trim() || null, is_company: editIsCompany }),
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
    setEditingId(c.id); setEditName(c.name); setEditPhone(c.phone || ''); setEditCity(c.city || ''); setEditIsCompany(c.is_company)
  }

  const companies = clients.filter(c => c.is_company)
  const individuals = clients.filter(c => !c.is_company)

  function ClientRow({ c }: { c: ClientRecord }) {
    if (editingId === c.id) {
      return (
        <div className="px-4 py-3 bg-gray-50">
          <div className="flex flex-wrap gap-2 mb-2">
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
              placeholder="Name *" className="flex-1 min-w-[140px] px-2 py-1.5 border border-gray-300 rounded text-sm bg-white text-gray-900" />
            <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)}
              placeholder="Phone" className="w-32 px-2 py-1.5 border border-gray-300 rounded text-sm bg-white text-gray-900" />
            <input type="text" value={editCity} onChange={e => setEditCity(e.target.value)}
              placeholder="City" className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm bg-white text-gray-900" />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={editIsCompany} onChange={e => setEditIsCompany(e.target.checked)} className="w-3.5 h-3.5" />
              Company
            </label>
            <button onClick={() => saveEdit(c.id)} disabled={editSaving || !editName.trim()}
              className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium text-white bg-green-600 disabled:opacity-50">
              <Check className="w-3 h-3" />{editSaving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded text-xs text-gray-600 bg-white border border-gray-200">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-sm text-gray-800">{c.name}</span>
          {(c.phone || c.city) && (
            <span className="ml-2 text-xs text-gray-400">{[c.phone, c.city].filter(Boolean).join(' · ')}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => startEdit(c)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => deleteClient(c.id)} disabled={deletingId === c.id}
            className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Clients</h1>
        <p className="text-sm text-gray-400 mt-0.5">Save clients and companies — link them to cases for easy tracking.</p>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Client / Company</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <input type="text" value={name} onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') addClient() }}
            placeholder="Name *"
            className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:border-[#1e3a5f]" />
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addClient() }}
            placeholder="Phone"
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:border-[#1e3a5f]" />
          <input type="text" value={city} onChange={e => setCity(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addClient() }}
            placeholder="City"
            className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:border-[#1e3a5f]" />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={isCompany} onChange={e => setIsCompany(e.target.checked)} className="w-4 h-4" />
            This is a company
          </label>
          <button onClick={addClient} disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#1e3a5f' }}>
            <Plus className="w-4 h-4" />{saving ? 'Saving…' : 'Add'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : (
        <>
          {/* Companies */}
          {companies.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Companies ({companies.length})</h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {companies.map(c => <ClientRow key={c.id} c={c} />)}
              </div>
            </div>
          )}

          {/* Individuals */}
          {individuals.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Individuals ({individuals.length})</h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {individuals.map(c => <ClientRow key={c.id} c={c} />)}
              </div>
            </div>
          )}

          {companies.length === 0 && individuals.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
              No clients yet. Add one above.
            </div>
          )}
        </>
      )}
    </div>
  )
}
