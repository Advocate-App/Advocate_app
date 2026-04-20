import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFatherEmpanelled } from '@/lib/constants/empanelment'
import { sendGmail } from '@/lib/gmail'

/** Max emails per cron run — BCI compliance, no mass sending */
const MAX_EMAILS_PER_RUN = 5

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    console.error('CRON_SECRET env var is not set in Vercel')
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET missing' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check required Google env vars before doing any DB work
  const missingEnv: string[] = []
  if (!process.env.GOOGLE_CLIENT_ID_AVI) missingEnv.push('GOOGLE_CLIENT_ID_AVI')
  if (!process.env.GOOGLE_CLIENT_SECRET_AVI) missingEnv.push('GOOGLE_CLIENT_SECRET_AVI')
  if (!process.env.GOOGLE_AVI_REFRESH_TOKEN && !process.env.GOOGLE_REFRESH_TOKEN_AVI) missingEnv.push('GOOGLE_AVI_REFRESH_TOKEN')
  if (missingEnv.length > 0) {
    console.error('Missing env vars:', missingEnv)
    return NextResponse.json({ error: 'Missing env vars: ' + missingEnv.join(', ') }, { status: 500 })
  }

  try {
    const supabase = createAdminClient()

    // Get applications ready to send, ordered by priority (via org join)
    const { data: apps, error: appsError } = await supabase
      .from('applications')
      .select(`
        id,
        organization_id,
        advocate_id,
        subject,
        body,
        status,
        target_organizations (
          id,
          name,
          email,
          priority,
          segment
        ),
        advocates (
          id,
          full_name,
          email
        )
      `)
      .eq('status', 'ready_to_send')
      .limit(MAX_EMAILS_PER_RUN)

    if (appsError) {
      console.error('Failed to fetch ready_to_send applications:', appsError)
      return NextResponse.json(
        { error: 'Failed to fetch applications' },
        { status: 500 }
      )
    }

    if (!apps || apps.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'No applications ready to send',
      })
    }

    let sentCount = 0
    const skipped: string[] = []
    const errors: string[] = []

    for (const app of apps) {
      // target_organizations comes as a single object from a FK join
      const org = app.target_organizations as unknown as {
        id: string
        name: string
        email: string | null
        priority: string
        segment: string
      } | null

      if (!org) {
        errors.push(`No organization found for application ${app.id}`)
        continue
      }

      // Double-check: never send to father's empanelled companies
      if (isFatherEmpanelled(org.name)) {
        skipped.push(`${org.name} — father already empanelled`)
        continue
      }

      // Must have a contact email
      if (!org.email) {
        skipped.push(`${org.name} — no email`)
        console.log(`No email for ${org.name}, skipping`)
        continue
      }

      if (!app.subject || !app.body) {
        skipped.push(`${org.name} — empty draft`)
        continue
      }

      // Determine which Gmail account to send from based on advocate
      const advocate = app.advocates as unknown as {
        id: string
        full_name: string
        email: string | null
      } | null

      const isRatnesh = advocate?.email === 'ratneshshah67@gmail.com'
      const account: 'avi' | 'ratnesh' = isRatnesh ? 'ratnesh' : 'avi'
      const fromName = isRatnesh ? 'Ratnesh Kumar Jain Shah' : 'Avi Jain'
      const fromEmail = isRatnesh ? 'ratneshshah67@gmail.com' : 'jainavi.aj@gmail.com'

      // Send email from the right account
      const result = await sendGmail(
        account,
        org.email,
        app.subject,
        app.body,
        `${fromName} <${fromEmail}>`
      )

      if ('error' in result) {
        errors.push(`Failed to send to ${org.name}: ${result.error}`)
        continue
      }

      // Update application status
      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          status: 'sent',
          send_method: 'email',
          sent_date: now.split('T')[0],
          application_sent_at: now,
          updated_at: now,
        })
        .eq('id', app.id)

      if (updateError) {
        errors.push(`Sent to ${org.name} but failed to update status: ${updateError.message}`)
        continue
      }

      // Log status history
      await supabase.from('application_status_history').insert({
        application_id: app.id,
        status: 'sent',
      })

      sentCount++
      console.log(`Sent empanelment email to ${org.name} (${org.email}), messageId: ${result.messageId}`)
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('auto-send error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
