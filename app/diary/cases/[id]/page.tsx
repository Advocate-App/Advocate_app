'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useDropzone } from 'react-dropzone'
import { format, isToday, isPast, parseISO } from 'date-fns'
import { compressFile } from '@/lib/compress'
import {
  getCourtShortLabel,
  eCourtsDeepLink,
  formatCaseNumber,
  DISTRICT_STAGES,
  HC_STAGES,
} from '@/lib/constants/courts'
import {
  ChevronRight,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  Download,
  FileText,
  Upload,
  ExternalLink,
  Loader2,
  X,
  Check,
  ListChecks,
  BookOpen,
  Eye,
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
  client_id: string | null
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
  // ── Case tracking ──
  payment_received: boolean
  is_company_case: boolean
  documents_received: boolean
  bills_generated: boolean
  order_passed: boolean
  order_sent_to_company: boolean
  order_sent_date: string | null
  appeal_filed: boolean
  case_story: string | null
  lok_adalat_fit: boolean | null
}

interface ImportantPoint {
  id: string
  case_id: string
  point_text: string
  created_at: string
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
  set_by_name: string | null
}

interface CaseDocument {
  id: string
  case_id: string
  file_name: string
  storage_path: string | null
  file_size_bytes: number | null
  mime_type: string | null
  doc_type: string | null
  uploaded_at: string
  notes: string | null
  external_url: string | null
  source: 'upload' | 'drive_link'
}

// Tracking, Hearings, and eCourts used to be separate tabs — Tracking and
// Hearings are now sections inside Overview, and eCourts was dropped.
type TabKey = 'overview' | 'documents'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents' },
]

const DOC_TYPES = [
  'order', 'application', 'reply', 'evidence', 'written_statement',
  'pleading', 'notice', 'plaint', 'vakalatnama', 'affidavit', 'judgment', 'other',
]

// The real ceiling — matches what the Supabase storage bucket itself
// allows per file. Checked *after* compression, not before, since a big
// mobile scan easily compresses down under this.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
// How large a file can be picked in the first place, before compression
// runs. Generous, since a 40-60 MB phone scan is normal and compresses
// down a long way — this just stops something wildly oversized (a video
// picked by mistake, etc.) from being attempted at all.
const MAX_SELECT_BYTES = 150 * 1024 * 1024

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

// Builds a human-readable file name for an uploaded document, e.g.
// "Ram_Laxman(NI-1)_Petition.pdf" — so a downloaded file makes sense on
// sight (which case, which court, what it is) instead of whatever name
// the phone's camera/scanner app gave it.
function sanitizeFileNamePart(s: string): string {
  return s.trim().replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').slice(0, 60)
}
function buildDocFileName(caseData: CaseRecord, label: string, ext: string): string {
  const p1 = sanitizeFileNamePart(caseData.party_plaintiff) || 'Party1'
  const p2 = sanitizeFileNamePart(caseData.party_defendant) || 'Party2'
  // getCourtShortLabel doesn't know about custom courts — for one, it just
  // hands back the raw code (e.g. "CUSTOM_<uuid>") unchanged rather than
  // failing, so check for that specifically and fall back to the real name.
  const shortLabel = getCourtShortLabel(caseData.court_code || '')
  const courtTag = sanitizeFileNamePart(shortLabel && !shortLabel.startsWith('CUSTOM_') ? shortLabel : caseData.court_name)
  const lbl = sanitizeFileNamePart(label) || 'Document'
  return `${p1}_${p2}(${courtTag})_${lbl}.${ext}`
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
  const router = useRouter()

  // Core state
  const [caseData, setCaseData] = useState<CaseRecord | null>(null)
  const [advocateId, setAdvocateId] = useState<string | null>(null)
  const [advocateName, setAdvocateName] = useState('')
  const [readOnly, setReadOnly] = useState(false) // juniors: view only, no edits
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
  const [hearingCustomStage, setHearingCustomStage] = useState('')

  // Documents state
  const [documents, setDocuments] = useState<CaseDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploadDocType, setUploadDocType] = useState('other')
  const [uploadLabel, setUploadLabel] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([]) // picked, not uploaded yet
  const [uploading, setUploading] = useState(false)
  const [compressingName, setCompressingName] = useState<string | null>(null)
  const [compressionNote, setCompressionNote] = useState<string | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [docPendingDelete, setDocPendingDelete] = useState<CaseDocument | null>(null)
  const [deletingDoc, setDeletingDoc] = useState(false)
  const [driveDeleteWarning, setDriveDeleteWarning] = useState<string | null>(null)
  const [viewingDoc, setViewingDoc] = useState<CaseDocument | null>(null)
  const [viewingUrl, setViewingUrl] = useState<string | null>(null)

  // Google Drive link state
  const [driveUrl, setDriveUrl] = useState('')
  const [driveName, setDriveName] = useState('')
  const [driveError, setDriveError] = useState('')
  const [addingDriveLink, setAddingDriveLink] = useState(false)

  // Delete case
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Tracking state
  const [trackingSaving, setTrackingSaving] = useState<string | null>(null) // which field is saving
  const [storyDraft, setStoryDraft] = useState('')
  const [storyDirty, setStoryDirty] = useState(false)
  const [storySaving, setStorySaving] = useState(false)
  // Once a story's been written, it's locked (shown as plain text) until
  // "Edit" is clicked — first-time entry (nothing written yet) stays
  // directly editable, since there's nothing to accidentally disturb yet.
  const [storyEditing, setStoryEditing] = useState(false)
  const [orderDateDraft, setOrderDateDraft] = useState('')

  const [importantPoints, setImportantPoints] = useState<ImportantPoint[]>([])
  const [pointsLoading, setPointsLoading] = useState(false)
  const [newPointText, setNewPointText] = useState('')
  const [addingPoint, setAddingPoint] = useState(false)
  const [deletePointId, setDeletePointId] = useState<string | null>(null)

  // Company picker state
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false)
  const [companySearch, setCompanySearch] = useState('')
  const [companySaving, setCompanySaving] = useState(false)

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
        .select('id, full_name, role')
        .eq('user_id', user.id)
        .limit(1)
      const adv = advRows?.[0] || null
      if (adv) {
        setAdvocateId(adv.id)
        setAdvocateName(adv.full_name || '')
        setReadOnly(adv.role === 'junior')
      }

      // Fetch case by ID
      const { data: c, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !c) { setNotFound(true); setLoading(false); return }
      const rec = c as CaseRecord
      setCaseData(rec)
      setStoryDraft(rec.case_story || '')
      setOrderDateDraft(rec.order_sent_date || '')
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

  // ───── Load important points ─────
  const loadImportantPoints = useCallback(async () => {
    if (!id) return
    setPointsLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('case_important_points')
      .select('*')
      .eq('case_id', id)
      .order('created_at', { ascending: false })
    setImportantPoints((data as ImportantPoint[]) || [])
    setPointsLoading(false)
  }, [id])

  // ───── Load existing companies (for the Company picker) ─────
  const loadCompanies = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('is_company', true)
      .order('name', { ascending: true })
    setCompanies((data as { id: string; name: string }[]) || [])
  }, [])

  // Fetch tab-specific data on tab switch — Overview now carries hearings,
  // tracking, and important points all in one page, so it needs all three;
  // Documents stays lazy-loaded since it's its own tab.
  useEffect(() => {
    if (activeTab === 'overview') { loadHearings(); loadImportantPoints(); loadCompanies() }
    if (activeTab === 'documents') loadDocuments()
  }, [activeTab, loadHearings, loadDocuments, loadImportantPoints, loadCompanies])

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
    setHearingCustomStage('')
    setShowHearingForm(false)
    setEditingHearingId(null)
  }

  function startEditHearing(h: Hearing) {
    // A stage that isn't one of the preset options was typed in as custom
    // last time — re-select "Custom..." and pre-fill the text so editing
    // doesn't silently overwrite it with a preset stage.
    const isPreset = h.stage_on_date ? stages.includes(h.stage_on_date) : true
    setHearingForm({
      hearing_date: h.hearing_date || '',
      stage_on_date: h.stage_on_date ? (isPreset ? h.stage_on_date : 'Custom...') : '',
      next_hearing_date: h.next_hearing_date || '',
      purpose: h.purpose || '',
      appearing_advocate_name: h.appearing_advocate_name || 'self',
      outcome_notes: h.outcome_notes || '',
      happened: h.happened,
    })
    setHearingCustomStage(isPreset ? '' : (h.stage_on_date || ''))
    setEditingHearingId(h.id)
    setShowHearingForm(true)
  }

  async function saveHearing(e: React.FormEvent) {
    e.preventDefault()
    if (!hearingForm.hearing_date) return
    if (hearingForm.stage_on_date === 'Custom...' && !hearingCustomStage.trim()) return
    setHearingSaving(true)
    const supabase = createClient()

    // Resolve "Custom..." to whatever was actually typed — otherwise the
    // literal text "Custom..." would get saved as the stage.
    const resolvedStage = hearingForm.stage_on_date === 'Custom...'
      ? hearingCustomStage.trim()
      : hearingForm.stage_on_date

    const row = {
      case_id: id,
      hearing_date: hearingForm.hearing_date,
      stage_on_date: resolvedStage || null,
      next_hearing_date: hearingForm.next_hearing_date || null,
      purpose: hearingForm.purpose || null,
      appearing_advocate_name: hearingForm.appearing_advocate_name || 'self',
      outcome_notes: hearingForm.outcome_notes || null,
      happened: hearingForm.happened,
      set_by_advocate_id: advocateId,
      set_by_name: advocateName || null,
    }

    if (editingHearingId) {
      await supabase.from('hearings').update(row).eq('id', editingHearingId)
    } else {
      await supabase.from('hearings').insert(row)
    }

    // Also update case_stage if provided
    if (resolvedStage && caseData) {
      await supabase.from('cases').update({ case_stage: resolvedStage }).eq('id', id)
      setCaseData({ ...caseData, case_stage: resolvedStage })
    }

    // Auto-create next hearing if next date is provided (so it shows in
    // diary) — this needs to run on edit too, not just when adding a brand
    // new hearing. It used to be skipped whenever editingHearingId was
    // set, which meant setting/changing the next date on an existing
    // hearing saved the text but never actually scheduled it as a real
    // hearing, so it silently never showed up in the diary on that day.
    if (hearingForm.next_hearing_date) {
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
          stage_on_date: resolvedStage || null,
          appearing_advocate_name: hearingForm.appearing_advocate_name || 'self',
          happened: false,
          set_by_advocate_id: advocateId,
          set_by_name: advocateName || null,
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
  // Picking/dropping a file only stages it — nothing is compressed or
  // uploaded until "Upload" is pressed, so it's never uploading something
  // by accident and there's a chance to double-check the name first.
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    setPendingFiles((prev) => [...prev, ...acceptedFiles])
  }, [])

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadPendingFiles = useCallback(async () => {
    if (!advocateId || !id || !caseData || pendingFiles.length === 0) return
    const acceptedFiles = pendingFiles
    setUploading(true)
    setCompressionNote(null)
    setUploadErrors([])
    const supabase = createClient()
    let totalBefore = 0
    let totalAfter = 0
    const errors: string[] = []
    const baseLabel = uploadLabel.trim() || capitalize(uploadDocType)

    for (let i = 0; i < acceptedFiles.length; i++) {
      const rawFile = acceptedFiles[i]
      setCompressingName(rawFile.name)
      const { file, originalBytes, compressedBytes, note } = await compressFile(rawFile)
      totalBefore += originalBytes
      totalAfter += compressedBytes
      if (note) errors.push(`${rawFile.name} — ${note}`)

      // Compression usually gets a big scan well under the limit, but on
      // the rare file where it can't, say so clearly instead of letting
      // the upload just fail with no explanation.
      if (file.size > MAX_UPLOAD_BYTES) {
        errors.push(`${rawFile.name} — still ${formatBytes(file.size)} after compression, over the 50 MB limit. Try splitting it into smaller PDFs, or paste a Google Drive link instead.`)
        continue
      }

      // If more than one file dropped at once with the same label, number
      // them so they don't collide — "Petition 1", "Petition 2", etc.
      const label = acceptedFiles.length > 1 ? `${baseLabel} ${i + 1}` : baseLabel
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const displayName = buildDocFileName(caseData, label, ext)

      const ts = Date.now()
      const safeName = displayName.replace(/[^a-zA-Z0-9().-]/g, '_')
      const storagePath = `${advocateId}/${id}/${ts}_${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from('case-documents')
        .upload(storagePath, file)

      if (uploadErr) {
        errors.push(`${rawFile.name} — upload failed: ${uploadErr.message}`)
        continue
      }

      await supabase.from('case_documents').insert({
        case_id: id,
        file_name: displayName,
        storage_path: storagePath,
        file_size_bytes: file.size,
        mime_type: file.type,
        doc_type: uploadDocType,
        uploaded_by: advocateId,
      })
    }

    setCompressingName(null)
    setUploadErrors(errors)
    // Always leave a visible confirmation that compression actually ran —
    // even when a file was already efficiently encoded and didn't shrink
    // further, so it's never just silent/ambiguous whether it worked.
    const pct = totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0
    setCompressionNote(
      pct > 0
        ? `Compressed ${formatBytes(totalBefore)} → ${formatBytes(totalAfter)} (${pct}% smaller)`
        : `Compression checked — ${formatBytes(totalAfter)} (already efficiently encoded, nothing more to shrink)`
    )
    setUploading(false)
    setUploadLabel('')
    setPendingFiles([])
    loadDocuments()
  }, [advocateId, id, caseData, uploadDocType, uploadLabel, pendingFiles, loadDocuments])

  // ───── Google Drive link ─────
  function extractDriveFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,       // .../file/d/<id>/view
      /[?&]id=([a-zA-Z0-9_-]+)/,           // .../open?id=<id> or ...uc?id=<id>
      /\/document\/d\/([a-zA-Z0-9_-]+)/,   // Google Docs link
      /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/, // Google Sheets link
    ]
    for (const re of patterns) {
      const m = url.match(re)
      if (m) return m[1]
    }
    return null
  }

  async function addDriveLink(e: React.FormEvent) {
    e.preventDefault()
    setDriveError('')
    if (!driveUrl.trim()) return
    if (!/drive\.google\.com|docs\.google\.com/.test(driveUrl)) {
      setDriveError('That doesn\'t look like a Google Drive link.')
      return
    }
    if (!extractDriveFileId(driveUrl)) {
      setDriveError('Couldn\'t read a file from that link — make sure it\'s a "Share" link for a single file.')
      return
    }
    if (!id) return
    setAddingDriveLink(true)
    const supabase = createClient()
    const { error } = await supabase.from('case_documents').insert({
      case_id: id,
      file_name: driveName.trim() || 'Google Drive file',
      external_url: driveUrl.trim(),
      source: 'drive_link',
      doc_type: uploadDocType,
      uploaded_by: advocateId,
    })
    setAddingDriveLink(false)
    if (error) { setDriveError(error.message); return }
    setDriveUrl('')
    setDriveName('')
    loadDocuments()
  }

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    disabled: uploading,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxSize: MAX_SELECT_BYTES,
  })

  // Opens the file in-app first (shown inline, Download/Open-in-Drive sits
  // at the top) rather than immediately jumping away — either to a
  // download or off to Drive's own site — which isn't what you usually
  // want when you just want to glance at a document.
  async function openViewer(doc: CaseDocument) {
    if (doc.source === 'drive_link' && doc.external_url) {
      const fileId = extractDriveFileId(doc.external_url)
      if (!fileId) { window.open(doc.external_url, '_blank'); return } // couldn't parse it — fall back to opening it directly
      setViewingDoc(doc)
      setViewingUrl(`https://drive.google.com/file/d/${fileId}/preview`)
      return
    }
    if (!doc.storage_path) return
    const supabase = createClient()
    const { data } = await supabase.storage
      .from('case-documents')
      .createSignedUrl(doc.storage_path, 300)
    if (data?.signedUrl) {
      setViewingDoc(doc)
      setViewingUrl(data.signedUrl)
    }
  }

  async function downloadViewingDoc() {
    if (!viewingDoc) return
    if (viewingDoc.source === 'drive_link') {
      if (viewingDoc.external_url) window.open(viewingDoc.external_url, '_blank')
      return
    }
    if (!viewingDoc.storage_path) return
    const supabase = createClient()
    // A fresh signed URL with `download` set forces the browser to save
    // the file instead of showing it — the inline preview URL above
    // deliberately doesn't set this.
    const { data } = await supabase.storage
      .from('case-documents')
      .createSignedUrl(viewingDoc.storage_path, 60, { download: viewingDoc.file_name })
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  // Deleting a Drive-linked document also deletes the real file in Drive
  // now, not just the app's reference — so this asks for a real
  // confirmation (see the modal below) rather than a quick button-swap.
  async function confirmDeleteDoc() {
    if (!docPendingDelete) return
    const doc = docPendingDelete
    setDeletingDoc(true)
    setDriveDeleteWarning(null)
    const supabase = createClient()

    if (doc.source === 'drive_link' && doc.external_url) {
      const fileId = extractDriveFileId(doc.external_url)
      if (fileId) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          try {
            const res = await fetch('/api/documents/delete-drive-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ fileId }),
            })
            if (!res.ok) setDriveDeleteWarning('Removed from the case, but couldn\'t delete the file in Google Drive — you may need to remove it there yourself.')
          } catch {
            setDriveDeleteWarning('Removed from the case, but couldn\'t reach Google Drive to delete the file there — you may need to remove it there yourself.')
          }
        }
      }
    } else if (doc.storage_path) {
      await supabase.storage.from('case-documents').remove([doc.storage_path])
    }

    await supabase.from('case_documents').delete().eq('id', doc.id)
    setDeletingDoc(false)
    setDocPendingDelete(null)
    loadDocuments()
  }

  // ───── Delete case ─────
  async function deleteCase() {
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('cases').delete().eq('id', id)
    router.push('/diary/search')
  }

  // ───── Tracking: toggle a boolean field ─────
  async function toggleCaseField(field: keyof CaseRecord, value: boolean) {
    if (!caseData) return
    setTrackingSaving(field)
    const supabase = createClient()
    const patch: Record<string, boolean> = { [field]: value }
    // If turning off "Order Passed", also clear "Order Sent to Company" so state stays consistent
    if (field === 'order_passed' && !value) patch.order_sent_to_company = false
    // If turning off "Company Case", also clear "Documents Received"
    if (field === 'is_company_case' && !value) patch.documents_received = false
    const { error } = await supabase.from('cases').update(patch).eq('id', id)
    if (!error) setCaseData({ ...caseData, ...patch })
    setTrackingSaving(null)
  }

  // ───── Tracking: save order sent date ─────
  async function saveOrderDate(dateVal: string) {
    if (!caseData) return
    setTrackingSaving('order_sent_date')
    const supabase = createClient()
    const { error } = await supabase
      .from('cases')
      .update({ order_sent_date: dateVal || null })
      .eq('id', id)
    if (!error) setCaseData({ ...caseData, order_sent_date: dateVal || null })
    setTrackingSaving(null)
  }

  // ───── Tracking: pick an existing company for this case ─────
  async function selectCompany(companyId: string, companyName: string) {
    if (!caseData) return
    setCompanySaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('cases')
      .update({ client_id: companyId, client_name: companyName })
      .eq('id', id)
    if (!error) setCaseData({ ...caseData, client_id: companyId, client_name: companyName })
    setCompanySaving(false)
    setCompanyPickerOpen(false)
    setCompanySearch('')
  }

  // ───── Tracking: add a brand-new company and attach it to this case ─────
  async function addNewCompany(name: string) {
    if (!caseData || !name.trim()) return
    setCompanySaving(true)
    const supabase = createClient()
    const { data: advRows } = await supabase.from('advocates').select('id').limit(1)
    const advId = advocateId || advRows?.[0]?.id
    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({ advocate_id: advId, name: name.trim(), is_company: true })
      .select('id, name')
      .single()
    if (!error && newClient) {
      setCompanies((prev) => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)))
      await selectCompany(newClient.id, newClient.name)
    }
    setCompanySaving(false)
  }

  // ───── Lok Adalat fitness (tri-state: null = not assessed) ─────
  async function setLokAdalatFit(value: boolean | null) {
    if (!caseData) return
    setTrackingSaving('lok_adalat_fit')
    const supabase = createClient()
    const { error } = await supabase
      .from('cases')
      .update({ lok_adalat_fit: value })
      .eq('id', id)
    if (!error) setCaseData({ ...caseData, lok_adalat_fit: value })
    setTrackingSaving(null)
  }

  // ───── Tracking: save case story ─────
  async function saveStory() {
    if (!caseData) return
    setStorySaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('cases')
      .update({ case_story: storyDraft.trim() || null })
      .eq('id', id)
    if (!error) {
      setCaseData({ ...caseData, case_story: storyDraft.trim() || null })
      setStoryDirty(false)
      setStoryEditing(false)
    }
    setStorySaving(false)
  }

  function cancelStoryEdit() {
    setStoryDraft(caseData?.case_story || '')
    setStoryDirty(false)
    setStoryEditing(false)
  }

  // ───── Tracking: important points CRUD ─────
  async function addImportantPoint(e: React.FormEvent) {
    e.preventDefault()
    if (!newPointText.trim() || !id) return
    setAddingPoint(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('case_important_points')
      .insert({ case_id: id, point_text: newPointText.trim() })
    if (!error) {
      setNewPointText('')
      loadImportantPoints()
    }
    setAddingPoint(false)
  }

  async function deleteImportantPoint(pointId: string) {
    const supabase = createClient()
    await supabase.from('case_important_points').delete().eq('id', pointId)
    setDeletePointId(null)
    loadImportantPoints()
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

  // Last Date / Next Date for the Overview tab — derived from the actual
  // hearing history rather than a stored field, so it's always accurate.
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const lastHearingDate = hearings
    .map((h) => h.hearing_date)
    .filter((d) => d <= todayStr)
    .sort()
    .at(-1) || null
  const nextHearingDate = hearings
    .map((h) => h.hearing_date)
    .filter((d) => d > todayStr)
    .sort()[0] || null

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
              {caseData.court_name}
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
            {lastHearingDate && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-sm text-gray-600">
                  Last date: <span className="font-medium text-gray-800">{formatDate(lastHearingDate)}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/diary/cases/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: '#1e3a5f' }}
            >
              <Pencil className="w-4 h-4" />
              Edit
            </Link>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                <span className="text-sm text-red-700 font-medium">Delete this case?</span>
                <button
                  onClick={deleteCase}
                  disabled={deleting}
                  className="px-3 py-1 rounded text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1 rounded text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {readOnly && (
        <div className="mb-6 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2" style={{ background: '#fef9c3', color: '#854d0e' }}>
          <Eye className="w-4 h-4 shrink-0" />
          View only — you can look through this case, but changes here are limited to advocates.
        </div>
      )}

      {/* ── Tabs — frozen at the top while the page scrolls, so there's no
           need to scroll back up to switch tabs, and it takes up less
           room than before ── */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 sticky top-0 z-10 py-1.5" style={{ background: '#fafaf7' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors"
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
        <div className="space-y-4">
          {/* Court Info — compact inline rows (label and value on one
               line), not stacked, so this doesn't eat half the screen */}
          <section className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Court Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <CompactField label="Next Date" value={formatDate(nextHearingDate)} />
              <CompactField label="Court Level" value={caseData.court_level === 'high_court' ? 'High Court' : 'District Court'} />
              <CompactField label="Court" value={caseData.court_name} />
              {caseData.hc_bench && <CompactField label="HC Bench" value={capitalize(caseData.hc_bench)} />}
              <CompactField label="Case Type" value={caseData.case_type} />
              <CompactField label="Case Number" value={formatCaseNumber(caseData.case_number, caseData.case_year)} />
              <CompactField label="Current Stage" value={caseData.case_stage} />
              <CompactField label="Status" value={capitalize(caseData.status)} />
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center gap-4 flex-wrap">
              <span className="text-xs text-gray-500 shrink-0">Lok Adalat</span>
              <label className={`flex items-center gap-1.5 text-xs text-gray-700 ${readOnly ? '' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={caseData.lok_adalat_fit === true}
                  onChange={(e) => !readOnly && setLokAdalatFit(e.target.checked ? true : null)}
                  disabled={readOnly}
                  className="w-3.5 h-3.5 rounded border-gray-300"
                  style={{ accentColor: '#1e3a5f' }}
                />
                Fit
              </label>
              <label className={`flex items-center gap-1.5 text-xs text-gray-700 ${readOnly ? '' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={caseData.lok_adalat_fit === false}
                  onChange={(e) => !readOnly && setLokAdalatFit(e.target.checked ? false : null)}
                  disabled={readOnly}
                  className="w-3.5 h-3.5 rounded border-gray-300"
                  style={{ accentColor: '#1e3a5f' }}
                />
                Not Fit
              </label>
              {trackingSaving === 'lok_adalat_fit' && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
            </div>
          </section>

          {/* Hearings */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Hearings
              </h3>
              {!showHearingForm && !readOnly && (
                <button
                  onClick={() => { resetHearingForm(); setShowHearingForm(true) }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                  style={{ background: '#1e3a5f' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Hearing
                </button>
              )}
            </div>

            {/* Inline Hearing Form */}
            {showHearingForm && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">
                    {editingHearingId ? 'Edit Hearing' : 'New Hearing'}
                  </h4>
                  <button onClick={resetHearingForm} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={saveHearing} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Hearing Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={hearingForm.hearing_date}
                        onChange={(e) => setHearingForm({ ...hearingForm, hearing_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Stage on Date
                      </label>
                      <select
                        value={hearingForm.stage_on_date}
                        onChange={(e) => { setHearingForm({ ...hearingForm, stage_on_date: e.target.value }); if (e.target.value !== 'Custom...') setHearingCustomStage('') }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                      >
                        <option value="">-- Select Stage --</option>
                        {stages.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {hearingForm.stage_on_date === 'Custom...' && (
                        <input
                          autoFocus
                          type="text"
                          value={hearingCustomStage}
                          onChange={(e) => setHearingCustomStage(e.target.value)}
                          placeholder="Type custom stage…"
                          className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Next Hearing Date
                      </label>
                      <input
                        type="date"
                        value={hearingForm.next_hearing_date}
                        onChange={(e) => setHearingForm({ ...hearingForm, next_hearing_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
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
                      className="px-5 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Hearings Timeline */}
            {hearingsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : hearings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No hearings recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {hearings.map((h) => (
                  <div
                    key={h.id}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-3 relative"
                    style={{ borderLeftWidth: '4px', borderLeftColor: hearingBorderColor(h) }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-800">
                            {formatDate(h.hearing_date)}
                          </span>
                          {h.stage_on_date && (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
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
                            {h.set_by_name && <span className="text-gray-400"> — set by {h.set_by_name}</span>}
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
                      {!readOnly && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => startEditHearing(h)}
                            className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 transition-colors"
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
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Case Story — locked/plain-text once something's been written,
               so a stray tap can't disturb it; "Edit" unlocks it. Empty
               (first time) stays directly typeable. */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Case Story
              </h3>
              {!readOnly && caseData.case_story && !storyEditing && (
                <button
                  onClick={() => setStoryEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
              {!readOnly && storyEditing && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveStory}
                    disabled={storySaving}
                    className="px-4 py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-50"
                    style={{ background: '#1e3a5f' }}
                  >
                    {storySaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelStoryEdit}
                    disabled={storySaving}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {caseData.case_story && !storyEditing ? (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{caseData.case_story}</p>
            ) : (
              <textarea
                value={storyDraft}
                onChange={(e) => { setStoryDraft(e.target.value); setStoryDirty(true) }}
                onBlur={() => { if (storyDirty && !caseData.case_story) saveStory() }}
                autoFocus={storyEditing}
                rows={3}
                readOnly={readOnly}
                placeholder="Paste the core story of the case here, so it's quick to check on the go…"
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 ${readOnly ? 'bg-gray-50 cursor-default' : ''}`}
              />
            )}
          </section>

          {/* Important Points */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2">
              <ListChecks className="w-4 h-4" /> Important Points
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Your arguments and supporting points for this case — add them one at a time as they come to you.
            </p>

            {!readOnly && (
              <form onSubmit={addImportantPoint} className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                  type="text"
                  value={newPointText}
                  onChange={(e) => setNewPointText(e.target.value)}
                  placeholder="Add a point…"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
                <button
                  type="submit"
                  disabled={addingPoint || !newPointText.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 shrink-0"
                  style={{ background: '#1e3a5f' }}
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </form>
            )}

            {pointsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : importantPoints.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No points added yet.</p>
            ) : (
              <div className="space-y-2">
                {importantPoints.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-3 bg-gray-50 rounded-lg p-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{p.point_text}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(p.created_at)}</p>
                    </div>
                    {readOnly ? null : deletePointId === p.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => deleteImportantPoint(p.id)}
                          className="px-2 py-1 rounded text-xs font-semibold text-white bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeletePointId(null)}
                          className="px-2 py-1 rounded text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletePointId(p.id)}
                        className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Case Tracking */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Case Tracking
            </h3>
            <div className="divide-y divide-gray-100">
              <TrackingToggle
                label="Payment Received"
                checked={caseData.payment_received}
                saving={trackingSaving === 'payment_received'}
                onChange={(v) => toggleCaseField('payment_received', v)}
                disabled={readOnly}
              />
              <TrackingToggle
                label="Company Case"
                checked={caseData.is_company_case}
                saving={trackingSaving === 'is_company_case'}
                onChange={(v) => toggleCaseField('is_company_case', v)}
                disabled={readOnly}
              />
              {caseData.is_company_case && (
                <div className="pl-4 border-l-2 py-3 space-y-3" style={{ borderColor: '#dbeafe' }}>
                  {/* Company picker */}
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                    <button
                      type="button"
                      onClick={() => !readOnly && setCompanyPickerOpen((v) => !v)}
                      disabled={readOnly}
                      className={`w-full flex items-center justify-between px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-left transition-colors ${readOnly ? 'bg-gray-50 cursor-default' : 'bg-white hover:border-gray-400'}`}
                    >
                      <span className={caseData.client_name ? 'text-gray-900' : 'text-gray-400'}>
                        {caseData.client_name || 'Select a company…'}
                      </span>
                      {companySaving ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
                      ) : !readOnly && (
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                    </button>

                    {companyPickerOpen && !readOnly && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            autoFocus
                            type="text"
                            value={companySearch}
                            onChange={(e) => setCompanySearch(e.target.value)}
                            placeholder="Search companies…"
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 outline-none"
                          />
                        </div>
                        <ul className="overflow-y-auto max-h-48">
                          {companies
                            .filter((c) => c.name.toLowerCase().includes(companySearch.trim().toLowerCase()))
                            .map((c) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  onClick={() => selectCompany(c.id, c.name)}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                                    c.name === caseData.client_name ? 'bg-blue-50 font-medium' : ''
                                  }`}
                                >
                                  {c.name}
                                </button>
                              </li>
                            ))}
                          {companySearch.trim() && !companies.some((c) => c.name.toLowerCase() === companySearch.trim().toLowerCase()) && (
                            <li>
                              <button
                                type="button"
                                onClick={() => addNewCompany(companySearch)}
                                className="w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 transition-colors flex items-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add &ldquo;{companySearch.trim()}&rdquo; as a new company
                              </button>
                            </li>
                          )}
                          {!companySearch.trim() && companies.length === 0 && (
                            <li className="px-3 py-2.5 text-sm text-gray-400">No companies saved yet — type a name to add one.</li>
                          )}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Pick from your existing companies, or type a new name to add it.
                    </p>
                  </div>

                  <TrackingToggle
                    label="Documents Received (from petitioner's advocate)"
                    checked={caseData.documents_received}
                    saving={trackingSaving === 'documents_received'}
                    onChange={(v) => toggleCaseField('documents_received', v)}
                    disabled={readOnly}
                  />
                </div>
              )}
              <TrackingToggle
                label="Bills Generated"
                checked={caseData.bills_generated}
                saving={trackingSaving === 'bills_generated'}
                onChange={(v) => toggleCaseField('bills_generated', v)}
                disabled={readOnly}
              />
              <TrackingToggle
                label="Order Passed"
                checked={caseData.order_passed}
                saving={trackingSaving === 'order_passed'}
                onChange={(v) => toggleCaseField('order_passed', v)}
                disabled={readOnly}
              />
              {caseData.order_passed && (
                <div className="pl-4 border-l-2 py-3" style={{ borderColor: '#dbeafe' }}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-sm text-gray-700">Order Sent to Company</span>
                    <span className="flex items-center gap-2">
                      {trackingSaving === 'order_sent_to_company' && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                      )}
                      <button
                        type="button"
                        onClick={() => !readOnly && toggleCaseField('order_sent_to_company', !caseData.order_sent_to_company)}
                        disabled={readOnly}
                        className={`relative w-11 h-6 rounded-full transition-colors ${readOnly ? 'opacity-50 cursor-default' : ''}`}
                        style={{ background: caseData.order_sent_to_company ? '#1e3a5f' : '#e5e7eb' }}
                      >
                        <span
                          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform flex items-center justify-center"
                          style={{ transform: caseData.order_sent_to_company ? 'translateX(20px)' : 'translateX(0)' }}
                        >
                          {caseData.order_sent_to_company && <Check className="w-3 h-3" style={{ color: '#1e3a5f' }} />}
                        </span>
                      </button>
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date Sent</label>
                    <input
                      type="date"
                      value={orderDateDraft}
                      onChange={(e) => { setOrderDateDraft(e.target.value); saveOrderDate(e.target.value) }}
                      readOnly={readOnly}
                      className={`px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 ${readOnly ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                </div>
              )}
              <TrackingToggle
                label="Appeal Filed"
                checked={caseData.appeal_filed}
                saving={trackingSaving === 'appeal_filed'}
                onChange={(v) => toggleCaseField('appeal_filed', v)}
                disabled={readOnly}
              />
            </div>
          </section>

          {/* Parties & Client */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Parties & Client
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Plaintiff / Petitioner" value={caseData.party_plaintiff} />
              <Field label="Defendant / Respondent" value={caseData.party_defendant} />
              <Field label="Client Name" value={caseData.client_name} />
              <Field label="Client Side" value={capitalize(caseData.client_side)} />
              <Field label="Our Role" value={caseData.our_role} />
              <Field label="Opposite Advocate" value={caseData.opposite_advocate} />
            </div>
          </section>

          {/* Dates */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Important Dates
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Filed Date" value={formatDate(caseData.filed_date)} />
              <Field label="Disposal Date" value={formatDate(caseData.disposal_date)} />
              <Field label="Created" value={formatDate(caseData.created_at)} />
              <Field label="Last Updated" value={formatDate(caseData.updated_at)} />
            </div>
          </section>

          {/* CNR & Notes */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Notes & eCourts
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* ======== DOCUMENTS ======== */}
      {activeTab === 'documents' && (
        <div>
          {/* Upload Zone */}
          {!readOnly && (
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
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Name this document
                </label>
                <input
                  type="text"
                  value={uploadLabel}
                  onChange={(e) => setUploadLabel(e.target.value)}
                  placeholder="e.g. Petition"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
            </div>
            {caseData && (
              <p className="text-xs text-gray-400 mb-3">
                Will be saved as: <span className="font-mono text-gray-600">
                  {buildDocFileName(caseData, uploadLabel.trim() || capitalize(uploadDocType), 'pdf')}
                </span>
              </p>
            )}

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                uploading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              } ${
                isDragActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              <div>
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">
                  {isDragActive
                    ? 'Drop files here...'
                    : 'Drag and drop PDF, JPG, or PNG files here, or click to browse'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Nothing uploads until you press Upload below — compressed automatically, no visible quality loss</p>
              </div>
            </div>
            {fileRejections.length > 0 && (
              <p className="text-xs text-red-500 mt-2 text-center">
                {fileRejections.map((r) => r.file.name).join(', ')} — {
                  fileRejections[0].errors[0]?.code === 'file-too-large'
                    ? `over the 150 MB selection limit (${formatBytes(fileRejections[0].file.size)}).`
                    : 'not a supported file type (PDF, JPG, or PNG only).'
                }
              </p>
            )}

            {/* Staged files — picked, waiting to be uploaded */}
            {pendingFiles.length > 0 && (
              <div className="mt-4 border border-gray-200 rounded-lg divide-y divide-gray-100">
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 truncate" title={f.name}>{f.name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(f.size)}</p>
                    </div>
                    {!uploading && (
                      <button
                        onClick={() => removePendingFile(i)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors shrink-0"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="p-3">
                  <button
                    onClick={uploadPendingFiles}
                    disabled={uploading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                    style={{ background: '#1e3a5f' }}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {compressingName ? `Compressing ${compressingName}…` : 'Uploading...'}
                      </>
                    ) : (
                      `Upload ${pendingFiles.length} file${pendingFiles.length !== 1 ? 's' : ''}`
                    )}
                  </button>
                </div>
              </div>
            )}
            {uploadErrors.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-500 text-center">{e}</p>
                ))}
              </div>
            )}
            {compressionNote && (
              <p className="text-xs text-emerald-600 font-medium mt-2 text-center">✓ {compressionNote}</p>
            )}

            {/* Or link a Google Drive file — stays in Drive, no copy made */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-600 mb-2">Or add a file that&rsquo;s already in Google Drive</p>
              <form onSubmit={addDriveLink} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  placeholder="Paste the Drive share link…"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
                <input
                  type="text"
                  value={driveName}
                  onChange={(e) => setDriveName(e.target.value)}
                  placeholder="Label (e.g. Written Statement)"
                  className="sm:w-56 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
                <button
                  type="submit"
                  disabled={addingDriveLink || !driveUrl.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 shrink-0"
                  style={{ background: '#1e3a5f' }}
                >
                  {addingDriveLink ? 'Adding…' : 'Add'}
                </button>
              </form>
              {driveError && <p className="text-xs text-red-500 mt-1.5">{driveError}</p>}
              <p className="text-xs text-gray-400 mt-1.5">
                In Drive: open the file → Share → Copy link, then paste it here. The file stays in Drive — this app only keeps the link.
              </p>
            </div>
          </div>
          )}

          {driveDeleteWarning && (
            <div className="mb-4 px-4 py-2.5 rounded-lg text-sm flex items-start gap-2" style={{ background: '#fef3c7', color: '#92400e' }}>
              <span>{driveDeleteWarning}</span>
            </div>
          )}

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
                    {doc.source === 'drive_link' ? (
                      <ExternalLink className="w-8 h-8 text-gray-400 shrink-0 mt-0.5" />
                    ) : (
                      <FileText className="w-8 h-8 text-gray-400 shrink-0 mt-0.5" />
                    )}
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
                        {doc.source === 'drive_link' ? (
                          <span className="text-xs text-gray-400">Google Drive</span>
                        ) : (
                          <span className="text-xs text-gray-400">{formatBytes(doc.file_size_bytes)}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(doc.uploaded_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
                    <button
                      onClick={() => openViewer(doc)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      {doc.source === 'drive_link' ? (
                        <>
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open in Drive
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </>
                      )}
                    </button>
                    {!readOnly && (
                      <button
                        onClick={() => setDocPendingDelete(doc)}
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

      {/* ── Document Viewer — opens the file inline first; Download sits
           at the top so it's only used when actually needed ── */}
      {viewingDoc && viewingUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-gray-200">
            <p className="text-sm font-medium text-gray-800 truncate min-w-0" title={viewingDoc.file_name}>
              {viewingDoc.file_name}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={downloadViewingDoc}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                {viewingDoc.source === 'drive_link' ? (
                  <>
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open in Drive
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </>
                )}
              </button>
              <button
                onClick={() => { setViewingDoc(null); setViewingUrl(null) }}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 bg-gray-800">
            {viewingDoc.mime_type?.startsWith('image/') ? (
              <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewingUrl} alt={viewingDoc.file_name} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <iframe src={viewingUrl} title={viewingDoc.file_name} className="w-full h-full border-0" />
            )}
          </div>
        </div>
      )}

      {/* ── Delete Document confirmation ── */}
      {docPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-sm w-full p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Delete this document?</h3>
            <p className="text-sm text-gray-600 mb-1 break-words">{docPendingDelete.file_name}</p>
            <p className="text-sm text-gray-500 mb-5">
              {docPendingDelete.source === 'drive_link'
                ? 'This will also permanently delete the file in Google Drive, not just remove it from this case. This can\'t be undone.'
                : 'This can\'t be undone.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmDeleteDoc}
                disabled={deletingDoc}
                className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deletingDoc ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setDocPendingDelete(null)}
                disabled={deletingDoc}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
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

// ───── Same as Field, but label and value share one line — for a section
// that needs to stay compact instead of one row per field ─────
function CompactField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm border-b border-gray-50 last:border-0 sm:border-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 font-medium text-right truncate">{value || '--'}</span>
    </div>
  )
}

// ───── Reusable tracking toggle switch ─────
function TrackingToggle({
  label, checked, saving, onChange, disabled,
}: {
  label: string
  checked: boolean
  saving: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm text-gray-700">{label}</span>
      <span className="flex items-center gap-2 shrink-0">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => !disabled && onChange(!checked)}
          disabled={disabled}
          className={`relative w-11 h-6 rounded-full transition-colors ${disabled ? 'opacity-50 cursor-default' : ''}`}
          style={{ background: checked ? '#1e3a5f' : '#e5e7eb' }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform flex items-center justify-center"
            style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
          >
            {checked && <Check className="w-3 h-3" style={{ color: '#1e3a5f' }} />}
          </span>
        </button>
      </span>
    </div>
  )
}
