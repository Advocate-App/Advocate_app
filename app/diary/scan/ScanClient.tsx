'use client'

/**
 * In-app document scanner — camera capture, instant auto-crop + enhance
 * (plain Canvas 2D, no external library — opencv.js was tried three times
 * and never reliably finished loading on a real phone, so auto-crop/
 * enhance just silently never ran), multi-page collection assembled into
 * one PDF, then upload straight to a case (with a Download button too).
 *
 * Flow: Capture keeps firing continuously (camera or file picker), full
 * screen — each shot is auto-cropped + enhanced immediately and added as
 * a thumbnail. Tap a thumbnail to fix its crop by hand if needed. Done →
 * one review screen shows every page at real size, picks a case, names
 * it, uploads or downloads.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { buildDocFileName, type CaseForNaming } from '@/lib/docNaming'
import { formatCaseNumber } from '@/lib/constants/courts'
import { Camera, Upload, Download, X, Check, Loader2, ImagePlus, Search, ArrowLeft, Sparkles, Pencil, History, ChevronDown, ChevronUp } from 'lucide-react'

interface Rect { x0: number; y0: number; x1: number; y1: number }
type EnhanceMode = 'color' | 'bw' | 'off'

interface ScannedPage {
  id: string
  rawCanvas: HTMLCanvasElement // untouched capture — kept so a page can be re-cropped later
  rect: Rect // current crop, in rawCanvas pixel coordinates
  processedCanvas: HTMLCanvasElement // cropped + enhanced — what actually gets used
}

interface CaseResult extends CaseForNaming {
  id: string
  case_number: string | null
  case_year: number | null
  city: string | null
}

interface RecentUpload {
  id: string
  fileName: string
  uploadedAt: string
  caseId: string
  caseTitle: string
}
interface RecentUploadRow {
  id: string
  file_name: string
  uploaded_at: string
  case_id: string
  cases: { full_title: string } | null
}

type Step = 'capture' | 'editCrop' | 'details' | 'uploading' | 'done'

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function fullFrameRect(canvas: HTMLCanvasElement): Rect {
  return { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height }
}

/** Finds the page's bounding box by comparing each row/column against the
 *  background colour sampled from the frame's corners — instant, no
 *  external library, no perspective correction (that needs real computer
 *  vision), but reliably crops away table/background for a document shot
 *  reasonably square-on, which covers the large majority of real scans. */
function autoDetectRect(canvas: HTMLCanvasElement): Rect {
  const W = canvas.width
  const H = canvas.height
  const maxDim = 320
  const scale = Math.min(1, maxDim / Math.max(W, H))
  const w = Math.max(1, Math.round(W * scale))
  const h = Math.max(1, Math.round(H * scale))
  const small = document.createElement('canvas')
  small.width = w
  small.height = h
  const sctx = small.getContext('2d', { willReadFrequently: true })
  if (!sctx) return fullFrameRect(canvas)
  sctx.drawImage(canvas, 0, 0, w, h)
  const { data } = sctx.getImageData(0, 0, w, h)
  const lum = (x: number, y: number) => {
    const i = (y * w + x) * 4
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  const cornerPts: [number, number][] = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]
  const bg = cornerPts.reduce((s, [x, y]) => s + lum(x, y), 0) / cornerPts.length
  const THRESH = 28
  const xStep = Math.max(1, Math.floor(w / 80))
  const yStep = Math.max(1, Math.floor(h / 80))

  function rowHasContent(y: number): boolean {
    let hits = 0, total = 0
    for (let x = 0; x < w; x += xStep) { total++; if (Math.abs(lum(x, y) - bg) > THRESH) hits++ }
    return total > 0 && hits / total > 0.15
  }
  function colHasContent(x: number): boolean {
    let hits = 0, total = 0
    for (let y = 0; y < h; y += yStep) { total++; if (Math.abs(lum(x, y) - bg) > THRESH) hits++ }
    return total > 0 && hits / total > 0.15
  }

  const maxScan = Math.floor(Math.min(w, h) * 0.45) // never eat more than 45% from one side
  let top = 0, bottom = h - 1, left = 0, right = w - 1
  let steps = 0
  while (top < bottom && steps < maxScan && !rowHasContent(top)) { top++; steps++ }
  steps = 0
  while (bottom > top && steps < maxScan && !rowHasContent(bottom)) { bottom--; steps++ }
  steps = 0
  while (left < right && steps < maxScan && !colHasContent(left)) { left++; steps++ }
  steps = 0
  while (right > left && steps < maxScan && !colHasContent(right)) { right--; steps++ }

  const fx = W / w, fy = H / h
  const margin = 3
  const x0 = clamp((left - margin) * fx, 0, W)
  const y0 = clamp((top - margin) * fy, 0, H)
  const x1 = clamp((right + margin) * fx, 0, W)
  const y1 = clamp((bottom + margin) * fy, 0, H)

  const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  if (area < W * H * 0.25) {
    // Detection didn't find anything confident — a light inset beats
    // guessing wrong and cropping into the actual document.
    const inset = Math.round(Math.min(W, H) * 0.02)
    return { x0: inset, y0: inset, x1: W - inset, y1: H - inset }
  }
  return { x0, y0, x1, y1 }
}

function cropCanvas(canvas: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const w = Math.max(1, Math.round(rect.x1 - rect.x0))
  const h = Math.max(1, Math.round(rect.y1 - rect.y0))
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (ctx) ctx.drawImage(canvas, rect.x0, rect.y0, w, h, 0, 0, w, h)
  return out
}

/** The "magic" pass real scanner apps apply after cropping — a contrast/
 *  brightness/saturation boost for a clean-scan look, or (B&W mode) a
 *  crisp black-text-on-white threshold. Native Canvas 2D only. */
function enhanceCanvas(canvas: HTMLCanvasElement, mode: EnhanceMode): HTMLCanvasElement {
  if (mode === 'off') return canvas
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')
  if (!ctx) return canvas

  if (mode === 'color') {
    ctx.filter = 'contrast(135%) brightness(108%) saturate(112%)'
    ctx.drawImage(canvas, 0, 0)
    return out
  }

  // B&W — grayscale first (via filter, cheap), then threshold per-pixel.
  ctx.filter = 'grayscale(100%)'
  ctx.drawImage(canvas, 0, 0)
  ctx.filter = 'none'
  const imgData = ctx.getImageData(0, 0, out.width, out.height)
  const d = imgData.data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += d[i]
  const avg = sum / (d.length / 4)
  const threshold = clamp(avg - 20, 100, 200)
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > threshold ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(imgData, 0, 0)
  return out
}

export default function ScanClient() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('capture')
  const [pages, setPages] = useState<ScannedPage[]>([])
  const [enhanceMode, setEnhanceMode] = useState<EnhanceMode>('color')

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [videoReady, setVideoReady] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [justCaptured, setJustCaptured] = useState(false)
  const [captureNote, setCaptureNote] = useState<string | null>(null)

  // Edit-crop step (re-cropping an already-captured page) — a plain
  // rectangle now (drag the two corners), not a 4-point perspective quad.
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editRect, setEditRect] = useState<Rect | null>(null)
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
  const imgWrapRef = useRef<HTMLDivElement>(null)
  const draggingHandle = useRef<'tl' | 'br' | null>(null)

  // Details / upload
  const [advocateId, setAdvocateId] = useState<string | null>(null)
  const [caseQuery, setCaseQuery] = useState('')
  const [caseResults, setCaseResults] = useState<CaseResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedCase, setSelectedCase] = useState<CaseResult | null>(null)
  const [label, setLabel] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)

  // History — recently uploaded documents, shown with the exact same
  // filename (label_party1_party2) they were saved as, e.g. a doc named
  // "Petition" attached to Rohan vs Sohan shows as "Petition_Rohan_Sohan".
  const [recentUploads, setRecentUploads] = useState<RecentUpload[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const loadRecentUploads = useCallback(async () => {
    if (!advocateId) return
    const supabase = createClient()
    const { data } = await supabase
      .from('case_documents')
      .select('id, file_name, uploaded_at, case_id, cases(full_title)')
      .eq('uploaded_by', advocateId)
      .order('uploaded_at', { ascending: false })
      .limit(20)
    if (data) {
      setRecentUploads((data as unknown as RecentUploadRow[]).map((d) => ({
        id: d.id,
        fileName: d.file_name,
        uploadedAt: d.uploaded_at,
        caseId: d.case_id,
        caseTitle: d.cases?.full_title || '',
      })))
    }
  }, [advocateId])

  useEffect(() => { loadRecentUploads() }, [loadRecentUploads])

  // ── Don't lose scanned-but-not-uploaded pages to a stray back-button
  // press — pushes one extra history entry once there's something to
  // lose, and a confirm before actually letting a back navigation (or
  // the in-app back/exit buttons) through. ──
  const pagesRef = useRef<ScannedPage[]>([])
  useEffect(() => { pagesRef.current = pages }, [pages])
  const guardPushedRef = useRef(false)

  useEffect(() => {
    if (pages.length > 0 && !guardPushedRef.current) {
      guardPushedRef.current = true
      window.history.pushState({ scannerGuard: true }, '', window.location.href)
    }
  }, [pages.length])

  useEffect(() => {
    function handlePopState() {
      if (pagesRef.current.length > 0 && step !== 'done') {
        const leave = window.confirm(
          `You have ${pagesRef.current.length} scanned page${pagesRef.current.length !== 1 ? 's' : ''} not uploaded yet. Leave and lose them?`
        )
        if (leave) {
          guardPushedRef.current = false
          router.back()
        } else {
          window.history.pushState({ scannerGuard: true }, '', window.location.href)
        }
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [router, step])

  function exitScanner() {
    if (pages.length > 0 && step !== 'done') {
      const leave = window.confirm(
        `You have ${pages.length} scanned page${pages.length !== 1 ? 's' : ''} not uploaded yet. Leave and lose them?`
      )
      if (!leave) return
    }
    router.back()
  }

  // ── Camera — tries progressively looser constraints so an odd device
  // (no exact 1080p rear-camera match, etc.) still gets *something*
  // instead of failing outright. ──
  const startCamera = useCallback(async () => {
    setCameraError(null)
    setVideoReady(false)
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
      { video: { facingMode: { ideal: 'environment' } } },
      { video: true },
    ]
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try {
            await videoRef.current.play()
          } catch {
            // Some browsers reject an explicit play() call even though the
            // stream itself is fine and starts via the autoPlay attribute
            // anyway — don't throw away a working stream over this.
          }
        }
        return
      } catch {
        // try the next, looser set of constraints
      }
    }
    setCameraError('Could not access the camera. You can still pick a photo from your files below.')
  }, [])

  useEffect(() => {
    if (step === 'capture') startCamera()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [step, startCamera])

  // Who's uploading (for the case_documents row)
  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: adv } = await supabase.from('advocates').select('id').eq('user_id', user.id).limit(1).single()
      if (adv) setAdvocateId(adv.id)
    })()
  }, [])

  // Captures (or a picked file) go straight in as a new page, auto-cropped
  // and enhanced immediately — everything here is plain Canvas 2D, so
  // there's no loading delay and no external dependency that might not
  // be ready in time.
  function addPage(canvas: HTMLCanvasElement) {
    const id = `${Date.now()}-${Math.random()}`
    try {
      const rect = autoDetectRect(canvas)
      const cropped = cropCanvas(canvas, rect)
      const processed = enhanceCanvas(cropped, enhanceMode)
      setPages((p) => [...p, { id, rawCanvas: canvas, rect, processedCanvas: processed }])
    } catch (err) {
      console.error('auto-crop/enhance failed, keeping the raw photo:', err)
      setPages((p) => [...p, { id, rawCanvas: canvas, rect: fullFrameRect(canvas), processedCanvas: canvas }])
    }
    setJustCaptured(true)
    setTimeout(() => setJustCaptured(false), 400)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.readyState < 2) {
      setCaptureNote('Camera is still starting up — give it a second and try again.')
      setTimeout(() => setCaptureNote(null), 2500)
      return
    }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(video, 0, 0)
      // A short buzz so a shot actually feels taken — Android Chrome only,
      // iOS Safari doesn't support the Vibration API and just no-ops.
      navigator.vibrate?.(50)
      addPage(canvas)
    } catch (err) {
      console.error('capture failed:', err)
      setCaptureNote('That capture didn’t work — try again.')
      setTimeout(() => setCaptureNote(null), 2500)
    }
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const file of files) {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        addPage(canvas)
        URL.revokeObjectURL(img.src)
      }
      img.src = URL.createObjectURL(file)
    }
  }

  function openEditCrop(pageId: string) {
    const pg = pages.find((p) => p.id === pageId)
    if (!pg) return
    setEditingPageId(pageId)
    setEditRect(pg.rect)
    setStep('editCrop')
  }

  // Track how big the crop image is actually displayed, to translate
  // between screen drag coordinates and the canvas's real pixel corners.
  const editingPage = pages.find((p) => p.id === editingPageId) || null
  useEffect(() => {
    if (step !== 'editCrop' || !imgWrapRef.current) return
    const el = imgWrapRef.current
    const update = () => setDisplaySize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [step, editingPage])

  const scale = editingPage && displaySize.width > 0 ? displaySize.width / editingPage.rawCanvas.width : 1

  function onHandlePointerDown(which: 'tl' | 'br') {
    draggingHandle.current = which
  }
  function onOverlayPointerMove(e: React.PointerEvent) {
    if (!draggingHandle.current || !editRect || !editingPage || !imgWrapRef.current) return
    const rect = imgWrapRef.current.getBoundingClientRect()
    const x = clamp((e.clientX - rect.left) / scale, 0, editingPage.rawCanvas.width)
    const y = clamp((e.clientY - rect.top) / scale, 0, editingPage.rawCanvas.height)
    if (draggingHandle.current === 'tl') setEditRect({ ...editRect, x0: x, y0: y })
    else setEditRect({ ...editRect, x1: x, y1: y })
  }
  function onOverlayPointerUp() {
    draggingHandle.current = null
  }

  function confirmCropEdit() {
    if (!editingPage || !editRect) return
    const normalized: Rect = {
      x0: Math.min(editRect.x0, editRect.x1),
      y0: Math.min(editRect.y0, editRect.y1),
      x1: Math.max(editRect.x0, editRect.x1),
      y1: Math.max(editRect.y0, editRect.y1),
    }
    const cropped = cropCanvas(editingPage.rawCanvas, normalized)
    const processed = enhanceCanvas(cropped, enhanceMode)
    setPages((prev) => prev.map((p) => (p.id === editingPage.id ? { ...p, rect: normalized, processedCanvas: processed } : p)))
    setEditingPageId(null)
    setEditRect(null)
    setStep('capture')
  }

  function cancelCropEdit() {
    setEditingPageId(null)
    setEditRect(null)
    setStep('capture')
  }

  function removePage(id: string) {
    setPages((p) => p.filter((pg) => pg.id !== id))
  }

  // ── Case search ──
  function handleCaseSearch(q: string) {
    setCaseQuery(q)
    setSelectedCase(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!q.trim()) { setCaseResults([]); return }
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('cases')
        .select('id, court_code, court_name, case_number, case_year, party_plaintiff, party_defendant, city')
        .or(`party_plaintiff.ilike.%${q}%,party_defendant.ilike.%${q}%,case_number.ilike.%${q}%`)
        .limit(15)
      setCaseResults((data as CaseResult[]) || [])
      setSearching(false)
    }, 300)
  }

  // ── Build the PDF from all pages (used for both Download and Upload) ──
  async function buildPdf(): Promise<Uint8Array> {
    // Dynamic import — pdf-lib touches browser-only APIs (DOMMatrix) at
    // module-evaluation time, which crashes when this page is rendered on
    // the server (Vercel does this on every request for a dynamic route,
    // not just at build time). A static top-level import got evaluated
    // there; this one only loads once actually called, client-side only.
    const { PDFDocument } = await import('pdf-lib')
    const pdfDoc = await PDFDocument.create()
    for (const page of pages) {
      const jpegDataUrl = page.processedCanvas.toDataURL('image/jpeg', 0.92)
      const jpegBytes = Uint8Array.from(atob(jpegDataUrl.split(',')[1]), (c) => c.charCodeAt(0))
      const img = await pdfDoc.embedJpg(jpegBytes)
      const pdfPage = pdfDoc.addPage([img.width, img.height])
      pdfPage.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
    }
    return pdfDoc.save()
  }

  async function downloadPdf() {
    const bytes = pdfBytes || (await buildPdf())
    if (!pdfBytes) setPdfBytes(bytes)
    const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (label.trim() ? label.trim() : 'Scanned Document') + '.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function uploadScan() {
    if (!selectedCase || !advocateId || pages.length === 0) return
    setUploadError(null)
    setStep('uploading')
    try {
      const bytes = pdfBytes || (await buildPdf())
      const displayName = buildDocFileName(selectedCase, label.trim() || 'Scan', 'pdf')
      // No general-purpose compressFile() here on purpose — each page was
      // already JPEG-encoded at capture resolution when the PDF was built
      // above. Running that back through the shared PDF compressor
      // re-renders every page down to 160 DPI and re-compresses it a
      // *second* time on top of that — double compression is what was
      // making scans come out blurry.
      const file = new File([bytes.slice().buffer], displayName, { type: 'application/pdf' })

      const supabase = createClient()
      const ts = Date.now()
      const safeName = displayName.replace(/[^a-zA-Z0-9().-]/g, '_')
      const storagePath = `${advocateId}/${selectedCase.id}/${ts}_${safeName}`

      const { error: uploadErr } = await supabase.storage.from('case-documents').upload(storagePath, file)
      if (uploadErr) throw new Error(uploadErr.message)

      await supabase.from('case_documents').insert({
        case_id: selectedCase.id,
        file_name: displayName,
        storage_path: storagePath,
        file_size_bytes: file.size,
        mime_type: file.type,
        doc_type: 'other',
        uploaded_by: advocateId,
      })

      loadRecentUploads()
      setStep('done')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed — try again.')
      setStep('details')
    }
  }

  function scanAnother() {
    setPages([])
    setSelectedCase(null)
    setCaseQuery('')
    setCaseResults([])
    setLabel('')
    setUploadError(null)
    setPdfBytes(null)
    setStep('capture')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={exitScanner} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Scan Document</h1>
          <p className="text-sm text-gray-400 mt-0.5">Scan one or more pages, then attach them to a case as one PDF.</p>
        </div>
        {recentUploads.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 shrink-0"
          >
            <History className="w-3.5 h-3.5" />
            History
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* ── Recent scans — shown with the exact filename they were saved
          as (label first, then the case's parties), e.g. a doc named
          "Petition" attached to Rohan vs Sohan shows as
          "Petition_Rohan_Sohan(...)". ── */}
      {showHistory && (
        <div className="bg-white rounded-xl border border-gray-200 mb-6 divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {recentUploads.map((u) => (
            <Link key={u.id} href={`/diary/cases/${u.caseId}`} className="block px-4 py-2.5 hover:bg-gray-50">
              <p className="text-sm font-medium text-gray-800 truncate">{u.fileName}</p>
              <p className="text-xs text-gray-400 truncate">{u.caseTitle} · {new Date(u.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </Link>
          ))}
        </div>
      )}

      {/* ── Capture step — full-screen like Adobe Scanner/CamScanner, so
          the frame is actually big enough to see what you're scanning.
          Stays open after every shot (thumbnails collect along the
          bottom) so you can keep scanning pages back to back; Done takes
          you to the page review. ── */}
      {step === 'capture' && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Camera fills all the space between the top and bottom bars */}
          <div className={`flex-1 relative overflow-hidden transition-opacity ${justCaptured ? 'opacity-60' : ''}`}>
            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <p className="text-white/70 text-sm text-center">{cameraError}</p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                  onLoadedMetadata={() => setVideoReady(true)}
                />
                {!videoReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <p className="text-white/80 text-sm flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting camera…
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Top bar, overlaid on the camera */}
            <div className="absolute top-0 inset-x-0 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
              <button onClick={exitScanner} className="p-2 rounded-full bg-black/30 text-white">
                <X className="w-5 h-5" />
              </button>
              <span className="text-white text-sm font-medium">
                {pages.length > 0 ? `${pages.length} page${pages.length !== 1 ? 's' : ''} scanned` : 'Scan Document'}
              </span>
              <div className="flex items-center gap-1.5">
                {(['color', 'bw', 'off'] as EnhanceMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setEnhanceMode(m)}
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      enhanceMode === m ? 'bg-white text-gray-900' : 'bg-black/30 text-white/80'
                    }`}
                  >
                    {m === 'color' ? 'Enhance' : m === 'bw' ? 'B&W' : 'Off'}
                  </button>
                ))}
              </div>
            </div>

            {captureNote && (
              <div className="absolute top-14 inset-x-0 flex justify-center px-4">
                <p className="bg-black/60 text-white/90 text-xs px-3 py-1.5 rounded-full">{captureNote}</p>
              </div>
            )}
          </div>

          {/* Bottom bar, overlaid on the camera */}
          <div className="bg-gradient-to-t from-black/80 to-black/40 px-4 pt-3 pb-5">
            {pages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-3">
                {pages.map((p) => (
                  <div key={p.id} className="relative shrink-0">
                    <button onClick={() => openEditCrop(p.id)} className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.processedCanvas.toDataURL('image/jpeg', 0.6)} alt="" className="h-16 w-auto rounded border-2 border-white/80" />
                      <span className="absolute bottom-1 right-1 bg-black/50 rounded-full p-1">
                        <Pencil className="w-2.5 h-2.5 text-white" />
                      </span>
                    </button>
                    <button
                      onClick={() => removePage(p.id)}
                      className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-gray-300 p-0.5 text-gray-500 hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-full bg-white/15 text-white"
              >
                <ImagePlus className="w-5 h-5" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFilePicked} className="hidden" />

              <button
                onClick={capturePhoto}
                disabled={!!cameraError || !videoReady}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-full text-white font-medium disabled:opacity-30 bg-white/20 border-2 border-white"
              >
                <Camera className="w-5 h-5" />
                {videoReady ? 'Capture' : 'Starting…'}
              </button>

              {pages.length > 0 ? (
                <button
                  onClick={() => setStep('details')}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-full text-white font-medium"
                  style={{ background: '#1e3a5f' }}
                >
                  <Check className="w-4 h-4" />
                  Done
                </button>
              ) : (
                <div className="w-[72px]" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit crop step — only reached by tapping an existing page.
          Drag the two corner handles to adjust a plain rectangular
          crop. ── */}
      {step === 'editCrop' && editingPage && editRect && (
        <div className="space-y-4">
          <div
            ref={imgWrapRef}
            className="relative w-full select-none touch-none bg-gray-900 rounded-xl overflow-hidden"
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
            onPointerLeave={onOverlayPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={editingPage.rawCanvas.toDataURL('image/jpeg', 0.85)} alt="Captured page" className="w-full h-auto block" draggable={false} />
            <div
              className="absolute pointer-events-none border-2"
              style={{
                borderColor: '#1e3a5f',
                background: 'rgba(30,58,95,0.2)',
                left: Math.min(editRect.x0, editRect.x1) * scale,
                top: Math.min(editRect.y0, editRect.y1) * scale,
                width: Math.abs(editRect.x1 - editRect.x0) * scale,
                height: Math.abs(editRect.y1 - editRect.y0) * scale,
              }}
            />
            <div
              onPointerDown={(e) => { e.preventDefault(); onHandlePointerDown('tl') }}
              className="absolute w-9 h-9 -ml-4.5 -mt-4.5 rounded-full bg-white border-2 pointer-events-auto cursor-grab active:cursor-grabbing shadow"
              style={{ left: editRect.x0 * scale, top: editRect.y0 * scale, borderColor: '#1e3a5f' }}
            />
            <div
              onPointerDown={(e) => { e.preventDefault(); onHandlePointerDown('br') }}
              className="absolute w-9 h-9 -ml-4.5 -mt-4.5 rounded-full bg-white border-2 pointer-events-auto cursor-grab active:cursor-grabbing shadow"
              style={{ left: editRect.x1 * scale, top: editRect.y1 * scale, borderColor: '#1e3a5f' }}
            />
          </div>
          <p className="text-xs text-gray-400 text-center">Drag the two corners to match the page edges, then confirm.</p>
          <div className="flex items-center gap-3">
            <button
              onClick={cancelCropEdit}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => setEditRect(fullFrameRect(editingPage.rawCanvas))}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Use Full Image
            </button>
            <button
              onClick={confirmCropEdit}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium"
              style={{ background: '#1e3a5f' }}
            >
              <Check className="w-4 h-4" />
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* ── Details step: the whole document at real size, then pick a
          case, name it, upload/download. ── */}
      {(step === 'details' || step === 'uploading') && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">
              {pages.length} page{pages.length !== 1 ? 's' : ''} — tap to fix a crop
            </p>
            <div className="space-y-3">
              {pages.map((p, i) => (
                <div key={p.id} className="relative">
                  <button onClick={() => openEditCrop(p.id)} className="block w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.processedCanvas.toDataURL('image/jpeg', 0.85)} alt={`Page ${i + 1}`} className="w-full h-auto rounded-lg border border-gray-200" />
                    <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">Page {i + 1}</span>
                    <span className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1.5">
                      <Pencil className="w-3.5 h-3.5 text-white" />
                    </span>
                  </button>
                  <button
                    onClick={() => removePage(p.id)}
                    className="absolute -top-2 -right-2 bg-white rounded-full border border-gray-300 p-1 text-gray-500 hover:text-red-600 shadow"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {!selectedCase ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Which case is this for?</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={caseQuery}
                  onChange={(e) => handleCaseSearch(e.target.value)}
                  placeholder="Search by party name or case number…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
                />
              </div>
              {searching && <p className="text-xs text-gray-400 mt-2">Searching…</p>}
              {caseResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {caseResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCase(c); setCaseResults([]); setCaseQuery('') }}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium text-gray-800">{c.party_plaintiff} <span className="text-gray-400">vs</span> {c.party_defendant}</div>
                      <div className="text-xs text-gray-400">
                        {formatCaseNumber(c.case_number || '', c.case_year)} · {c.court_name}{c.city ? ` · ${c.city}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Case</p>
                  <p className="text-sm font-medium text-gray-800">{selectedCase.party_plaintiff} <span className="text-gray-400">vs</span> {selectedCase.party_defendant}</p>
                  <p className="text-xs text-gray-400">{formatCaseNumber(selectedCase.case_number || '', selectedCase.case_year)} · {selectedCase.court_name}</p>
                </div>
                <button onClick={() => setSelectedCase(null)} className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0">Change</button>
              </div>
              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">File name</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Petition, Vakalatnama, Order…"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:border-[#1e3a5f]"
                />
                {label.trim() && (
                  <p className="text-xs text-gray-400 mt-1.5 truncate">
                    Will save as: {buildDocFileName(selectedCase, label.trim(), 'pdf')}
                  </p>
                )}
              </div>
            </div>
          )}

          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={downloadPdf}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            <button
              onClick={uploadScan}
              disabled={!selectedCase || step === 'uploading'}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-30"
              style={{ background: '#1e3a5f' }}
            >
              {step === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {step === 'uploading' ? 'Uploading…' : 'Upload to Case'}
            </button>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && selectedCase && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-gray-800 mb-1">Uploaded</p>
          <p className="text-xs text-gray-400 mb-5">
            {pages.length} page{pages.length !== 1 ? 's' : ''} saved to {selectedCase.party_plaintiff} vs {selectedCase.party_defendant}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => router.push(`/diary/cases/${selectedCase.id}`)}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: '#1e3a5f' }}
            >
              View Case
            </button>
            <button
              onClick={scanAnother}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Scan Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
