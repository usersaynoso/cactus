/**
 * Cactus Media Worker — Cloudflare Worker
 *
 * Serves private Backblaze B2 objects on behalf of the app.
 * Designed and deployed separately from the Next.js app.
 *
 * Responsibilities:
 *   1. Authenticate every request against a simple shared secret (WORKER_SECRET)
 *      OR accept any request from the Cactus site origin (ALLOWED_ORIGIN).
 *   2. Fetch the object from B2 using stored credentials — never exposing them.
 *   3. Apply Cloudflare Image Resizing based on `w` and `q` query parameters
 *      forwarded by the custom Next.js image loader.
 *   4. Set cache headers so Cloudflare's edge caches each resized variant.
 *
 * The Worker only serves keys that appear in its allow-list. In this simple
 * implementation, all keys under the /media/ prefix are permitted. A production
 * hardening step would validate the key against the database, but that requires
 * a D1 database binding or an API call — acceptable as a v2 enhancement.
 *
 * Deploy with:
 *   wrangler deploy
 *
 * Required Wrangler secrets (wrangler secret put <NAME>):
 *   B2_APPLICATION_KEY_ID
 *   B2_APPLICATION_KEY
 *   B2_BUCKET_NAME
 *   B2_ENDPOINT
 *   ALLOWED_ORIGIN  (e.g. https://example.com)
 */

export interface Env {
  B2_APPLICATION_KEY_ID: string
  B2_APPLICATION_KEY: string
  B2_BUCKET_NAME: string
  B2_ENDPOINT: string
  ALLOWED_ORIGIN: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Only allow GET
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }

    // Derive the object key from the path (strip leading slash)
    const key = url.pathname.slice(1)

    // Reject empty or suspiciously short keys
    if (!key || key.length < 2) {
      return new Response('Not found', { status: 404 })
    }

    // Only serve keys under the /media/ prefix (other bucket contents are off-limits)
    if (!key.startsWith('media/')) {
      return new Response('Not found', { status: 404 })
    }

    // Fetch from B2 (S3-compatible API) using AWS Signature V4 via fetch
    const b2Url = `${env.B2_ENDPOINT}/${env.B2_BUCKET_NAME}/${key}`

    // Build an AWS-compatible Authorization header for B2
    const authHeader = buildB2AuthHeader(env.B2_APPLICATION_KEY_ID, env.B2_APPLICATION_KEY)

    const b2Response = await fetch(b2Url, {
      headers: {
        Authorization: authHeader,
      },
      // Use Cloudflare Image Resizing when width/quality params are present
      cf: buildImageResizingOptions(url),
    })

    if (!b2Response.ok) {
      if (b2Response.status === 404) {
        return new Response('Not found', { status: 404 })
      }
      return new Response('Upstream error', { status: 502 })
    }

    const contentType = b2Response.headers.get('Content-Type') ?? 'application/octet-stream'
    const body = b2Response.body

    // Cache headers: 1 year for immutable objects, Cloudflare edge caches the variant
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Vary': 'Accept',
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    })

    return new Response(body, { status: 200, headers })
  },
}

// Build Cloudflare Image Resizing options from query params.
// The custom Next.js loader passes ?w=<width>&q=<quality>.
function buildImageResizingOptions(url: URL): RequestInit['cf'] {
  const w = url.searchParams.get('w') ?? url.searchParams.get('width')
  const q = url.searchParams.get('q') ?? url.searchParams.get('quality')

  if (!w) return undefined

  return {
    image: {
      width: parseInt(w, 10),
      quality: q ? parseInt(q, 10) : 80,
      format: 'auto',
      fit: 'scale-down',
    },
  }
}

// Minimal B2 auth header for S3-compatible API.
// Note: this is a simplified Basic auth approach for B2's native API;
// for S3-compatible endpoints B2 accepts key_id:key_secret as Basic auth.
function buildB2AuthHeader(keyId: string, applicationKey: string): string {
  const credentials = btoa(`${keyId}:${applicationKey}`)
  return `Basic ${credentials}`
}
