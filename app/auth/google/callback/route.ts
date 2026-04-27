import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state') || 'ratnesh'

  if (error || !code) {
    return NextResponse.json(
      { error: error || 'No authorization code received' },
      { status: 400 }
    )
  }

  const clientId = state === 'avi'
    ? process.env.GOOGLE_CLIENT_ID_AVI!
    : process.env.GOOGLE_CLIENT_ID_RATNESH!

  const clientSecret = state === 'avi'
    ? process.env.GOOGLE_CLIENT_SECRET_AVI!
    : process.env.GOOGLE_CLIENT_SECRET_RATNESH!

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `https://advocate-diary-hub.vercel.app/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenResponse.json()

  if (tokens.error) {
    return NextResponse.json(
      { error: tokens.error, description: tokens.error_description },
      { status: 400 }
    )
  }

  const accountLabel = state === 'avi' ? 'Avi (jainavi.aj@gmail.com)' : 'Ratnesh (ratneshshah67@gmail.com)'

  return new NextResponse(
    `<html>
      <body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:20px">
        <h2 style="color:#1e3a5f">Gmail Authorized - ${accountLabel}</h2>
        <p style="color:green;font-weight:bold">Success! Copy the refresh token below and share it with Claude Code.</p>
        <div style="background:#f5f5f5;padding:16px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:13px;margin:16px 0">
          ${tokens.refresh_token || 'No refresh token received - try again with prompt=consent'}
        </div>
        <p style="color:#666;font-size:13px">This token does not expire. It lets the app send emails from your Gmail account.</p>
      </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
