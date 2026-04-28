import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFatherEmpanelled } from '@/lib/constants/empanelment'
import { sendGmail } from '@/lib/gmail'

const MAX_EMAILS_PER_RUN = 5

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const authHeader = request.headers.get('authorization') || (searchParams.get('key') ? `Bearer ${searchParams.get('key')}` : null)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Fetch a larger batch so we can skip bad ones and still hit MAX_EMAILS_PER_RUN
    const { data: apps, error: appsError } = await supabase
      .from('applications')
      .select(`
        id, organization_id, advocate_id, draft_subject, draft_body,
        target_organizations ( id, organization_name, contact_email, segment ),
        advocates ( id, full_name, email )
      `)
      .eq('status', 'ready_to_send')
      .limit(50)

    if (appsError) {
      return NextResponse.json({ error: appsError.message }, { status: 500 })
    }

    if (!apps || apps.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No applications ready to send' })
    }

    let sentCount = 0
    const sent: string[] = []
    const skipped: string[] = []
    const errors: string[] = []

    for (const app of apps) {
      if (sentCount >= MAX_EMAILS_PER_RUN) break

      const org = app.target_organizations as unknown as {
        id: string; organization_name: string; contact_email: string | null; segment: string
      } | null

      // No org record — mark as drafted to remove from queue
      if (!org) {
        await supabase.from('applications').update({ status: 'drafted', updated_at: new Date().toISOString() }).eq('id', app.id)
        skipped.push(`${app.id} — org deleted, moved to drafted`)
        continue
      }

      // No email — mark as drafted to remove from queue
      if (!org.contact_email) {
        await supabase.from('applications').update({ status: 'drafted', updated_at: new Date().toISOString() }).eq('id', app.id)
        skipped.push(`${org.organization_name} — no email, moved to drafted`)
        continue
      }

      // Father's companies — skip for Ratnesh, allow for Avi
      const advocate = app.advocates as unknown as { email: string | null } | null
      const isRatnesh = advocate?.email === 'ratneshshah67@gmail.com'
      if (isRatnesh && isFatherEmpanelled(org.organization_name)) {
        await supabase.from('applications').update({ status: 'drafted', updated_at: new Date().toISOString() }).eq('id', app.id)
        skipped.push(`${org.organization_name} — father empanelled, moved to drafted`)
        continue
      }

      const subject = (app as unknown as { draft_subject: string }).draft_subject
      const body = (app as unknown as { draft_body: string }).draft_body
      if (!subject || !body) {
        skipped.push(`${org.organization_name} — empty draft`)
        continue
      }

      const account: 'avi' | 'ratnesh' = isRatnesh ? 'ratnesh' : 'avi'
      const fromName = isRatnesh ? 'Ratnesh Kumar Jain Shah' : 'Avi Jain'
      const fromEmail = isRatnesh ? 'ratneshshah67@gmail.com' : 'jainavi.aj@gmail.com'

      const result = await sendGmail(account, org.contact_email, subject, body, `${fromName} <${fromEmail}>`)

      if ('error' in result) {
        errors.push(`${org.organization_name}: ${result.error}`)
        continue
      }

      const now = new Date().toISOString()
      await supabase.from('applications').update({
        status: 'sent', application_method: 'email', application_sent_at: now, updated_at: now,
      }).eq('id', app.id)

      await supabase.from('application_status_history').insert({ application_id: app.id, status: 'sent' })

      await supabase.from('application_emails').insert({
        application_id: app.id, direction: 'sent', email_type: 'initial',
        from_email: fromEmail, to_email: org.contact_email, subject, body, sent_at: now,
      })

      sentCount++
      sent.push(`${org.organization_name} (${org.contact_email})`)
      console.log(`Sent to ${org.organization_name} from ${fromEmail}`)
    }

    return NextResponse.json({
      success: true, sent: sentCount,
      sent_to: sent.length > 0 ? sent : undefined,
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('auto-send error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
