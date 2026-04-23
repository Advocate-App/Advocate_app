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
import { ArrowLeft, Building2, Scale, ChevronDown, Search } from 'lucide-react'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type CourtLevel = 'district' | 'high_court'

interface FormData {
  // common
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
  // district-specific
  court_code: string
  court_name_custom: string   // free text when "OTHER" selected
  // hc-specific
  hc_bench: string
  // first hearing
  next_hearing_date: string
}

interface FieldErrors {
  [key: string]: string
}

const INITIAL: FormData = {
  court_level: null,
  case_number: '',
  case_year: new Date().getFullYear(),
  case_type: '',
  party_plaintiff: '',
  party_defendant: '',
  client_name: '',
  client_side: '',
  our_role: '',
  opposite_advocate: '',
  filed_date: '',
  case_stage: '',
  ecourts_cnr: '',
  notes: '',
  court_code: '',
  court_name_custom: '',
  hc_bench: '',
  next_hearing_date: '',
}

// ---------------------------------------------------------------------------
// Searchable dropdown component
// ---------------------------------------------------------------------------
function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select...',
  error,
  required,
}: {
  label: string
  options: { value: string; label: string }[]
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
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(q))
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
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 border border-gray-200 rounded-md bg-gray-50">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>
          </div>
          <ul className="overflow-y-auto max-h-48">
            {filtered.length === 0 && (
              <li className="px-3 py-2.5 text-sm text-gray-400">No matches</li>
            )}
            {filtered.map(o => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                    o.value === value ? 'bg-blue-50 font-medium' : ''
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Simple select (no search)
// ---------------------------------------------------------------------------
function SimpleSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select...',
  error,
  required,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-white appearance-none transition-colors ${
          error ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-300 hover:border-gray-400'
        } ${!value ? 'text-gray-400' : 'text-gray-900'}`}
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Text input
// ---------------------------------------------------------------------------
function TextInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  required,
  type = 'text',
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  required?: boolean
  type?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2.5 border rounded-lg text-sm transition-colors ${
          error ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-300 hover:border-gray-400'
        } ${disabled ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------
function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 transition-colors resize-none"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers for formatting labels
// ---------------------------------------------------------------------------
function capitalize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    // clear error for this field when user types
    if (errors[key]) {
      setErrors(prev => {
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Step A: pick court level
  // ---------------------------------------------------------------------------
  if (!form.court_level) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link
          href="/diary/cases"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Cases
        </Link>

        <h2
          className="text-2xl font-bold text-gray-800 mb-2"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Add New Case
        </h2>
        <p className="text-gray-500 mb-8">Select the court level to get started.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => set('court_level', 'district')}
            className="group flex flex-col items-center gap-4 p-8 bg-white rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] hover:shadow-md transition-all"
          >
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
              <Building2 className="w-8 h-8" style={{ color: '#1e3a5f' }} />
            </div>
            <div className="text-center">
              <h3
                className="text-lg font-bold text-gray-800"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                District Court
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Sessions, MACT, Consumer, Family, Commercial
              </p>
            </div>
          </button>

          <button
            onClick={() => set('court_level', 'high_court')}
            className="group flex flex-col items-center gap-4 p-8 bg-white rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] hover:shadow-md transition-all"
          >
            <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
              <Scale className="w-8 h-8" style={{ color: '#1e3a5f' }} />
            </div>
            <div className="text-center">
              <h3
                className="text-lg font-bold text-gray-800"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                High Court
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Rajasthan HC — Jodhpur & Jaipur Bench
              </p>
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
    if (!form.party_plaintiff.trim()) {
      e.party_plaintiff = form.court_level === 'high_court'
        ? 'Petitioner is required'
        : 'Plaintiff is required'
    }
    if (!form.party_defendant.trim()) {
      e.party_defendant = form.court_level === 'high_court'
        ? 'Respondent is required'
        : 'Defendant is required'
    }

    if (form.court_level === 'district') {
      if (!form.court_code) e.court_code = 'Court is required'
      if (form.court_code === 'OTHER' && !form.court_name_custom.trim()) {
        e.court_name_custom = 'Please specify the court name'
      }
    }

    if (form.court_level === 'high_court') {
      if (!form.hc_bench) e.hc_bench = 'Bench selection is required'
    }

    if (!form.next_hearing_date) e.next_hearing_date = 'Next hearing date is required'

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

      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        setSaveError('You must be logged in to add a case.')
        setSaving(false)
        return
      }

      // Get advocate_id — try by user_id first, then any accessible record
      let advocateId: string | null = null
      const { data: advByUser } = await supabase
        .from('advocates').select('id').eq('user_id', user.id).limit(1)
      if (advByUser && advByUser.length > 0) {
        advocateId = advByUser[0].id
      } else {
        const { data: advAny } = await supabase
          .from('advocates').select('id').limit(1)
        if (advAny && advAny.length > 0) advocateId = advAny[0].id
      }
      if (!advocateId) {
        setSaveError('Advocate profile not found. Please go to Profile and complete your setup first.')
        setSaving(false)
        return
      }

      // Build the row
      let courtName: string
      let courtCode: string | null = null

      if (form.court_level === 'district') {
        if (form.court_code === 'OTHER') {
          courtName = form.court_name_custom.trim()
          courtCode = 'OTHER'
        } else {
          const court = DISTRICT_COURTS.find(c => c.code === form.court_code)
          courtName = court?.name || form.court_code
          courtCode = form.court_code
        }
      } else {
        const bench = HC_BENCHES.find(b => b.code === form.hc_bench)
        courtName = bench?.name || form.hc_bench
        courtCode = form.hc_bench
      }

      const plaintiff = form.party_plaintiff.trim()
      const defendant = form.party_defendant.trim()
      const fullTitle = `${plaintiff} vs ${defendant}`

      const row = {
        advocate_id: advocateId,
        court_level: form.court_level,
        court_code: courtCode,
        court_name: courtName,
        case_number: form.case_number.trim(),
        case_year: form.case_year,
        case_type: form.case_type || null,
        party_plaintiff: plaintiff,
        party_defendant: defendant,
        full_title: fullTitle,
        client_name: form.client_name.trim() || null,
        client_side: form.client_side || null,
        our_role: form.our_role.trim() || null,
        opposite_advocate: form.opposite_advocate.trim() || null,
        filed_date: form.filed_date || null,
        case_stage: form.case_stage || null,
        ecourts_cnr: form.ecourts_cnr.trim() || null,
        notes: form.notes.trim() || null,
      }

      const { data: inserted, error: insertError } = await supabase
        .from('cases')
        .insert(row)
        .select('id')
        .single()

      if (insertError) {
        setSaveError(insertError.message)
        setSaving(false)
        return
      }

      const todayStr = new Date().toISOString().split('T')[0]

      // 1. Create a "Case Commenced" hearing for TODAY so it shows in today's diary with NEW tag
      await supabase.from('hearings').insert({
        case_id: inserted.id,
        hearing_date: todayStr,
        stage_on_date: form.case_stage || null,
        next_hearing_date: form.next_hearing_date || null,
        purpose: 'Case Commenced',
        appearing_advocate_name: 'self',
        happened: true,
      })

      // 2. Create the actual next hearing so it shows in diary on that future date
      if (form.next_hearing_date && form.next_hearing_date !== todayStr) {
        await supabase.from('hearings').insert({
          case_id: inserted.id,
          hearing_date: form.next_hearing_date,
          previous_hearing_date: todayStr,
          stage_on_date: form.case_stage || null,
          purpose: null,
          appearing_advocate_name: 'self',
          happened: false,
        })
      }

      router.push(`/diary/cases/${inserted.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setSaveError(message)
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Derived option lists
  // ---------------------------------------------------------------------------
  const isDistrict = form.court_level === 'district'

  const courtOptions = DISTRICT_COURTS.map(c => ({
    value: c.code,
    label: `${c.name}${c.district ? ` (${c.district})` : ''}`,
  }))

  const benchOptions = HC_BENCHES.map(b => ({
    value: b.code,
    label: b.name,
  }))

  const caseTypeOptions = (isDistrict ? DISTRICT_CASE_TYPES : HC_CASE_TYPES).map(t => ({
    value: t,
    label: t,
  }))

  const stageOptions = (isDistrict ? DISTRICT_STAGES : HC_STAGES).map(s => ({
    value: s,
    label: s,
  }))

  const sideOptions = (isDistrict ? CLIENT_SIDES_DISTRICT : CLIENT_SIDES_HC).map(s => ({
    value: s,
    label: capitalize(s),
  }))

  const selectedCourt = DISTRICT_COURTS.find(c => c.code === form.court_code)

  // ---------------------------------------------------------------------------
  // Step B: the form
  // ---------------------------------------------------------------------------
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => {
            setForm({ ...INITIAL })
            setErrors({})
            setSaveError(null)
          }}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div>
          <h2
            className="text-2xl font-bold text-gray-800"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {isDistrict ? 'District Court' : 'High Court'} — New Case
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Fill in the case details below. Fields marked with * are required.
          </p>
        </div>
      </div>

      {/* Global error */}
      {saveError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* Form card */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* ---- Section 1: Court details ---- */}
        <div className="p-6 space-y-5">
          <h3
            className="text-base font-semibold text-gray-800"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Court Details
          </h3>

          {isDistrict ? (
            <>
              <SearchableSelect
                label="Court"
                options={courtOptions}
                value={form.court_code}
                onChange={(v) => set('court_code', v)}
                placeholder="Search courts..."
                error={errors.court_code}
                required
              />

              {form.court_code === 'OTHER' && (
                <TextInput
                  label="Court Name (specify)"
                  value={form.court_name_custom}
                  onChange={(v) => set('court_name_custom', v)}
                  placeholder="e.g. ADJ Court No. 4, Pali"
                  error={errors.court_name_custom}
                  required
                />
              )}

              {form.court_code && form.court_code !== 'OTHER' && selectedCourt && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="px-2 py-0.5 bg-gray-100 rounded font-mono">
                    {selectedCourt.code}
                  </span>
                  {selectedCourt.district && (
                    <span>District: {selectedCourt.district}</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <SimpleSelect
              label="High Court Bench"
              options={benchOptions}
              value={form.hc_bench}
              onChange={(v) => set('hc_bench', v)}
              placeholder="Select bench..."
              error={errors.hc_bench}
              required
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SimpleSelect
              label="Case Type"
              options={caseTypeOptions}
              value={form.case_type}
              onChange={(v) => set('case_type', v)}
              placeholder="Select type..."
            />
            <TextInput
              label="Case Number"
              value={form.case_number}
              onChange={(v) => set('case_number', v)}
              placeholder="e.g. 123"
              error={errors.case_number}
              required
            />
            <TextInput
              label="Case Year"
              value={String(form.case_year)}
              onChange={(v) => {
                const n = parseInt(v, 10)
                if (!isNaN(n)) set('case_year', n)
                else if (v === '') set('case_year', 0 as number)
              }}
              placeholder="2026"
              type="number"
            />
          </div>
        </div>

        {/* ---- Section 2: Parties ---- */}
        <div className="p-6 space-y-5">
          <h3
            className="text-base font-semibold text-gray-800"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Parties
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label={isDistrict ? 'Plaintiff' : 'Petitioner'}
              value={form.party_plaintiff}
              onChange={(v) => set('party_plaintiff', v)}
              placeholder={isDistrict ? 'Full name of plaintiff' : 'Full name of petitioner'}
              error={errors.party_plaintiff}
              required
            />
            <TextInput
              label={isDistrict ? 'Defendant' : 'Respondent'}
              value={form.party_defendant}
              onChange={(v) => set('party_defendant', v)}
              placeholder={isDistrict ? 'Full name of defendant' : 'Full name of respondent'}
              error={errors.party_defendant}
              required
            />
          </div>
        </div>

        {/* ---- Section 3: Client & representation ---- */}
        <div className="p-6 space-y-5">
          <h3
            className="text-base font-semibold text-gray-800"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Client & Representation
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Client Name"
              value={form.client_name}
              onChange={(v) => set('client_name', v)}
              placeholder="Who is your client?"
            />
            <SimpleSelect
              label="Client Side"
              options={sideOptions}
              value={form.client_side}
              onChange={(v) => set('client_side', v)}
              placeholder="Select side..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Our Role / Designation"
              value={form.our_role}
              onChange={(v) => set('our_role', v)}
              placeholder="e.g. Counsel for Petitioner"
            />
            <TextInput
              label="Opposite Advocate"
              value={form.opposite_advocate}
              onChange={(v) => set('opposite_advocate', v)}
              placeholder="Name of opposing counsel"
            />
          </div>
        </div>

        {/* ---- Section 4: Case status ---- */}
        <div className="p-6 space-y-5">
          <h3
            className="text-base font-semibold text-gray-800"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Status & Filing
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Filed Date"
              value={form.filed_date}
              onChange={(v) => set('filed_date', v)}
              type="date"
            />
            <SimpleSelect
              label="Case Stage"
              options={stageOptions}
              value={form.case_stage}
              onChange={(v) => set('case_stage', v)}
              placeholder="Select stage..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Next Hearing Date"
              value={form.next_hearing_date}
              onChange={(v) => set('next_hearing_date', v)}
              type="date"
              required
              error={errors.next_hearing_date}
            />
            <TextInput
              label="eCourts CNR"
              value={form.ecourts_cnr}
              onChange={(v) => set('ecourts_cnr', v)}
              placeholder="e.g. RJUD020012345672026"
            />
          </div>

          <p className="text-xs text-gray-400">
            The case will automatically appear in your diary on the next hearing date.
          </p>
        </div>

        {/* ---- Section 5: Notes ---- */}
        <div className="p-6">
          <TextArea
            label="Notes"
            value={form.notes}
            onChange={(v) => set('notes', v)}
            placeholder="Any additional notes about this case..."
          />
        </div>

        {/* ---- Actions ---- */}
        <div className="p-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              setForm({ ...INITIAL })
              setErrors({})
              setSaveError(null)
            }}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: saving ? '#4b6a8a' : '#1e3a5f' }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = '#15304f' }}
            onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = '#1e3a5f' }}
          >
            {saving ? 'Saving...' : 'Save Case'}
          </button>
        </div>
      </div>
    </div>
  )
}
