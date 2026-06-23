import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

const Body = z.object({ permissionKey: z.string() })
type Params = { params: Promise<{ id: string }> }

async function guard(roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } })
  if (!role) return { error: 'Role not found', status: 404 }
  if (role.isProtected) return { error: 'Cannot modify permissions for a protected role', status: 403 }
  return { role }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'roles.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const g = await guard(id)
  if ('error' in g) return errorResponse(g.error!, g.status!)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse('Invalid input')

  await prisma.rolePermission.upsert({
    where: { roleId_permissionKey: { roleId: id, permissionKey: parsed.data.permissionKey } },
    create: { roleId: id, permissionKey: parsed.data.permissionKey },
    update: {},
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'roles.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const g = await guard(id)
  if ('error' in g) return errorResponse(g.error!, g.status!)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse('Invalid input')

  await prisma.rolePermission.deleteMany({
    where: { roleId: id, permissionKey: parsed.data.permissionKey },
  })
  return NextResponse.json({ ok: true })
}
