import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Verify the caller is authenticated
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    // Get advocate_id for this user
    const { data: advRows } = await supabaseAdmin
      .from('advocates').select('id').eq('user_id', user.id).limit(1)
    const advocateId = advRows?.[0]?.id
    if (!advocateId) return NextResponse.json({ error: 'Advocate profile not found' }, { status: 400 })

    const validClientSides = ['plaintiff','defendant','both','intervenor','petitioner','respondent','applicant','opposite_party','appellant','caveator']
    // next_hearing_date is not a column on cases — handled separately for hearings
    const { next_hearing_date, ...caseFields } = body

    const baseCaseData = {
      advocate_id: advocateId,
      court_level: caseFields.court_level,
      court_name: caseFields.court_name,
      court_code: caseFields.court_code || null,
      case_number: caseFields.case_number,
      case_year: caseFields.case_year,
      case_type: caseFields.case_type || null,
      party_plaintiff: caseFields.party_plaintiff,
      party_defendant: caseFields.party_defendant,
      status: caseFields.status || 'active',
      client_name: caseFields.client_name || null,
      client_side: validClientSides.includes(body.client_side) ? body.client_side : null,
      our_role: caseFields.our_role || null,
      opposite_advocate: caseFields.opposite_advocate || null,
      filed_date: caseFields.filed_date || null,
      case_stage: caseFields.case_stage || null,
      ecourts_cnr: caseFields.ecourts_cnr || null,
      notes: caseFields.notes || null,
    }

    // Try with new columns (migration 004). If columns don't exist yet, fall back.
    const fullData = {
      ...baseCaseData,
      ...(caseFields.city ? { city: caseFields.city } : {}),
      ...(caseFields.client_id ? { client_id: caseFields.client_id } : {}),
    }

    let { data: newCase, error: insertErr } = await supabaseAdmin
      .from('cases').insert(fullData).select('id').single()

    if (insertErr && (insertErr.message.includes('city') || insertErr.message.includes('client_id') || insertErr.message.includes('column'))) {
      const fallback = await supabaseAdmin.from('cases').insert(baseCaseData).select('id').single()
      newCase = fallback.data
      insertErr = fallback.error
    }

    if (insertErr || !newCase) return NextResponse.json({ error: insertErr?.message || 'Insert failed' }, { status: 400 })

    // Insert hearings
    const today = new Date().toISOString().split('T')[0]
    await supabaseAdmin.from('hearings').insert({
      case_id: newCase.id,
      hearing_date: today,
      stage_on_date: body.case_stage || null,
      next_hearing_date: next_hearing_date || null,
      purpose: 'Case Commenced',
      appearing_advocate_name: 'self',
      happened: true,
    })

    if (next_hearing_date && next_hearing_date !== today) {
      await supabaseAdmin.from('hearings').insert({
        case_id: newCase.id,
        hearing_date: next_hearing_date,
        previous_hearing_date: today,
        stage_on_date: body.case_stage || null,
        purpose: null,
        appearing_advocate_name: 'self',
        happened: false,
      })
    }

    return NextResponse.json({ id: newCase.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
