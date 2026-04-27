import { NextResponse } from 'next/server'
import { checkGmailAuth } from '@/lib/gmail'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const account = (searchParams.get('account') || 'avi') as 'avi' | 'ratnesh'
  const result = await checkGmailAuth(account)
  return NextResponse.json(result)
}
