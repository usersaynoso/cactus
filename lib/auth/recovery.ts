import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'

const RECOVERY_TTL_MS = 30 * 60 * 1000 // 30 minutes
const RECOVERY_CODE_LENGTH = 32 // bytes → 64 hex chars

// ---------------------------------------------------------------------------
// Recovery codes (offline, no email required)
// ---------------------------------------------------------------------------

export function generateRecoveryCode(): string {
  return randomBytes(RECOVERY_CODE_LENGTH).toString('hex')
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

// Verify a recovery code against the stored hash in SiteConfig (admin only).
// Single-use: clears the hash on success.
export async function verifyAdminRecoveryCode(code: string): Promise<boolean> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { recoveryCodeHash: true },
  })
  if (!config?.recoveryCodeHash) return false

  const hash = hashRecoveryCode(code.trim())
  if (hash !== config.recoveryCodeHash) return false

  // Consume the code
  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { recoveryCodeHash: null },
  })
  return true
}

// ---------------------------------------------------------------------------
// Email-based recovery tokens
// ---------------------------------------------------------------------------

export function generateRecoveryToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createRecoveryRequest(userId: string): Promise<string> {
  // Invalidate any existing unused requests for this user
  await prisma.recoveryRequest.deleteMany({ where: { userId, used: false } })

  const token = generateRecoveryToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + RECOVERY_TTL_MS)

  await prisma.recoveryRequest.create({
    data: { userId, tokenHash, expiresAt },
  })

  return token
}

export async function validateRecoveryToken(
  token: string
): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(token.trim())
  const request = await prisma.recoveryRequest.findUnique({
    where: { tokenHash },
  })

  if (!request) return null
  if (request.used) return null
  if (request.expiresAt < new Date()) {
    await prisma.recoveryRequest.delete({ where: { id: request.id } })
    return null
  }

  return { userId: request.userId }
}

export async function consumeRecoveryToken(token: string): Promise<boolean> {
  const tokenHash = hashToken(token.trim())
  const updated = await prisma.recoveryRequest.updateMany({
    where: { tokenHash, used: false, expiresAt: { gt: new Date() } },
    data: { used: true },
  })
  return updated.count > 0
}
