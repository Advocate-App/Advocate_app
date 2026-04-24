import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFatherEmpanelled } from '@/lib/constants/empanelment'
import { sendGmail } from '@/lib/gmail'

const MAX_FOLLOWUPS_PER_RUN = 3
const FOLLOWUP_1_DELAY_DAYS = 10  // sooner — they still remember your first email
const FOLLOWUP_2_DELAY_DAYS = 15
const RECONTACT_DELAY_DAYS = 60

interface AdvocateInfo {
  full_name: string
  email: string
  phone: string | null
  bci_enrollment: string | null
  chamber_address: string | null
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function buildSignature(adv: AdvocateInfo): string {
  const enrollment = adv.bci_enrollment || 'Bar Council of Rajasthan'
  const chamber = adv.chamber_address || 'District Court, Udaipur'
  const phone = adv.phone ? `\nMobile: ${adv.phone}` : ''
  return `Respectfully yours,\n${adv.full_name}\nAdvocate, Bar Council of Rajasthan (${enrollment})\n${chamber}\nEmail: ${adv.email}${phone}`
}

function getFollowup1Email(
  orgName: string,
  sentDate: string,
  adv: AdvocateInfo
): { subject: string; body: string } {
  const formattedDate = formatDate(sentDate)
  const enrollment = adv.bci_enrollment || 'Bar Council of Rajasthan'
  const courts = 'Udaipur, Dungarpur, Banswara, Rajsamand, Nathdwara, and Sagwara'
  const isRatnesh = adv.email === 'ratneshshah67@gmail.com'

  const credLine = isRatnesh
    ? `I have been in active legal practice for over 30 years and am well-versed with the professional standards expected of an empanelled advocate.\n`
    : `My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994), has been an empanelled advocate with several organisations for over 30 years, and I am well-versed with the professional standards expected.\n`

  return {
    subject: `Follow-up - ${orgName} - Empanelment Application dated ${formattedDate} - ${adv.full_name}`,
    body: `Respected Sir/Madam,

I am writing to follow up on my application for empanelment as a Panel Advocate that was submitted to ${orgName} on ${formattedDate}.

I understand that the empanelment process takes time and involves careful consideration. I remain sincerely interested in being empanelled with your esteemed organisation and am ready to provide any additional documents or information that may be required.

For your convenience, I wish to reiterate that I am enrolled with the Bar Council of Rajasthan (Enrollment No. ${enrollment}) and practice before the courts in ${courts}, covering southern Rajasthan.

${credLine}
I would be grateful if you could kindly apprise me of the status of my application at your convenience.

Thanking you.

${buildSignature(adv)}`,
  }
}

function getFollowup2Email(
  orgName: string,
  sentDate: string,
  adv: AdvocateInfo
): { subject: string; body: string } {
  const formattedDate = formatDate(sentDate)
  const courts = 'Udaipur, Dungarpur, Banswara, Rajsamand, Nathdwara, and Sagwara'

  return {
    subject: `Second Follow-up - ${orgName} - Empanelment Application dated ${formattedDate} - ${adv.full_name}`,
    body: `Respected Sir/Madam,

I am writing with reference to my application for empanelment as a Panel Advocate submitted to ${orgName} on ${formattedDate}, and my subsequent follow-up communication.

This is my final follow-up regarding the said application. I fully appreciate that the empanelment process requires due diligence and I respect the time required for the same.

Should my application not meet the present requirements, I remain available for consideration in any future empanelment cycle. I shall be happy to furnish any additional documents or appear for any interview or assessment, should the need arise.

I continue to practice before the courts in ${courts}, covering southern Rajasthan, and remain at your service.

Thanking you for your kind consideration.

${buildSignature(adv)}`,
  }
}

type OrgRow = { id: string; organization_name: string; contact_email: string | null }
type AdvRow = { id: string; full_name: string; email: string; phone: string | null; bci_enrollment: string | null; chamber_address: string | null }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const authHeader = request.headers.get('authorization') || (searchParams.get('key') ? `Bearer ${searchParams.get('key')}` : null)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const now = new Date()
    const f1Cutoff = new Date(now.getTime() - FOLLOWUP_1_DELAY_DAYS * 86400000).toISOString()
    const f2Cutoff = new Date(now.getTime() - FOLLOWUP_2_DELAY_DAYS * 86400000).toISOString()
    const recontactCutoff = new Date(now.getTime() - RECONTACT_DELAY_DAYS * 86400000).toISOString()

    let followupsSent = 0
    const errors: string[] = []
    const skipped: string[] = []

    // --- Follow-up 1: initial send > 10 days ago, no follow-up yet ---
    const { data: f1Apps } = await supabase
      .from('applications')
      .select(`
        id, application_sent_at,
        target_organizations ( id, organization_name, contact_email ),
        advocates ( id, full_name, email, phone, bci_enrollment, chamber_address )
      `)
      .eq('status', 'sent')
      .lt('application_sent_at', f1Cutoff)
      .is('followup1_sent_at', null)
      .limit(MAX_FOLLOWUPS_PER_RUN)

    for (const app of f1Apps || []) {
      if (followupsSent >= MAX_FOLLOWUPS_PER_RUN) break
      const org = app.target_organizations as unknown as OrgRow | null
      const adv = app.advocates as unknown as AdvRow | null
      if (!org || !adv) continue
      if (isFatherEmpanelled(org.organization_name)) { skipped.push(`${org.organization_name} — father empanelled`); continue }
      if (!org.contact_email) { skipped.push(`${org.organization_name} — no email`); continue }

      const account: 'avi' | 'ratnesh' = adv.email === 'ratneshshah67@gmail.com' ? 'ratnesh' : 'avi'
      const { subject, body } = getFollowup1Email(org.organization_name, app.application_sent_at || now.toISOString(), adv)
      const result = await sendGmail(account, org.contact_email, subject, body)
      if ('error' in result) { errors.push(`Follow-up 1 failed for ${org.organization_name}: ${result.error}`); continue }

      const nowStr = now.toISOString()
      await supabase.from('applications').update({ status: 'followup_1_sent', followup1_sent_at: nowStr, updated_at: nowStr }).eq('id', app.id)
      await supabase.from('application_status_history').insert({ application_id: app.id, status: 'followup_1_sent' })
      await supabase.from('application_emails').insert({
        application_id: app.id, direction: 'sent', email_type: 'followup_1',
        from_email: adv.email, to_email: org.contact_email, subject, body, sent_at: nowStr,
      })
      followupsSent++
      console.log(`Follow-up 1 sent to ${org.organization_name} via ${account}`)
    }

    // --- Follow-up 2: follow-up 1 > 15 days ago ---
    if (followupsSent < MAX_FOLLOWUPS_PER_RUN) {
      const { data: f2Apps } = await supabase
        .from('applications')
        .select(`
          id, application_sent_at, followup1_sent_at,
          target_organizations ( id, organization_name, contact_email ),
          advocates ( id, full_name, email, phone, bci_enrollment, chamber_address )
        `)
        .eq('status', 'followup_1_sent')
        .lt('followup1_sent_at', f2Cutoff)
        .is('followup2_sent_at', null)
        .limit(MAX_FOLLOWUPS_PER_RUN - followupsSent)

      for (const app of f2Apps || []) {
        if (followupsSent >= MAX_FOLLOWUPS_PER_RUN) break
        const org = app.target_organizations as unknown as OrgRow | null
        const adv = app.advocates as unknown as AdvRow | null
        if (!org || !adv) continue
        if (isFatherEmpanelled(org.organization_name)) { skipped.push(`${org.organization_name} — father empanelled`); continue }
        if (!org.contact_email) { skipped.push(`${org.organization_name} — no email`); continue }

        const account: 'avi' | 'ratnesh' = adv.email === 'ratneshshah67@gmail.com' ? 'ratnesh' : 'avi'
        const { subject, body } = getFollowup2Email(org.organization_name, app.application_sent_at || now.toISOString(), adv)
        const result = await sendGmail(account, org.contact_email, subject, body)
        if ('error' in result) { errors.push(`Follow-up 2 failed for ${org.organization_name}: ${result.error}`); continue }

        const nowStr = now.toISOString()
        await supabase.from('applications').update({ status: 'followup_2_sent', followup2_sent_at: nowStr, updated_at: nowStr }).eq('id', app.id)
        await supabase.from('application_status_history').insert({ application_id: app.id, status: 'followup_2_sent' })
        await supabase.from('application_emails').insert({
          application_id: app.id, direction: 'sent', email_type: 'followup_2',
          from_email: adv.email, to_email: org.contact_email, subject, body, sent_at: nowStr,
        })
        followupsSent++
        console.log(`Follow-up 2 sent to ${org.organization_name} via ${account}`)
      }
    }

    // --- Re-contact: 60 days after follow-up 2 — reset so a fresh letter goes out ---
    const { data: recontactApps } = await supabase
      .from('applications')
      .select('id')
      .eq('status', 'followup_2_sent')
      .lt('followup2_sent_at', recontactCutoff)
      .limit(5)

    let recontacted = 0
    for (const app of recontactApps || []) {
      const nowStr = now.toISOString()
      await supabase.from('applications').update({
        status: 'ready_to_send',
        followup1_sent_at: null,
        followup2_sent_at: null,
        application_sent_at: null,
        updated_at: nowStr,
      }).eq('id', app.id)
      recontacted++
    }

    return NextResponse.json({
      success: true, followupsSent, recontacted,
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('auto-followup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
