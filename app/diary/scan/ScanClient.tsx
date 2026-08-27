'use client'

/**
 * In-app document scanner — camera capture, auto edge-detection + crop
 * (OpenCV.js, loaded lazily only on this page since it's a ~8MB asset),
 * multi-page collection assembled into one PDF, then the same
 * compress → upload pipeline the case detail page's file picker uses.
 *
 * Flow: Capture (camera or file picker) → Crop (auto-detected corners,
 * draggable to adjust) → repeat for more pages → pick a case + name it →
 * Upload (with a Download button too, before or instead of uploading).
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { compressFile } from '@/lib/compress'
import { buildDocFileName, type CaseForNaming } from '@/lib/docNaming'
import { formatCaseNumber } from '@/lib/constants/courts'
import { Camera, Upload, Download, X, Check, RotateCcw, Loader2, ImagePlus, Search, ArrowLeft } from 'lucide-react'

// The opencv.js global — typed loosely since its API surface is huge and
// this file only touches a handful of functions.
type CVNamespace = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

declare global {
  interface Window {
    cv?: CVNamespace
  }
}

interface Point { x: number; y: number }
interface ScannedPage { id: string; canvas: HTMLCanvasElement }

interface CaseResult extends CaseForNaming {
  id: string
  case_number: string | null
  case_year: number | null
  city: string | null
}

type Step = 'capture' | 'crop' | 'details' | 'uploading' | 'done'

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function orderCorners(pts: Point[]): [Point, Point, Point, Point] {
  const sums = pts.map((p) => p.x + p.y)
  const diffs = pts.map((p) => p.x - p.y)
  const tl = pts[sums.indexOf(Math.min(...sums))]
  const br = pts[sums.indexOf(Math.max(...sums))]
  const tr = pts[diffs.indexOf(Math.max(...diffs))]
  const bl = pts[diffs.indexOf(Math.min(...diffs))]
  return [tl, tr, br, bl]
}

/** Finds the document's 4 corners via edge detection; returns null (caller
 *  falls back to the full frame) if nothing convincing enough is found. */
function detectDocumentCorners(cv: CVNamespace, canvas: HTMLCanvasElement): [Point, Point, Point, Point] | null {
  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edged = new cv.Mat()
  const dilated = new cv.Mat()
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U)
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  let bestPoints: Point[] | null = null

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edged, 75, 200)
    cv.dilate(edged, dilated, kernel)
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    const imgArea = src.rows * src.cols
    let bestArea = 0
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const peri = cv.arcLength(cnt, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true)
      if (approx.rows === 4) {
        const area = cv.contourArea(approx)
        if (area > bestArea && area > imgArea * 0.15) {
          bestArea = area
          const pts: Point[] = []
          for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] })
          bestPoints = pts
        }
      }
      approx.delete()
      cnt.delete()
    }
  } finally {
    src.delete(); gray.delete(); blurred.delete(); edged.delete(); dilated.delete()
    kernel.delete(); contours.delete(); hierarchy.delete()
  }

  return bestPoints ? orderCorners(bestPoints) : null
}

/** Crops + straightens the source canvas to just the quadrilateral given
 *  by `corners` (perspective transform), returning a fresh canvas. */
function warpToCorners(cv: CVNamespace, canvas: HTMLCanvasElement, corners: [Point, Point, Point, Point]): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners
  const maxWidth = Math.round(Math.max(dist(tl, tr), dist(bl, br)))
  const maxHeight = Math.round(Math.max(dist(tl, bl), dist(tr, br)))

  const src = cv.imread(canvas)
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, maxWidth, 0, maxWidth, maxHeight, 0, maxHeight])
  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  const dst = new cv.Mat()
  const dsize = new cv.Size(maxWidth, maxHeight)

  const out = document.createElement('canvas')
  out.width = maxWidth
  out.height = maxHeight
  try {
    cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar())
    cv.imshow(out, dst)
  } finally {
    src.delete(); srcTri.delete(); dstTri.delete(); M.delete(); dst.delete()
  }
  return out
}

export default function ScanClient() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('capture')
  const [pages, setPages] = useState<ScannedPage[]>([])

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // OpenCV
  const [cvReady, setCvReady] = useState(false)
  const [cvLoadFailed, setCvLoadFailed] = useState(false)

  // Crop step
  const [rawCanvas, setRawCanvas] = useState<HTMLCanvasElement | null>(null)
  const [corners, setCorners] = useState<[Point, Point, Point, Point] | null>(null)
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
  const imgWrapRef = useRef<HTMLDivElement>(null)
  const draggingCorner = useRef<number | null>(null)

  // Details / upload
  const [advocateId, setAdvocateId] = useState<string | null>(null)
  const [caseQuery, setCaseQuery] = useState('')
  const [caseResults, setCaseResults] = useState<CaseResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedCase, setSelectedCase] = useState<CaseResult | null>(null)
  const [label, setLabel] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [compressNote, setCompressNote] = useState<string | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)

  // ── Load opencv.js lazily, only on this page ──
  useEffect(() => {
    if (window.cv && window.cv.Mat) { setCvReady(true); return }
    const script = document.createElement('script')
    script.src = '/opencv.js'
    script.async = true
    script.onload = () => {
      const check = () => {
        if (window.cv && window.cv.Mat) setCvReady(true)
        else if (window.cv) window.cv['onRuntimeInitialized'] = () => setCvReady(true)
        else setTimeout(check, 200)
      }
      check()
    }
    script.onerror = () => setCvLoadFailed(true)
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [])

  // ── Camera ──
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setCameraError('Could not access the camera. You can still pick a photo from your files below.')
    }
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

  function goToCrop(canvas: HTMLCanvasElement) {
    setRawCanvas(canvas)
    setStep('crop')
    if (cvReady && window.cv) {
      const detected = detectDocumentCorners(window.cv, canvas)
      setCorners(detected || fullFrameCorners(canvas))
    } else {
      setCorners(fullFrameCorners(canvas))
    }
  }

  function fullFrameCorners(canvas: HTMLCanvasElement): [Point, Point, Point, Point] {
    const inset = Math.round(Math.min(canvas.width, canvas.height) * 0.04)
    return [
      { x: inset, y: inset },
      { x: canvas.width - inset, y: inset },
      { x: canvas.width - inset, y: canvas.height - inset },
      { x: inset, y: canvas.height - inset },
    ]
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    goToCrop(canvas)
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      goToCrop(canvas)
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }

  // Track how big the crop image is actually displayed, to translate
  // between screen drag coordinates and the canvas's real pixel corners.
  useEffect(() => {
    if (step !== 'crop' || !imgWrapRef.current) return
    const el = imgWrapRef.current
    const update = () => setDisplaySize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [step, rawCanvas])

  const scale = rawCanvas && displaySize.width > 0 ? displaySize.width / rawCanvas.width : 1

  function onCornerPointerDown(index: number) {
    draggingCorner.current = index
  }
  function onOverlayPointerMove(e: React.PointerEvent) {
    if (draggingCorner.current === null || !corners || !rawCanvas || !imgWrapRef.current) return
    const rect = imgWrapRef.current.getBoundingClientRect()
    const x = Math.min(Math.max(0, (e.clientX - rect.left) / scale), rawCanvas.width)
    const y = Math.min(Math.max(0, (e.clientY - rect.top) / scale), rawCanvas.height)
    const next = [...corners] as [Point, Point, Point, Point]
    next[draggingCorner.current] = { x, y }
    setCorners(next)
  }
  function onOverlayPointerUp() {
    draggingCorner.current = null
  }

  function confirmPage() {
    if (!rawCanvas || !corners) return
    const cropped = cvReady && window.cv ? warpToCorners(window.cv, rawCanvas, corners) : rawCanvas
    setPages((p) => [...p, { id: `${Date.now()}-${Math.random()}`, canvas: cropped }])
    setRawCanvas(null)
    setCorners(null)
    setStep('capture')
  }

  function retake() {
    setRawCanvas(null)
    setCorners(null)
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
      const jpegDataUrl = page.canvas.toDataURL('image/jpeg', 0.92)
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
      const rawFile = new File([bytes.slice().buffer], displayName, { type: 'application/pdf' })

      const { file, note } = await compressFile(rawFile)
      if (note) setCompressNote(note)

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
    setCompressNote(null)
    setPdfBytes(null)
    setStep('capture')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>Scan Document</h1>
          <p className="text-sm text-gray-400 mt-0.5">Scan one or more pages, then attach them to a case as one PDF.</p>
        </div>
      </div>

      {/* ── Capture step ── */}
      {step === 'capture' && (
        <div className="space-y-4">
          <div className="bg-black rounded-xl overflow-hidden relative aspect-[3/4] flex items-center justify-center">
            {cameraError ? (
              <p className="text-white/70 text-sm text-center px-6">{cameraError}</p>
            ) : (
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            )}
          </div>
          {!cvReady && !cvLoadFailed && (
            <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing auto-detect (first scan only)…
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={capturePhoto}
              disabled={!!cameraError}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-white font-medium disabled:opacity-30"
              style={{ background: '#1e3a5f' }}
            >
              <Camera className="w-5 h-5" />
              Capture
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
            >
              <ImagePlus className="w-5 h-5" />
              From Files
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFilePicked} className="hidden" />
          </div>

          {pages.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500 mb-2">{pages.length} page{pages.length !== 1 ? 's' : ''} scanned</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pages.map((p) => (
                  <div key={p.id} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.canvas.toDataURL('image/jpeg', 0.6)} alt="" className="h-20 w-auto rounded border border-gray-200" />
                    <button
                      onClick={() => removePage(p.id)}
                      className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-gray-300 p-0.5 text-gray-500 hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep('details')}
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium"
                style={{ background: '#1e3a5f' }}
              >
                <Check className="w-4 h-4" />
                Done Scanning — Continue
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Crop step ── */}
      {step === 'crop' && rawCanvas && corners && (
        <div className="space-y-4">
          <div
            ref={imgWrapRef}
            className="relative w-full select-none touch-none bg-gray-900 rounded-xl overflow-hidden"
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
            onPointerLeave={onOverlayPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rawCanvas.toDataURL('image/jpeg', 0.85)} alt="Captured page" className="w-full h-auto block" draggable={false} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <polygon
                points={corners.map((c) => `${c.x * scale},${c.y * scale}`).join(' ')}
                fill="rgba(30,58,95,0.25)"
                stroke="#1e3a5f"
                strokeWidth={2}
              />
            </svg>
            {corners.map((c, i) => (
              <div
                key={i}
                onPointerDown={(e) => { e.preventDefault(); onCornerPointerDown(i) }}
                className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full bg-white border-2 pointer-events-auto cursor-grab active:cursor-grabbing shadow"
                style={{ left: c.x * scale, top: c.y * scale, borderColor: '#1e3a5f' }}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 text-center">Drag the corners to match the page edges, then confirm.</p>
          <div className="flex items-center gap-3">
            <button
              onClick={retake}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              <RotateCcw className="w-4 h-4" />
              Retake
            </button>
            <button
              onClick={() => setCorners(fullFrameCorners(rawCanvas))}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Use Full Image
            </button>
            <button
              onClick={confirmPage}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium"
              style={{ background: '#1e3a5f' }}
            >
              <Check className="w-4 h-4" />
              Confirm Page
            </button>
          </div>
        </div>
      )}

      {/* ── Details step: pick case, name it, upload/download ── */}
      {(step === 'details' || step === 'uploading') && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">{pages.length} page{pages.length !== 1 ? 's' : ''}</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pages.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.canvas.toDataURL('image/jpeg', 0.6)} alt="" className="h-16 w-auto rounded border border-gray-200" />
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

          {compressNote && <p className="text-xs text-amber-600">{compressNote}</p>}
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
