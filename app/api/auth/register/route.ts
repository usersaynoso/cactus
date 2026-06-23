// Public user registration (when publicRegistration is enabled).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { hashPassword, validateNewPassword } from '@/lib/auth/password'
import { createEmailChallenge } from '@/lib/auth/email-challenge'
import { sendEmailVerification } from '@/lib/email/index'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { isBlocklisted } from '@/lib/config/site'
import { isEmailConfigured } from '@/lib/config/env'

const Body = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(32).regex(/^[a-z0-9_-]+$/),
  password: z.string().optional(),
  turnstileToken: z.string().optional(),
  agreedToPolicy: z.boolean(),
})

export async function POST(request: NextRequest) {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { publicRegistration: true, defaultRoleId: true, siteName: true },
  })

  if (!config?.publicRegistration) {
    return NextResponse.json({ error: 'Registration is currently closed' }, { status: 403 })
  }

  const ip = await getClientIp(request)
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { email, username, password, turnstileToken, agreedToPolicy } = parsed.data

  if (!agreedToPolicy) {
    return NextResponse.json({ error: 'You must accept the privacy policy to register' }, { status: 400 })
  }

  const ts = await verifyTurnstile(turnstileToken)
  if (!ts) {
    return NextResponse.json({ error: 'Bot check failed' }, { status: 400 })
  }

  const rl = await checkAndRecord('register', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many registrations from this IP. Try again later.' }, { status: 429 })
  }

  if (isBlocklisted(username)) {
    return NextResponse.json({ error: `Username "${username}" is reserved` }, { status: 400 })
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })
  if (existing) {
    return NextResponse.json({ error: 'Email or username already in use' }, { status: 409 })
  }

  let passwordHash: string | undefined
  if (password) {
    const pwResult = await validateNewPassword(password)
    if (!pwResult.valid) {
      return NextResponse.json({ error: pwResult.reason }, { status: 400 })
    }
    passwordHash = await hashPassword(password)
  }

  // Get default role
  let roleId = config.defaultRoleId
  if (!roleId) {
    const memberRole = await prisma.role.findFirst({ where: { isProtected: false } })
    roleId = memberRole?.id ?? null
  }
  if (!roleId) {
    return NextResponse.json({ error: 'No default role configured' }, { status: 500 })
  }

  const emailVerified = !isEmailConfigured()

  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      roleId,
      emailVerifiedAt: emailVerified ? new Date() : null,
      acceptedPrivacyPolicyAt: new Date(),
    },
  })

  if (isEmailConfigured()) {
    const code = await createEmailChallenge(user.id, 'verify_email')
    await sendEmailVerification(email, code, config.siteName ?? 'Cactus')
  }

  return NextResponse.json({ userId: user.id, emailVerificationRequired: !emailVerified })
}
