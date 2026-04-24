import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFatherEmpanelled } from '@/lib/constants/empanelment'

const COURTS = 'Udaipur, Dungarpur, Banswara, Rajsamand, Nathdwara, Sagwara'

interface AdvocateDetails {
  id: string
  name: string
  email: string
  phone: string
  enrollment: string
  experience: string
  chamber: string
}

function buildAdvocateDetails(adv: {
  id: string; full_name: string; email: string
  phone: string | null; bci_enrollment: string | null; chamber_address: string | null
}): AdvocateDetails {
  const isRatnesh = adv.email === 'ratneshshah67@gmail.com'
  return {
    id: adv.id,
    name: adv.full_name || (isRatnesh ? 'Ratnesh Kumar Jain Shah' : 'Avi Jain'),
    email: adv.email,
    phone: adv.phone || '',
    enrollment: adv.bci_enrollment || (isRatnesh ? '418/1994' : 'R/7238/2025'),
    experience: isRatnesh ? '30+ years' : '1+ years',
    chamber: adv.chamber_address || 'Chamber No. 39, District Court, Udaipur',
  }
}

function isHealthInsurance(orgName: string): boolean {
  const n = orgName.toLowerCase()
  return n.includes('health') || n.includes('bupa') || n.includes('care health') || n.includes('max bupa')
}

function isLifeInsurance(orgName: string): boolean {
  const n = orgName.toLowerCase()
  return n.includes(' life') || n === 'lic of india' || n.includes('life insurance') || n.includes('prudential')
}

function getCredibilityLine(info: AdvocateDetails, segment: string, orgName: string): string {
  if (info.email === 'ratneshshah67@gmail.com') {
    if (segment === 'insurance') {
      return 'I am presently empanelled as panel advocate with SBI General Insurance, New India Assurance, Oriental Insurance, National Insurance, United India Insurance, ICICI Lombard, Bajaj Allianz General Insurance, IFFCO-Tokio, Future Generali India Insurance, and Universal Sompo General Insurance.'
    }
    return `I have been practicing before the courts in ${COURTS} for over 30 years, and am experienced in matters relevant to your organisation.`
  }

  // Avi — reference father's work
  if (segment === 'insurance') {
    if (isHealthInsurance(orgName)) {
      return 'My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994, 30+ years practice), is a panel advocate for several general insurance companies. I have developed experience in consumer disputes redressal matters and health insurance dispute litigation before consumer commissions in Udaipur.'
    }
    if (isLifeInsurance(orgName)) {
      return 'My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994, 30+ years practice), is a panel advocate for several insurance companies. I practice in consumer forum matters including life insurance disputes involving repudiation, surrender, and maturity claims.'
    }
    // Motor / general insurance (default — most of the list)
    return 'My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994, 30+ years practice), is presently empanelled for motor accident and insurance matters with ICICI Lombard, Bajaj Allianz General Insurance, New India Assurance, National Insurance, United India Insurance, IFFCO-Tokio, and Universal Sompo General Insurance, among others.'
  }

  if (segment === 'bank' || segment === 'nbfc') {
    return 'My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994), has been in active legal practice for over 30 years. I have developed experience in NI Act proceedings, recovery suits, and banking-related civil litigation before courts in southern Rajasthan.'
  }

  return 'My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994, 30+ years practice), has been in active legal practice before various courts and tribunals across southern Rajasthan.'
}

function getTemplate(segment: string, orgName: string, info: AdvocateDetails): string {
  const credibility = getCredibilityLine(info, segment, orgName)
  const phoneInfo = info.phone ? `\n- Mobile: ${info.phone}` : ''
  const closingPhone = info.phone ? `\nMobile: ${info.phone}` : ''

  const commonDetails = `Key details to include:
- Advocate: ${info.name}, enrolled with Bar Council of Rajasthan (${info.enrollment}), practicing for ${info.experience}
- Chamber: ${info.chamber}
- Courts of practice: ${COURTS}${phoneInfo}
- ${credibility}
- Territory coverage: Southern Rajasthan (Udaipur division and surrounding districts)

The closing signature must be exactly:
${info.name}
Advocate, Bar Council of Rajasthan (${info.enrollment})
${info.chamber}
Email: ${info.email}${closingPhone}`

  const base = `This must be a BCI Rule 36 compliant letter — formal, dignified, no self-promotion, no marketing language, no superlatives.

${commonDetails}

The letter must:
1. Be addressed to the appropriate authority (use the contact role provided)
2. State the purpose clearly — requesting empanelment as panel advocate`

  if (segment === 'insurance') {
    const practiceAreas = isHealthInsurance(orgName)
      ? 'consumer forum matters (NCDRC/SCDRC), health insurance dispute litigation, repudiation claim cases, and civil suits relating to insurance'
      : isLifeInsurance(orgName)
      ? 'life insurance dispute litigation, consumer forum matters, repudiation and maturity claim cases, and civil suits relating to life insurance'
      : 'motor accident claims (MACT), insurance dispute litigation, consumer forum matters (NCDRC/SCDRC), and civil suits relevant to the insurance industry'

    return `Write a formal empanelment application letter for an insurance company panel advocate position.

${base}
3. Mention the advocate's ability to handle ${practiceAreas}
4. Include the credibility line naturally in the body
5. Offer to provide documents (enrollment certificate, practice certificate, identity proof) upon request
6. End with the exact closing signature specified above`
  }

  if (segment === 'bank' || segment === 'nbfc') {
    return `Write a formal empanelment application letter for a bank/financial institution panel advocate position.

${base}
3. Mention the advocate's ability to handle DRT/DRAT matters, SARFAESI Act proceedings, recovery suits, NI Act (cheque bounce) cases, and civil litigation relevant to banking
4. Include the credibility line naturally in the body
5. Offer to provide documents (enrollment certificate, practice certificate, identity proof) upon request
6. End with the exact closing signature specified above`
  }

  return `Write a formal empanelment application letter for a government/PSU panel advocate position.

${base}
3. Mention the advocate's ability to handle service matters, civil disputes, arbitration proceedings, contractual disputes, and writ petitions relevant to PSU/government work
4. Include the credibility line naturally in the body
5. Offer to provide documents (enrollment certificate, practice certificate, identity proof) upon request
6. End with the exact closing signature specified above`
}

async function generateDraft(
  org: { organization_name: string; segment: string; target_contact_role: string | null },
  info: AdvocateDetails,
  groqKey: string
): Promise<{ subject: string; body: string } | null> {
  const template = getTemplate(org.segment, org.organization_name, info)
  const contactRole = org.target_contact_role || 'The Empanelment Committee / Legal Department'

  const userPrompt = `Organization: ${org.organization_name}
Addressed to: ${contactRole}
Segment: ${org.segment}

${template}

Write the letter body only (no subject line). Start with "Respected Sir/Madam," and end with the exact closing signature. Keep it concise — no more than 400 words.`

  const systemPrompt = `You are a legal letter drafting assistant for Indian advocates. Write formal empanelment applications compliant with BCI Rule 36.
- Formal, dignified language only — no marketing language, no self-praise, no superlatives
- Use the exact advocate details provided — no placeholders
- Include the exact closing signature as instructed`

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!groqRes.ok) {
      console.error(`Groq error for ${org.organization_name}:`, await groqRes.text())
      return null
    }

    const data = await groqRes.json()
    const body = data.choices?.[0]?.message?.content?.trim() || ''
    if (!body) return null

    return {
      subject: `Empanelment Application - ${org.organization_name} - ${info.name}`,
      body,
    }
  } catch (err) {
    console.error(`Draft generation failed for ${org.organization_name}:`, err)
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const authHeader = request.headers.get('authorization') || (searchParams.get('key') ? `Bearer ${searchParams.get('key')}` : null)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })

  try {
    const supabase = createAdminClient()

    // Both advocates
    const { data: advocates } = await supabase
      .from('advocates')
      .select('id, full_name, email, phone, bci_enrollment, chamber_address')
      .in('email', ['jainavi.aj@gmail.com', 'ratneshshah67@gmail.com'])

    if (!advocates || advocates.length === 0) {
      return NextResponse.json({ error: 'No advocates found' }, { status: 404 })
    }

    // All target organizations, highest priority first
    const { data: allOrgs } = await supabase
      .from('target_organizations')
      .select('id, organization_name, segment, target_contact_role, priority')
      .order('priority', { ascending: true })

    if (!allOrgs) return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 })

    const eligibleOrgs = allOrgs.filter(org => !isFatherEmpanelled(org.organization_name))

    let draftsGenerated = 0
    const errors: string[] = []

    for (const adv of advocates) {
      const info = buildAdvocateDetails(adv as Parameters<typeof buildAdvocateDetails>[0])

      // Get this advocate's existing applications only
      const { data: existingApps } = await supabase
        .from('applications')
        .select('id, organization_id, status')
        .eq('advocate_id', adv.id)

      const appMap = new Map((existingApps || []).map(a => [a.organization_id, a]))

      for (const org of eligibleOrgs) {
        let app = appMap.get(org.id)

        // Create row if none exists
        if (!app) {
          const { data: newApp, error: insertErr } = await supabase
            .from('applications')
            .insert({ organization_id: org.id, advocate_id: adv.id, status: 'new', draft_subject: '', draft_body: '' })
            .select('id, organization_id, status')
            .single()

          if (insertErr) {
            errors.push(`Create app failed for ${org.organization_name} (${info.name}): ${insertErr.message}`)
            continue
          }
          app = newApp
          appMap.set(org.id, newApp)
        }

        if (app.status !== 'new') continue

        const draft = await generateDraft(org, info, groqKey)
        if (!draft) { errors.push(`Draft gen failed for ${org.organization_name} (${info.name})`); continue }

        const { error: updateErr } = await supabase
          .from('applications')
          .update({ draft_subject: draft.subject, draft_body: draft.body, status: 'ready_to_send', updated_at: new Date().toISOString() })
          .eq('id', app.id)

        if (updateErr) { errors.push(`Update failed for ${org.organization_name} (${info.name}): ${updateErr.message}`); continue }

        await supabase.from('application_status_history').insert([
          { application_id: app.id, status: 'drafted' },
          { application_id: app.id, status: 'ready_to_send' },
        ])

        draftsGenerated++
      }
    }

    return NextResponse.json({
      success: true, draftsGenerated,
      totalEligible: eligibleOrgs.length,
      advocatesProcessed: advocates.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('auto-draft error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
