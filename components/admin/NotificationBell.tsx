'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  adminPath: string
  unreadCount?: number
  collapsed?: boolean
}

export default function NotificationBell({ adminPath, unreadCount = 0, collapsed }: Props) {
  const pathname = usePathname()
  const base = `/${adminPath}`
  const href = `${base}/notifications`
  const isActive = pathname === href || pathname.startsWith(href)

  const label = unreadCount > 0
    ? `Notifications (${unreadCount} unread)`
    : 'Notifications'

  return (
    <Link
      href={href}
      className={[
        'admin-sidebar-bell',
        collapsed ? '' : 'admin-sidebar-bell--inline',
        isActive ? 'active' : '',
      ].filter(Boolean).join(' ')}
      title={label}
      aria-label={label}
    >
      <span aria-hidden="true">🔔</span>
      {unreadCount > 0 && (
        <span className="admin-sidebar-bell-count">{unreadCount}</span>
      )}
    </Link>
  )
}
