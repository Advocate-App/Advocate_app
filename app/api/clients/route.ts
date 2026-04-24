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
    .from('clients')
    .select('*')
    .eq('advocate_id', advocateId)
    .order('is_company', { ascending: false })
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const advocateId = await getAdvocateId(req)
  if (!advocateId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { name, phone, email, city, notes, is_company } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({
      advocate_id: advocateId,
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      city: city?.trim() || null,
      notes: notes?.trim() || null,
      is_company: !!is_company,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const advocateId = await getAdvocateId(req)
  if (!advocateId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Client id required' }, { status: 400 })
  await supabaseAdmin.from('clients').delete().eq('id', id).eq('advocate_id', advocateId)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const advocateId = await getAdvocateId(req)
  if (!advocateId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id, name, phone, email, city, notes, is_company } = await req.json()
  if (!id) return NextResponse.json({ error: 'Client id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('clients')
    .update({
      name: name?.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      city: city?.trim() || null,
      notes: notes?.trim() || null,
      is_company: !!is_company,
    })
    .eq('id', id)
    .eq('advocate_id', advocateId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (name?.trim()) {
    await supabaseAdmin
      .from('cases')
      .update({ client_name: name.trim() })
      .eq('client_id', id)
      .eq('advocate_id', advocateId)
  }

  return NextResponse.json(data)
}
