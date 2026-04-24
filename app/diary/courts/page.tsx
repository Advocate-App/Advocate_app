'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { DISTRICT_COURTS, HC_BENCHES } from '@/lib/constants/courts'

interface CourtRow { id: string; name: string; short_name: string | null; city: string | null; builtin_code: string | null }

// Group built-in courts by city
const BUILTIN_BY_CITY: { city: string; courts: typeof DISTRICT_COURTS }[] = [
  { city: 'Udaipur', courts: DISTRICT_COURTS.filter(c => c.district === 'Udaipur' && c.code !== 'OTHER') },
  { city: 'Dungarpur', courts: DISTRICT_COURTS.filter(c => c.district === 'Dungarpur') },
  { city: 'Banswara', courts: DISTRICT_COURTS.filter(c => c.district === 'Banswara') },
  { city: 'Rajsamand', courts: DISTRICT_COURTS.filter(c => c.district === 'Rajsamand') },
  { city: 'Jaipur', courts: DISTRICT_COURTS.filter(c => c.district === 'Jaipur') },
]

export default function CourtsPage() {
  const [rows, setRows] = useState<CourtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState('')

  // Add form
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Edit state (works for both custom and builtin)
  const [editingCode, setEditingCode] = useState<string | null>(null) // builtin code or custom id
  const [editName, setEditName] = useState('')
  const [editShort, setEditShort] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setAuthToken(session.access_token)
      const res = await fetch('/api/custom-courts', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) setRows(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  // Get override for a built-in court code
  function getOverride(code: string): CourtRow | undefined {
    return rows.find(r => r.builtin_code === code)
  }

  // Get custom courts (no builtin_code)
  const customCourts = rows.filter(r => !r.builtin_code)

  async function addCourt() {
    if (!name.trim()) { setError('Court name is required'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/custom-courts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: name.trim(), short_name: shortName.trim() || null, city: city.trim() || null }),
    })
    if (res.ok) {
      const court = await res.json()
      setRows(prev => [...prev, court])
      setName(''); setShortName(''); setCity('')
    } else {
      const j = await res.json(); setError(j.error || 'Failed')
    }
    setSaving(false)
  }

  // Edit built-in court (saves as override)
  function startBuiltinEdit(code: string, defaultName: string) {
    const ov = getOverride(code)
    setEditingCode(code)
    setEditName(ov?.name || defaultName)
    setEditShort(ov?.short_name || '')
  }

  async function saveBuiltinEdit(code: string, defaultName: string, defaultCity: string) {
    setEditSaving(true)
    const res = await fetch('/api/custom-courts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: editName.trim() || defaultName, short_name: editShort.trim() || null, city: defaultCity, builtin_code: code }),
    })
    if (res.ok) {
      const updated = await res.json()
      setRows(prev => {
        const without = prev.filter(r => r.builtin_code !== code)
        return [...without, updated]
      })
    }
    setEditingCode(null); setEditSaving(false)
  }

  // Edit custom court
  function startCustomEdit(r: CourtRow) {
    setEditingCode(`CUSTOM_${r.id}`)
    setEditName(r.name)
    setEditShort(r.short_name || '')
  }

  async function saveCustomEdit(id: string) {
    setEditSaving(true)
    const res = await fetch('/api/custom-courts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id, name: editName.trim(), short_name: editShort.trim() || null }),
    })
    if (res.ok) {
      const updated = await res.json()
      setRows(prev => prev.map(r => r.id === id ? updated : r))
    }
    setEditingCode(null); setEditSaving(false)
  }

  async function deleteCourt(id: string) {
    setDeletingId(id)
    await fetch('/api/custom-courts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id }),
    })
    setRows(prev => prev.filter(r => r.id !== id))
    setDeletingId(null)
  }

  function InlineEditForm({ onSave, onCancel, showName = false }: { onSave: () => void; onCancel: () => void; showName?: boolean }) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1">
        {showName && (
          <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
            placeholder="Court name" className="px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900 w-48" />
        )}
        <input type="text" value={editShort} onChange={e => setEditShort(e.target.value)}
          placeholder="Short form (diary)" className="px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900 w-32" />
        <button onClick={onSave} disabled={editSaving}
          className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
          <Check className="w-3 h-3" />{editSaving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-3 py-1 rounded text-xs text-gray-600 bg-gray-100 hover:bg-gray-200">
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Courts</h1>
        <p className="text-sm text-gray-400 mt-0.5">Edit short forms to change how courts appear in your diary. Add custom courts below.</p>
      </div>

      {/* Add custom court */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Custom Court</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <input type="text" value={name} onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') addCourt() }}
            placeholder="Court name *"
            className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:border-[#1e3a5f]" />
          <input type="text" value={shortName} onChange={e => setShortName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCourt() }}
            placeholder="Short form"
            className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:border-[#1e3a5f]" />
          <input type="text" value={city} onChange={e => setCity(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCourt() }}
            placeholder="City"
            className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:border-[#1e3a5f]" />
          <button onClick={addCourt} disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#1e3a5f' }}>
            <Plus className="w-4 h-4" />{saving ? 'Saving…' : 'Add'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Custom courts */}
      {customCourts.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">My Custom Courts</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {customCourts.map(c => (
              <div key={c.id} className="px-4 py-3">
                {editingCode === `CUSTOM_${c.id}` ? (
                  <InlineEditForm showName onSave={() => saveCustomEdit(c.id)} onCancel={() => setEditingCode(null)} />
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-800">{c.name}</span>
                      {c.short_name && <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{c.short_name}</span>}
                      {c.city && <span className="text-xs text-gray-400">{c.city}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startCustomEdit(c)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteCourt(c.id)} disabled={deletingId === c.id}
                        className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High Court */}
      <div className="mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">High Court of Rajasthan</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {HC_BENCHES.map(b => {
            const ov = getOverride(b.code)
            const city = b.code === 'jodhpur' ? 'Jodhpur' : 'Jaipur'
            return (
              <div key={b.code} className="px-4 py-3">
                {editingCode === b.code ? (
                  <InlineEditForm onSave={() => saveBuiltinEdit(b.code, b.name, city)} onCancel={() => setEditingCode(null)} />
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-800">{ov?.name || b.name}</span>
                      <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                        {ov?.short_name || (b.code === 'jodhpur' ? 'HC-Jod' : 'HC-Jpr')}
                      </span>
                      <span className="text-xs text-gray-400">{city}</span>
                    </div>
                    <button onClick={() => startBuiltinEdit(b.code, b.name)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* District courts by city */}
      {BUILTIN_BY_CITY.map(({ city, courts }) => (
        <div key={city} className="mb-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{city}</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {loading ? (
              <div className="px-4 py-3 text-sm text-gray-400">Loading…</div>
            ) : courts.map(c => {
              const ov = getOverride(c.code)
              return (
                <div key={c.code} className="px-4 py-3">
                  {editingCode === c.code ? (
                    <InlineEditForm onSave={() => saveBuiltinEdit(c.code, c.name, c.district || city)} onCancel={() => setEditingCode(null)} />
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-800">{ov?.name || c.name}</span>
                        {(ov?.short_name) && (
                          <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{ov.short_name}</span>
                        )}
                      </div>
                      <button onClick={() => startBuiltinEdit(c.code, c.name)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
