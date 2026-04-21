import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessToken, replyGmail, markAsUnread } from '@/lib/gmail'

interface GmailMessage {
  id: string
  threadId: string
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessageFull {
  id: string
  threadId: string
  snippet: string
  payload: {
    headers: GmailHeader[]
    body?: { data?: string }
    parts?: Array<{ body?: { data?: string }; mimeType?: string }>
  }
}

function extractSenderEmail(headers: GmailHeader[]): string | null {
  const fromHeader = headers.find((h) => h.name.toLowerCase() === 'from')
  if (!fromHeader) return null

  // Extract email from "Name <email@example.com>" or just "email@example.com"
  const emailMatch = fromHeader.value.match(/<([^>]+)>/)
  if (emailMatch) return emailMatch[1].toLowerCase()
  // If no angle brackets, the whole value might be the email
  if (fromHeader.value.includes('@')) return fromHeader.value.trim().toLowerCase()
  return null
}

function getMessageBody(message: GmailMessageFull): string {
  // Try to get plain text body
  if (message.payload.parts) {
    const textPart = message.payload.parts.find((p) => p.mimeType === 'text/plain')
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64').toString('utf-8')
    }
  }
  if (message.payload.body?.data) {
    return Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
  }
  // Fallback to snippet
  return message.snippet || ''
}

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const lower = text.toLowerCase()
  const positiveKeywords = ['empanel', 'approved', 'selected', 'welcome', 'pleased to inform', 'congratulat']
  const negativeKeywords = ['regret', 'unable', 'reject', 'sorry', 'not possible', 'declined', 'cannot']

  const hasPositive = positiveKeywords.some((kw) => lower.includes(kw))
  const hasNegative = negativeKeywords.some((kw) => lower.includes(kw))

  if (hasPositive && !hasNegative) return 'positive'
  if (hasNegative && !hasPositive) return 'negative'
  return 'neutral'
}

export async function GET(request: Request) {
  // Verify cron secret
  const { searchParams } = new URL(request.url)
  const authHeader = request.headers.get('authorization') || (searchParams.get('key') ? `Bearer ${searchParams.get('key')}` : null)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const accessToken = await getAccessToken('avi')

    // Get all target organization emails for matching
    const { data: orgs, error: orgsError } = await supabase
      .from('target_organizations')
      .select('id, organization_name, contact_email')
      .not('contact_email', 'is', null)

    if (orgsError || !orgs) {
      return NextResponse.json(
        { error: 'Failed to fetch organizations' },
        { status: 500 }
      )
    }

    // Build a map of email -> org for quick lookup
    const emailToOrg = new Map<string, { id: string; name: string }>(
      orgs
        .filter((o) => o.contact_email)
        .map((o) => [o.contact_email!.toLowerCase(), { id: o.id, name: o.organization_name }])
    )

    // Search Gmail for unread messages in inbox
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread in:inbox')}&maxResults=20`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!searchRes.ok) {
      const errText = await searchRes.text()
      console.error('Gmail search failed:', errText)
      return NextResponse.json(
        { error: 'Failed to search Gmail' },
        { status: 500 }
      )
    }

    const searchData = await searchRes.json()
    const messages: GmailMessage[] = searchData.messages || []

    if (messages.length === 0) {
      return NextResponse.json({
        success: true,
        repliesProcessed: 0,
        message: 'No unread messages',
      })
    }

    let repliesProcessed = 0
    const matched: string[] = []

    for (const msg of messages) {
      // Get the full message
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )

      if (!msgRes.ok) continue

      const fullMessage: GmailMessageFull = await msgRes.json()
      const senderEmail = extractSenderEmail(fullMessage.payload.headers)

      if (!senderEmail) {
        // Can't determine sender — restore unread so nothing is lost
        await markAsUnread('avi', msg.id, accessToken)
        continue
      }

      // Check if sender matches any target organization
      const matchedOrg = emailToOrg.get(senderEmail)
      if (!matchedOrg) {
        // Irrelevant email — mark back as unread so inbox is undisturbed
        await markAsUnread('avi', msg.id, accessToken)
        continue
      }

      // Found a reply from a target organization
      const bodyText = getMessageBody(fullMessage)
      const snippet = fullMessage.snippet || bodyText.substring(0, 300)
      const sentiment = analyzeSentiment(bodyText || snippet)

      // Find the application for this organization
      const { data: app } = await supabase
        .from('applications')
        .select('id, status')
        .eq('organization_id', matchedOrg.id)
        .in('status', ['sent', 'followup_1_sent', 'followup_2_sent'])
        .single()

      if (!app) continue

      // Update application with response info
      const now = new Date().toISOString()
      await supabase
        .from('applications')
        .update({
          response_received_at: now,
          response_summary: snippet.substring(0, 500),
          response_sentiment: sentiment,
          status: 'under_review',
          updated_at: now,
        })
        .eq('id', app.id)

      // Log status history
      await supabase.from('application_status_history').insert({
        application_id: app.id,
        status: 'under_review',
      })

      // Send acknowledgment reply in the same thread
      const subjectHeader = fullMessage.payload.headers.find(
        (h) => h.name.toLowerCase() === 'subject'
      )
      const gmailMsgIdHeader = fullMessage.payload.headers.find(
        (h) => h.name.toLowerCase() === 'message-id'
      )
      const replySubject = subjectHeader?.value || 'Re: Empanelment Application'
      const gmailMsgId = gmailMsgIdHeader?.value || ''

      await replyGmail(
        'avi',
        senderEmail,
        replySubject,
        `Respected Sir/Madam,

Thank you for your response regarding the empanelment application. I have noted your reply and will follow up as needed.

Respectfully yours,
Avi Jain
Advocate, Bar Council of Rajasthan (R/7238/2025)
Chamber No. 39, District Court, Udaipur
Email: jainavi.aj@gmail.com`,
        msg.threadId,
        gmailMsgId
      )

      matched.push(`${matchedOrg.name} (${sentiment})`)
      repliesProcessed++

      console.log(`Reply detected from ${matchedOrg.name} — sentiment: ${sentiment}`)
    }

    return NextResponse.json({
      success: true,
      repliesProcessed,
      totalUnread: messages.length,
      matched: matched.length > 0 ? matched : undefined,
    })
  } catch (err) {
    console.error('check-replies error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
