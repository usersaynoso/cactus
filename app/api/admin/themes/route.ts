import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import {
  fetchManifestFromRepo,
  parseThemeManifest,
  parseGitHubRepo,
} from '@/lib/modules/manifest'
import { commitSubmoduleAdd, getLatestRelease } from '@/lib/modules/github'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'themes.manage')) return errorResponse('Forbidden', 403)

  const themes = await prisma.theme.findMany({ orderBy: { installedAt: 'asc' } })
  return NextResponse.json({ themes })
}

const InstallBody = z.object({ repoUrl: z.string().url() })

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'themes.manage')) return errorResponse('Forbidden', 403)

  if (!process.env.GITHUB_API_TOKEN) {
    return errorResponse('GITHUB_API_TOKEN is required to install themes', 503)
  }

  const parsed = InstallBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { repoUrl } = parsed.data

  const lock = await prisma.deployLock.findUnique({ where: { id: 'singleton' } })
  if (lock) return errorResponse('Another install or update is in progress', 409)

  let manifest
  try {
    const raw = await fetchManifestFromRepo(repoUrl, 'cactus.theme.json')
    manifest = parseThemeManifest(raw)
  } catch (err: unknown) {
    return errorResponse(`Manifest error: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  const existing = await prisma.theme.findUnique({ where: { name: manifest.name } })
  if (existing) return errorResponse(`Theme "${manifest.name}" is already installed`)

  const release = await getLatestRelease(repoUrl)
  if (!release) return errorResponse('No tagged releases found in this repository')

  const { owner, repo } = parseGitHubRepo(repoUrl)
  const submodulePath = `themes/${manifest.name}`

  await prisma.deployLock.create({ data: { id: 'singleton', lockedBy: `theme:${manifest.name}` } })

  try {
    await commitSubmoduleAdd({
      submodulePath,
      submoduleUrl: repoUrl,
      commitSha: release.sha,
      message: `chore: install theme ${manifest.name} v${release.tag}\n\n[cactus-install]`,
    })

    await prisma.theme.create({
      data: { name: manifest.name, repoUrl, version: release.tag, isActive: false },
    })
  } catch (err: unknown) {
    await prisma.deployLock.deleteMany({ where: { id: 'singleton' } })
    return errorResponse(`Install failed: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
  }

  return NextResponse.json({ ok: true, name: manifest.name })
}
