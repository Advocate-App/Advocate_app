'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useDropzone } from 'react-dropzone'
import { format, isToday, isPast, parseISO } from 'date-fns'
import {
  getCourtLabel,
  eCourtsDeepLink,
  formatCaseNumber,
  DISTRICT_STAGES,
  HC_STAGES,
} from '@/lib/constants/courts'
import {
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Download,
  FileText,
  Upload,
  ExternalLink,
  Loader2,
  Calendar,
  X,
} from 'lucide-react'

// ───────────────────── Types ─────────────────────
interface CaseRecord {
  id: string
  advocate_id: string
  court_level: string
  court_name: string
  court_code: string | null
  case_number: string
  case_year: number | null
  case_type: string | null
  party_plaintiff: string
  party_defendant: string
  full_title: string
  client_name: string | null
  client_side: string | null
  our_role: string | null
  opposite_advocate: string | null
  case_stage: string | null
  status: string
  filed_date: string | null
  disposal_date: string | null
  ecourts_cnr: string | null
  hc_bench: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface Hearing {
  id: string
  case_id: string
  hearing_date: string
  previous_hearing_date: string | null
  next_hearing_date: string | null
  stage_on_date: string | null
  purpose: string | null
  appearing_advocate_name: string | null
  happened: boolean
  adjournment_reason: string | null
  outcome_notes: string | null
  created_at: string
}

interface CaseDocument {
  id: string
  case_id: string
  file_name: string
  storage_path: string
  file_size_bytes: number | null
  mime_type: string | null
  doc_type: string | null
  uploaded_at: string
  notes: string | null
}

type TabKey = 'overview' | 'hearings' | 'documents' | 'ecourts'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'hearings', label: 'Hearings' },
  { key: 'documents', label: 'Documents' },
  { key: 'ecourts', label: 'eCourts' },
]

const DOC_TYPES = [
  'order', 'application', 'reply', 'evidence', 'written_statement',
  'pleading', 'notice', 'plaint', 'vakalatnama', 'affidavit', 'judgment', 'other',
]

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: '#dcfce7', text: '#166534' },
  disposed: { bg: '#fee2e2', text: '#991b1b' },
  stayed: { bg: '#fef9c3', text: '#854d0e' },
  withdrawn: { bg: '#f3f4f6', text: '#374151' },
  transferred: { bg: '#dbeafe', text: '#1e40af' },
  reserved: { bg: '#ede9fe', text: '#5b21b6' },
}

// ───────────────────── Helpers ─────────────────────
function formatBytes(bytes: number | null): string {
  if (!bytes) return '--'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(d: string | null): string {
  if (!d) return '--'
  try {
    return format(parseISO(d), 'dd MMM yyyy')
  } catch {
    return d
  }
}

function capitalize(s: string | null): string {
  if (!s) return '--'
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function hearingBorderColor(hearing: Hearing): string {
  if (hearing.happened) return '#22c55e'
  const d = parseISO(hearing.hearing_date)
  if (isToday(d)) return '#f59e0b'
  if (isPast(d)) return '#ef4444'
  return '#d1d5db'
}

// ───────────────────── Main Component ─────────────────────
export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>()

  // Core state
  const [caseData, setCaseData] = useState<CaseRecord | null>(null)
  const [advocateId, setAdvocateId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  // Hearings state
  const [hearings, setHearings] = useState<Hearing[]>([])
  const [hearingsLoading, setHearingsLoading] = useState(false)
  const [showHearingForm, setShowHearingForm] = useState(false)
  const [editingHearingId, setEditingHearingId] = useState<string | null>(null)
  const [hearingForm, setHearingForm] = useState({
    hearing_date: '',
    stage_on_date: '',
    next_hearing_date: '',
    purpose: '',
    appearing_advocate_name: 'self',
    outcome_notes: '',
    happened: false,
  })
  const [hearingSaving, setHearingSaving] = useState(false)

  // Documents state
  const [documents, setDocuments] = useState<CaseDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploadDocType, setUploadDocType] = useState('other')
  const [uploading, setUploading] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // eCourts state
  const [cnrInput, setCnrInput] = useState('')
  const [cnrSaving, setCnrSaving] = useState(false)
  const [ecourtForm, setEcourtForm] = useState({
    stage: '',
    next_hearing_date: '',
    notes: '',
  })
  const [ecourtSaving, setEcourtSaving] = useState(false)

  // ───── Load case ─────
  useEffect(() => {
    async function loadCase() {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setNotFound(true); setLoading(false); return }

      // Get advocate_id
      const { data: advRows } = await supabase
        .from('advocates')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
      const adv = advRows?.[0] || null
      if (adv) setAdvocateId(adv.id)

      // Fetch case by ID
      const { data: c, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !c) { setNotFound(true); setLoading(false); return }
      setCaseData(c as CaseRecord)
      setLoading(false)
    }
    if (id) loadCase()
  }, [id])

  // ───── Load hearings ─────
  const loadHearings = useCallback(async () => {
    if (!id) return
    setHearingsLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('hearings')
      .select('*')
      .eq('case_id', id)
      .order('hearing_date', { ascending: false })
    setHearings((data as Hearing[]) || [])
    setHearingsLoading(false)
  }, [id])

  // ───── Load documents ─────
  const loadDocuments = useCallback(async () => {
    if (!id) return
    setDocsLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', id)
      .order('uploaded_at', { ascending: false })
    setDocuments((data as CaseDocument[]) || [])
    setDocsLoading(false)
  }, [id])

  // Fetch tab-specific data on tab switch
  useEffect(() => {
    if (activeTab === 'hearings') loadHearings()
    if (activeTab === 'documents') loadDocuments()
  }, [activeTab, loadHearings, loadDocuments])

  // ───── Hearing CRUD ─────
  function resetHearingForm() {
    setHearingForm({
      hearing_date: '',
      stage_on_date: '',
      next_hearing_date: '',
      purpose: '',
      appearing_advocate_name: 'self',
      outcome_notes: '',
      happened: false,
    })
    setShowHearingForm(false)
    setEditingHearingId(null)
  }

  function startEditHearing(h: Hearing) {
    setHearingForm({
      hearing_date: h.hearing_date || '',
      stage_on_date: h.stage_on_date || '',
      next_hearing_date: h.next_hearing_date || '',
      purpose: h.purpose || '',
      appearing_advocate_name: h.appearing_advocate_name || 'self',
      outcome_notes: h.outcome_notes || '',
      happened: h.happened,
    })
    setEditingHearingId(h.id)
    setShowHearingForm(true)
  }

  async function saveHearing(e: React.FormEvent) {
    e.preventDefault()
    if (!hearingForm.hearing_date) return
    setHearingSaving(true)
    const supabase = createClient()

    const row = {
      case_id: id,
      hearing_date: hearingForm.hearing_date,
      stage_on_date: hearingForm.stage_on_date || null,
      next_hearing_date: hearingForm.next_hearing_date || null,
      purpose: hearingForm.purpose || null,
      appearing_advocate_name: hearingForm.appearing_advocate_name || 'self',
      outcome_notes: hearingForm.outcome_notes || null,
      happened: hearingForm.happened,
    }

    if (editingHearingId) {
      await supabase.from('hearings').update(row).eq('id', editingHearingId)
    } else {
      await supabase.from('hearings').insert(row)
    }

    // Also update case_stage if provided
    if (hearingForm.stage_on_date && caseData) {
      await supabase.from('cases').update({ case_stage: hearingForm.stage_on_date }).eq('id', id)
      setCaseData({ ...caseData, case_stage: hearingForm.stage_on_date })
    }

    // Auto-create next hearing if next date is provided (so it shows in diary)
    if (hearingForm.next_hearing_date && !editingHearingId) {
      const { data: existing } = await supabase
        .from('hearings')
        .select('id')
        .eq('case_id', id)
        .eq('hearing_date', hearingForm.next_hearing_date)
        .limit(1)

      if (!existing || existing.length === 0) {
        await supabase.from('hearings').insert({
          case_id: id,
          hearing_date: hearingForm.next_hearing_date,
          previous_hearing_date: hearingForm.hearing_date,
          stage_on_date: hearingForm.stage_on_date || null,
          appearing_advocate_name: hearingForm.appearing_advocate_name || 'self',
          happened: false,
        })
      }
    }

    setHearingSaving(false)
    resetHearingForm()
    loadHearings()
  }

  async function deleteHearing(hId: string) {
    const supabase = createClient()
    await supabase.from('hearings').delete().eq('id', hId)
    loadHearings()
  }

  // ───── Document Upload / Download / Delete ─────
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!advocateId || !id || acceptedFiles.length === 0) return
    setUploading(true)
    const supabase = createClient()

    for (const file of acceptedFiles) {
      const ts = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${advocateId}/${id}/${ts}_${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from('case-documents')
        .upload(storagePath, file)

      if (uploadErr) {
        console.error('Upload error:', uploadErr.message)
        continue
      }

      await supabase.from('case_documents').insert({
        case_id: id,
        file_name: file.name,
        storage_path: storagePath,
        file_size_bytes: file.size,
        mime_type: file.type,
        doc_type: uploadDocType,
        uploaded_by: advocateId,
      })
    }

    setUploading(false)
    loadDocuments()
  }, [advocateId, id, uploadDocType, loadDocuments])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxSize: 10 * 1024 * 1024,
  })

  async function downloadDoc(doc: CaseDocument) {
    const supabase = createClient()
    const { data } = await supabase.storage
      .from('case-documents')
      .createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function deleteDoc(docId: string, storagePath: string) {
    const supabase = createClient()
    await supabase.storage.from('case-documents').remove([storagePath])
    await supabase.from('case_documents').delete().eq('id', docId)
    setDeleteConfirmId(null)
    loadDocuments()
  }

  // ───── eCourts: save CNR ─────
  async function saveCnr(e: React.FormEvent) {
    e.preventDefault()
    if (!cnrInput.trim() || !caseData) return
    setCnrSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('cases')
      .update({ ecourts_cnr: cnrInput.trim().toUpperCase() })
      .eq('id', id)
    if (!error) {
      setCaseData({ ...caseData, ecourts_cnr: cnrInput.trim().toUpperCase() })
      setCnrInput('')
    }
    setCnrSaving(false)
  }

  // ───── eCourts: update from eCourts ─────
  async function saveEcourtUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!ecourtForm.stage && !ecourtForm.next_hearing_date) return
    setEcourtSaving(true)
    const supabase = createClient()

    // Insert as a new hearing row
    await supabase.from('hearings').insert({
      case_id: id,
      hearing_date: new Date().toISOString().split('T')[0],
      stage_on_date: ecourtForm.stage || null,
      next_hearing_date: ecourtForm.next_hearing_date || null,
      outcome_notes: ecourtForm.notes || 'Updated from eCourts',
      happened: true,
      appearing_advocate_name: 'self',
    })

    // Update case stage
    if (ecourtForm.stage && caseData) {
      await supabase.from('cases').update({ case_stage: ecourtForm.stage }).eq('id', id)
      setCaseData({ ...caseData, case_stage: ecourtForm.stage })
    }

    setEcourtForm({ stage: '', next_hearing_date: '', notes: '' })
    setEcourtSaving(false)
  }

  // ───── Stages based on court level ─────
  const stages = caseData?.court_level === 'high_court' ? HC_STAGES : DISTRICT_STAGES

  // ───────────────────── Render ─────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (notFound || !caseData) {
    return (
      <div className="max-w-4xl">
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-700" style={{ fontFamily: 'Georgia, serif' }}>
            Case Not Found
          </h2>
          <p className="text-gray-500 mt-2 mb-6">
            This case does not exist or you do not have access to it.
          </p>
          <Link
            href="/diary/search"
            className="inline-block px-5 py-2 rounded-lg text-white font-medium"
            style={{ background: '#1e3a5f' }}
          >
            Back to All Cases
          </Link>
        </div>
      </div>
    )
  }

  const statusColor = STATUS_COLORS[caseData.status] || STATUS_COLORS.active
  const ecourtLink = eCourtsDeepLink(caseData.ecourts_cnr)

  return (
    <div className="max-w-5xl">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/diary/cases" className="hover:text-gray-700 transition-colors">
          Cases
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-800 font-medium truncate max-w-[300px]">
          {caseData.full_title || `${caseData.party_plaintiff} vs ${caseData.party_defendant}`}
        </span>
      </div>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1
            className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {caseData.party_plaintiff} <span className="text-gray-400 font-normal">vs</span> {caseData.party_defendant}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="text-sm text-gray-600">
              {getCourtLabel(caseData.court_code || caseData.court_name)}
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-600 font-mono">
              {caseData.case_type ? `${caseData.case_type} ` : ''}
              {formatCaseNumber(caseData.case_number, caseData.case_year)}
            </span>
            <span
              className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: statusColor.bg, color: statusColor.text }}
            >
              {capitalize(caseData.status)}
            </span>
          </div>
        </div>

        <Link
          href={`/diary/cases/${id}/edit`}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium shrink-0"
          style={{ background: '#1e3a5f' }}
        >
          <Pencil className="w-4 h-4" />
          Edit
        </Link>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
            style={
              activeTab === tab.key
                ? { background: '#1e3a5f', color: '#fff' }
                : { background: '#f3f4f6', color: '#374151' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}

      {/* ======== OVERVIEW ======== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Parties */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Parties
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Plaintiff / Petitioner" value={caseData.party_plaintiff} />
              <Field label="Defendant / Respondent" value={caseData.party_defendant} />
            </div>
          </section>

          {/* Client Info */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Client Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Client Name" value={caseData.client_name} />
              <Field label="Client Side" value={capitalize(caseData.client_side)} />
              <Field label="Our Role" value={caseData.our_role} />
              <Field label="Opposite Advocate" value={caseData.opposite_advocate} />
            </div>
          </section>

          {/* Court Info */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Court Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Court Level" value={caseData.court_level === 'high_court' ? 'High Court' : 'District Court'} />
              <Field label="Court" value={getCourtLabel(caseData.court_code || caseData.court_name)} />
              {caseData.hc_bench && <Field label="HC Bench" value={capitalize(caseData.hc_bench)} />}
              <Field label="Case Type" value={caseData.case_type} />
              <Field label="Case Number" value={formatCaseNumber(caseData.case_number, caseData.case_year)} />
              <Field label="Current Stage" value={caseData.case_stage} />
              <Field label="Status" value={capitalize(caseData.status)} />
            </div>
          </section>

          {/* Dates */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Important Dates
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Filed Date" value={formatDate(caseData.filed_date)} />
              <Field label="Disposal Date" value={formatDate(caseData.disposal_date)} />
              <Field label="Created" value={formatDate(caseData.created_at)} />
              <Field label="Last Updated" value={formatDate(caseData.updated_at)} />
            </div>
          </section>

          {/* CNR & Notes */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Notes & eCourts
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Notes" value={caseData.notes} />
              </div>
              <div>
                <span className="block text-xs text-gray-500 mb-1">eCourts CNR</span>
                {caseData.ecourts_cnr ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-800">{caseData.ecourts_cnr}</span>
                    {ecourtLink && (
                      <a
                        href={ecourtLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md"
                        style={{ background: '#dbeafe', color: '#1e40af' }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open on eCourts
                      </a>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Not set</span>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ======== HEARINGS ======== */}
      {activeTab === 'hearings' && (
        <div>
          {/* Add Hearing Button */}
          {!showHearingForm && (
            <button
              onClick={() => { resetHearingForm(); setShowHearingForm(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium mb-6"
              style={{ background: '#1e3a5f' }}
            >
              <Plus className="w-4 h-4" />
              Add Hearing
            </button>
          )}

          {/* Inline Hearing Form */}
          {showHearingForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  {editingHearingId ? 'Edit Hearing' : 'New Hearing'}
                </h3>
                <button onClick={resetHearingForm} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={saveHearing} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Hearing Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={hearingForm.hearing_date}
                      onChange={(e) => setHearingForm({ ...hearingForm, hearing_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Stage on Date
                    </label>
                    <select
                      value={hearingForm.stage_on_date}
                      onChange={(e) => setHearingForm({ ...hearingForm, stage_on_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                    >
                      <option value="">-- Select Stage --</option>
                      {stages.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Next Hearing Date
                    </label>
                    <input
                      type="date"
                      value={hearingForm.next_hearing_date}
                      onChange={(e) => setHearingForm({ ...hearingForm, next_hearing_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Purpose
                    </label>
                    <input
                      type="text"
                      value={hearingForm.purpose}
                      onChange={(e) => setHearingForm({ ...hearingForm, purpose: e.target.value })}
                      placeholder="e.g., Arguments, Evidence"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Appearing Advocate
                    </label>
                    <input
                      type="text"
                      value={hearingForm.appearing_advocate_name}
                      onChange={(e) => setHearingForm({ ...hearingForm, appearing_advocate_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hearingForm.happened}
                        onChange={(e) => setHearingForm({ ...hearingForm, happened: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      Already happened
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <textarea
                    value={hearingForm.outcome_notes}
                    onChange={(e) => setHearingForm({ ...hearingForm, outcome_notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    placeholder="Outcome, adjournment reason, etc."
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={hearingSaving}
                    className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                    style={{ background: '#1e3a5f' }}
                  >
                    {hearingSaving ? 'Saving...' : editingHearingId ? 'Update Hearing' : 'Save Hearing'}
                  </button>
                  <button
                    type="button"
                    onClick={resetHearingForm}
                    className="px-5 py-2 rounded-lg border border-gray-300 text-sm text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Hearings Timeline */}
          {hearingsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : hearings.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hearings recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {hearings.map((h) => (
                <div
                  key={h.id}
                  className="bg-white border border-gray-200 rounded-xl p-5 mb-3 relative"
                  style={{ borderLeftWidth: '4px', borderLeftColor: hearingBorderColor(h) }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-1">
                        <span className="text-sm font-semibold text-gray-800">
                          {formatDate(h.hearing_date)}
                        </span>
                        {h.stage_on_date && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {h.stage_on_date}
                          </span>
                        )}
                        {h.happened && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            Done
                          </span>
                        )}
                      </div>
                      {h.purpose && (
                        <p className="text-sm text-gray-600">
                          <span className="text-gray-400">Purpose:</span> {h.purpose}
                        </p>
                      )}
                      {h.appearing_advocate_name && (
                        <p className="text-sm text-gray-600">
                          <span className="text-gray-400">Appeared by:</span> {h.appearing_advocate_name}
                        </p>
                      )}
                      {h.next_hearing_date && (
                        <p className="text-sm text-gray-600">
                          <span className="text-gray-400">Next date:</span> {formatDate(h.next_hearing_date)}
                        </p>
                      )}
                      {h.outcome_notes && (
                        <p className="text-sm text-gray-500 mt-1 italic">{h.outcome_notes}</p>
                      )}
                      {h.adjournment_reason && (
                        <p className="text-sm text-amber-600 mt-1">
                          Adjournment: {h.adjournment_reason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => startEditHearing(h)}
                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteHearing(h.id)}
                        className="p-1.5 rounded-md hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======== DOCUMENTS ======== */}
      {activeTab === 'documents' && (
        <div>
          {/* Upload Zone */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Document Type
                </label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                >
                  {DOC_TYPES.map((dt) => (
                    <option key={dt} value={dt}>{capitalize(dt)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading...
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    {isDragActive
                      ? 'Drop files here...'
                      : 'Drag and drop PDF, JPG, or PNG files here, or click to browse'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Max 10 MB per file</p>
                </div>
              )}
            </div>
          </div>

          {/* Documents Grid */}
          {docsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : documents.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col"
                >
                  <div className="flex items-start gap-3 mb-3 min-w-0">
                    <FileText className="w-8 h-8 text-gray-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate" title={doc.file_name}>
                        {doc.file_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                          style={{ background: '#ede9fe', color: '#5b21b6' }}
                        >
                          {capitalize(doc.doc_type)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatBytes(doc.file_size_bytes)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(doc.uploaded_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
                    <button
                      onClick={() => downloadDoc(doc)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                    {deleteConfirmId === doc.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteDoc(doc.id, doc.storage_path)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(doc.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======== ECOURTS ======== */}
      {activeTab === 'ecourts' && (
        <div className="space-y-6">
          {/* CNR Section */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              CNR Number
            </h3>
            {caseData.ecourts_cnr ? (
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-mono text-lg text-gray-800">{caseData.ecourts_cnr}</span>
                {ecourtLink && (
                  <a
                    href={ecourtLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ background: '#1e3a5f' }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open on eCourts
                  </a>
                )}
              </div>
            ) : (
              <form onSubmit={saveCnr} className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                <div className="flex-1 w-full sm:w-auto">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Enter CNR Number
                  </label>
                  <input
                    type="text"
                    value={cnrInput}
                    onChange={(e) => setCnrInput(e.target.value)}
                    placeholder="e.g., RJUD020012345672025"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={cnrSaving || !cnrInput.trim()}
                  className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 shrink-0"
                  style={{ background: '#1e3a5f' }}
                >
                  {cnrSaving ? 'Saving...' : 'Save CNR'}
                </button>
              </form>
            )}
          </section>

          {/* eCourts Dashboard Link */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              eCourts Dashboard
            </h3>
            <a
              href="https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open eCourts AdvocateID Dashboard
            </a>
          </section>

          {/* Update from eCourts */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Update from eCourts
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              After checking eCourts, enter the latest stage and next date here. This will create a new hearing record.
            </p>
            <form onSubmit={saveEcourtUpdate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    New Stage
                  </label>
                  <select
                    value={ecourtForm.stage}
                    onChange={(e) => setEcourtForm({ ...ecourtForm, stage: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                  >
                    <option value="">-- Select Stage --</option>
                    {stages.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Next Hearing Date
                  </label>
                  <input
                    type="date"
                    value={ecourtForm.next_hearing_date}
                    onChange={(e) => setEcourtForm({ ...ecourtForm, next_hearing_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  value={ecourtForm.notes}
                  onChange={(e) => setEcourtForm({ ...ecourtForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  placeholder="Any notes from eCourts update"
                />
              </div>
              <button
                type="submit"
                disabled={ecourtSaving || (!ecourtForm.stage && !ecourtForm.next_hearing_date)}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ background: '#1e3a5f' }}
              >
                {ecourtSaving ? 'Saving...' : 'Save eCourts Update'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

// ───── Reusable read-only field ─────
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="block text-xs text-gray-500 mb-0.5">{label}</span>
      <span className="text-sm text-gray-800">{value || '--'}</span>
    </div>
  )
}
