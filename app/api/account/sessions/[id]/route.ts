import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie, revokeSessionById } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const { id } = await params
  await revokeSessionById(id, user.id)
  return NextResponse.json({ ok: true })
}
