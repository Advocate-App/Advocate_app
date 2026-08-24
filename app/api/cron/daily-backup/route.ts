import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateYearSpreadsheet, addDailyBackupTab, type BackupCaseRow } from '@/lib/googleSheetsBackup'
import { fetchAllRows } from '@/lib/fetchAll'

// Which Google account owns the yearly backup workbook. Chosen by Avi.
const BACKUP_ACCOUNT: 'avi' | 'ratnesh' = 'ratnesh'

function todayIST(): { tabTitle: string; year: number } {
  // IST = UTC+5:30
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return { tabTitle: `${y}-${m}-${d}`, year: y }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const authHeader = request.headers.get('authorization') ||
    (searchParams.get('key') ? `Bearer ${searchParams.get('key')}` : null)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const cases = await fetchAllRows<BackupCaseRow>((from, to) =>
      supabase
        .from('cases')
        .select(`
          court_name, city, case_number, case_year, party_plaintiff, party_defendant,
          client_name, case_stage, status, is_company_case, payment_received,
          documents_received, bills_generated, order_passed, order_sent_to_company, appeal_filed
        `)
        .order('party_plaintiff', { ascending: true })
        .range(from, to)
    )

    const { tabTitle, year } = todayIST()
    const spreadsheetId = await getOrCreateYearSpreadsheet(BACKUP_ACCOUNT, year)
    const result = await addDailyBackupTab(BACKUP_ACCOUNT, spreadsheetId, tabTitle, cases)

    return NextResponse.json({
      success: true,
      account: BACKUP_ACCOUNT,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      tab: result.sheetTitle,
      created: result.created,
      caseCount: cases.length,
      message: result.created
        ? `Backed up ${cases.length} cases to tab "${result.sheetTitle}"`
        : `Tab "${result.sheetTitle}" already existed — skipped (cron probably ran twice today)`,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
