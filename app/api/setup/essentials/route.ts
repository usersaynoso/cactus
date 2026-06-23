import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'

const Body = z.object({
  siteName: z.string().min(1).max(100),
  timezone: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { setupCompleted: true },
  })
  if (cfg?.setupCompleted) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { siteName, timezone } = parsed.data

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { siteName, timezone },
  })

  return NextResponse.json({ ok: true })
}
