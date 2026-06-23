import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/prisma'
import { getSiteUrl } from '@/lib/config/env'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = getSiteUrl()

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { hideFromCrawlers: true, status: true },
  })

  // Disallow all crawling when: hide is on, or site is not live
  const disallowAll =
    config?.hideFromCrawlers === true || config?.status !== 'live'

  if (disallowAll) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/_cactus_admin/', '/_setup/', '/_status/', '/api/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
