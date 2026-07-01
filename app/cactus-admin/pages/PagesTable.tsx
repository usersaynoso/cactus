'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type PageRow = {
  id: string
  slug: string
  title: string
  status: string
  createdAt: Date
  updatedAt: Date
  createdBy: { username: string } | null
}

type Props = {
  pages: PageRow[]
  page: number
  totalPages: number
  adminPath: string
  canWrite: boolean
  canDelete: boolean
}

export default function PagesTable({ pages, page, totalPages, adminPath, canWrite, canDelete }: Props) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteModal, setDeleteModal] = useState<
    | { mode: 'single'; id: string; title: string }
    | { mode: 'bulk'; ids: string[] }
    | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const selectAllRef = useRef<HTMLInputElement>(null)

  const allSelected = pages.length > 0 && selectedIds.size === pages.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < pages.length

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pages.map((p) => p.id)))
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleDelete() {
    if (!deleteModal) return
    setLoading(true)
    setError('')
    try {
      if (deleteModal.mode === 'single') {
        const res = await fetch(`/api/admin/pages/${deleteModal.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Delete failed')
      } else {
        const res = await fetch('/api/admin/pages', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: deleteModal.ids }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Delete failed')
      }
      setDeleteModal(null)
      setSelectedIds(new Set())
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  const bulkCount = deleteModal?.mode === 'bulk' ? deleteModal.ids.length : 0

  return (
    <>
      {canDelete && selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {selectedIds.size} selected
          </span>
          <button
            className="btn btn-destructive btn-sm"
            onClick={() => setDeleteModal({ mode: 'bulk', ids: [...selectedIds] })}
          >
            Delete selected
          </button>
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {canDelete && (
                <th style={{ width: '2.5rem' }}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ accentColor: 'var(--color-primary)' }}
                    aria-label="Select all pages"
                  />
                </th>
              )}
              <th>Title</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Author</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pages.length === 0 && (
              <tr>
                <td
                  colSpan={canDelete ? 7 : 6}
                  style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}
                >
                  No pages yet
                </td>
              </tr>
            )}
            {pages.map((p) => (
              <tr key={p.id}>
                {canDelete && (
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleRow(p.id)}
                      style={{ accentColor: 'var(--color-primary)' }}
                      aria-label={`Select ${p.title}`}
                    />
                  </td>
                )}
                <td>
                  <strong>{p.title}</strong>
                </td>
                <td><code style={{ fontSize: '0.875rem' }}>{p.slug}</code></td>
                <td>
                  <span className={`badge ${p.status === 'published' ? 'badge-green' : 'badge-gray'}`}>
                    {p.status}
                  </span>
                </td>
                <td>{p.createdBy?.username ?? '—'}</td>
                <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {new Date(p.updatedAt).toLocaleDateString()}
                </td>
                <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <a
                    href={`/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    View
                  </a>
                  {canWrite && (
                    <Link href={`/${adminPath}/pages/${p.id}`} className="btn btn-secondary btn-sm">
                      Edit
                    </Link>
                  )}
                  {canDelete && (
                    <button
                      className="btn btn-destructive btn-sm"
                      onClick={() => setDeleteModal({ mode: 'single', id: p.id, title: p.title })}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          {page > 1 && <Link href={`?page=${page - 1}`}>←</Link>}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={`?page=${n}`} className={n === page ? 'current' : ''}>{n}</Link>
          ))}
          {page < totalPages && <Link href={`?page=${page + 1}`}>→</Link>}
        </div>
      )}

      {deleteModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !loading) setDeleteModal(null) }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%', margin: '1rem' }}>
            <h2 className="card-title">Are you sure?</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
              {deleteModal.mode === 'single'
                ? <>This will permanently delete &ldquo;{deleteModal.title}&rdquo;. This cannot be undone.</>
                : <>This will permanently delete {bulkCount === 1 ? '1 page' : `${bulkCount} pages`}. This cannot be undone.</>
              }
            </p>
            {error && (
              <p style={{ color: 'var(--color-destructive)', marginBottom: '1rem', fontSize: 'var(--text-sm)' }}>
                {error}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setDeleteModal(null); setError('') }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="btn btn-destructive"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading
                  ? 'Deleting…'
                  : deleteModal.mode === 'single'
                    ? 'Delete page'
                    : `Delete ${bulkCount === 1 ? '1 page' : `${bulkCount} pages`}`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
