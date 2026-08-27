import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateCaseFolder, uploadFileToDrive } from '@/lib/driveDocuments'

// Which Google account's Drive holds case documents — Ratnesh's (Avi's
// father) paid 2TB plan, not Avi's own account.
const DRIVE_ACCOUNT: 'avi' | 'ratnesh' = 'ratnesh'

// Documents sit in Supabase Storage for a few hours after upload (so the
// upload itself stays fast and doesn't wait on Drive) before this cron
// moves them into Drive and clears them out of the free-tier bucket.
const MIN_AGE_HOURS = 3
const BATCH_SIZE = 15

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const authHeader = request.headers.get('authorization') ||
    (searchParams.get('key') ? `Bearer ${searchParams.get('key')}` : null)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000).toISOString()

  const { data: rows, error: fetchErr } = await supabase
    .from('case_documents')
    .select('id, case_id, file_name, storage_path, mime_type, uploaded_at')
    .eq('source', 'upload')
    .not('storage_path', 'is', null)
    .lte('uploaded_at', cutoff)
    .order('uploaded_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ success: true, migrated: 0, message: 'Nothing to migrate' })
  }

  // One Drive folder lookup per case, reused across that case's documents
  // in this batch, instead of one lookup per file.
  const folderCache = new Map<string, { accessToken: string; folderId: string }>()

  let migrated = 0
  const errors: string[] = []

  for (const row of rows) {
    try {
      if (!row.storage_path) continue

      let folder = folderCache.get(row.case_id)
      if (!folder) {
        const { data: caseRow } = await supabase
          .from('cases')
          .select('full_title, party_plaintiff, party_defendant')
          .eq('id', row.case_id)
          .maybeSingle()
        const title = caseRow?.full_title || `${caseRow?.party_plaintiff || 'Case'} vs ${caseRow?.party_defendant || ''}`.trim()
        folder = await getOrCreateCaseFolder(DRIVE_ACCOUNT, title)
        folderCache.set(row.case_id, folder)
      }

      const { data: fileBlob, error: downloadErr } = await supabase.storage
        .from('case-documents')
        .download(row.storage_path)
      if (downloadErr || !fileBlob) {
        errors.push(`${row.file_name}: download failed — ${downloadErr?.message || 'no data'}`)
        continue
      }
      const fileBytes = Buffer.from(await fileBlob.arrayBuffer())

      const uploaded = await uploadFileToDrive(
        folder.accessToken,
        folder.folderId,
        row.file_name,
        row.mime_type || 'application/octet-stream',
        fileBytes
      )

      // Point the app at the new Drive copy BEFORE deleting the Supabase
      // copy — if this update fails, the old copy is untouched and this
      // row just gets retried on the next run instead of losing the file.
      const { error: updateErr } = await supabase
        .from('case_documents')
        .update({
          source: 'drive_link',
          external_url: uploaded.webViewLink,
          storage_path: null,
        })
        .eq('id', row.id)
      if (updateErr) {
        errors.push(`${row.file_name}: DB update failed after Drive upload — ${updateErr.message}`)
        continue
      }

      await supabase.storage.from('case-documents').remove([row.storage_path])
      migrated++
    } catch (e) {
      errors.push(`${row.file_name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    migrated,
    remaining_in_batch_failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}
