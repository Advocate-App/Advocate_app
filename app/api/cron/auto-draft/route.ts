import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFatherEmpanelled } from '@/lib/constants/empanelment'

const ADVOCATE_INFO = {
  name: 'Avi Jain',
  enrollment: 'R/7238/2025',
  experience: '1+ years',
  chamber: 'Chamber No. 39, District Court, Udaipur',
  courts: 'Udaipur, Dungarpur, Banswara, Rajsamand, Nathdwara, Sagwara',
}

const FATHER_INFO =
  'My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994, 30+ years practice), ' +
  'is presently empanelled with SBI General Insurance, New India Assurance, Oriental Insurance, ' +
  'National Insurance, United India Insurance, ICICI Lombard, Bajaj Allianz General Insurance, ' +
  'IFFCO-Tokio, Future Generali India Insurance, and Universal Sompo General Insurance.'

function getTemplate(segment: string): string {
  if (segment === 'insurance') {
    return `Write a formal empanelment application letter for an insurance company panel advocate position.

This must be a BCI Rule 36 compliant letter — formal, dignified, no self-promotion, no marketing language, no superlatives.

Key details to include:
- Advocate: ${ADVOCATE_INFO.name}, enrolled with Bar Council of Rajasthan (${ADVOCATE_INFO.enrollment}), practicing for ${ADVOCATE_INFO.experience}
- Chamber: ${ADVOCATE_INFO.chamber}
- Courts of practice: ${ADVOCATE_INFO.courts}
- ${FATHER_INFO}
- The letter should mention the advocate's ability to handle motor accident claims (MACT), insurance dispute litigation, consumer forum matters, and civil suits relevant to the insurance industry.
- Territory coverage: Southern Rajasthan (Udaipur division and surrounding districts)

The letter must:
1. Be addressed to the appropriate authority (use the contact role provided)
2. State the purpose clearly — requesting empanelment as panel advocate
3. Mention relevant practice areas for insurance matters
4. Reference father's existing empanelment to establish family credibility
5. Offer to provide documents (enrollment certificate, practice certificate, identity proof) upon request
6. End with a respectful closing`
  }

  if (segment === 'bank' || segment === 'nbfc') {
    return `Write a formal empanelment application letter for a bank/financial institution panel advocate position.

This must be a BCI Rule 36 compliant letter — formal, dignified, no self-promotion, no marketing language, no superlatives.

Key details to include:
- Advocate: ${ADVOCATE_INFO.name}, enrolled with Bar Council of Rajasthan (${ADVOCATE_INFO.enrollment}), practicing for ${ADVOCATE_INFO.experience}
- Chamber: ${ADVOCATE_INFO.chamber}
- Courts of practice: ${ADVOCATE_INFO.courts}
- ${FATHER_INFO}
- The letter should mention the advocate's ability to handle DRT/DRAT matters, SARFAESI Act proceedings, recovery suits, NI Act (cheque bounce) cases, and civil litigation relevant to banking.
- Territory coverage: Southern Rajasthan (Udaipur division and surrounding districts)

The letter must:
1. Be addressed to the appropriate authority (use the contact role provided)
2. State the purpose clearly — requesting empanelment as panel advocate
3. Mention relevant practice areas for banking and financial matters
4. Reference father's existing empanelment to establish family credibility
5. Offer to provide documents (enrollment certificate, practice certificate, identity proof) upon request
6. End with a respectful closing`
  }

  // PSU / Govt
  return `Write a formal empanelment application letter for a government/PSU panel advocate position.

This must be a BCI Rule 36 compliant letter — formal, dignified, no self-promotion, no marketing language, no superlatives.

Key details to include:
- Advocate: ${ADVOCATE_INFO.name}, enrolled with Bar Council of Rajasthan (${ADVOCATE_INFO.enrollment}), practicing for ${ADVOCATE_INFO.experience}
- Chamber: ${ADVOCATE_INFO.chamber}
- Courts of practice: ${ADVOCATE_INFO.courts}
- ${FATHER_INFO}
- The letter should mention the advocate's ability to handle service matters, civil disputes, arbitration proceedings, contractual disputes, and writ petitions relevant to PSU/government work.
- Territory coverage: Southern Rajasthan (Udaipur division and surrounding districts)

The letter must:
1. Be addressed to the appropriate authority (use the contact role provided)
2. State the purpose clearly — requesting empanelment as panel advocate
3. Mention relevant practice areas for government and PSU matters
4. Reference father's existing empanelment to establish family credibility
5. Offer to provide documents (enrollment certificate, practice certificate, identity proof) upon request
6. End with a respectful closing`
}

async function generateDraftForOrg(org: {
  name: string
  segment: string
  contact_role: string | null
}): Promise<{ subject: string; body: string } | null> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    console.error('GROQ_API_KEY not configured')
    return null
  }

  const template = getTemplate(org.segment)
  const contactRole = org.contact_role || 'The Empanelment Committee / Legal Department'
  const territoryLine = `I practice across courts in ${ADVOCATE_INFO.courts}, covering southern Rajasthan.`

  const userPrompt = `Organization: ${org.name}
Addressed to: ${contactRole}
Segment: ${org.segment}
Territory line: ${territoryLine}

${template}

Write the letter body only (no subject line). Start with "Respected Sir/Madam," and end with the closing. Keep the letter concise — no more than 400 words.`

  const systemPrompt = `You are a legal letter drafting assistant for Indian advocates. You write formal empanelment applications that comply with BCI (Bar Council of India) Rule 36.

Rules:
- Use formal, dignified language
- NO marketing language, NO self-praise, NO superlatives
- NO phrases like "I am the best", "exceptional track record", "outstanding"
- Keep it factual and respectful
- Use proper Indian legal letter format
- Do NOT include subject line — only the body of the letter
- Do NOT add placeholders like [Your Name] — use the actual advocate details provided`

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
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
    const errText = await groqRes.text()
    console.error(`Groq API error for ${org.name}:`, errText)
    return null
  }

  const groqData = await groqRes.json()
  const generatedBody = groqData.choices?.[0]?.message?.content?.trim() || ''

  if (!generatedBody) {
    console.error(`Empty draft generated for ${org.name}`)
    return null
  }

  const subject = `Application for Empanelment as Panel Advocate — Udaipur Region — Avi Jain`
  return { subject, body: generatedBody }
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Get Avi's advocate_id
    const { data: advocate, error: advError } = await supabase
      .from('advocates')
      .select('id')
      .eq('email', 'jainavi.aj@gmail.com')
      .single()

    if (advError || !advocate) {
      return NextResponse.json(
        { error: 'Advocate not found for jainavi.aj@gmail.com' },
        { status: 404 }
      )
    }

    const advocateId = advocate.id

    // Get all target organizations
    const { data: allOrgs, error: orgsError } = await supabase
      .from('target_organizations')
      .select('id, name, segment, contact_role, priority')
      .order('priority', { ascending: true })

    if (orgsError || !allOrgs) {
      return NextResponse.json(
        { error: 'Failed to fetch organizations' },
        { status: 500 }
      )
    }

    // Filter out father's empanelled companies
    const eligibleOrgs = allOrgs.filter((org) => !isFatherEmpanelled(org.name))

    // Get existing applications for this advocate
    const { data: existingApps } = await supabase
      .from('applications')
      .select('id, organization_id, status')

    const appsByOrgId = new Map(
      (existingApps || []).map((app) => [app.organization_id, app])
    )

    let draftsGenerated = 0
    const errors: string[] = []

    for (const org of eligibleOrgs) {
      const existingApp = appsByOrgId.get(org.id)

      // If no application exists, create one with status='new'
      if (!existingApp) {
        const { data: newApp, error: insertError } = await supabase
          .from('applications')
          .insert({
            organization_id: org.id,
            advocate_id: advocateId,
            status: 'new',
            subject: '',
            body: '',
          })
          .select('id, organization_id, status')
          .single()

        if (insertError) {
          errors.push(`Failed to create application for ${org.name}: ${insertError.message}`)
          continue
        }

        appsByOrgId.set(org.id, newApp)
      }

      const app = appsByOrgId.get(org.id)!

      // Only generate drafts for applications with status='new'
      if (app.status !== 'new') continue

      // Generate draft via Groq
      const draft = await generateDraftForOrg(org)
      if (!draft) {
        errors.push(`Failed to generate draft for ${org.name}`)
        continue
      }

      // Update application with draft content
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          subject: draft.subject,
          body: draft.body,
          status: 'ready_to_send',
          updated_at: new Date().toISOString(),
        })
        .eq('id', app.id)

      if (updateError) {
        errors.push(`Failed to update draft for ${org.name}: ${updateError.message}`)
        continue
      }

      // Add status history entries
      await supabase.from('application_status_history').insert([
        { application_id: app.id, status: 'drafted' },
        { application_id: app.id, status: 'ready_to_send' },
      ])

      draftsGenerated++
    }

    return NextResponse.json({
      success: true,
      draftsGenerated,
      totalEligible: eligibleOrgs.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('auto-draft error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
