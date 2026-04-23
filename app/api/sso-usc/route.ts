import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const SSO_SECRET = process.env.SSO_SECRET || ''
const USC_URL = 'https://usc-platform-beta.vercel.app'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  const redirect = searchParams.get('redirect') || '/dashboard'

  if (!key || key !== SSO_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.USC_SUPABASE_URL!,
    process.env.USC_SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'jainavi.aj@gmail.com',
  })

  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: 'Failed to generate USC login' }, { status: 500 })
  }

  const callbackUrl = `${process.env.USC_SUPABASE_URL}/auth/v1/verify?token=${data.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(USC_URL + redirect)}`

  return NextResponse.redirect(callbackUrl)
}
