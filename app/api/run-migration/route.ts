import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

const MIGRATION_SQL = `
-- Migration 013: OTP confirmation before permanently deleting a case
CREATE TABLE IF NOT EXISTS case_delete_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_delete_otps_case ON case_delete_otps(case_id);

ALTER TABLE case_delete_otps ENABLE ROW LEVEL SECURITY;
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
    return NextResponse.json({ ok: true, message: 'Migration 013 applied successfully' })
  } catch (err: unknown) {
    await client.end().catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
