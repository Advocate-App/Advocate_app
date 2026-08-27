import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Step 2: only deletes the case once the emailed code checks out. The
// actual delete happens here, server-side, rather than the client just
// being trusted to call cases.delete() after checking the code itself.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { caseId, code } = await req.json().catch(() => ({}))
  if (!caseId || !code) {
    return NextResponse.json({ error: 'caseId and code are required' }, { status: 400 })
  }

  const { data: otpRow } = await supabaseAdmin
    .from('case_delete_otps')
    .select('id, code, expires_at, used')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otpRow || otpRow.used || otpRow.code !== String(code).trim() || new Date(otpRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'That code is wrong or has expired. Request a new one and try again.' }, { status: 400 })
  }

  await supabaseAdmin.from('case_delete_otps').update({ used: true }).eq('id', otpRow.id)
  const { error: deleteErr } = await supabaseAdmin.from('cases').delete().eq('id', caseId)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
