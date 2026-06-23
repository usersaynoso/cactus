import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { createRecoveryRequest } from '@/lib/auth/recovery'
import { sendRecoveryLink, sendRecoveryRequestNotification } from '@/lib/email/index'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { isEmailConfigured } from '@/lib/config/env'
import { verifyTurnstile } from '@/lib/auth/turnstile'

const Body = z.object({
  email: z.string().email(),
  turnstileToken: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('recovery_request', [`ip:${ip}`])
  if (!rl.allowed) {
    // Return 200 to avoid leaking whether recovery is rate-limited
    return NextResponse.json({ ok: true })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ ok: true }) // Don't leak validation errors
  }

  const ts = await verifyTurnstile(parsed.data.turnstileToken)
  if (!ts) {
    return NextResponse.json({ error: 'Bot check failed' }, { status: 400 })
  }

  // Always return 200 to prevent email enumeration
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!user) {
    return NextResponse.json({ ok: true })
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true },
  })

  if (!isEmailConfigured()) {
    // Can't send email, but don't reveal that — the UI handles the "not configured" message
    return NextResponse.json({ ok: true })
  }

  const token = await createRecoveryRequest(user.id)
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '') ?? ''
  const recoveryUrl = `${siteUrl}/api/auth/recovery/complete?token=${token}`

  await sendRecoveryLink(user.email, recoveryUrl, config?.siteName ?? 'Cactus')
  await sendRecoveryRequestNotification(user.email, config?.siteName ?? 'Cactus').catch(() => {})

  return NextResponse.json({ ok: true })
}
