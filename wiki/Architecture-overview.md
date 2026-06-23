# Architecture overview

## Request flow

```
Browser request
      │
      ▼
proxy.ts  (Node.js runtime — NOT Edge)
      │
      ├── Always pass: /api/health, /api/webhooks/, /_next/, /favicon.ico
      │
      ├── Setup gate: if SiteConfig.setupCompleted = false
      │     → only /_setup and /api/setup/* pass through
      │     → everything else redirects to /_setup
      │
      ├── Admin path enforcement
      │     → request matches /<adminPath>[/*] ?
      │         yes → rewrite to /_cactus_admin[/*]
      │               (validate session; redirect to /<adminPath>/login if missing)
      │         no  → falls through (404 from Next.js for unknown routes)
      │
      └── Site status gate (public routes only)
            → status = live?  → pass through
            → status ≠ live and requester has admin session? → pass through
            → status = comingSoon → rewrite to /_status/coming-soon
            → status = maintenance → rewrite to /_status/maintenance
```

**Why `proxy.ts` instead of `middleware.ts`?** Next.js 16 moved the request-interception layer from the Edge runtime to Node.js and renamed the file. Running on Node.js means Prisma works directly — no edge-compatible ORM, no edge Config only as a fallback. The admin path and site status checks can use real database reads.

## Admin path and Edge Config

The admin path is a secret URL prefix chosen during setup. It's stored in `SiteConfig.adminPath` and mirrored to **Vercel Edge Config** whenever it changes (via the Vercel REST API). `proxy.ts` reads it from Edge Config first (fast, no database round-trip), falling back to a Prisma read cached briefly in memory if write credentials aren't configured. Same pattern for site status.

## Authentication and sessions

- **Passkey-first**: WebAuthn registration and authentication via `@simplewebauthn/server`. The relying party ID is derived from `SITE_URL` in production, `localhost` in development. Credentials are stored in the `Passkey` table (public key, counter, transports).
- **Sessions**: Database-backed (not JWTs). A session token is hashed with `SESSION_SECRET` before storage. Suspending a user invalidates their session immediately.
- **Password + OTP fallback** (when email is configured): bcrypt, Pwned Passwords k-anonymity check on registration, mandatory 6-digit email OTP as second factor.
- **Trust this browser**: a `TrustedDevice` cookie skips the OTP step for a configurable number of days.
- **Recovery**: offline single-use recovery code (generated at setup), or email link (30-minute expiry). Both land on the login page's recovery UI.

## Media pipeline

```
Browser ──── Next.js <Image> ────▶ Custom loader (lib/media/loader.ts)
                                          │
                                          │  builds URL: https://worker.example.com/<key>?w=<width>&q=<quality>
                                          ▼
                               Cloudflare Worker (workers/media-worker/)
                                          │
                                          ├── validates key (must start with "media/")
                                          ├── fetches from private B2 bucket
                                          ├── applies Cloudflare Image Resizing (width, quality, format=auto)
                                          └── returns with cache headers (1 year, immutable)
```

**Why not proxy through Vercel?** Vercel bills GB-hours of serverless execution. A 10 MB image served through a Next.js route handler on every page view burns real money at scale. The Cloudflare Worker sits outside Vercel's billing, caches resized variants at Cloudflare's edge, and never touches Vercel's function runtime for image bytes.

## Module system

Modules are git submodules living under `modules/<name>/`. Installing one:

1. `POST /api/admin/modules` fetches `cactus.module.json`, validates the manifest, acquires the deploy lock, and commits the submodule via the GitHub Git Data API (no `git` CLI, no shell calls).
2. The commit triggers a Vercel deployment through the standard GitHub integration.
3. During Vercel's build step, `scripts/run-module-migrations.mjs` runs **after** `prisma migrate deploy`. It finds all active modules' SQL migration files, checks the `ModuleMigration` table for already-applied ones, and executes the rest in lexicographic order.
4. The deploy lock is released when the Vercel webhook fires (`deployment.succeeded`) or lazily on the next Modules page load (for Hobby-plan users without webhooks).

Module database tables are **prefixed** (`tablePrefix` field, e.g. `forum_`). They never touch Prisma's migration history. The core Prisma client knows nothing about module tables — modules query their own tables directly.

## Theme system

Themes live under `themes/<name>/`. Activating a theme is a pure database flag flip (`Theme.isActive`) with no redeploy. Installing a new theme follows the same submodule-commit pattern as a module.

The Prickly theme is bundled in `themes/prickly/` — it is not a submodule. No install step is needed for it.
