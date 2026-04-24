import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessToken, replyGmail, markAsUnread } from '@/lib/gmail'

interface GmailMessage { id: string; threadId: string }
interface GmailHeader { name: string; value: string }
interface GmailMessageFull {
  id: string
  threadId: string
  snippet: string
  payload: {
    headers: GmailHeader[]
    body?: { data?: string }
    parts?: Array<{ body?: { data?: string }; mimeType?: string; parts?: Array<{ body?: { data?: string }; mimeType?: string }> }>
  }
}

function extractSenderEmail(headers: GmailHeader[]): string | null {
  const from = headers.find(h => h.name.toLowerCase() === 'from')
  if (!from) return null
  const match = from.value.match(/<([^>]+)>/)
  if (match) return match[1].toLowerCase()
  if (from.value.includes('@')) return from.value.trim().toLowerCase()
  return null
}

function getHeader(headers: GmailHeader[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

function getMessageBody(message: GmailMessageFull): string {
  function extractFromParts(parts: GmailMessageFull['payload']['parts']): string {
    if (!parts) return ''
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
      if (part.parts) {
        const nested = extractFromParts(part.parts)
        if (nested) return nested
      }
    }
    return ''
  }
  if (message.payload.parts) {
    const text = extractFromParts(message.payload.parts)
    if (text) return text
  }
  if (message.payload.body?.data) {
    return Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
  }
  return message.snippet || ''
}

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const lower = text.toLowerCase()
  const pos = ['empanel', 'approved', 'selected', 'welcome', 'pleased to inform', 'congratulat', 'shortlisted', 'panel approved']
  const neg = ['regret', 'unable', 'reject', 'sorry', 'not possible', 'declined', 'cannot', 'do not require', 'not empanelling']
  if (pos.some(k => lower.includes(k)) && !neg.some(k => lower.includes(k))) return 'positive'
  if (neg.some(k => lower.includes(k)) && !pos.some(k => lower.includes(k))) return 'negative'
  return 'neutral'
}

async function processAccount(
  account: 'avi' | 'ratnesh',
  accountEmail: string,
  emailToOrg: Map<string, { id: string; name: string }>,
  supabase: ReturnType<typeof createAdminClient>,
  advRecord: { id: string; full_name: string; bci_enrollment: string | null; chamber_address: string | null; phone: string | null }
): Promise<{ processed: number; matched: string[]; errors: string[] }> {
  const processed = { processed: 0, matched: [] as string[], errors: [] as string[] }

  let accessToken: string
  try {
    accessToken = await getAccessToken(account)
  } catch (err) {
    processed.errors.push(`Failed to get ${account} access token: ${String(err)}`)
    return processed
  }

  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread in:inbox')}&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!searchRes.ok) {
    processed.errors.push(`Gmail search failed for ${account}: ${await searchRes.text()}`)
    return processed
  }

  const messages: GmailMessage[] = (await searchRes.json()).messages || []

  for (const msg of messages) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!msgRes.ok) continue

    const fullMsg: GmailMessageFull = await msgRes.json()
    const senderEmail = extractSenderEmail(fullMsg.payload.headers)

    if (!senderEmail) {
      await markAsUnread(account, msg.id, accessToken)
      continue
    }

    const matchedOrg = emailToOrg.get(senderEmail)
    if (!matchedOrg) {
      await markAsUnread(account, msg.id, accessToken)
      continue
    }

    // Reply from a target organization — process it
    const bodyText = getMessageBody(fullMsg)
    const snippet = fullMsg.snippet || bodyText.substring(0, 300)
    const sentiment = analyzeSentiment(bodyText || snippet)
    const replySubject = getHeader(fullMsg.payload.headers, 'subject') || 'Re: Empanelment Application'
    const gmailMsgId = getHeader(fullMsg.payload.headers, 'message-id')
    const receivedAt = new Date().toISOString()

    // Find application for this org + advocate
    const { data: app } = await supabase
      .from('applications')
      .select('id, status')
      .eq('organization_id', matchedOrg.id)
      .eq('advocate_id', advRecord.id)
      .in('status', ['sent', 'followup_1_sent', 'followup_2_sent', 'under_review'])
      .maybeSingle()

    if (!app) {
      await markAsUnread(account, msg.id, accessToken)
      continue
    }

    // Update application status
    await supabase.from('applications').update({
      response_received_at: receivedAt,
      response_summary: snippet.substring(0, 500),
      response_sentiment: sentiment,
      status: 'under_review',
      updated_at: receivedAt,
    }).eq('id', app.id)

    await supabase.from('application_status_history').insert({
      application_id: app.id, status: 'under_review',
    })

    // Log the received email in thread
    await supabase.from('application_emails').insert({
      application_id: app.id,
      direction: 'received',
      email_type: 'reply',
      from_email: senderEmail,
      to_email: accountEmail,
      subject: replySubject,
      body: bodyText || snippet,
      gmail_message_id: msg.id,
      gmail_thread_id: msg.threadId,
      sent_at: receivedAt,
    })

    // Build acknowledgment using advocate's actual profile
    const enrollment = advRecord.bci_enrollment || (account === 'ratnesh' ? '418/1994' : 'R/7238/2025')
    const chamber = advRecord.chamber_address || 'Chamber No. 39, District Court, Udaipur'
    const phone = advRecord.phone ? `\nMobile: ${advRecord.phone}` : ''
    const ackBody = `Respected Sir/Madam,

Thank you for your response regarding the empanelment application. I have noted your reply and will follow up as needed.

Respectfully yours,
${advRecord.full_name}
Advocate, Bar Council of Rajasthan (${enrollment})
${chamber}
Email: ${accountEmail}${phone}`

    const ackResult = await replyGmail(account, senderEmail, replySubject, ackBody, msg.threadId, gmailMsgId)

    // Log the acknowledgment we sent
    if (!('error' in ackResult)) {
      await supabase.from('application_emails').insert({
        application_id: app.id,
        direction: 'sent',
        email_type: 'acknowledgment',
        from_email: accountEmail,
        to_email: senderEmail,
        subject: replySubject.startsWith('Re:') ? replySubject : `Re: ${replySubject}`,
        body: ackBody,
        gmail_thread_id: msg.threadId,
        sent_at: new Date().toISOString(),
      })
    }

    processed.matched.push(`${matchedOrg.name} (${sentiment})`)
    processed.processed++
    console.log(`Reply from ${matchedOrg.name} via ${account} — sentiment: ${sentiment}`)
  }

  return processed
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const authHeader = request.headers.get('authorization') || (searchParams.get('key') ? `Bearer ${searchParams.get('key')}` : null)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Get all target org emails
    const { data: orgs } = await supabase
      .from('target_organizations')
      .select('id, organization_name, contact_email')
      .not('contact_email', 'is', null)

    const emailToOrg = new Map<string, { id: string; name: string }>(
      (orgs || [])
        .filter(o => o.contact_email)
        .map(o => [o.contact_email!.toLowerCase(), { id: o.id, name: o.organization_name }])
    )

    // Get both advocates
    const { data: advocates } = await supabase
      .from('advocates')
      .select('id, full_name, email, phone, bci_enrollment, chamber_address')
      .in('email', ['jainavi.aj@gmail.com', 'ratneshshah67@gmail.com'])

    let totalProcessed = 0
    const allMatched: string[] = []
    const allErrors: string[] = []

    for (const adv of advocates || []) {
      const account: 'avi' | 'ratnesh' = adv.email === 'ratneshshah67@gmail.com' ? 'ratnesh' : 'avi'
      const result = await processAccount(account, adv.email, emailToOrg, supabase, adv as Parameters<typeof processAccount>[4])
      totalProcessed += result.processed
      allMatched.push(...result.matched)
      allErrors.push(...result.errors)
    }

    return NextResponse.json({
      success: true,
      repliesProcessed: totalProcessed,
      matched: allMatched.length > 0 ? allMatched : undefined,
      errors: allErrors.length > 0 ? allErrors : undefined,
    })
  } catch (err) {
    console.error('check-replies error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
