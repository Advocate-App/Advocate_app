/**
 * Shared Gmail helper functions for sending emails via the Gmail API.
 * Supports Avi's and Ratnesh's accounts.
 */

interface GmailCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
  fromEmail: string
  fromName: string
}

function getCredentials(account: 'avi' | 'ratnesh'): GmailCredentials {
  if (account === 'avi') {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID_AVI || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_AVI || '',
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN_AVI || process.env.GOOGLE_AVI_REFRESH_TOKEN || '',
      fromEmail: 'jainavi.aj@gmail.com',
      fromName: 'Avi Jain',
    }
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID_RATNESH || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET_RATNESH || '',
    refreshToken: process.env.GOOGLE_RATNESH_REFRESH_TOKEN || '',
    fromEmail: 'ratneshshah67@gmail.com',
    fromName: 'Ratnesh Kumar Jain Shah',
  }
}

/**
 * Exchange a refresh token for a fresh access token.
 */
export async function getAccessToken(account: 'avi' | 'ratnesh'): Promise<string> {
  const creds = getCredentials(account)

  if (!creds.refreshToken) {
    throw new Error(`No refresh token configured for account: ${account}`)
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Token exchange failed for ${account}: ${errText}`)
  }

  const data = await res.json()
  return data.access_token as string
}

/** RFC 2047 Base64-encode a header value if it contains non-ASCII characters. */
function encodeSubjectHeader(subject: string): string {
  if (/[^\x00-\x7F]/.test(subject)) {
    const base64 = Buffer.from(subject, 'utf-8').toString('base64')
    return `=?UTF-8?B?${base64}?=`
  }
  return subject
}

/**
 * Build a base64url-encoded MIME message.
 */
function buildMimeMessage(
  from: string,
  to: string,
  subject: string,
  body: string,
  extraHeaders?: Record<string, string>
): string {
  const mimeLines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubjectHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ]
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      mimeLines.push(`${key}: ${value}`)
    }
  }
  mimeLines.push('', body)
  const raw = mimeLines.join('\r\n')
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Send an email via the Gmail API.
 * Returns the Gmail messageId on success, or an error object.
 */
export async function sendGmail(
  account: 'avi' | 'ratnesh',
  to: string,
  subject: string,
  body: string,
  from?: string
): Promise<{ messageId: string } | { error: string }> {
  try {
    const creds = getCredentials(account)
    const accessToken = await getAccessToken(account)

    const fromHeader = from || `${creds.fromName} <${creds.fromEmail}>`
    const rawMessage = buildMimeMessage(fromHeader, to, subject, body)

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
      return { error: `Gmail send failed: ${errText}` }
    }

    const sendData = await sendRes.json()
    return { messageId: sendData.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Gmail error'
    console.error('sendGmail error:', message)
    return { error: message }
  }
}

/**
 * Send a reply in the same Gmail thread.
 */
export async function replyGmail(
  account: 'avi' | 'ratnesh',
  to: string,
  subject: string,
  body: string,
  threadId: string,
  inReplyToMessageId: string
): Promise<{ messageId: string } | { error: string }> {
  try {
    const creds = getCredentials(account)
    const accessToken = await getAccessToken(account)

    const fromHeader = `${creds.fromName} <${creds.fromEmail}>`
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`
    const rawMessage = buildMimeMessage(fromHeader, to, replySubject, body, {
      'In-Reply-To': inReplyToMessageId,
      References: inReplyToMessageId,
    })

    const sendRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: rawMessage, threadId }),
      }
    )

    if (!sendRes.ok) {
      const errText = await sendRes.text()
      console.error('Gmail reply failed:', errText)
      return { error: `Gmail reply failed: ${errText}` }
    }

    const sendData = await sendRes.json()
    return { messageId: sendData.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Gmail error'
    console.error('replyGmail error:', message)
    return { error: message }
  }
}

/**
 * Mark a Gmail message as unread.
 */
export async function markAsUnread(
  account: 'avi' | 'ratnesh',
  messageId: string,
  accessToken: string
): Promise<void> {
  await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
    }
  )
}
