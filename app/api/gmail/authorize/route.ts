import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const account = searchParams.get('account') || 'ratnesh'

  const clientId = account === 'avi'
    ? process.env.GOOGLE_CLIENT_ID_AVI
    : process.env.GOOGLE_CLIENT_ID_RATNESH

  if (!clientId) {
    return NextResponse.json({ error: `No client ID found for account: ${account}`, env_keys: Object.keys(process.env).filter(k => k.includes('GOOGLE')) })
  }

  const redirectUri = `https://advocate-diary-hub.vercel.app/auth/google/callback`

  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ].join(' ')

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${account}`

  // Show the URL instead of redirecting, so we can debug
  return new NextResponse(
    `<html><body style="font-family:system-ui;max-width:700px;margin:40px auto;padding:20px">
      <h2>Gmail Authorization — ${account}</h2>
      <p>Click the link below to authorize:</p>
      <p><a href="${authUrl}" style="color:#1e3a5f;font-weight:bold;word-break:break-all">${authUrl}</a></p>
      <hr style="margin:20px 0"/>
      <p style="font-size:12px;color:#888">Client ID: ${clientId.substring(0, 20)}...</p>
      <p style="font-size:12px;color:#888">Redirect URI: ${redirectUri}</p>
      <p style="font-size:12px;color:#888">If you get Error 400 from Google, check that this exact Redirect URI is registered in your Google Cloud Console → Credentials → OAuth Client.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
