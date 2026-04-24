'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DISTRICT_COURTS,
  DISTRICT_CASE_TYPES,
  DISTRICT_STAGES,
  HC_BENCHES,
  HC_CASE_TYPES,
  HC_STAGES,
  CLIENT_SIDES_DISTRICT,
  CLIENT_SIDES_HC,
} from '@/lib/constants/courts'
import { ArrowLeft, Building2, Scale, ChevronDown, Search, Printer, Plus, X, User, Check } from 'lucide-react'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type CourtLevel = 'district' | 'high_court'

interface CustomCourt { id: string; name: string; city: string | null }
interface ClientRecord { id: string; name: string; phone: string | null; email: string | null; city: string | null }

interface FormData {
  court_level: CourtLevel | null
  case_number: string
  case_year: number
  case_type: string
  party_plaintiff: string
  party_defendant: string
  client_name: string
  client_side: string
  our_role: string
  opposite_advocate: string
  filed_date: string
  case_stage: string
  ecourts_cnr: string
  notes: string
  court_code: string
  court_name_custom: string
  hc_bench: string
  next_hearing_date: string
}

interface FieldErrors { [key: string]: string }

const INITIAL: FormData = {
  court_level: null, case_number: '', case_year: new Date().getFullYear(),
  case_type: '', party_plaintiff: '', party_defendant: '',
  client_name: '', client_side: '', our_role: '', opposite_advocate: '',
  filed_date: '', case_stage: '', ecourts_cnr: '', notes: '',
  court_code: '', court_name_custom: '', hc_bench: '', next_hearing_date: '',
}

// ---------------------------------------------------------------------------
// Searchable dropdown — supports __HEADER__ and __ACTION__ special values
// ---------------------------------------------------------------------------
function SearchableSelect({
  label, options, value, onChange, placeholder = 'Select...', error, required,
}: {
  label: string
  options: { value: string; label: string; sub?: string }[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  required?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter(o =>
      o.value === '__HEADER__' || o.value === '__ACTION__' ||
      o.label.toLowerCase().includes(q) || o.sub?.toLowerCase().includes(q)
    )
  }, [search, options])

  const selectedLabel = options.find(o => o.value === value)?.label || ''

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch('') }}
        className={`w-full flex items-center justify-between px-3 py-2.5 border rounded-lg text-sm text-left bg-white transition-colors ${
          error ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <span className={value && value !== '__HEADER__' && value !== '__ACTION__' ? 'text-gray-900' : 'text-gray-400'}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 border border-gray-200 rounded-md bg-gray-50">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input autoFocus type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search..." className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400" />
            </div>
          </div>
          <ul className="overflow-y-auto max-h-56">
            {filtered.length === 0 && <li className="px-3 py-2.5 text-sm text-gray-400">No matches</li>}
            {filtered.map((o) => {
              if (o.value === '__HEADER__') return (
                <li key={o.value}>
                  <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50">{o.label}</div>
                </li>
              )
              if (o.value === '__ACTION__') return (
                <li key={o.value}>
                  <button type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" />{o.label}
                  </button>
                </li>
              )
              return (
                <li key={o.value}>
                  <button type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${o.value === value ? 'bg-blue-50 font-medium' : ''}`}>
                    <div>{o.label}</div>
                    {o.sub && <div className="text-xs text-gray-400 mt-0.5">{o.sub}</div>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Simple select (no search)
// ---------------------------------------------------------------------------
function SimpleSelect({ label, options, value, onChange, placeholder = 'Select...', error, required }: {
  label: string; options: { value: string; label: string }[]; value: string
  onChange: (v: string) => void; placeholder?: string; error?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-white appearance-none transition-colors ${
          error ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-300 hover:border-gray-400'
        } ${!value ? 'text-gray-400' : 'text-gray-900'}`}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Text input
// ---------------------------------------------------------------------------
function TextInput({ label, value, onChange, placeholder, error, required, type = 'text', disabled }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; error?: string; required?: boolean; type?: string; disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className={`w-full px-3 py-2.5 border rounded-lg text-sm transition-colors ${
          error ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-300 hover:border-gray-400'
        } ${disabled ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------
function TextArea({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 transition-colors resize-none" />
    </div>
  )
}

function capitalize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Inline add-court panel
// ---------------------------------------------------------------------------
function AddCourtPanel({ onSave, onCancel }: { onSave: (name: string, city: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
      <p className="text-xs font-semibold text-blue-800">New Court</p>
      <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Court name *" className="w-full px-3 py-2 border border-blue-300 rounded text-sm bg-white text-gray-900" />
      <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
        placeholder="City / District" className="w-full px-3 py-2 border border-blue-300 rounded text-sm bg-white text-gray-900" />
      <div className="flex gap-2">
        <button type="button" disabled={!name.trim() || saving}
          onClick={async () => { setSaving(true); await onSave(name, city); setSaving(false) }}
          className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded disabled:opacity-50 hover:bg-blue-700">
          {saving ? 'Saving…' : 'Save Court'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline add-client panel
// ---------------------------------------------------------------------------
function AddClientPanel({ onSave, onCancel }: { onSave: (name: string, phone: string, city: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
      <p className="text-xs font-semibold text-green-800">New Client</p>
      <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Client full name *" className="w-full px-3 py-2 border border-green-300 rounded text-sm bg-white text-gray-900" />
      <div className="grid grid-cols-2 gap-2">
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone" className="px-3 py-2 border border-green-300 rounded text-sm bg-white text-gray-900" />
        <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
          placeholder="City" className="px-3 py-2 border border-green-300 rounded text-sm bg-white text-gray-900" />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!name.trim() || saving}
          onClick={async () => { setSaving(true); await onSave(name, phone, city); setSaving(false) }}
          className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded disabled:opacity-50 hover:bg-green-700">
          {saving ? 'Saving…' : 'Save Client'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function NewCasePage() {
  const router = useRouter()
  const [form, setForm] = useState<FormData>({ ...INITIAL })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [customStage, setCustomStage] = useState('')

  // Courts & clients
  const [customCourts, setCustomCourts] = useState<CustomCourt[]>([])
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [authToken, setAuthToken] = useState('')
  const [showAddCourt, setShowAddCourt] = useState(false)
  const [showAddClient, setShowAddClient] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [city, setCity] = useState('')

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => { const c = { ...prev }; delete c[key]; return c })
  }

  // Load auth token + custom courts + clients
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const token = session.access_token
      setAuthToken(token)
      const headers = { Authorization: `Bearer ${token}` }
      // Gracefully ignore errors (tables may not exist yet)
      const [cr, cl] = await Promise.all([
        fetch('/api/custom-courts', { headers }).catch(() => null),
        fetch('/api/clients', { headers }).catch(() => null),
      ])
      if (cr?.ok) setCustomCourts(await cr.json())
      if (cl?.ok) setClients(await cl.json())
    }
    load()
  }, [])

  async function addCustomCourt(name: string, courtCity: string) {
    const res = await fetch('/api/custom-courts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name, city: courtCity || null }),
    })
    if (res.ok) {
      const court: CustomCourt = await res.json()
      setCustomCourts(prev => [...prev, court])
      set('court_code', `CUSTOM_${court.id}`)
      if (court.city) setCity(court.city)
      setShowAddCourt(false)
    }
  }

  async function addClient(name: string, phone: string, clientCity: string) {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name, phone: phone || null, city: clientCity || null }),
    })
    if (res.ok) {
      const client: ClientRecord = await res.json()
      setClients(prev => [...prev, client])
      setSelectedClientId(client.id)
      set('client_name', client.name)
      setShowAddClient(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Step A: pick court level
  // ---------------------------------------------------------------------------
  if (!form.court_level) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link href="/diary/cases" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Cases
        </Link>
        <h2 className="text-2xl font-bold text-gray-800 mb-2" style={{ fontFamily: 'Georgia, serif' }}>Add New Case</h2>
        <p className="text-gray-500 mb-8">Select the court level to get started.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button onClick={() => set('court_level', 'district')}
            className="group flex flex-col items-center gap-4 p-8 bg-white rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] hover:shadow-md transition-all">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
              <Building2 className="w-8 h-8" style={{ color: '#1e3a5f' }} />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>District Court</h3>
              <p className="text-sm text-gray-500 mt-1">Sessions, MACT, Consumer, Family, Commercial</p>
            </div>
          </button>
          <button onClick={() => set('court_level', 'high_court')}
            className="group flex flex-col items-center gap-4 p-8 bg-white rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] hover:shadow-md transition-all">
            <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
              <Scale className="w-8 h-8" style={{ color: '#1e3a5f' }} />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>High Court</h3>
              <p className="text-sm text-gray-500 mt-1">Rajasthan HC — Jodhpur & Jaipur Bench</p>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  function validate(): boolean {
    const e: FieldErrors = {}
    if (!form.case_number.trim()) e.case_number = 'Case number is required'
    if (!form.party_plaintiff.trim()) e.party_plaintiff = form.court_level === 'high_court' ? 'Petitioner is required' : 'Plaintiff is required'
    if (!form.party_defendant.trim()) e.party_defendant = form.court_level === 'high_court' ? 'Respondent is required' : 'Defendant is required'
    if (form.court_level === 'district') {
      if (!form.court_code) e.court_code = 'Court is required'
      if (form.court_code === 'OTHER' && !form.court_name_custom.trim()) e.court_name_custom = 'Please specify the court name'
    }
    if (form.court_level === 'high_court') {
      if (!form.hc_bench) e.hc_bench = 'Bench selection is required'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------
  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    setSaveError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setSaveError('Not logged in.'); setSaving(false); return }

      let courtName: string
      let courtCode: string | null = null

      if (form.court_level === 'district') {
        if (form.court_code.startsWith('CUSTOM_')) {
          const customId = form.court_code.replace('CUSTOM_', '')
          const c = customCourts.find(c => c.id === customId)
          courtName = c?.name || 'Custom Court'
          courtCode = form.court_code
        } else if (form.court_code === 'OTHER') {
          courtName = form.court_name_custom.trim()
          courtCode = 'OTHER'
        } else {
          const c = DISTRICT_COURTS.find(c => c.code === form.court_code)
          courtName = c?.name || form.court_code
          courtCode = form.court_code
        }
      } else {
        const bench = HC_BENCHES.find(b => b.code === form.hc_bench)
        courtName = bench?.name || form.hc_bench
        courtCode = form.hc_bench
      }

      const body = {
        court_level: form.court_level,
        court_code: courtCode,
        court_name: courtName,
        city: city || null,
        case_number: form.case_number.trim(),
        case_year: form.case_year,
        case_type: form.case_type || null,
        party_plaintiff: form.party_plaintiff.trim(),
        party_defendant: form.party_defendant.trim(),
        status: 'active',
        client_id: selectedClientId || null,
        client_name: form.client_name.trim() || null,
        client_side: form.client_side || null,
        our_role: form.our_role.trim() || null,
        opposite_advocate: form.opposite_advocate.trim() || null,
        filed_date: form.filed_date || null,
        case_stage: form.case_stage === 'Custom...' ? (customStage.trim() || null) : (form.case_stage || null),
        next_hearing_date: form.next_hearing_date || null,
        ecourts_cnr: form.ecourts_cnr.trim() || null,
        notes: form.notes.trim() || null,
      }

      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setSaveError(json.error || 'Failed to save case'); setSaving(false); return }
      router.push('/diary/search')
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Derived option lists
  // ---------------------------------------------------------------------------
  const isDistrict = form.court_level === 'district'

  const allCourtOptions = [
    ...DISTRICT_COURTS.map(c => ({ value: c.code, label: `${c.name}${c.district ? ` (${c.district})` : ''}` })),
    ...(customCourts.length > 0 ? [{ value: '__HEADER__', label: 'My Courts' }] : []),
    ...customCourts.map(c => ({ value: `CUSTOM_${c.id}`, label: c.name, sub: c.city || '' })),
    { value: '__ACTION__', label: 'Add custom court…' },
  ]

  const benchOptions = HC_BENCHES.map(b => ({ value: b.code, label: b.name }))
  const caseTypeOptions = (isDistrict ? DISTRICT_CASE_TYPES : HC_CASE_TYPES).map(t => ({ value: t, label: t }))
  const stageOptions = (isDistrict ? DISTRICT_STAGES : HC_STAGES).map(s => ({ value: s, label: s }))
  const sideOptions = (isDistrict ? CLIENT_SIDES_DISTRICT : CLIENT_SIDES_HC).map(s => ({ value: s, label: capitalize(s) }))

  const clientOptions = [
    ...(clients.length > 0 ? [{ value: '__HEADER__', label: 'Saved Clients' }] : []),
    ...clients.map(c => ({ value: c.id, label: c.name, sub: [c.phone, c.city].filter(Boolean).join(' · ') })),
    { value: '__ACTION__', label: 'Add new client…' },
  ]

  const selectedCourt = DISTRICT_COURTS.find(c => c.code === form.court_code)

  // ---------------------------------------------------------------------------
  // Step B: the form
  // ---------------------------------------------------------------------------
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => { setForm({ ...INITIAL }); setErrors({}); setSaveError(null) }}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>
            {isDistrict ? 'District Court' : 'High Court'} — New Case
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Fields marked with * are required.</p>
        </div>
        <button onClick={() => window.print()}
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors print:hidden">
          <Printer className="w-4 h-4" /> Print Blank Form
        </button>
      </div>

      {/* Printable blank form */}
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          body > * { display: none !important; }
          #blank-case-form { display: block !important; }
        }
      `}</style>
      <div id="blank-case-form" style={{ display: 'none', fontFamily: 'Georgia, serif', fontSize: '13px', color: '#111' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: '4mm', marginBottom: '5mm' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#555' }}>Advocate Diary</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', margin: '2mm 0' }}>Case Registration Form</div>
          <div style={{ fontSize: '11px', color: '#777' }}>Fill in and enter into the system later</div>
        </div>
        {[
          ['Court Name', ''],['Court Type', 'District Court / High Court'],['Case Type', ''],
          ['Case Number', ''],['Case Year', ''],['Filed Date', ''],
          ['Party 1 (Plaintiff / Petitioner)', ''],['Party 2 (Defendant / Respondent)', ''],
          ['Client Name', ''],['Client Side', 'Plaintiff / Defendant / Petitioner / Respondent'],
          ['Our Role', ''],['Opposite Advocate', ''],
          ['Case Stage', ''],['Next Hearing Date', ''],
          ['eCourts CNR Number', ''],['Notes', ''],
        ].map(([label, hint]) => (
          <div key={label} style={{ marginBottom: '5mm' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#555', marginBottom: '1mm' }}>{label}</div>
            {hint ? (
              <div style={{ borderBottom: '1px solid #bbb', paddingBottom: '1mm', color: '#aaa', fontSize: '11px', fontStyle: 'italic' }}>{hint}</div>
            ) : (
              <div style={{ borderBottom: '1px solid #bbb', height: '6mm' }} />
            )}
          </div>
        ))}
      </div>

      {saveError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{saveError}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">

        {/* ── Section 1: Court ── */}
        <div className="p-6 space-y-5">
          <h3 className="text-base font-semibold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>Court Details</h3>

          {isDistrict ? (
            <>
              <SearchableSelect
                label="Court" options={allCourtOptions} value={form.court_code} error={errors.court_code} required
                placeholder="Search courts…"
                onChange={(v) => {
                  if (v === '__HEADER__') return
                  if (v === '__ACTION__') { setShowAddCourt(true); return }
                  set('court_code', v)
                  setShowAddCourt(false)
                  if (v.startsWith('CUSTOM_')) {
                    const c = customCourts.find(c => c.id === v.replace('CUSTOM_', ''))
                    setCity(c?.city || '')
                  } else {
                    const c = DISTRICT_COURTS.find(c => c.code === v)
                    setCity(c?.district || '')
                  }
                }}
              />
              {showAddCourt && (
                <AddCourtPanel onSave={addCustomCourt} onCancel={() => setShowAddCourt(false)} />
              )}
              {form.court_code === 'OTHER' && (
                <TextInput label="Court Name (specify)" value={form.court_name_custom}
                  onChange={(v) => set('court_name_custom', v)} placeholder="e.g. ADJ Court No. 4, Pali"
                  error={errors.court_name_custom} required />
              )}
              {form.court_code && form.court_code !== 'OTHER' && selectedCourt && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="px-2 py-0.5 bg-gray-100 rounded font-mono">{selectedCourt.code}</span>
                  {selectedCourt.district && <span>District: {selectedCourt.district}</span>}
                </div>
              )}
              {city && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium text-gray-600">City:</span>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                    className="px-2 py-0.5 border border-gray-200 rounded text-xs text-gray-700 bg-white" />
                  <span className="text-gray-400">(used for filtering)</span>
                </div>
              )}
            </>
          ) : (
            <SimpleSelect label="High Court Bench" options={benchOptions} value={form.hc_bench}
              onChange={(v) => { set('hc_bench', v); setCity(v === 'jodhpur' ? 'Jodhpur' : v === 'jaipur' ? 'Jaipur' : '') }}
              placeholder="Select bench…" error={errors.hc_bench} required />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SimpleSelect label="Case Type" options={caseTypeOptions} value={form.case_type}
              onChange={(v) => set('case_type', v)} placeholder="Select type…" />
            <TextInput label="Case Number" value={form.case_number} onChange={(v) => set('case_number', v)}
              placeholder="e.g. 123" error={errors.case_number} required />
            <TextInput label="Case Year" value={String(form.case_year)} type="number" placeholder="2026"
              onChange={(v) => { const n = parseInt(v, 10); if (!isNaN(n)) set('case_year', n) }} />
          </div>
        </div>

        {/* ── Section 2: Parties ── */}
        <div className="p-6 space-y-5">
          <h3 className="text-base font-semibold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>Parties</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput label={isDistrict ? 'Plaintiff' : 'Petitioner'} value={form.party_plaintiff}
              onChange={(v) => set('party_plaintiff', v)}
              placeholder={isDistrict ? 'Full name of plaintiff' : 'Full name of petitioner'}
              error={errors.party_plaintiff} required />
            <TextInput label={isDistrict ? 'Defendant' : 'Respondent'} value={form.party_defendant}
              onChange={(v) => set('party_defendant', v)}
              placeholder={isDistrict ? 'Full name of defendant' : 'Full name of respondent'}
              error={errors.party_defendant} required />
          </div>
        </div>

        {/* ── Section 3: Client ── */}
        <div className="p-6 space-y-5">
          <h3 className="text-base font-semibold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>Client & Representation</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Client picker */}
            <div>
              <SearchableSelect
                label="Client Name"
                options={clientOptions}
                value={selectedClientId || ''}
                placeholder="Search or add client…"
                onChange={(v) => {
                  if (v === '__HEADER__') return
                  if (v === '__ACTION__') { setShowAddClient(true); return }
                  const c = clients.find(c => c.id === v)
                  setSelectedClientId(v)
                  set('client_name', c?.name || '')
                  setShowAddClient(false)
                }}
              />
              {selectedClientId && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3" />
                    Linked to saved client
                  </span>
                  <button onClick={() => { setSelectedClientId(''); set('client_name', '') }}
                    className="text-xs text-gray-400 hover:text-gray-600">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {!selectedClientId && (
                <input type="text" value={form.client_name} onChange={(e) => set('client_name', e.target.value)}
                  placeholder="Or type a name directly…"
                  className="mt-1.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 placeholder-gray-400" />
              )}
              {showAddClient && (
                <AddClientPanel onSave={addClient} onCancel={() => setShowAddClient(false)} />
              )}
            </div>
            <SimpleSelect label="Client Side" options={sideOptions} value={form.client_side}
              onChange={(v) => set('client_side', v)} placeholder="Select side…" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput label="Our Role / Designation" value={form.our_role} onChange={(v) => set('our_role', v)}
              placeholder="e.g. Counsel for Petitioner" />
            <TextInput label="Opposite Advocate" value={form.opposite_advocate}
              onChange={(v) => set('opposite_advocate', v)} placeholder="Name of opposing counsel" />
          </div>
        </div>

        {/* ── Section 4: Status ── */}
        <div className="p-6 space-y-5">
          <h3 className="text-base font-semibold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>Status & Filing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput label="Filed Date" value={form.filed_date} onChange={(v) => set('filed_date', v)} type="date" />
            <div>
              <SimpleSelect label="Case Stage" options={stageOptions} value={form.case_stage}
                onChange={(v) => set('case_stage', v)} placeholder="Select stage…" />
              {form.case_stage === 'Custom...' && (
                <input autoFocus type="text" value={customStage} onChange={(e) => setCustomStage(e.target.value)}
                  placeholder="Type custom stage…"
                  className="mt-2 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 hover:border-gray-400" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput label="Next Hearing Date" value={form.next_hearing_date}
              onChange={(v) => set('next_hearing_date', v)} type="date" error={errors.next_hearing_date} />
            <TextInput label="eCourts CNR" value={form.ecourts_cnr} onChange={(v) => set('ecourts_cnr', v)}
              placeholder="e.g. RJUD020012345672026" />
          </div>
          <p className="text-xs text-gray-400">The case will appear in your diary on the next hearing date.</p>
        </div>

        {/* ── Section 5: Notes ── */}
        <div className="p-6">
          <TextArea label="Notes" value={form.notes} onChange={(v) => set('notes', v)}
            placeholder="Any additional notes about this case…" />
        </div>

        {/* ── Actions ── */}
        <div className="p-6 flex items-center justify-between gap-4">
          <button type="button"
            onClick={() => { setForm({ ...INITIAL }); setErrors({}); setSaveError(null); setSelectedClientId(''); setCity('') }}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Reset
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-8 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: saving ? '#4b6a8a' : '#1e3a5f' }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = '#15304f' }}
            onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = '#1e3a5f' }}>
            {saving ? 'Saving...' : 'Save Case'}
          </button>
        </div>
      </div>
    </div>
  )
}
