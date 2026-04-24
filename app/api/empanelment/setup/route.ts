import { NextResponse } from 'next/server'
import { Client } from 'pg'

// Idempotent — safe to call multiple times
const SQL = `
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
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
