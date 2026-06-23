import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { deleteSession, clearSessionCookie } from '@/lib/auth/session'

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('cactus_session')?.value

  if (token) {
    await deleteSession(token).catch(() => {})
  }

  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
