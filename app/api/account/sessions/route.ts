import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import {
  getSessionFromCookie,
  listUserSessions,
  deleteAllUserSessions,
  clearSessionCookie,
  validateSession,
} from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const cookieStore = await cookies()
  const currentToken = cookieStore.get('cactus_session')?.value ?? ''

  const sessions = await listUserSessions(user.id)

  const { createHash } = await import('crypto')
  const { getSessionSecret } = await import('@/lib/config/env')
  const secret = getSessionSecret()
  const currentHash = createHash('sha256').update(currentToken + secret).digest('hex')

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.tokenHash === currentHash,
    })),
  })
}

// DELETE all sessions (sign out everywhere)
export async function DELETE() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  await deleteAllUserSessions(user.id)
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
