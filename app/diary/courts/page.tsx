'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { DISTRICT_COURTS, HC_BENCHES, getCourtMobileShortLabel } from '@/lib/constants/courts'

interface CourtRow { id: string; name: string; short_name: string | null; mobile_short_name: string | null; city: string | null; builtin_code: string | null }

type EditState = { key: string; name: string; short: string; mobileShort: string } | null

const CITIES = ['Udaipur', 'Dungarpur', 'Banswara', 'Rajsamand', 'Salumber', 'Nathdwara', 'Jaipur']

function normalize(s: string | null | undefined) {
  return (s || '').trim().toLowerCase()
}

// ── Row components live outside CourtsPage on purpose ──────────────────────
// If they were defined inside the page component, React would see a brand
// new function (a "new component type") on every render — which happens on
// every keystroke since `edit` is component state — and would unmount +
// remount the row, killing focus mid-type. Keeping them at module scope with
// plain props avoids that entirely.

function BuiltinRow({
  code, name, city, override, isEditing, editShort, editMobileShort, editSaving,
  onStartEdit, onChangeShort, onChangeMobileShort, onSave, onCancel,
}: {
  code: string
  name: string
  city: string
  override: CourtRow | undefined
  isEditing: boolean
  editShort: string
  editMobileShort: string
  editSaving: boolean
  onStartEdit: () => void
  onChangeShort: (v: string) => void
  onChangeMobileShort: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const displayName = override?.name || name
  const displayShort = override?.short_name || null
  const displayMobileShort = override?.mobile_short_name || getCourtMobileShortLabel(code)

  if (isEditing) {
    return (
      <div className="px-4 py-2.5 bg-blue-50 border-b border-gray-100">
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            type="text"
            value={editShort}
            onChange={(e) => onChangeShort(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
            placeholder="Short form for diary…"
            className="w-40 px-2.5 py-1.5 border border-blue-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={editMobileShort}
            onChange={(e) => onChangeMobileShort(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
            placeholder={`Mobile (e.g. ${getCourtMobileShortLabel(code)})`}
            className="w-32 px-2.5 py-1.5 border border-purple-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:border-purple-500"
          />
          <button onClick={onSave} disabled={editSaving}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
            <Check className="w-3.5 h-3.5" />{editSaving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onCancel} className="p-1.5 rounded text-gray-400 hover:bg-gray-200">
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
        <span className="text-xs text-purple-500 font-mono bg-purple-50 px-1.5 py-0.5 rounded shrink-0" title="Mobile short form">{displayMobileShort}</span>
      </div>
      <button
        onClick={onStartEdit}
        className="shrink-0 p-1.5 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors ml-2"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function CustomRow({
  r, isEditing, editName, editShort, editMobileShort, editSaving, deleting,
  onStartEdit, onChangeName, onChangeShort, onChangeMobileShort, onSave, onCancel, onDelete,
}: {
  r: CourtRow
  isEditing: boolean
  editName: string
  editShort: string
  editMobileShort: string
  editSaving: boolean
  deleting: boolean
  onStartEdit: () => void
  onChangeName: (v: string) => void
  onChangeShort: (v: string) => void
  onChangeMobileShort: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  if (isEditing) {
    return (
      <div className="px-4 py-2.5 bg-blue-50 border-b border-gray-100">
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            type="text"
            value={editName}
            onChange={(e) => onChangeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
            placeholder="Court name"
            className="flex-1 min-w-[140px] px-2.5 py-1.5 border border-blue-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={editShort}
            onChange={(e) => onChangeShort(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
            placeholder="Short form"
            className="w-32 px-2.5 py-1.5 border border-blue-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={editMobileShort}
            onChange={(e) => onChangeMobileShort(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
            placeholder="Mobile short"
            className="w-28 px-2.5 py-1.5 border border-purple-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:border-purple-500"
          />
          <button onClick={onSave} disabled={editSaving || !editName.trim()}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
            <Check className="w-3.5 h-3.5" />{editSaving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onCancel} className="p-1.5 rounded text-gray-400 hover:bg-gray-200">
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
        {r.mobile_short_name && (
          <span className="text-xs text-purple-500 font-mono bg-purple-50 px-1.5 py-0.5 rounded shrink-0" title="Mobile short form">{r.mobile_short_name}</span>
        )}
        <span className="text-xs text-blue-400 shrink-0">custom</span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0 ml-2">
        <button onClick={onStartEdit}
          className="p-1.5 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} disabled={deleting}
          className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
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
        mobile_short_name: edit?.mobileShort.trim() || null,
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
      body: JSON.stringify({ id, name: edit.name.trim(), short_name: edit.short.trim() || null, mobile_short_name: edit.mobileShort.trim() || null }),
    })
    if (res.ok) setRows(prev => prev.map(r => r.id === id ? { ...r, name: edit!.name.trim(), short_name: edit!.short.trim() || null, mobile_short_name: edit!.mobileShort.trim() || null } : r))
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

  // ─── city section ─────────────────────────────────────────────────────────
  // A plain function that returns JSX (called inline below), not a nested
  // component — see the note above BuiltinRow for why that distinction
  // matters here.

  function renderCitySection(city: string, builtins: typeof DISTRICT_COURTS) {
    const customs = customForCity(city)
    if (builtins.length === 0 && customs.length === 0) return null
    return (
      <div key={city} className="mb-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{city}</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {builtins.map((c) => {
            const isEditing = edit?.key === c.code
            return (
              <BuiltinRow
                key={c.code}
                code={c.code}
                name={c.name}
                city={city}
                override={getOverride(c.code)}
                isEditing={isEditing}
                editShort={isEditing ? edit!.short : ''}
                editMobileShort={isEditing ? edit!.mobileShort : ''}
                editSaving={editSaving}
                onStartEdit={() => setEdit({ key: c.code, name: getOverride(c.code)?.name || c.name, short: getOverride(c.code)?.short_name || '', mobileShort: getOverride(c.code)?.mobile_short_name || '' })}
                onChangeShort={(v) => setEdit((prev) => (prev ? { ...prev, short: v } : prev))}
                onChangeMobileShort={(v) => setEdit((prev) => (prev ? { ...prev, mobileShort: v } : prev))}
                onSave={() => saveBuiltin(c.code, c.name, city)}
                onCancel={() => setEdit(null)}
              />
            )
          })}
          {customs.map((r) => {
            const isEditing = edit?.key === `CUSTOM_${r.id}`
            return (
              <CustomRow
                key={r.id}
                r={r}
                isEditing={isEditing}
                editName={isEditing ? edit!.name : ''}
                editShort={isEditing ? edit!.short : ''}
                editMobileShort={isEditing ? edit!.mobileShort : ''}
                editSaving={editSaving}
                deleting={deletingId === r.id}
                onStartEdit={() => setEdit({ key: `CUSTOM_${r.id}`, name: r.name, short: r.short_name || '', mobileShort: r.mobile_short_name || '' })}
                onChangeName={(v) => setEdit((prev) => (prev ? { ...prev, name: v } : prev))}
                onChangeShort={(v) => setEdit((prev) => (prev ? { ...prev, short: v } : prev))}
                onChangeMobileShort={(v) => setEdit((prev) => (prev ? { ...prev, mobileShort: v } : prev))}
                onSave={() => saveCustom(r.id)}
                onCancel={() => setEdit(null)}
                onDelete={() => deleteCourt(r.id)}
              />
            )
          })}
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
          Click the pencil on any court to set its short form for the diary, and its (even shorter) mobile short form — shown in purple. Custom courts appear in their city section.
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
              {HC_BENCHES.map((b) => {
                const city = b.code === 'jodhpur' ? 'Jodhpur' : 'Jaipur'
                const isEditing = edit?.key === b.code
                return (
                  <BuiltinRow
                    key={b.code}
                    code={b.code}
                    name={b.name}
                    city={city}
                    override={getOverride(b.code)}
                    isEditing={isEditing}
                    editShort={isEditing ? edit!.short : ''}
                    editMobileShort={isEditing ? edit!.mobileShort : ''}
                    editSaving={editSaving}
                    onStartEdit={() => setEdit({ key: b.code, name: getOverride(b.code)?.name || b.name, short: getOverride(b.code)?.short_name || '', mobileShort: getOverride(b.code)?.mobile_short_name || '' })}
                    onChangeShort={(v) => setEdit((prev) => (prev ? { ...prev, short: v } : prev))}
                    onChangeMobileShort={(v) => setEdit((prev) => (prev ? { ...prev, mobileShort: v } : prev))}
                    onSave={() => saveBuiltin(b.code, b.name, city)}
                    onCancel={() => setEdit(null)}
                  />
                )
              })}
            </div>
          </div>

          {/* District courts by city — custom courts appear in their city */}
          {CITIES.map(city =>
            renderCitySection(city, DISTRICT_COURTS.filter(c => c.district === city && c.code !== 'OTHER'))
          )}

          {/* Other/unassigned custom courts */}
          {otherCustoms.length > 0 && (
            <div className="mb-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Other</h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {otherCustoms.map((r) => {
                  const isEditing = edit?.key === `CUSTOM_${r.id}`
                  return (
                    <CustomRow
                      key={r.id}
                      r={r}
                      isEditing={isEditing}
                      editName={isEditing ? edit!.name : ''}
                      editShort={isEditing ? edit!.short : ''}
                      editMobileShort={isEditing ? edit!.mobileShort : ''}
                      editSaving={editSaving}
                      deleting={deletingId === r.id}
                      onStartEdit={() => setEdit({ key: `CUSTOM_${r.id}`, name: r.name, short: r.short_name || '', mobileShort: r.mobile_short_name || '' })}
                      onChangeName={(v) => setEdit((prev) => (prev ? { ...prev, name: v } : prev))}
                      onChangeShort={(v) => setEdit((prev) => (prev ? { ...prev, short: v } : prev))}
                      onChangeMobileShort={(v) => setEdit((prev) => (prev ? { ...prev, mobileShort: v } : prev))}
                      onSave={() => saveCustom(r.id)}
                      onCancel={() => setEdit(null)}
                      onDelete={() => deleteCourt(r.id)}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
