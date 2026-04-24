'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { DISTRICT_COURTS, HC_BENCHES } from '@/lib/constants/courts'

interface CourtRow { id: string; name: string; short_name: string | null; city: string | null; builtin_code: string | null }

type EditState = { key: string; name: string; short: string } | null

const CITIES = ['Udaipur', 'Dungarpur', 'Banswara', 'Rajsamand', 'Salumber', 'Nathdwara', 'Jaipur']

function normalize(s: string | null | undefined) {
  return (s || '').trim().toLowerCase()
}

export default function CourtsPage() {
  const [rows, setRows] = useState<CourtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState('')

  // Add form
  const [addName, setAddName] = useState('')
  const [addShort, setAddShort] = useState('')
  const [addCity, setAddCity] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit — one at a time, stable state
  const [edit, setEdit] = useState<EditState>(null)
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

  // ─── helpers ────────────────────────────────────────────────────────────────

  function getOverride(code: string) {
    return rows.find(r => r.builtin_code === code)
  }

  function customForCity(city: string) {
    return rows.filter(r => !r.builtin_code && normalize(r.city) === normalize(city))
  }

  function customOther() {
    const known = CITIES.map(normalize)
    return rows.filter(r => !r.builtin_code && !known.includes(normalize(r.city)))
  }

  // ─── add ────────────────────────────────────────────────────────────────────

  async function addCourt() {
    if (!addName.trim()) { setAddError('Name is required'); return }
    setAddSaving(true); setAddError('')
    const res = await fetch('/api/custom-courts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: addName.trim(), short_name: addShort.trim() || null, city: addCity.trim() || null }),
    })
    if (res.ok) {
      const newRow = await res.json()
      setRows(prev => [...prev, newRow])
      setAddName(''); setAddShort(''); setAddCity('')
    } else {
      const j = await res.json(); setAddError(j.error || 'Failed')
    }
    setAddSaving(false)
  }

  // ─── edit built-in ──────────────────────────────────────────────────────────

  async function saveBuiltin(code: string, defaultName: string, defaultCity: string) {
    setEditSaving(true)
    const res = await fetch('/api/custom-courts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        name: edit?.name.trim() || defaultName,
        short_name: edit?.short.trim() || null,
        city: defaultCity,
        builtin_code: code,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setRows(prev => [...prev.filter(r => r.builtin_code !== code), updated])
    }
    setEdit(null); setEditSaving(false)
  }

  // ─── edit custom ────────────────────────────────────────────────────────────

  async function saveCustom(id: string) {
    if (!edit?.name.trim()) return
    setEditSaving(true)
    const res = await fetch('/api/custom-courts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id, name: edit.name.trim(), short_name: edit.short.trim() || null }),
    })
    if (res.ok) setRows(prev => prev.map(r => r.id === id ? { ...r, name: edit!.name.trim(), short_name: edit!.short.trim() || null } : r))
    setEdit(null); setEditSaving(false)
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

  // ─── row renderers ───────────────────────────────────────────────────────────

  function BuiltinRow({ code, name, city }: { code: string; name: string; city: string }) {
    const ov = getOverride(code)
    const displayName = ov?.name || name
    const displayShort = ov?.short_name || null
    const isEditing = edit?.key === code

    if (isEditing) {
      return (
        <div className="px-4 py-2.5 bg-blue-50 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              type="text"
              value={edit.short}
              onChange={e => setEdit({ ...edit, short: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveBuiltin(code, name, city); if (e.key === 'Escape') setEdit(null) }}
              placeholder="Short form for diary…"
              className="w-40 px-2.5 py-1.5 border border-blue-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-500"
            />
            <button onClick={() => saveBuiltin(code, name, city)} disabled={editSaving}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <Check className="w-3.5 h-3.5" />{editSaving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEdit(null)} className="p-1.5 rounded text-gray-400 hover:bg-gray-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-100 last:border-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-gray-800 truncate">{displayName}</span>
          {displayShort && (
            <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{displayShort}</span>
          )}
        </div>
        <button
          onClick={() => setEdit({ key: code, name: displayName, short: displayShort || '' })}
          className="shrink-0 p-1.5 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors ml-2"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  function CustomRow({ r }: { r: CourtRow }) {
    const isEditing = edit?.key === `CUSTOM_${r.id}`

    if (isEditing) {
      return (
        <div className="px-4 py-2.5 bg-blue-50 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              type="text"
              value={edit.name}
              onChange={e => setEdit({ ...edit, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveCustom(r.id); if (e.key === 'Escape') setEdit(null) }}
              placeholder="Court name"
              className="flex-1 min-w-[140px] px-2.5 py-1.5 border border-blue-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={edit.short}
              onChange={e => setEdit({ ...edit, short: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveCustom(r.id); if (e.key === 'Escape') setEdit(null) }}
              placeholder="Short form"
              className="w-32 px-2.5 py-1.5 border border-blue-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-500"
            />
            <button onClick={() => saveCustom(r.id)} disabled={editSaving || !edit.name.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <Check className="w-3.5 h-3.5" />{editSaving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEdit(null)} className="p-1.5 rounded text-gray-400 hover:bg-gray-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-100 last:border-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-gray-800 truncate">{r.name}</span>
          {r.short_name && (
            <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{r.short_name}</span>
          )}
          <span className="text-xs text-blue-400 shrink-0">custom</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-2">
          <button onClick={() => setEdit({ key: `CUSTOM_${r.id}`, name: r.name, short: r.short_name || '' })}
            className="p-1.5 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => deleteCourt(r.id)} disabled={deletingId === r.id}
            className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  function CitySection({ city, builtins }: { city: string; builtins: typeof DISTRICT_COURTS }) {
    const customs = customForCity(city)
    if (builtins.length === 0 && customs.length === 0) return null
    return (
      <div className="mb-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{city}</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {builtins.map(c => <BuiltinRow key={c.code} code={c.code} name={c.name} city={city} />)}
          {customs.map(r => <CustomRow key={r.id} r={r} />)}
        </div>
      </div>
    )
  }

  const otherCustoms = customOther()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Courts</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Click the pencil on any court to set its short form for the diary. Custom courts appear in their city section.
        </p>
      </div>

      {/* Add custom court */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Custom Court</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <input type="text" value={addName} onChange={e => { setAddName(e.target.value); setAddError('') }}
            onKeyDown={e => { if (e.key === 'Enter') addCourt() }}
            placeholder="Court name *"
            className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:border-[#1e3a5f]" />
          <input type="text" value={addShort} onChange={e => setAddShort(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCourt() }}
            placeholder="Short form"
            className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:border-[#1e3a5f]" />
          <select value={addCity} onChange={e => setAddCity(e.target.value)}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:border-[#1e3a5f]">
            <option value="">City…</option>
            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="Salumber">Salumber</option>
            <option value="Nathdwara">Nathdwara</option>
            <option value="Jodhpur">Jodhpur</option>
            <option value="Other">Other</option>
          </select>
          <button onClick={addCourt} disabled={addSaving || !addName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#1e3a5f' }}>
            <Plus className="w-4 h-4" />{addSaving ? 'Saving…' : 'Add'}
          </button>
        </div>
        {addError && <p className="text-xs text-red-500">{addError}</p>}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : (
        <>
          {/* High Court */}
          <div className="mb-5">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">High Court of Rajasthan</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {HC_BENCHES.map(b => (
                <BuiltinRow key={b.code} code={b.code} name={b.name} city={b.code === 'jodhpur' ? 'Jodhpur' : 'Jaipur'} />
              ))}
            </div>
          </div>

          {/* District courts by city — custom courts appear in their city */}
          {CITIES.map(city => (
            <CitySection
              key={city}
              city={city}
              builtins={DISTRICT_COURTS.filter(c => c.district === city && c.code !== 'OTHER')}
            />
          ))}

          {/* Other/unassigned custom courts */}
          {otherCustoms.length > 0 && (
            <div className="mb-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Other</h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {otherCustoms.map(r => <CustomRow key={r.id} r={r} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
