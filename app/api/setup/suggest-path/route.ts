import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { generateSuggestedAdminPath } from '@/lib/config/site'

async function isSetupComplete(): Promise<boolean> {
  try {
    if (!process.env.DATABASE_URL) return false
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    })
    return config?.setupCompleted ?? false
  } catch {
    return false
  }
}

export async function GET() {
  if (await isSetupComplete()) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }
  return NextResponse.json({ path: generateSuggestedAdminPath() })
}
