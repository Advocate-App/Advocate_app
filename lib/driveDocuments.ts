/**
 * Uploads case documents to Google Drive — the app's own free-tier
 * Supabase Storage is only ever meant to hold a file for a few hours
 * right after upload (so the upload itself stays fast), then the
 * migrate-docs-to-drive cron moves it into Ratnesh's paid 2TB Drive and
 * deletes the Supabase copy. See app/api/cron/migrate-docs-to-drive.
 *
 * Uses the same OAuth connection as Gmail/Sheets backups (see
 * lib/gmail.ts, getAccessToken) — the `drive.file` scope already
 * granted at /api/gmail/authorize is enough for creating and reading
 * back files this app creates.
 */
import { getAccessToken } from '@/lib/gmail'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files'
const ROOT_FOLDER_NAME = 'Advocate Hub - Case Documents'

async function driveFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Drive API ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

/** Finds a folder by name+parent, or creates it. */
async function getOrCreateFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false${parentClause}`
  const found = await driveFetch(accessToken, `/files?q=${encodeURIComponent(q)}&fields=files(id,name)`)
  if (found.files && found.files.length > 0) return found.files[0].id

  const created = await driveFetch(accessToken, '/files?fields=id', {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  })
  return created.id
}

/** Root "Advocate Hub - Case Documents" / <case title> folder, filed under
 *  the given account's own Drive. Cached per case within a single cron
 *  run isn't done here — callers should reuse the returned id across
 *  documents for the same case in one batch to save API calls. */
export async function getOrCreateCaseFolder(
  account: 'avi' | 'ratnesh',
  caseTitle: string
): Promise<{ accessToken: string; folderId: string }> {
  const accessToken = await getAccessToken(account)
  const rootId = await getOrCreateFolder(accessToken, ROOT_FOLDER_NAME)
  const caseFolderId = await getOrCreateFolder(accessToken, caseTitle.slice(0, 120) || 'Untitled Case', rootId)
  return { accessToken, folderId: caseFolderId }
}

/** Uploads raw file bytes into the given Drive folder via a multipart
 *  request (metadata + content in one call) — fine for the <=50MB PDFs
 *  this app deals with; no need for the resumable-upload dance. */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBytes: Buffer
): Promise<{ id: string; webViewLink: string }> {
  const boundary = `advocatehub-${Math.random().toString(36).slice(2)}`
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] })
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
    'utf-8'
  )
  const tail = Buffer.from(`\r\n--${boundary}--`, 'utf-8')
  const body = Buffer.concat([head, fileBytes, tail])

  const res = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Drive upload failed (${res.status}): ${text}`)
  }
  return res.json()
}
