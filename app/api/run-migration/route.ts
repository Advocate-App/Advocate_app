import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

const MIGRATION_SQL = `
-- Migration 015: cases/hearings readable+writable by any authenticated
-- advocate — "cases_own" only ever matched your own advocate_id, so a
-- junior (who owns zero cases themselves) saw exactly zero cases at the
-- database level no matter what the app asked for.
DROP POLICY IF EXISTS "cases_own" ON cases;
DROP POLICY IF EXISTS "cases_shared" ON cases;
CREATE POLICY "cases_shared" ON cases
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "hearings_own" ON hearings;
DROP POLICY IF EXISTS "hearings_shared" ON hearings;
CREATE POLICY "hearings_shared" ON hearings
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
`

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-migration-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let bodyUrl: string | null = null
  try {
    const body = await req.json()
    bodyUrl = body?.db_url || null
  } catch { /* no body */ }

  const ref = 'iukpuouiutxoworbdfuo'
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  // Try several connection string patterns
  const dbUrl =
    bodyUrl ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    (process.env.POSTGRES_PASSWORD
      ? `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@db.${ref}.supabase.co:5432/postgres`
      : null) ||
    // Try service role key as password (Supabase pooler session mode)
    `postgresql://postgres.${ref}:${svcKey}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`

  if (!dbUrl) {
    return NextResponse.json({ error: 'No database URL' }, { status: 500 })
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    await client.query(MIGRATION_SQL)
    await client.end()
    return NextResponse.json({ ok: true, message: 'Migration 015 applied successfully' })
  } catch (err: unknown) {
    await client.end().catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
