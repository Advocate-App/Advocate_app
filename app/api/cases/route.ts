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

    // Insert case (service role bypasses RLS)
    const { data: newCase, error: insertErr } = await supabaseAdmin
      .from('cases')
      .insert({ ...body, advocate_id: advocateId })
      .select('id')
      .single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 })

    // Insert hearings
    const today = new Date().toISOString().split('T')[0]
    await supabaseAdmin.from('hearings').insert({
      case_id: newCase.id,
      hearing_date: today,
      stage_on_date: body.case_stage || null,
      next_hearing_date: body.next_hearing_date || null,
      purpose: 'Case Commenced',
      appearing_advocate_name: 'self',
      happened: true,
    })

    if (body.next_hearing_date && body.next_hearing_date !== today) {
      await supabaseAdmin.from('hearings').insert({
        case_id: newCase.id,
        hearing_date: body.next_hearing_date,
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
