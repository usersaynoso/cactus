'use client'

import { useState, useEffect } from 'react'

type SiteConfig = {
  siteName: string; tagline: string; description: string;
  timezone: string; locale: string; dateFormat: string; timeFormat: string;
  adminPath: string; status: string; hideFromCrawlers: boolean;
  publicRegistration: boolean; trustDeviceDays: number;
  emailFromName: string; emailFromAddress: string; emailProvider: string;
  imageProvider: string;
  comingSoonPageId: string; maintenancePageId: string;
  privacyPolicyPageId: string; termsPageId: string;
  sessionPurgeAfterDays: number; recoveryPurgeAfterDays: number;
}

type InfoPage = { id: string; title: string }

const TABS = ['general', 'branding', 'access', 'email', 'media', 'status', 'gdpr', 'integrations'] as const
type Tab = typeof TABS[number]

export default function ConfigPage() {
  const [tab, setTab] = useState<Tab>('general')
  const [config, setConfig] = useState<Partial<SiteConfig>>({})
  const [pages, setPages] = useState<InfoPage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/config').then((r) => r.json()),
      fetch('/api/admin/pages?perPage=100').then((r) => r.json()),
    ]).then(([cfg, pagesData]) => {
      setConfig(cfg)
      setPages(pagesData.pages ?? [])
      setLoading(false)
    }).catch(() => { setError('Failed to load config'); setLoading(false) })
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function set(key: keyof SiteConfig, value: unknown) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) return <p>Loading…</p>

  const tabLabels: Record<Tab, string> = {
    general: 'General', branding: 'Branding', access: 'Auth & Access',
    email: 'Email', media: 'Media', status: 'Site Status', gdpr: 'GDPR & Legal', integrations: 'Integrations',
  }

  const publishedPages = pages.filter((p: { id: string; title: string } & { status?: string }) => (p as { id: string; title: string; status?: string }).status === 'published' || true)

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e7eb', marginBottom: '2rem', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.625rem 1rem', border: 'none', background: 'none',
            borderBottom: t === tab ? '2px solid #16a34a' : '2px solid transparent',
            color: t === tab ? '#16a34a' : '#6b7280', fontWeight: t === tab ? 600 : 400,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9375rem', whiteSpace: 'nowrap',
          }}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div>
          <div className="field"><label>Site name</label><input value={config.siteName ?? ''} onChange={(e) => set('siteName', e.target.value)} /></div>
          <div className="field"><label>Tagline</label><input value={config.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} /></div>
          <div className="field"><label>Description</label><textarea value={config.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={3} /></div>
          <div className="field">
            <label>Timezone</label>
            <select value={config.timezone ?? 'UTC'} onChange={(e) => set('timezone', e.target.value)}>
              {['UTC','Europe/London','Europe/Paris','Europe/Berlin','America/New_York','America/Chicago','America/Los_Angeles','Asia/Tokyo','Australia/Sydney'].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Date format</label><input value={config.dateFormat ?? 'DD/MM/YYYY'} onChange={(e) => set('dateFormat', e.target.value)} /></div>
          <div className="field"><label>Time format</label><input value={config.timeFormat ?? 'HH:mm'} onChange={(e) => set('timeFormat', e.target.value)} /></div>
        </div>
      )}

      {tab === 'access' && (
        <div>
          <div className="field">
            <label>Admin path</label>
            <input value={config.adminPath ?? ''} onChange={(e) => set('adminPath', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
            <span className="field-hint">Changing this takes effect on next deploy (Edge Config update triggered automatically).</span>
          </div>
          <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.publicRegistration ?? true} onChange={(e) => set('publicRegistration', e.target.checked)} />
            Allow public registration
          </label>
          <div className="field">
            <label>Trust this browser (days)</label>
            <input type="number" min={1} max={365} value={config.trustDeviceDays ?? 28} onChange={(e) => set('trustDeviceDays', parseInt(e.target.value))} />
          </div>
        </div>
      )}

      {tab === 'email' && (
        <div>
          <div className="field"><label>From name</label><input value={config.emailFromName ?? ''} onChange={(e) => set('emailFromName', e.target.value)} /></div>
          <div className="field"><label>From address</label><input type="email" value={config.emailFromAddress ?? ''} onChange={(e) => set('emailFromAddress', e.target.value)} /></div>
          <div className="alert alert-info" style={{ fontSize: '0.875rem' }}>Email provider credentials (API keys, SMTP password) are set via environment variables, not here.</div>
        </div>
      )}

      {tab === 'status' && (
        <div>
          <div className="field">
            <label>Site status</label>
            <select value={config.status ?? 'comingSoon'} onChange={(e) => set('status', e.target.value)}>
              <option value="live">Live</option>
              <option value="comingSoon">Coming soon</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <div className="field">
            <label>Coming soon page</label>
            <select value={config.comingSoonPageId ?? ''} onChange={(e) => set('comingSoonPageId', e.target.value)}>
              <option value="">— Use default template —</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Maintenance page</label>
            <select value={config.maintenancePageId ?? ''} onChange={(e) => set('maintenancePageId', e.target.value)}>
              <option value="">— Use default template —</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.hideFromCrawlers ?? true} onChange={(e) => set('hideFromCrawlers', e.target.checked)} />
            Hide from search engines (noindex)
          </label>
        </div>
      )}

      {tab === 'gdpr' && (
        <div>
          <div className="field">
            <label>Privacy policy page</label>
            <select value={config.privacyPolicyPageId ?? ''} onChange={(e) => set('privacyPolicyPageId', e.target.value)}>
              <option value="">— Not set —</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Terms of service page</label>
            <select value={config.termsPageId ?? ''} onChange={(e) => set('termsPageId', e.target.value)}>
              <option value="">— Not set —</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Purge expired sessions after (days)</label>
            <input type="number" min={1} max={365} value={config.sessionPurgeAfterDays ?? 30} onChange={(e) => set('sessionPurgeAfterDays', parseInt(e.target.value))} />
          </div>
          <div className="field">
            <label>Purge unused recovery requests after (days)</label>
            <input type="number" min={1} max={30} value={config.recoveryPurgeAfterDays ?? 7} onChange={(e) => set('recoveryPurgeAfterDays', parseInt(e.target.value))} />
          </div>
        </div>
      )}

      {tab === 'integrations' && (
        <div>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>GitHub API</h3>
            <p style={{ fontSize: '0.9375rem', color: '#6b7280' }}>
              {process.env.NEXT_PUBLIC_GITHUB_CONFIGURED === 'true'
                ? '✓ Configured — module/theme installs enabled'
                : '✗ GITHUB_API_TOKEN not set — install/update buttons disabled'}
            </p>
          </div>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Vercel</h3>
            <p style={{ fontSize: '0.9375rem', color: '#6b7280' }}>
              Credentials are set via environment variables. Edge Config writes and deployment status checks depend on VERCEL_API_TOKEN and VERCEL_PROJECT_ID.
            </p>
          </div>
        </div>
      )}

      {(tab === 'branding' || tab === 'media') && (
        <div className="alert alert-info">
          {tab === 'branding'
            ? 'Logo and favicon upload requires media (B2 + Cloudflare Worker) to be configured first.'
            : 'Media provider: Backblaze B2. Credentials are set via environment variables (B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, etc.).'}
        </div>
      )}
    </div>
  )
}
