import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken } from '@/lib/gmail'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization')
  if (!auth) return false
  const { data: { user } } = await supabaseAdmin.auth.getUser(auth.replace('Bearer ', ''))
  return !!user
}

// Deleting a Drive-linked document from the app now also removes the real
// file in Drive, not just the app's reference to it. There's no stored
// record of which of the two Google accounts (Avi's or Ratnesh's) actually
// owns any given linked file, so this just tries both — cheap, and either
// one succeeds or the file was never reachable from this app to begin with.
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { fileId } = await req.json().catch(() => ({}))
  if (!fileId || typeof fileId !== 'string') {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 })
  }

  const accounts: ('avi' | 'ratnesh')[] = ['avi', 'ratnesh']
  const errors: string[] = []

  for (const account of accounts) {
    try {
      const token = await getAccessToken(account)
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      // 204 = deleted. 404 = already gone (someone deleted it in Drive
      // directly) — treat that as success too, since the end state is
      // exactly what we want.
      if (res.status === 204 || res.status === 404) {
        return NextResponse.json({ ok: true, account })
      }
      errors.push(`${account}: ${res.status} ${await res.text()}`)
    } catch (e) {
      errors.push(`${account}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ ok: false, error: errors.join(' | ') }, { status: 502 })
}
