import { NextResponse } from 'next/server'

// Vercel sets this automatically for every deployment — a cheap, always-
// fresh way for a client to check "is what I loaded still the live
// version?" without needing any build-time setup of our own.
export async function GET() {
  return NextResponse.json({
    sha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
