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
 *  - PDFs: losslessly re-saved through pdf-lib, which removes duplicate
 *    objects and compresses the internal structure. This never touches the
 *    embedded images/text, so there is zero visual difference — the trade-off
 *    is the size reduction is modest (typically 10-30%) compared to what's
 *    possible on the image side.
 *
 * If compression ever produces a *larger* file than the original, or fails
 * for any reason, the original file is returned untouched.
 */
import { PDFDocument } from 'pdf-lib'

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

async function compressPdfFile(file: File): Promise<File> {
  const bytes = await file.arrayBuffer()
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const saved = await pdf.save({ useObjectStreams: true })
  return new File([new Uint8Array(saved)], file.name, { type: 'application/pdf', lastModified: Date.now() })
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
