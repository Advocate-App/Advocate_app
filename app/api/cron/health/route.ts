import { NextResponse } from 'next/server'

export async function GET() {
  const checks = {
    CRON_SECRET: !!process.env.CRON_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    GOOGLE_CLIENT_ID_AVI: !!process.env.GOOGLE_CLIENT_ID_AVI,
    GOOGLE_CLIENT_SECRET_AVI: !!process.env.GOOGLE_CLIENT_SECRET_AVI,
    GOOGLE_AVI_REFRESH_TOKEN: !!(process.env.GOOGLE_AVI_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN_AVI),
    GOOGLE_CLIENT_ID_RATNESH: !!process.env.GOOGLE_CLIENT_ID_RATNESH,
    GOOGLE_CLIENT_SECRET_RATNESH: !!process.env.GOOGLE_CLIENT_SECRET_RATNESH,
    GOOGLE_RATNESH_REFRESH_TOKEN: !!process.env.GOOGLE_RATNESH_REFRESH_TOKEN,
  }

  const missing = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k)

  return NextResponse.json({
    ok: missing.length === 0,
    missing,
    present: Object.keys(checks).filter(k => checks[k as keyof typeof checks]),
  })
}
