import type { NextConfig } from 'next'

const config: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Cloudflare Worker URL for private B2 media
        // Set CLOUDFLARE_WORKER_URL in environment variables
        protocol: 'https',
        hostname: process.env.CLOUDFLARE_WORKER_HOSTNAME ?? 'placeholder.workers.dev',
      },
    ],
    loader: 'custom',
    loaderFile: './lib/media/loader.ts',
  },
  experimental: {
    // typedRoutes: true, // enable once stable in Next.js 16
  },
  // Security headers are applied in proxy.ts
}

export default config
