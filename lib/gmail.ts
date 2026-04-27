/**
 * Gmail helper — sends/reads email for Avi and Ratnesh.
 * Refresh tokens are stored in the gmail_tokens Supabase table (primary source).
 * Falls back to env vars if no DB row exists.
 * Access tokens are cached in the DB (1-hour expiry) to minimize token exchanges.
 */

import { createAdminClient } from '@/lib/supabase/admin'

interface GmailCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
  fromEmail: string
  fromName: string
}

function getEnvCredentials(account: 'avi' | 'ratnesh'): Omit<GmailCredentials, 'refreshToken'> & { envRefreshToken: string } {
  if (account === 'avi') {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID_AVI || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_AVI || '',
      envRefreshToken: process.env.GOOGLE_REFRESH_TOKEN_AVI || process.env.GOOGLE_AVI_REFRESH_TOKEN || '',
      fromEmail: 'jainavi.aj@gmail.com',
      fromName: 'Avi Jain',
    }
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID_RATNESH || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET_RATNESH || '',
    envRefreshToken: process.env.GOOGLE_RATNESH_REFRESH_TOKEN || '',
    fromEmail: 'ratneshshah67@gmail.com',
    fromName: 'Ratnesh Kumar Jain Shah',
  }
}

/** RFC 2047 Base64-encode a header value if it contains non-ASCII characters. */
function encodeSubjectHeader(subject: string): string {
  if (/[^\x00-\x7F]/.test(subject)) {
    const base64 = Buffer.from(subject, 'utf-8').toString('base64')
    return `=?UTF-8?B?${base64}?=`
  }
  return subject
}

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
 * Get a valid access token for the given account.
 * Checks DB cache first, then refreshes if expired, then falls back to env refresh token.
 */
export async function getAccessToken(account: 'avi' | 'ratnesh'): Promise<string> {
  const env = getEnvCredentials(account)
  const supabase = createAdminClient()

  // Try DB for cached access token + refresh token + client credentials
  const { data: row } = await supabase
    .from('gmail_tokens')
    .select('refresh_token, access_token, access_token_expires_at, client_id, client_secret')
    .eq('account', account)
    .maybeSingle()

  // Use cached access token if still valid (5-min buffer)
  if (row?.access_token && row.access_token_expires_at) {
    const expiresAt = new Date(row.access_token_expires_at).getTime()
    if (expiresAt - Date.now() > 5 * 60 * 1000) {
      return row.access_token
    }
  }

  // Use DB refresh token if available, otherwise env var
  const refreshToken = row?.refresh_token || env.envRefreshToken
  if (!refreshToken) {
    throw new Error(`No refresh token found for ${account}. Re-authorize Gmail at /diary/empanelment/gmail`)
  }

  // Use DB client credentials if stored, otherwise fall back to env vars
  const clientId = row?.client_id || env.clientId
  const clientSecret = row?.client_secret || env.clientSecret

  // Exchange refresh token for a new access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Token exchange failed for ${account}: ${errText}`)
  }

  const data = await res.json()

  if (data.error) {
    throw new Error(`Token exchange error for ${account}: ${data.error} — ${data.error_description}. Re-authorize at /diary/empanelment/gmail`)
  }

  const accessToken = data.access_token as string
  const expiresIn = (data.expires_in as number) || 3600
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Cache the new access token in DB
  await supabase.from('gmail_tokens').upsert({
    account,
    refresh_token: refreshToken,
    access_token: accessToken,
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account' })

  return accessToken
}

/**
 * Save a new refresh token to the DB (called after re-auth).
 */
export async function saveRefreshToken(account: 'avi' | 'ratnesh', refreshToken: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('gmail_tokens').upsert({
    account,
    refresh_token: refreshToken,
    access_token: null,
    access_token_expires_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account' })
}

/**
 * Check if a Gmail account is properly authorized.
 */
export async function checkGmailAuth(account: 'avi' | 'ratnesh'): Promise<{ ok: boolean; error?: string }> {
  try {
    await getAccessToken(account)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function sendGmail(
  account: 'avi' | 'ratnesh',
  to: string,
  subject: string,
  body: string,
  from?: string
): Promise<{ messageId: string } | { error: string }> {
  try {
    const env = getEnvCredentials(account)
    const accessToken = await getAccessToken(account)

    const fromHeader = from || `${env.fromName} <${env.fromEmail}>`
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

export async function replyGmail(
  account: 'avi' | 'ratnesh',
  to: string,
  subject: string,
  body: string,
  threadId: string,
  inReplyToMessageId: string
): Promise<{ messageId: string } | { error: string }> {
  try {
    const env = getEnvCredentials(account)
    const accessToken = await getAccessToken(account)

    const fromHeader = `${env.fromName} <${env.fromEmail}>`
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
