import { NextResponse } from 'next/server'

function getCredentials(account: 'ratnesh' | 'avi') {
  if (account === 'avi') {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID_AVI || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_AVI || '',
      refreshToken: process.env.GOOGLE_AVI_REFRESH_TOKEN || '',
    }
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID_RATNESH || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET_RATNESH || '',
    refreshToken: process.env.GOOGLE_RATNESH_REFRESH_TOKEN || '',
  }
}

function encodeSubject(subject: string): string {
  // RFC 2047 encoding for non-ASCII characters in email headers
  const encoded = Buffer.from(subject, 'utf-8').toString('base64')
  return `=?UTF-8?B?${encoded}?=`
}

function buildMimeMessage(to: string, subject: string, body: string): string {
  const mimeLines = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf-8').toString('base64'),
  ]
  const raw = mimeLines.join('\r\n')
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function POST(request: Request) {
  try {
    const { to, subject, body, account = 'ratnesh' } = await request.json()

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, body' },
        { status: 400 }
      )
    }

    if (account !== 'ratnesh' && account !== 'avi') {
      return NextResponse.json(
        { error: 'Invalid account. Use "ratnesh" or "avi".' },
        { status: 400 }
      )
    }

    const creds = getCredentials(account)

    if (!creds.refreshToken) {
      return NextResponse.json(
        {
          error: `Gmail not authorized yet. Visit /api/gmail/authorize?account=${account} to authorize.`,
        },
        { status: 401 }
      )
    }

    // Exchange refresh token for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('Token exchange failed:', errText)
      return NextResponse.json(
        { error: 'Failed to obtain Gmail access token. Re-authorize at /api/gmail/authorize?account=' + account },
        { status: 401 }
      )
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    // Build MIME message
    const rawMessage = buildMimeMessage(to, subject, body)

    // Send via Gmail API
    const sendRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: rawMessage }),
      }
    )

    if (!sendRes.ok) {
      const errText = await sendRes.text()
      console.error('Gmail send failed:', errText)
      return NextResponse.json(
        { error: 'Failed to send email via Gmail' },
        { status: 500 }
      )
    }

    const sendData = await sendRes.json()

    return NextResponse.json({
      success: true,
      messageId: sendData.id,
      threadId: sendData.threadId,
    })
  } catch (err) {
    console.error('Gmail send error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
