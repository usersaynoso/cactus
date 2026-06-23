import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

const Patch = z.object({ activate: z.boolean() })

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'themes.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const theme = await prisma.theme.findUnique({ where: { id } })
  if (!theme) return errorResponse('Theme not found', 404)

  const parsed = Patch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  if (parsed.data.activate) {
    // Activating a theme is a pure database flag flip — no redeploy needed
    await prisma.$transaction([
      prisma.theme.updateMany({ data: { isActive: false } }),
      prisma.theme.update({ where: { id }, data: { isActive: true } }),
    ])
  }

  return NextResponse.json({ ok: true })
}
