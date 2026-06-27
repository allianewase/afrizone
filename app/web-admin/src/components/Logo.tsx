import './Logo.css'

type Tone = 'dark' | 'light'

interface LogoProps {
  /** pixel size of the square mark */
  size?: number
  /** show the "Afrizone Part Time" wordmark */
  wordmark?: boolean
  /** show the "Made in Africa, delivered worldwide" tagline */
  tagline?: boolean
  /** dark = light wordmark for dark backgrounds (default); light = navy wordmark */
  tone?: Tone
  className?: string
}

/**
 * Afrizone Part Time logo — navy rounded-square mark with a bold gold "A",
 * two-tone "Afrizone Part Time" wordmark, optional tagline.
 */
export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <span className="az-mark" style={{ width: size, height: size, borderRadius: size * 0.3 }}>
      <svg viewBox="0 0 100 100" width="68%" height="68%" aria-hidden="true">
        <path
          d="M26 79 L50 23 L74 79"
          fill="none"
          stroke="var(--gold-bright)"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M37 60 H63" fill="none" stroke="var(--gold-bright)" strokeWidth="12" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export default function Logo({
  size = 38,
  wordmark = true,
  tagline = false,
  tone = 'dark',
  className = '',
}: LogoProps) {
  return (
    <span className={`az-logo ${className}`} aria-label="Afrizone Part Time">
      <LogoMark size={size} />
      {wordmark && (
        <span className="az-words">
          <span className="az-word">
            <span className={tone === 'dark' ? 'az-afri-dark' : 'az-afri-light'}>Afrizone</span>
            <span className="az-part">Part&nbsp;Time</span>
          </span>
          {tagline && <span className="az-tag">Made in Africa, delivered worldwide</span>}
        </span>
      )}
    </span>
  )
}
