'use client'

import { useState, useEffect } from 'react'
import type { EnvVarStatus } from '@/lib/config/env'

type Step = 'env' | 'account' | 'adminPath' | 'essentials' | 'recovery'

type EnvCheckData = {
  required: EnvVarStatus[]
  optional: EnvVarStatus[]
  missingRequired: string[]
}

export default function SetupPage() {
  const [step, setStep] = useState<Step>('env')
  const [envData, setEnvData] = useState<EnvCheckData | null>(null)
  const [adminPath, setAdminPath] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Account fields
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [passkeyRegistered, setPasskeyRegistered] = useState(false)
  const [userId, setUserId] = useState('')

  // Essentials
  const [siteName, setSiteName] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  const steps: Step[] = ['env', 'account', 'adminPath', 'essentials', 'recovery']
  const stepIndex = steps.indexOf(step)

  // ── Step 1: Environment check ──────────────────────────────────────────────
  useEffect(() => {
    if (step === 'env') {
      fetch('/api/setup/env-check')
        .then((r) => r.json())
        .then((d: EnvCheckData) => setEnvData(d))
        .catch(() => setError('Failed to load environment status'))
    }
  }, [step])

  // ── Step 2: Register passkey ───────────────────────────────────────────────
  async function handleCreateAccount() {
    setError('')
    setLoading(true)
    try {
      // 1. Create the admin user row
      const res = await fetch('/api/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to create account')
      }
      const { userId: uid } = await res.json()
      setUserId(uid)

      // 2. Register passkey
      const { startRegistration } = await import('@simplewebauthn/browser')
      const optRes = await fetch('/api/auth/passkey/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid }),
      })
      const opts = await optRes.json()
      const attestation = await startRegistration({ optionsJSON: opts })

      const verifyRes = await fetch('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, attestation }),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json()
        throw new Error(d.error ?? 'Passkey registration failed')
      }

      setPasskeyRegistered(true)
      setStep('adminPath')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Set admin path ─────────────────────────────────────────────────
  useEffect(() => {
    if (step === 'adminPath') {
      fetch('/api/setup/suggest-path')
        .then((r) => r.json())
        .then((d: { path: string }) => setAdminPath(d.path))
        .catch(() => {})
    }
  }, [step])

  async function handleAdminPath() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/setup/set-admin-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPath }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Invalid admin path')
      }
      setStep('essentials')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 4: Site essentials ────────────────────────────────────────────────
  async function handleEssentials() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/setup/essentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName, timezone }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to save settings')
      }
      setStep('recovery')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 5: Recovery code ──────────────────────────────────────────────────
  useEffect(() => {
    if (step === 'recovery') {
      fetch('/api/setup/recovery-code', { method: 'POST' })
        .then((r) => r.json())
        .then((d: { code: string }) => setRecoveryCode(d.code))
        .catch(() => setError('Failed to generate recovery code'))
    }
  }, [step])

  async function handleFinish() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/setup/complete', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to complete setup')
      const { adminPath: ap } = await res.json()
      // Redirect into the admin area
      window.location.href = `/${ap}`
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="setup-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ width: 36, height: 36, background: '#16a34a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.25rem' }}>🌵</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>Cactus Setup</div>
          <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>Step {stepIndex + 1} of {steps.length}</div>
        </div>
      </div>

      <div className="setup-steps" style={{ marginBottom: '2rem' }}>
        {steps.map((s, i) => (
          <div
            key={s}
            className={`setup-step ${i < stepIndex ? 'done' : i === stepIndex ? 'active' : ''}`}
          />
        ))}
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* ── Step: ENV CHECK ── */}
      {step === 'env' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Environment check</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            Cactus needs a few environment variables before it can start.
          </p>
          {!envData ? (
            <p>Checking…</p>
          ) : (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Required</div>
                {envData.required.map((v) => (
                  <div key={v.name} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ color: v.set ? '#16a34a' : '#dc2626', fontWeight: 700, flexShrink: 0 }}>{v.set ? '✓' : '✗'}</span>
                    <div>
                      <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{v.name}</code>
                      <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{v.description}</div>
                    </div>
                  </div>
                ))}
              </div>
              {envData.optional.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Optional</div>
                  {envData.optional.map((v) => (
                    <div key={v.name} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ color: v.set ? '#16a34a' : '#9ca3af', flexShrink: 0 }}>{v.set ? '✓' : '○'}</span>
                      <div>
                        <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{v.name}</code>
                        {!v.set && v.gates && (
                          <div style={{ fontSize: '0.8125rem', color: '#d97706' }}>Disabled: {v.gates}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {envData.missingRequired.length > 0 ? (
                <div className="alert alert-danger">
                  Missing required variables: <strong>{envData.missingRequired.join(', ')}</strong>. Add them to your <code>.env.local</code> file and restart.
                </div>
              ) : (
                <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => setStep('account')}>
                  Continue →
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Step: ADMIN ACCOUNT ── */}
      {step === 'account' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Create your admin account</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            You'll register a passkey (fingerprint, Face ID, or security key) as your primary login method.
          </p>
          {!passkeyRegistered ? (
            <>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. alice" autoComplete="username" />
                <span className="field-hint">Your public-facing handle. Used in bylines, not for login.</span>
              </div>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                <span className="field-hint">Used for account recovery if you add email credentials later.</span>
              </div>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={!username || !email || loading}
                onClick={handleCreateAccount}
              >
                {loading ? 'Registering…' : 'Register passkey →'}
              </button>
            </>
          ) : (
            <div className="alert alert-success">Passkey registered successfully!</div>
          )}
        </div>
      )}

      {/* ── Step: ADMIN PATH ── */}
      {step === 'adminPath' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Choose your admin path</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            This is the secret URL prefix for your admin area. Anyone who doesn't know it gets a plain 404.
          </p>
          <div className="field">
            <label htmlFor="adminPath">Admin path</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span style={{ padding: '0.5rem 0.75rem', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.9375rem', color: '#6b7280', flexShrink: 0 }}>
                {typeof window !== 'undefined' ? window.location.hostname : 'yourdomain.com'}/
              </span>
              <input
                id="adminPath"
                value={adminPath}
                onChange={(e) => setAdminPath(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="lemon-4f8a2c"
                style={{ flex: 1 }}
              />
            </div>
            <span className="field-hint">Lowercase letters, numbers, and hyphens only.</span>
          </div>
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={!adminPath || loading}
            onClick={handleAdminPath}
          >
            {loading ? 'Saving…' : 'Set admin path →'}
          </button>
        </div>
      )}

      {/* ── Step: ESSENTIALS ── */}
      {step === 'essentials' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Site essentials</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            A few basics to get your site ready.
          </p>
          <div className="field">
            <label htmlFor="siteName">Site name</label>
            <input id="siteName" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="My Cactus Site" />
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Europe/Paris">Europe/Paris</option>
              <option value="Europe/Berlin">Europe/Berlin</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Denver">America/Denver</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
              <option value="Asia/Shanghai">Asia/Shanghai</option>
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="Australia/Sydney">Australia/Sydney</option>
            </select>
          </div>
          <div className="alert alert-info" style={{ fontSize: '0.875rem' }}>
            <strong>Site URL:</strong> <code>{typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin : ''}</code><br />
            This is read from <code>SITE_URL</code> and is the WebAuthn relying party ID. It cannot be changed here.
          </div>
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={!siteName || loading}
            onClick={handleEssentials}
          >
            {loading ? 'Saving…' : 'Continue →'}
          </button>
        </div>
      )}

      {/* ── Step: RECOVERY CODE ── */}
      {step === 'recovery' && (
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Save your recovery code</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            If you lose access to your passkey, this code is your only way back in. It's single-use. <strong>Save it somewhere safe offline before continuing.</strong>
          </p>
          {!recoveryCode ? (
            <p>Generating…</p>
          ) : (
            <>
              <div style={{
                fontFamily: 'monospace',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: '1rem',
                fontSize: '0.9375rem',
                wordBreak: 'break-all',
                marginBottom: '1rem',
                userSelect: 'all',
              }}>
                {recoveryCode}
              </div>
              <div className="alert alert-warning" style={{ fontSize: '0.875rem' }}>
                This code is shown once and is not stored in plain text. Copy it now.
              </div>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={loading}
                onClick={handleFinish}
              >
                {loading ? 'Finishing…' : "I've saved it — go to admin →"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
