# Getting started

## Prerequisites

- Node.js ≥ 22
- A PostgreSQL database (Neon, Supabase, or self-hosted). Use a **pooled connection string** — Vercel serverless functions open many short-lived connections, and an unpooled string will exhaust your database's connection limit fast.
- A Vercel account (Hobby is fine for most features; Pro/Enterprise unlocks Vercel webhooks for automatic deployment status updates)
- `npm` — this project uses npm only. Do not use yarn or pnpm.

## Clone and install

```bash
git clone https://github.com/usersaynoso/cactus.git my-site
cd my-site
npm install
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

### Required — setup blocks without these

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL pooled connection string |
| `SESSION_SECRET` | At least 32 random characters. Generate: `openssl rand -base64 32` |
| `SITE_URL` | The canonical public domain, e.g. `https://example.com`. **This is also the WebAuthn relying party ID and cannot be changed after the first passkey is registered.** |

### Optional — feature is disabled until set

| Variable | Gates |
|----------|-------|
| `BREVO_API_KEY` | Email (password login, verification, recovery). Alternative: `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` |
| `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` | Media uploads |
| `CLOUDFLARE_WORKER_URL`, `CLOUDFLARE_WORKER_HOSTNAME` | Media serving via Cloudflare Worker |
| `GITHUB_API_TOKEN` | Module and theme install/update (needs `repo` scope) |
| `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID` | Edge Config writes, deployment status |
| `EDGE_CONFIG`, `VERCEL_EDGE_CONFIG_ID` | Fast Edge Config reads |
| `VERCEL_WEBHOOK_SECRET` | Automatic deploy status (Pro/Enterprise only) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile bot protection |
| `SENTRY_DSN` | Error reporting |

## Local development

```bash
# Apply the database schema (creates a migration file and updates the database)
npm run db:migrate
# Equivalent to: prisma migrate dev

# Start the dev server
npm run dev
```

Open http://localhost:3000. If the database is empty (no `SiteConfig` row), you'll be redirected to `/_setup` to run the setup wizard.

## First deploy to Vercel

1. Push your repo to GitHub.
2. Import the project in the Vercel dashboard.
3. Add all required environment variables in Vercel's project settings.
4. Deploy. During the build, `prisma migrate deploy` runs automatically (see `package.json`'s `build` script).
5. Visit your production URL — you'll be redirected to `/_setup`.

## The setup wizard

The wizard runs once, at `/_setup`, and completes in five steps:

1. **Environment check** — confirms required variables are set; lists optional ones with what they gate.
2. **Admin account** — enter a username and email, then register a passkey (fingerprint, Face ID, or security key). No password at this step. The account is exempt from email verification.
3. **Admin path** — choose a secret URL prefix for the admin area. A suggestion is pre-filled (e.g. `lemon-4f8a2c`). Anyone who doesn't know this path gets a plain 404.
4. **Site essentials** — site name and timezone. Site URL is shown read-only (it comes from `SITE_URL`).
5. **Recovery code** — a single-use offline recovery code is generated and shown **once**. Save it somewhere safe (password manager, printed paper). Only a hash is stored.

When you click "I've saved it", the setup marks `setupCompleted = true` and redirects you to the admin dashboard.

## After setup

The site defaults to `comingSoon` status. To go live:

1. Go to **Settings → Site Status** and set it to **Live**.
2. Add optional credentials (email, media, GitHub) as needed — the dashboard shows a banner for each unconfigured feature.
