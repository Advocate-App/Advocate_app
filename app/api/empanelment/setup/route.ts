import { NextResponse } from 'next/server'
import { Client } from 'pg'

// Idempotent — safe to call on every page load
const SQL = `
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

  CREATE TABLE IF NOT EXISTS application_emails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
    email_type      TEXT,
    from_email      TEXT NOT NULL,
    to_email        TEXT NOT NULL,
    subject         TEXT NOT NULL DEFAULT '',
    body            TEXT NOT NULL DEFAULT '',
    gmail_message_id TEXT,
    gmail_thread_id  TEXT,
    sent_at         TIMESTAMPTZ DEFAULT now(),
    comment         TEXT DEFAULT ''
  );

  ALTER TABLE application_emails ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT '';

  ALTER TABLE application_emails ENABLE ROW LEVEL SECURITY;

  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'application_emails' AND policyname = 'application_emails_own'
    ) THEN
      CREATE POLICY "application_emails_own" ON application_emails
        FOR ALL
        USING (
          application_id IN (
            SELECT a.id FROM applications a
            JOIN advocates adv ON adv.id = a.advocate_id
            WHERE adv.user_id = auth.uid()
          )
        )
        WITH CHECK (
          application_id IN (
            SELECT a.id FROM applications a
            JOIN advocates adv ON adv.id = a.advocate_id
            WHERE adv.user_id = auth.uid()
          )
        );
    END IF;
  END $$;
`

export async function POST() {
  const ref = 'iukpuouiutxoworbdfuo'
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  const dbUrl =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    (process.env.POSTGRES_PASSWORD
      ? `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@db.${ref}.supabase.co:5432/postgres`
      : `postgresql://postgres.${ref}:${svcKey}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`)

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    await client.query(SQL)
    await client.end()
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.end().catch(() => {})
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
