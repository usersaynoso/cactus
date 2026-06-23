import Link from 'next/link'

type Props = {
  siteName: string
  privacyPolicySlug?: string | null
  termsSlug?: string | null
}

export default function Footer({ siteName, privacyPolicySlug, termsSlug }: Props) {
  return (
    <footer className="prickly-footer">
      <div className="prickly-footer-inner">
        <span style={{ color: '#9ca3af' }}>
          © {new Date().getFullYear()} {siteName}
        </span>
        {(privacyPolicySlug || termsSlug) && (
          <div className="prickly-footer-links">
            {privacyPolicySlug && (
              <Link href={`/${privacyPolicySlug}`}>Privacy Policy</Link>
            )}
            {termsSlug && (
              <Link href={`/${termsSlug}`}>Terms of Service</Link>
            )}
          </div>
        )}
      </div>
    </footer>
  )
}
