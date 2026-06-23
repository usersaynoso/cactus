import Nav from './Nav'
import Footer from './Footer'

type Props = {
  children: React.ReactNode
  siteName?: string
  privacyPolicySlug?: string | null
  termsSlug?: string | null
}

export default function PricklyLayout({
  children,
  siteName = 'Cactus',
  privacyPolicySlug,
  termsSlug,
}: Props) {
  return (
    <div className="prickly-shell">
      <Nav siteName={siteName} />
      <main className="prickly-main">{children}</main>
      <Footer
        siteName={siteName}
        privacyPolicySlug={privacyPolicySlug}
        termsSlug={termsSlug}
      />
    </div>
  )
}
