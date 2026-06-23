import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/prisma'
import { getSiteUrl } from '@/lib/config/env'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl()

  const pages = await prisma.infoPage.findMany({
    where: { status: 'published' },
    select: { slug: true, updatedAt: true },
  })

  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...pages.map((p) => ({
      url: `${baseUrl}/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]

  return entries
}
