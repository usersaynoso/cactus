# Self-hosting and operations

## Database backups

Cactus is stateful in two places: PostgreSQL and your Backblaze B2 bucket. Back both up.

**Recommended approach for PostgreSQL on Neon or Supabase:**

- Enable Point-in-Time Recovery (PITR) — both providers offer it on paid plans. PITR lets you restore to any second in the past within your retention window, which is far more useful than a daily snapshot when debugging a bad migration.
- For self-hosted Postgres: use `pg_dump` scheduled via cron, ship the dump to an off-server location (another cloud storage bucket), and test restores occasionally.

**B2 media:**

- Backblaze B2 supports bucket replication to a second region. Enable it for production.
- If you delete a media file via the admin, it's gone from B2 immediately. There's no soft-delete or trash. Your B2 backup is the recovery path.

## Stale-row cleanup

Expired tokens accumulate in the database over time. Cactus doesn't run a background job, but the cleanup is a single query that's fast to run from a cron job or Vercel scheduled function:

```sql
-- Sessions expired more than N days ago (default: 30)
DELETE FROM "Session" WHERE "expiresAt" < NOW() - INTERVAL '30 days';

-- Unused recovery requests older than N days (default: 7)
DELETE FROM "RecoveryRequest" WHERE "expiresAt" < NOW() - INTERVAL '7 days' AND used = false;

-- Expired trusted devices
DELETE FROM "TrustedDevice" WHERE "expiresAt" < NOW();

-- Expired WebAuthn challenges (should be very short-lived)
DELETE FROM "WebAuthnChallenge" WHERE "expiresAt" < NOW();

-- Stale rate-limit windows
DELETE FROM "RateLimit" WHERE "windowStart" < NOW() - INTERVAL '1 hour';
```

The retention periods are configurable on the GDPR & Legal tab of the config page. Schedule the cleanup SQL with your Postgres provider's scheduled jobs feature, a Vercel Cron job, or an external cron.

## What to monitor

- **Database connection pool saturation** — watch `pg_stat_activity` or your provider's pool metrics. If you're near the limit, check `DATABASE_URL` is a pooled connection string.
- **Vercel function errors** — set `SENTRY_DSN` for structured error tracking. Without it, errors go to Vercel's function logs only.
- **Failed modules/themes** — the Modules/Themes admin page shows any item stuck in `failed` status with the error message.
- **Deploy lock stuck** — if a deploy fails uncleanly, `DeployLock` may remain set. Clear it:
  ```sql
  DELETE FROM "DeployLock" WHERE id = 'singleton';
  ```

## Admin recovery procedures

### Lost passkey, recovery code available

1. Go to `/<adminPath>/login`.
2. Click **Lost access?**.
3. Enter your email and the offline recovery code.
4. Optionally set a new password.
5. After signing in, register a new passkey from **Account settings**.

### Lost passkey, no recovery code, email configured

1. Go to `/<adminPath>/login` → **Lost access?**.
2. Click **Email me a recovery link** (visible when email is configured).
3. Check your email, click the link (expires in 30 minutes).
4. Register a new passkey and/or set a new password.

### Completely locked out (no passkey, no code, email not configured or inbox compromised)

This is a database intervention:

1. Connect to your PostgreSQL database.
2. Generate a new `bcrypt` hash for a temporary password:
   ```bash
   node -e "const b = require('bcryptjs'); b.hash('TempPass123!', 12).then(console.log)"
   ```
3. Update the admin user's `passwordHash`:
   ```sql
   UPDATE "User" SET "passwordHash" = '<hash>' WHERE email = 'you@example.com';
   ```
4. Add email credentials to your environment variables (if not already set).
5. Sign in via the password fallback, register a new passkey.
6. Remove the temporary password from account settings once your passkey is registered.

### Last admin account accidentally deleted

1. Connect to PostgreSQL.
2. Find the Admin role:
   ```sql
   SELECT id FROM "Role" WHERE "isProtected" = true;
   ```
3. Assign it to an existing user:
   ```sql
   UPDATE "User" SET "roleId" = '<admin-role-id>' WHERE email = 'you@example.com';
   ```

## Module migration failures

If a module migration fails during a build, the build will fail and Vercel will not deploy. The previous deployment stays live. To diagnose:

1. Check Vercel's build logs for the `[module-migrations]` lines.
2. Fix the SQL in your module's migrations folder.
3. If the broken migration was partially applied, you may need to roll it back manually in the database before retrying.
4. Commit the fix and push — this triggers a new build.

## Upgrading Cactus core

Cactus core upgrades are `npm update next @prisma/client prisma` (and other dependencies), followed by a new `prisma migrate dev` if the schema changed, then push. The module migration runner runs before `next build` and is unaffected by core upgrades.

## Environment variable changes

Adding or changing an environment variable requires either:
- A new Vercel deployment (for most variables), or
- Just saving in Vercel's project settings (for variables that aren't compiled into the build, like `DATABASE_URL`)

After changing `SITE_URL`, you **must** also re-register all passkeys — credentials are bound to the relying party ID (the domain). There is no automated migration for this.
