import Link from 'next/link'

type Props = {
  siteName: string
}

export default function Nav({ siteName }: Props) {
  return (
    <header className="prickly-header">
      <nav className="prickly-nav">
        <Link href="/" className="prickly-logo">
          🌵 {siteName}
        </Link>
      </nav>
    </header>
  )
}
