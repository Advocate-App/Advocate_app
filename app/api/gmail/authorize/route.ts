import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const account = searchParams.get('account') || 'ratnesh'

  const clientId = account === 'avi'
    ? process.env.GOOGLE_CLIENT_ID_AVI!
    : process.env.GOOGLE_CLIENT_ID_RATNESH!

  const redirectUri = `${process.env.APP_URL}/auth/google/callback`

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

  return NextResponse.redirect(authUrl)
}
