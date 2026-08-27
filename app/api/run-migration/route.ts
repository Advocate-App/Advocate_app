import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

const MIGRATION_SQL = `
-- Migration 014: let any authenticated advocate read the advocates table
DROP POLICY IF EXISTS "advocates_self" ON advocates;
DROP POLICY IF EXISTS "advocates_read_all" ON advocates;
DROP POLICY IF EXISTS "advocates_insert_own" ON advocates;
DROP POLICY IF EXISTS "advocates_update_own" ON advocates;
DROP POLICY IF EXISTS "advocates_delete_own" ON advocates;

CREATE POLICY "advocates_read_all" ON advocates
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "advocates_insert_own" ON advocates
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "advocates_update_own" ON advocates
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "advocates_delete_own" ON advocates
  FOR DELETE USING (user_id = auth.uid());
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
    return NextResponse.json({ ok: true, message: 'Migration 014 applied successfully' })
  } catch (err: unknown) {
    await client.end().catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
