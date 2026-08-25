/**
 * Client-side file compression, run in the browser before a document is
 * uploaded to a case. Two paths:
 *
 *  - Images (jpg/png): re-encoded through <canvas> at a high quality that's
 *    visually identical to the original but meaningfully smaller — the same
 *    idea WhatsApp/Google Photos use for "high quality" uploads. Oversized
 *    photos (much higher resolution than any screen or printout needs) are
 *    also downscaled to a sane cap.
 *
 *  - PDFs: every file — regardless of size — goes through both strategies
 *    below, and whichever result comes out smaller is used (never worse
 *    than just leaving the file alone).
 *      1. A lossless structural re-save through pdf-lib (dedupes objects,
 *         compresses the internal structure). This never touches embedded
 *         images/text, so it's the safe fallback for born-digital PDFs
 *         (petitions, judgments) — but for a PHONE-SCANNED PDF, the file
 *         size is almost entirely the embedded photo of each page, and
 *         this pass barely touches that, so it does close to nothing.
 *      2. Every page is rendered to a canvas at a generous 160 DPI and
 *         re-saved as a JPEG, then rebuilt into a fresh PDF. 160 DPI is
 *         well above what's needed to read or print a document clearly —
 *         this is the same technique tools like smallpdf use, and is
 *         where the real size reduction comes from for scans. For a
 *         text-only PDF this version usually comes out bigger, so the
 *         comparison above quietly discards it and keeps the structural
 *         (or original) result instead — text stays selectable/searchable.
 *
 * If compression ever produces a *larger* file than the original, or fails
 * for any reason, the original file is returned untouched.
 */
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
}

export interface CompressResult {
  file: File
  originalBytes: number
  compressedBytes: number
  // Set only when compression didn't run/failed and the original file was
  // used as-is — surfaced in the UI so a failure is never silent.
  note?: string
}

const MAX_IMAGE_DIMENSION = 2400 // px — plenty for reading/printing a document page
const IMAGE_QUALITY = 0.92 // visually lossless for scanned documents/photos

async function compressImageFile(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, width, height)

  const outType = file.type === 'image/png' && !fileLooksLikePhoto(bitmap) ? 'image/png' : 'image/jpeg'
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, outType, outType === 'image/jpeg' ? IMAGE_QUALITY : undefined)
  )
  if (!blob) return file

  const newName = outType === 'image/jpeg' ? file.name.replace(/\.(png|jpe?g)$/i, '.jpg') : file.name
  return new File([blob], newName, { type: outType, lastModified: Date.now() })
}

// Very small photos with few colors are more likely to be scanned line-art/
// screenshots where PNG (lossless) stays smaller than JPEG — otherwise
// prefer JPEG for its much better compression on photo-like content.
function fileLooksLikePhoto(bitmap: ImageBitmap): boolean {
  return bitmap.width * bitmap.height > 300 * 300
}

// 160 DPI / 0.82 quality was too conservative — real-world compressors
// (smallpdf's default tier included) land around 130 DPI / ~70% JPEG
// quality for a "still completely readable" document scan, and that's
// where the actual size win is. Phone scans are usually captured at
// 250-350+ DPI equivalent, so this is a big, legitimate drop in pixel
// count, not just a quality-slider tweak.
const PDF_PAGE_TARGET_DPI = 130
const PDF_PAGE_JPEG_QUALITY = 0.72

async function structuralPdfResave(bytes: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return pdf.save({ useObjectStreams: true })
}

// Renders every page to a canvas and rebuilds the PDF from JPEG page images
// — this is what actually shrinks a scanned document, since pdf-lib alone
// only touches the PDF's container, not the giant photo inside each page.
// Tried on every PDF regardless of size — a born-digital text PDF simply
// won't come out smaller this way and loses to the structural pass (or
// the original) in the comparison below, so there's no size cutoff here;
// every file gets an honest shot at compressing.
async function rasterizePdf(bytes: ArrayBuffer): Promise<Uint8Array | null> {
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise
  if (doc.numPages === 0) return null

  const out = await PDFDocument.create()
  const scale = PDF_PAGE_TARGET_DPI / 72 // PDF points are 1/72 inch

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    // Passing `canvas` (not `canvasContext`) is pdf.js's current
    // recommended form — mixing both isn't a supported combination.
    await page.render({ canvas, viewport }).promise

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', PDF_PAGE_JPEG_QUALITY)
    )
    if (!blob) throw new Error(`page ${i}: canvas.toBlob returned null`)
    const jpgBytes = new Uint8Array(await blob.arrayBuffer())

    const img = await out.embedJpg(jpgBytes)
    // Physical page size (in points) stays true to the original, at 72dpi —
    // only the embedded image's resolution/quality actually changed.
    const pageWidthPt = viewport.width / scale
    const pageHeightPt = viewport.height / scale
    const newPage = out.addPage([pageWidthPt, pageHeightPt])
    newPage.drawImage(img, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt })
  }

  return out.save()
}

async function compressPdfFile(file: File): Promise<{ bytes: Uint8Array; note?: string }> {
  // Independent copies — pdf-lib/pdf.js can detach the buffer they're
  // handed, so each strategy needs its own untouched copy to read from.
  const structuralBytes = await file.arrayBuffer()
  const rasterBytes = await file.arrayBuffer()

  let structuralErr: string | null = null
  let rasterErr: string | null = null

  const structural = await structuralPdfResave(structuralBytes).catch((e) => {
    structuralErr = e instanceof Error ? e.message : String(e)
    return null
  })
  const rasterized = await rasterizePdf(rasterBytes).catch((e) => {
    rasterErr = e instanceof Error ? e.message : String(e)
    return null
  })

  let best: Uint8Array | null = structural
  if (rasterized && (!best || rasterized.length < best.length)) best = rasterized

  if (!best) {
    throw new Error(
      `structural: ${structuralErr || 'skipped'}; rasterize: ${rasterErr || 'skipped'}`
    )
  }
  // Rasterizing failed outright but the structural pass still produced
  // something — worth explaining why this one didn't shrink as much.
  const note = rasterErr && !rasterized
    ? `page rendering failed (${rasterErr}), used the lighter structural pass instead`
    : undefined

  return { bytes: best, note }
}

export async function compressFile(file: File): Promise<CompressResult> {
  const originalBytes = file.size
  try {
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      const out = await compressImageFile(file)
      const final = out.size >= originalBytes ? file : out
      return { file: final, originalBytes, compressedBytes: final.size }
    }
    if (file.type === 'application/pdf') {
      const { bytes, note } = await compressPdfFile(file)
      const out = new File([new Uint8Array(bytes)], file.name, { type: 'application/pdf', lastModified: Date.now() })
      if (out.size >= originalBytes) return { file, originalBytes, compressedBytes: originalBytes, note }
      return { file: out, originalBytes, compressedBytes: out.size, note }
    }
    return { file, originalBytes, compressedBytes: originalBytes }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Compression failed, using original file:', err)
    return { file, originalBytes, compressedBytes: originalBytes, note: `compression failed (${message}), uploaded original file` }
  }
}
