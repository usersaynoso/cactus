import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { generateRecoveryCode, hashRecoveryCode } from '@/lib/auth/recovery'

export async function POST() {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { setupCompleted: true },
  })
  if (cfg?.setupCompleted) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }

  const code = generateRecoveryCode()
  const hash = hashRecoveryCode(code)

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { recoveryCodeHash: hash },
  })

  // Return the plain code — shown once, never stored again
  return NextResponse.json({ code })
}
