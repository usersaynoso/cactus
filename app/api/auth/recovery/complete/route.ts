import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateRecoveryToken, consumeRecoveryToken } from '@/lib/auth/recovery'
import { verifyAdminRecoveryCode } from '@/lib/auth/recovery'
import { hashPassword, validateNewPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/db/prisma'
import { deleteAllUserSessions, revokeAllTrustedDevices, createSession, setSessionCookie } from '@/lib/auth/session'
import { sendRecoveryNotification } from '@/lib/email/index'
import { isEmailConfigured } from '@/lib/config/env'

// GET: validate a recovery token (renders a form in the browser)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const result = await validateRecoveryToken(token)
  if (!result) {
    // Redirect to a "link expired" message — for now just redirect home
    return NextResponse.redirect(new URL('/?recovery=expired', request.url))
  }

  // Redirect to a recovery form page (the admin path's recovery page)
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true },
  })
  const adminPath = config?.adminPath ?? ''
  return NextResponse.redirect(
    new URL(`/${adminPath}/login?recovery_token=${encodeURIComponent(token)}`, request.url)
  )
}

// POST: complete recovery — register new passkey or set new password
const Body = z.object({
  token: z.string().optional(),
  recoveryCode: z.string().optional(),
  email: z.string().email().optional(), // for recovery-code path (identify the account)
  newPassword: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { token, recoveryCode, email, newPassword } = parsed.data

  let userId: string | null = null

  if (token) {
    // Email-based recovery
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'Email recovery is not available' }, { status: 503 })
    }
    const result = await validateRecoveryToken(token)
    if (!result) {
      return NextResponse.json({ error: 'Recovery link is invalid or expired' }, { status: 400 })
    }
    userId = result.userId
    await consumeRecoveryToken(token)
  } else if (recoveryCode && email) {
    // Offline recovery code (admin only, stored on SiteConfig)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
    const valid = await verifyAdminRecoveryCode(recoveryCode)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid recovery code' }, { status: 401 })
    }
    userId = user.id
  }

  if (!userId) {
    return NextResponse.json({ error: 'No valid recovery method provided' }, { status: 400 })
  }

  // Optionally set a new password
  if (newPassword) {
    const pwResult = await validateNewPassword(newPassword)
    if (!pwResult.valid) {
      return NextResponse.json({ error: pwResult.reason }, { status: 400 })
    }
    const hash = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } })
  }

  // Invalidate all other sessions and trusted devices
  await deleteAllUserSessions(userId)
  await revokeAllTrustedDevices(userId)

  // Create a new session for the recovered account
  const sessionToken = await createSession(userId)
  await setSessionCookie(sessionToken)

  // Notify the user
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
  if (user && isEmailConfigured()) {
    await sendRecoveryNotification(user.email, config?.siteName ?? 'Cactus').catch(() => {})
  }

  return NextResponse.json({ ok: true, userId })
}
