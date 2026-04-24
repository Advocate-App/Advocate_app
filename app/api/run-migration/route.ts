import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

const MIGRATION_SQL = `
-- 1. Fix client_side constraint
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_client_side_check;
ALTER TABLE cases ADD CONSTRAINT cases_client_side_check
  CHECK (client_side IN (
    'plaintiff','defendant','both','intervenor',
    'petitioner','respondent','applicant','opposite_party',
    'appellant','caveator'
  ));

-- 2. Add city + client_id columns to cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_id UUID;

-- 3. Custom courts table
CREATE TABLE IF NOT EXISTS custom_courts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advocate_id UUID REFERENCES advocates(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  short_name  TEXT,
  city        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE custom_courts ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE custom_courts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "custom_courts_own" ON custom_courts;
CREATE POLICY "custom_courts_own" ON custom_courts
  FOR ALL
  USING (advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid()))
  WITH CHECK (advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid()));

-- 4. Clients table
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advocate_id UUID REFERENCES advocates(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  city        TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_own" ON clients;
CREATE POLICY "clients_own" ON clients
  FOR ALL
  USING (advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid()))
  WITH CHECK (advocate_id IN (SELECT id FROM advocates WHERE user_id = auth.uid()));

-- 5. Add FK from cases.client_id -> clients.id
DO $$ BEGIN
  ALTER TABLE cases ADD CONSTRAINT cases_client_id_fk
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-migration-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Try several env var patterns that Vercel/Supabase integration sets
  const dbUrl =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    (process.env.POSTGRES_PASSWORD
      ? `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@db.iukpuouiutxoworbdfuo.supabase.co:5432/postgres`
      : null)

  if (!dbUrl) {
    return NextResponse.json({
      error: 'No database URL found. Set POSTGRES_URL_NON_POOLING in Vercel environment variables.',
      hint: 'Go to Vercel → Project → Settings → Environment Variables and check for POSTGRES_URL_NON_POOLING',
    }, { status: 500 })
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    await client.query(MIGRATION_SQL)
    await client.end()
    return NextResponse.json({ ok: true, message: 'Migration 004 applied successfully' })
  } catch (err: unknown) {
    await client.end().catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
