import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getAdvocateId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization')
  if (!auth) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return null
  const { data } = await supabaseAdmin.from('advocates').select('id').eq('user_id', user.id).limit(1)
  return data?.[0]?.id || null
}

export async function GET(req: NextRequest) {
  const advocateId = await getAdvocateId(req)
  if (!advocateId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('custom_courts')
    .select('*')
    .eq('advocate_id', advocateId)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const advocateId = await getAdvocateId(req)
  if (!advocateId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { name, short_name, city } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Court name is required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('custom_courts')
    .insert({ advocate_id: advocateId, name: name.trim(), short_name: short_name?.trim() || null, city: city?.trim() || null })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const advocateId = await getAdvocateId(req)
  if (!advocateId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id, name, short_name, city } = await req.json()
  if (!id || !name?.trim()) return NextResponse.json({ error: 'id and name required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('custom_courts')
    .update({ name: name.trim(), short_name: short_name?.trim() || null, city: city?.trim() || null })
    .eq('id', id)
    .eq('advocate_id', advocateId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // Propagate new name to all cases using this custom court
  await supabaseAdmin
    .from('cases')
    .update({ court_name: name.trim() })
    .eq('court_code', `CUSTOM_${id}`)
    .eq('advocate_id', advocateId)
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const advocateId = await getAdvocateId(req)
  if (!advocateId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await req.json()
  await supabaseAdmin.from('custom_courts').delete().eq('id', id).eq('advocate_id', advocateId)
  return NextResponse.json({ ok: true })
}
