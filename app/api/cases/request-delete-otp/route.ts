import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendGmail } from '@/lib/gmail'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const OTP_MINUTES = 10

// Step 1 of deleting a case: email a 6-digit code to whoever's actually
// logged in (their own account email, read from the auth token — never
// trusted from the request body) before anything gets touched. Confirmed
// by the matching /api/cases/confirm-delete-otp call.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(auth.replace('Bearer ', ''))
  if (!user || !user.email) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { caseId } = await req.json().catch(() => ({}))
  if (!caseId || typeof caseId !== 'string') {
    return NextResponse.json({ error: 'caseId is required' }, { status: 400 })
  }

  const { data: caseRow } = await supabaseAdmin
    .from('cases')
    .select('id, full_title')
    .eq('id', caseId)
    .maybeSingle()
  if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000).toISOString()

  const { error: insertErr } = await supabaseAdmin
    .from('case_delete_otps')
    .insert({ case_id: caseId, code, expires_at: expiresAt })
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const sendResult = await sendGmail(
    'ratnesh',
    user.email,
    `Delete confirmation code: ${code}`,
    `Someone (hopefully you) clicked Delete on the case:\n\n${caseRow.full_title}\n\n` +
    `Enter this code in the app to permanently delete it:\n\n${code}\n\n` +
    `This code expires in ${OTP_MINUTES} minutes. If you didn't do this, just ignore this email — nothing happens without the code.`
  )
  if ('error' in sendResult) {
    return NextResponse.json({ error: `Could not send the code: ${sendResult.error}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, sentTo: user.email })
}
