export async function verifyTurnstile(token?: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  if (!secretKey) {
    // Turnstile not configured — fail open (rate limiting still applies)
    return true
  }

  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretKey, response: token }),
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return false
    const data = (await res.json()) as { success: boolean }
    return data.success === true
  } catch {
    // Turnstile IS configured here, so a network error/timeout must fail
    // closed — rate limiting is the only other gate against bots, and
    // failing open would let an attacker who can induce timeouts disable
    // the bot check entirely.
    return false
  }
}
