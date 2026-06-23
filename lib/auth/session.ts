import { cookies } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { getSessionSecret } from '@/lib/config/env'
import type { User, Role } from '@prisma/client'

const SESSION_COOKIE = 'cactus_session'
const TRUSTED_DEVICE_COOKIE = 'cactus_trusted'
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

export type SessionUser = User & { role: Role }

function hashToken(token: string): string {
  const secret = getSessionSecret()
  return createHash('sha256')
    .update(token + secret)
    .digest('hex')
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  })

  return token
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(Date.now() + SESSION_DURATION_MS),
    path: '/',
  })
}

export async function getSessionFromCookie(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return validateSession(token)
}

export async function validateSession(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token)
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { role: true } } },
  })

  if (!session) return null
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } })
    return null
  }
  if (session.user.suspendedAt) return null

  return session.user as SessionUser
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token)
  await prisma.session.deleteMany({ where: { tokenHash } })
}

export async function deleteAllUserSessions(
  userId: string,
  exceptTokenHash?: string
): Promise<void> {
  await prisma.session.deleteMany({
    where: {
      userId,
      ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}),
    },
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

// ---------------------------------------------------------------------------
// Trusted device
// ---------------------------------------------------------------------------

export async function createTrustedDevice(
  userId: string,
  durationDays: number
): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)

  // Upsert: refresh if a trusted device cookie from this browser already exists.
  // In practice we key on the userId + browser, but since we have no device
  // fingerprint we just create a fresh record.
  await prisma.trustedDevice.create({ data: { userId, tokenHash, expiresAt } })

  return token
}

export async function setTrustedDeviceCookie(
  token: string,
  durationDays: number
): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: durationDays * 24 * 60 * 60,
    path: '/',
  })
}

export async function isTrustedDevice(userId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value
  if (!token) return false

  const tokenHash = hashToken(token)
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash } })
  if (!device) return false
  if (device.userId !== userId) return false
  if (device.expiresAt < new Date()) {
    await prisma.trustedDevice.delete({ where: { id: device.id } })
    return false
  }

  // Refresh expiry on valid use — find the config for the duration
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { trustDeviceDays: true },
  })
  const days = config?.trustDeviceDays ?? 28
  await prisma.trustedDevice.update({
    where: { id: device.id },
    data: { expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000) },
  })

  return true
}

export async function revokeAllTrustedDevices(
  userId: string
): Promise<void> {
  await prisma.trustedDevice.deleteMany({ where: { userId } })
}

// ---------------------------------------------------------------------------
// Session list for account settings
// ---------------------------------------------------------------------------

export async function listUserSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, expiresAt: true, tokenHash: true },
  })
}

export async function revokeSessionById(
  sessionId: string,
  userId: string
): Promise<void> {
  await prisma.session.deleteMany({
    where: { id: sessionId, userId },
  })
}

// Timing-safe token comparison helper
export function safeCompare(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}
