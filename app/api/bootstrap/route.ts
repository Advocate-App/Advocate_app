import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if advocate profile already exists
  const { data: existing } = await supabase
    .from('advocates')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ advocate_id: existing.id, created: false })
  }

  // Auto-create advocate profile based on email
  let fullName = 'New Advocate'
  let bciEnrollment = ''

  if (user.email === 'jainavi.aj@gmail.com') {
    fullName = 'Avi Jain'
    bciEnrollment = 'R/7238/2025'
  } else if (user.email === 'ratneshshah67@gmail.com') {
    fullName = 'Ratnesh Kumar Jain Shah'
    bciEnrollment = ''
  }

  const { data, error } = await supabase
    .from('advocates')
    .insert({
      user_id: user.id,
      full_name: fullName,
      bci_enrollment: bciEnrollment,
      email: user.email,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ advocate_id: data.id, created: true })
}
