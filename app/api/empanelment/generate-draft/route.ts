import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const AVI_INFO = {
  name: 'Avi Jain',
  enrollment: 'R/7238/2025',
  experience: '1+ years',
  chamber: 'Chamber No. 39, District Court, Udaipur',
  courts: 'Udaipur, Dungarpur, Banswara, Rajsamand, Nathdwara, Sagwara',
  credibilityLine:
    'My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994, 30+ years practice), ' +
    'is presently empanelled with SBI General Insurance, New India Assurance, Oriental Insurance, ' +
    'National Insurance, United India Insurance, ICICI Lombard, Bajaj Allianz General Insurance, ' +
    'IFFCO-Tokio, Future Generali India Insurance, and Universal Sompo General Insurance.',
}

const RATNESH_INFO = {
  name: 'Ratnesh Kumar Jain Shah',
  enrollment: '418/1994',
  experience: '30+ years',
  chamber: 'Chamber No. 39, District Court, Udaipur',
  courts: 'Udaipur, Dungarpur, Banswara, Rajsamand, Nathdwara, Sagwara',
  credibilityLine:
    'I am presently empanelled as panel advocate with SBI General Insurance, New India Assurance, ' +
    'Oriental Insurance, National Insurance, United India Insurance, ICICI Lombard, ' +
    'Bajaj Allianz General Insurance, IFFCO-Tokio, Future Generali India Insurance, ' +
    'and Universal Sompo General Insurance.',
}

type AdvocateInfo = typeof AVI_INFO

function getTemplate(segment: string, info: AdvocateInfo): string {
  const enrollmentLine =
    info === RATNESH_INFO
      ? `BCR Enrollment No. ${info.enrollment}`
      : `enrolled with Bar Council of Rajasthan (${info.enrollment})`

  if (segment === 'insurance') {
    return `Write a formal empanelment application letter for an insurance company panel advocate position.

This must be a BCI Rule 36 compliant letter — formal, dignified, no self-promotion, no marketing language, no superlatives.

Key details to include:
- Advocate: ${info.name}, ${enrollmentLine}, practicing for ${info.experience}
- Chamber: ${info.chamber}
- Courts of practice: ${info.courts}
- ${info.credibilityLine}
- The letter should mention the advocate's ability to handle motor accident claims (MACT), insurance dispute litigation, consumer forum matters, and civil suits relevant to the insurance industry.
- Territory coverage: Southern Rajasthan (Udaipur division and surrounding districts)

The letter must:
1. Be addressed to the appropriate authority (use the contact role provided)
2. State the purpose clearly — requesting empanelment as panel advocate
3. Mention relevant practice areas for insurance matters
4. Reference the credibility line above (existing empanelments) appropriately
5. Offer to provide documents (enrollment certificate, practice certificate, identity proof) upon request
6. End with a respectful closing`
  }

  if (segment === 'bank' || segment === 'nbfc') {
    return `Write a formal empanelment application letter for a bank/financial institution panel advocate position.

This must be a BCI Rule 36 compliant letter — formal, dignified, no self-promotion, no marketing language, no superlatives.

Key details to include:
- Advocate: ${info.name}, ${enrollmentLine}, practicing for ${info.experience}
- Chamber: ${info.chamber}
- Courts of practice: ${info.courts}
- ${info.credibilityLine}
- The letter should mention the advocate's ability to handle DRT/DRAT matters, SARFAESI Act proceedings, recovery suits, NI Act (cheque bounce) cases, and civil litigation relevant to banking.
- Territory coverage: Southern Rajasthan (Udaipur division and surrounding districts)

The letter must:
1. Be addressed to the appropriate authority (use the contact role provided)
2. State the purpose clearly — requesting empanelment as panel advocate
3. Mention relevant practice areas for banking and financial matters
4. Reference the credibility line above (existing empanelments) appropriately
5. Offer to provide documents (enrollment certificate, practice certificate, identity proof) upon request
6. End with a respectful closing`
  }

  // PSU / Govt
  return `Write a formal empanelment application letter for a government/PSU panel advocate position.

This must be a BCI Rule 36 compliant letter — formal, dignified, no self-promotion, no marketing language, no superlatives.

Key details to include:
- Advocate: ${info.name}, ${enrollmentLine}, practicing for ${info.experience}
- Chamber: ${info.chamber}
- Courts of practice: ${info.courts}
- ${info.credibilityLine}
- The letter should mention the advocate's ability to handle service matters, civil disputes, arbitration proceedings, contractual disputes, and writ petitions relevant to PSU/government work.
- Territory coverage: Southern Rajasthan (Udaipur division and surrounding districts)

The letter must:
1. Be addressed to the appropriate authority (use the contact role provided)
2. State the purpose clearly — requesting empanelment as panel advocate
3. Mention relevant practice areas for government and PSU matters
4. Reference the credibility line above (existing empanelments) appropriately
5. Offer to provide documents (enrollment certificate, practice certificate, identity proof) upon request
6. End with a respectful closing`
}

export async function POST(request: Request) {
  try {
    const { organizationId, advocateId } = await request.json()

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Look up org
    const { data: org, error: orgError } = await supabase
      .from('target_organizations')
      .select('*')
      .eq('id', organizationId)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Determine which advocate's info to use
    let info: AdvocateInfo = AVI_INFO
    if (advocateId) {
      const { data: adv } = await supabase
        .from('advocates')
        .select('email')
        .eq('id', advocateId)
        .single()
      if (adv?.email === 'ratneshshah67@gmail.com') info = RATNESH_INFO
    }

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })
    }

    const template = getTemplate(org.segment, info)
    const contactRole = org.contact_role || 'The Empanelment Committee / Legal Department'
    const territoryLine = `I practice across courts in ${info.courts}, covering southern Rajasthan.`

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
      console.error('Groq API error:', errText)
      return NextResponse.json({ error: 'AI draft generation failed' }, { status: 500 })
    }

    const groqData = await groqRes.json()
    const generatedBody = groqData.choices?.[0]?.message?.content?.trim() || ''

    const subject = `Application for Empanelment as Panel Advocate - Udaipur Region - ${info.name}`

    return NextResponse.json({ subject, body: generatedBody })
  } catch (err) {
    console.error('generate-draft error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
