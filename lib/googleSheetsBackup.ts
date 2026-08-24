/**
 * Daily case-list backup — one Google Sheets spreadsheet per year, with a
 * new tab added every day holding a full snapshot of the case list.
 *
 * Uses the same OAuth connection as Gmail (see lib/gmail.ts, getAccessToken),
 * just with the extra `spreadsheets` + `drive.file` scopes granted at
 * /api/gmail/authorize. Nothing here works until that re-authorization has
 * happened for the chosen account.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessToken } from '@/lib/gmail'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const ROOT_FOLDER_NAME = 'Advocate Hub Backups'

export interface BackupCaseRow {
  court_name: string | null
  city: string | null
  case_number: string | null
  case_year: number | null
  party_plaintiff: string
  party_defendant: string
  client_name: string | null
  case_stage: string | null
  status: string
  is_company_case: boolean
  payment_received: boolean
  documents_received: boolean
  bills_generated: boolean
  order_passed: boolean
  order_sent_to_company: boolean
  appeal_filed: boolean
}

async function sheetsFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${SHEETS_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets API ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

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

/** Finds a folder by name+parent, or creates it. Keeps everything the app
 *  makes inside one tidy tree instead of scattering files at Drive's root. */
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

/** Finds (or creates) this year's backup spreadsheet for the given account,
 *  filed under "Advocate Hub Backups / <year> /" in that account's Drive. */
export async function getOrCreateYearSpreadsheet(
  account: 'avi' | 'ratnesh',
  year: number
): Promise<string> {
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('backup_sheets')
    .select('spreadsheet_id')
    .eq('year', year)
    .eq('account', account)
    .maybeSingle()

  if (existing?.spreadsheet_id) return existing.spreadsheet_id

  const accessToken = await getAccessToken(account)

  const rootFolderId = await getOrCreateFolder(accessToken, ROOT_FOLDER_NAME)
  const yearFolderId = await getOrCreateFolder(accessToken, String(year), rootFolderId)

  // Create the spreadsheet directly inside the year folder (Drive API, not
  // the Sheets API — Sheets' own create endpoint can't set a parent folder).
  const created = await driveFetch(accessToken, '/files?fields=id', {
    method: 'POST',
    body: JSON.stringify({
      name: `Advocate Hub Case Backup ${year}`,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [yearFolderId],
    }),
  })
  const spreadsheetId = created.id as string

  // Cosmetic: rename the default first tab
  try {
    const meta = await sheetsFetch(accessToken, `/${spreadsheetId}?fields=sheets.properties`)
    const firstSheetId = meta.sheets?.[0]?.properties?.sheetId
    if (firstSheetId !== undefined) {
      await sheetsFetch(accessToken, `/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          requests: [{ updateSheetProperties: { properties: { sheetId: firstSheetId, title: 'Read Me' }, fields: 'title' } }],
        }),
      })
    }
  } catch {
    // non-fatal — cosmetic only
  }

  await supabase.from('backup_sheets').insert({
    year,
    account,
    spreadsheet_id: spreadsheetId,
  })

  return spreadsheetId
}

/**
 * Adds today's snapshot as a new tab. If a tab for today already exists
 * (e.g. the cron ran twice), it's left untouched and reported as skipped.
 */
export async function addDailyBackupTab(
  account: 'avi' | 'ratnesh',
  spreadsheetId: string,
  tabTitle: string,
  rows: BackupCaseRow[]
): Promise<{ created: boolean; sheetTitle: string }> {
  const accessToken = await getAccessToken(account)

  const meta = await sheetsFetch(accessToken, `/${spreadsheetId}?fields=sheets.properties.title`)
  const existingTitles: string[] = (meta.sheets || []).map(
    (s: { properties: { title: string } }) => s.properties.title
  )
  if (existingTitles.includes(tabTitle)) {
    return { created: false, sheetTitle: tabTitle }
  }

  await sheetsFetch(accessToken, `/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tabTitle } } }],
    }),
  })

  const header = [
    'Court', 'City', 'Case No.', 'Year', 'Plaintiff', 'Defendant', 'Client',
    'Stage', 'Status', 'Company Case', 'Payment Received', 'Documents Received',
    'Bills Generated', 'Order Passed', 'Order Sent to Company', 'Appeal Filed',
  ]
  const values = [
    header,
    ...rows.map((r) => [
      r.court_name || '', r.city || '', r.case_number || '', r.case_year ?? '',
      r.party_plaintiff, r.party_defendant, r.client_name || '', r.case_stage || '',
      r.status, r.is_company_case ? 'Yes' : 'No', r.payment_received ? 'Yes' : 'No',
      r.documents_received ? 'Yes' : 'No', r.bills_generated ? 'Yes' : 'No',
      r.order_passed ? 'Yes' : 'No', r.order_sent_to_company ? 'Yes' : 'No',
      r.appeal_filed ? 'Yes' : 'No',
    ]),
  ]

  await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(`'${tabTitle}'!A1`)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values }) }
  )

  return { created: true, sheetTitle: tabTitle }
}
