import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFatherEmpanelled } from '@/lib/constants/empanelment'
import { sendGmail } from '@/lib/gmail'

/** Max follow-ups per cron run */
const MAX_FOLLOWUPS_PER_RUN = 3

/** Days to wait before sending a follow-up */
const FOLLOWUP_DELAY_DAYS = 30

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function getFollowup1Email(orgName: string, sentDate: string): { subject: string; body: string } {
  const formattedDate = formatDate(sentDate)
  return {
    subject: `Follow-up — Empanelment Application dated ${formattedDate} — Avi Jain`,
    body: `Respected Sir/Madam,

I am writing to follow up on my application for empanelment as a Panel Advocate that was submitted to ${orgName} on ${formattedDate}.

I understand that the empanelment process takes time and involves careful consideration. I remain sincerely interested in being empanelled with your esteemed organization and am ready to provide any additional documents or information that may be required.

For your convenience, I wish to reiterate that I am enrolled with the Bar Council of Rajasthan (Enrollment No. R/7238/2025) and practice before the courts in Udaipur, Dungarpur, Banswara, Rajsamand, Nathdwara, and Sagwara, covering southern Rajasthan.

My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994), has been an empanelled advocate with several organisations for over 30 years, and I am well-versed with the professional standards expected.

I would be grateful if you could kindly apprise me of the status of my application at your convenience.

Thanking you.

Respectfully yours,
Avi Jain
Advocate, Bar Council of Rajasthan (R/7238/2025)
Chamber No. 39, District Court, Udaipur
Email: jainavi.aj@gmail.com`,
  }
}

function getFollowup2Email(orgName: string, sentDate: string): { subject: string; body: string } {
  const formattedDate = formatDate(sentDate)
  return {
    subject: `Second Follow-up — Empanelment Application dated ${formattedDate} — Avi Jain`,
    body: `Respected Sir/Madam,

I am writing with reference to my application for empanelment as a Panel Advocate submitted to ${orgName} on ${formattedDate}, and my subsequent follow-up communication.

This is my final follow-up regarding the said application. I fully appreciate that the empanelment process requires due diligence and I respect the time required for the same.

Should my application not meet the present requirements, I remain available for consideration in any future empanelment cycle. I shall be happy to furnish any additional documents or appear for any interview or assessment, should the need arise.

I continue to practice before the courts in Udaipur, Dungarpur, Banswara, Rajsamand, Nathdwara, and Sagwara, covering southern Rajasthan, and remain at your service.

Thanking you for your kind consideration.

Respectfully yours,
Avi Jain
Advocate, Bar Council of Rajasthan (R/7238/2025)
Chamber No. 39, District Court, Udaipur
Email: jainavi.aj@gmail.com`,
  }
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const now = new Date()
    const cutoffDate = new Date(now.getTime() - FOLLOWUP_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString()

    let followupsSent = 0
    const errors: string[] = []
    const skipped: string[] = []

    // --- Follow-up 1: applications sent > 30 days ago, no follow-up 1 yet ---
    const { data: followup1Apps } = await supabase
      .from('applications')
      .select(`
        id,
        application_sent_at,
        target_organizations (
          id,
          name,
          email
        )
      `)
      .eq('status', 'sent')
      .lt('application_sent_at', cutoffDate)
      .is('followup1_sent_at', null)
      .limit(MAX_FOLLOWUPS_PER_RUN)

    if (followup1Apps) {
      for (const app of followup1Apps) {
        if (followupsSent >= MAX_FOLLOWUPS_PER_RUN) break

        const org = app.target_organizations as unknown as {
          id: string
          name: string
          email: string | null
        } | null

        if (!org) continue

        // Never follow up on father's empanelled companies
        if (isFatherEmpanelled(org.name)) {
          skipped.push(`${org.name} — father empanelled, skipping follow-up`)
          continue
        }

        if (!org.email) {
          skipped.push(`${org.name} — no email for follow-up`)
          continue
        }

        const sentDate = app.application_sent_at || new Date().toISOString()
        const email = getFollowup1Email(org.name, sentDate)

        const result = await sendGmail(
          'avi',
          org.email,
          email.subject,
          email.body,
          'Avi Jain <jainavi.aj@gmail.com>'
        )

        if ('error' in result) {
          errors.push(`Follow-up 1 failed for ${org.name}: ${result.error}`)
          continue
        }

        const nowStr = new Date().toISOString()
        await supabase
          .from('applications')
          .update({
            status: 'followup_1_sent',
            followup1_sent_at: nowStr,
            updated_at: nowStr,
          })
          .eq('id', app.id)

        await supabase.from('application_status_history').insert({
          application_id: app.id,
          status: 'followup_1_sent',
        })

        followupsSent++
        console.log(`Follow-up 1 sent to ${org.name} (${org.email})`)
      }
    }

    // --- Follow-up 2: follow-up 1 sent > 30 days ago, no follow-up 2 yet ---
    if (followupsSent < MAX_FOLLOWUPS_PER_RUN) {
      const remaining = MAX_FOLLOWUPS_PER_RUN - followupsSent

      const { data: followup2Apps } = await supabase
        .from('applications')
        .select(`
          id,
          application_sent_at,
          followup1_sent_at,
          target_organizations (
            id,
            name,
            email
          )
        `)
        .eq('status', 'followup_1_sent')
        .lt('followup1_sent_at', cutoffDate)
        .is('followup2_sent_at', null)
        .limit(remaining)

      if (followup2Apps) {
        for (const app of followup2Apps) {
          if (followupsSent >= MAX_FOLLOWUPS_PER_RUN) break

          const org = app.target_organizations as unknown as {
            id: string
            name: string
            email: string | null
          } | null

          if (!org) continue

          if (isFatherEmpanelled(org.name)) {
            skipped.push(`${org.name} — father empanelled, skipping follow-up 2`)
            continue
          }

          if (!org.email) {
            skipped.push(`${org.name} — no email for follow-up 2`)
            continue
          }

          const sentDate = app.application_sent_at || new Date().toISOString()
          const email = getFollowup2Email(org.name, sentDate)

          const result = await sendGmail(
            'avi',
            org.email,
            email.subject,
            email.body,
            'Avi Jain <jainavi.aj@gmail.com>'
          )

          if ('error' in result) {
            errors.push(`Follow-up 2 failed for ${org.name}: ${result.error}`)
            continue
          }

          const nowStr = new Date().toISOString()
          await supabase
            .from('applications')
            .update({
              status: 'followup_2_sent',
              followup2_sent_at: nowStr,
              updated_at: nowStr,
            })
            .eq('id', app.id)

          await supabase.from('application_status_history').insert({
            application_id: app.id,
            status: 'followup_2_sent',
          })

          followupsSent++
          console.log(`Follow-up 2 sent to ${org.name} (${org.email})`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      followupsSent,
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('auto-followup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
