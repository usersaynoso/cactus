// Custom Next.js image loader that routes all image requests through the
// Cloudflare Worker. The Worker performs resizing via Cloudflare Image Resizing,
// so Next.js's own optimisation pipeline is bypassed entirely. This means images
// are served directly from the Worker's edge to the browser — never proxied
// through a Vercel serverless function — which is critical for cost and latency.
//
// The loader and the Worker are designed together as one unit:
//   - The loader builds URLs pointing at the Worker with width/quality params.
//   - The Worker reads those params and applies Cloudflare Image Resizing.
// Neither is optional; the loader without a resizing Worker would send full-size
// originals to every device.

type LoaderParams = {
  src: string
  width: number
  quality?: number
}

export default function cloudflareWorkerLoader({
  src,
  width,
  quality = 80,
}: LoaderParams): string {
  const workerUrl =
    process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL?.replace(/\/$/, '') ?? ''

  // src is already the full worker URL (e.g. https://worker.example.com/media/abc.jpg)
  // We append width/quality params that the Worker reads to drive Image Resizing.
  const url = new URL(src.startsWith('http') ? src : `${workerUrl}/${src}`)
  url.searchParams.set('w', String(width))
  url.searchParams.set('q', String(quality))

  return url.toString()
}
