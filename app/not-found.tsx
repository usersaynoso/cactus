export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '4rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#111827' }}>404</h1>
        <p style={{ color: '#6b7280', fontSize: '1.125rem', margin: 0 }}>This page doesn't exist.</p>
      </div>
    </main>
  )
}
