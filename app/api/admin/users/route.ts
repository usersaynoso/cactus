import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { parsePaginationParams, errorResponse } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'users.manage')) return errorResponse('Forbidden', 403)

  const { skip, perPage } = parsePaginationParams(request.nextUrl.searchParams)
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip, take: perPage,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, username: true, displayName: true,
        createdAt: true, suspendedAt: true, emailVerifiedAt: true,
        role: { select: { id: true, name: true, isProtected: true } },
      },
    }),
    prisma.user.count(),
  ])
  return NextResponse.json({ users, total })
}
