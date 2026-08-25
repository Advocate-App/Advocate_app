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
 *  - PDFs: two strategies, and whichever comes out smaller wins.
 *      1. A lossless structural re-save through pdf-lib (dedupes objects,
 *         compresses the internal structure). This never touches embedded
 *         images/text, so it's the safe fallback for born-digital PDFs
 *         (petitions, judgments) — but for a PHONE-SCANNED PDF, the file
 *         size is almost entirely the embedded photo of each page, and
 *         this pass barely touches that, so it does close to nothing.
 *      2. For scan-like PDFs (judged by average bytes per page — a real
 *         text page is tens of KB, a phone-camera page is hundreds of KB
 *         to a few MB), each page is rendered to a canvas at a generous
 *         160 DPI and re-saved as a JPEG, then rebuilt into a fresh PDF.
 *         160 DPI is well above what's needed to read or print a document
 *         clearly — this is the same technique tools like smallpdf use,
 *         and is where the real size reduction comes from for scans.
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

// A real text page is tens of KB; a phone-camera photo of a page is hundreds
// of KB to a few MB. Above this average, treat the PDF as scan-like and
// worth rasterizing — below it, leave the (selectable, searchable) text
// alone and only do the safe structural pass.
const SCAN_LIKE_BYTES_PER_PAGE = 300 * 1024
const PDF_PAGE_TARGET_DPI = 160 // comfortably sharp for reading/printing
const PDF_PAGE_JPEG_QUALITY = 0.82

async function structuralPdfResave(bytes: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return pdf.save({ useObjectStreams: true })
}

// Renders every page to a canvas and rebuilds the PDF from JPEG page images
// — this is what actually shrinks a scanned document, since pdf-lib alone
// only touches the PDF's container, not the giant photo inside each page.
// Also used to cheaply check the page count first (rendering only starts
// once we know the file is actually worth rasterizing).
async function rasterizePdf(bytes: ArrayBuffer, originalBytes: number): Promise<Uint8Array | null> {
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise
  if (doc.numPages === 0 || originalBytes / doc.numPages <= SCAN_LIKE_BYTES_PER_PAGE) return null

  const out = await PDFDocument.create()
  const scale = PDF_PAGE_TARGET_DPI / 72 // PDF points are 1/72 inch

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    await page.render({ canvasContext: ctx, viewport, canvas }).promise

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', PDF_PAGE_JPEG_QUALITY)
    )
    if (!blob) throw new Error('page rasterization failed')
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

async function compressPdfFile(file: File): Promise<File> {
  const originalBytes = file.size

  // Independent copies — pdf-lib/pdf.js can detach the buffer they're
  // handed, so each strategy needs its own untouched copy to read from.
  const structuralBytes = await file.arrayBuffer()
  const rasterBytes = await file.arrayBuffer()

  const structural = await structuralPdfResave(structuralBytes).catch(() => null)
  const rasterized = await rasterizePdf(rasterBytes, originalBytes).catch(() => null)

  let best: Uint8Array | null = structural
  if (rasterized && (!best || rasterized.length < best.length)) best = rasterized

  if (!best) throw new Error('all PDF compression strategies failed')
  return new File([new Uint8Array(best)], file.name, { type: 'application/pdf', lastModified: Date.now() })
}

export async function compressFile(file: File): Promise<CompressResult> {
  const originalBytes = file.size
  try {
    let out = file
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      out = await compressImageFile(file)
    } else if (file.type === 'application/pdf') {
      out = await compressPdfFile(file)
    }
    // Never ship something bigger than what the user gave us
    if (out.size >= originalBytes) out = file
    return { file: out, originalBytes, compressedBytes: out.size }
  } catch (err) {
    console.error('Compression failed, using original file:', err)
    return { file, originalBytes, compressedBytes: originalBytes }
  }
}
