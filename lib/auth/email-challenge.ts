import { createHash, randomInt } from 'crypto'
import { prisma } from '@/lib/db/prisma'

const CODE_LENGTH = 6
const CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5

export type ChallengePurpose = 'login_otp' | 'verify_email'

function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export async function createEmailChallenge(
  userId: string,
  purpose: ChallengePurpose
): Promise<string> {
  // Invalidate any existing challenges for this user + purpose
  await prisma.emailChallenge.deleteMany({ where: { userId, purpose } })

  const code = generateCode()
  const codeHash = hashCode(code)
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await prisma.emailChallenge.create({
    data: { userId, codeHash, purpose, expiresAt },
  })

  return code
}

export type ChallengeVerifyResult =
  | { success: true }
  | { success: false; reason: 'invalid' | 'expired' | 'max_attempts' }

export async function verifyEmailChallenge(
  userId: string,
  purpose: ChallengePurpose,
  code: string
): Promise<ChallengeVerifyResult> {
  const challenge = await prisma.emailChallenge.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: 'desc' },
  })

  if (!challenge) return { success: false, reason: 'invalid' }
  if (challenge.expiresAt < new Date()) {
    await prisma.emailChallenge.delete({ where: { id: challenge.id } })
    return { success: false, reason: 'expired' }
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    await prisma.emailChallenge.delete({ where: { id: challenge.id } })
    return { success: false, reason: 'max_attempts' }
  }

  const codeHash = hashCode(code.trim())
  if (codeHash !== challenge.codeHash) {
    await prisma.emailChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    })
    // If this was the last attempt, delete
    if (challenge.attempts + 1 >= MAX_ATTEMPTS) {
      await prisma.emailChallenge.delete({ where: { id: challenge.id } })
    }
    return { success: false, reason: 'invalid' }
  }

  // Success — consume the challenge
  await prisma.emailChallenge.delete({ where: { id: challenge.id } })
  return { success: true }
}
