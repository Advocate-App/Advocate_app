import { NextResponse } from 'next/server'
import { saveRefreshToken } from '@/lib/gmail'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = (searchParams.get('state') || 'ratnesh') as 'avi' | 'ratnesh'

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
      redirect_uri: 'https://advocate-diary-hub.vercel.app/auth/google/callback',
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenResponse.json()

  if (tokens.error) {
    return new NextResponse(
      `<html>
        <body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:20px">
          <h2 style="color:#991b1b">Authorization Failed</h2>
          <p style="color:#991b1b">${tokens.error}: ${tokens.error_description}</p>
          <p><a href="/diary/empanelment/gmail" style="color:#1e3a5f">Back to Gmail Settings</a></p>
        </body>
      </html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const accountLabel = state === 'avi' ? 'Avi (jainavi.aj@gmail.com)' : 'Ratnesh (ratneshshah67@gmail.com)'
  let savedToDb = false
  let saveError = ''

  if (tokens.refresh_token) {
    try {
      await saveRefreshToken(state, tokens.refresh_token)
      savedToDb = true
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Unknown error saving token'
    }
  }

  return new NextResponse(
    `<html>
      <body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:20px">
        <h2 style="color:#1e3a5f">Gmail Authorized — ${accountLabel}</h2>
        ${savedToDb
          ? `<p style="color:green;font-weight:bold">✓ Refresh token saved to database automatically. Emails will now work.</p>`
          : tokens.refresh_token
            ? `<p style="color:orange">Token received but could not save to DB: ${saveError}</p>
               <p>Copy this token manually:</p>
               <div style="background:#f5f5f5;padding:16px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:13px;margin:16px 0">${tokens.refresh_token}</div>`
            : `<p style="color:red">No refresh token received. Try again — the re-auth button uses prompt=consent which forces a new token.</p>`
        }
        <a href="/diary/empanelment/gmail" style="display:inline-block;margin-top:16px;color:#1e3a5f;font-weight:bold">← Back to Gmail Settings</a>
      </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
