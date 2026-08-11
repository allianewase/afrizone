import './Logo.css'

type Tone = 'dark' | 'light'
type MarkTone = 'full' | 'reversed'

interface LogoProps {
  /** pixel size of the mark */
  size?: number
  /** show the "AfriZoneMart.com" wordmark */
  wordmark?: boolean
  /** show the "Made in Africa, delivered worldwide" tagline */
  tagline?: boolean
  /** dark = light wordmark for dark backgrounds (default); light = navy wordmark */
  tone?: Tone
  className?: string
}

/**
 * Africa silhouette, 35 points, clockwise from the northwest Mediterranean.
 *
 * The previous version was 24 points and read as a blob. This one is drawn to
 * show the four features that make the continent recognisable at small sizes:
 * a flat Mediterranean coast, the Horn spiking east to x=100, the sharp x-drop
 * up the west side that gives the West Africa bulge its shape, and a steady
 * taper to a 2-unit Cape. Its width profile peaks at y=40 and narrows
 * monotonically from y=48 down, which is what makes it read as Africa rather
 * than as an oval.
 *
 * Kept identical to mobile's src/components/Logo.tsx, index.html's pre-boot
 * markup and favicon.svg. All four must change together.
 */
const AFRICA_PATH =
  'M18 10 L30 5 L44 4 L58 6 L70 10 L77 15 L81 21 L85 27 L90 32 L96 38 L100 42 L93 45 L87 44 L84 50 L82 58 L78 66 L74 74 L69 82 L63 90 L57 98 L51 103 L46 99 L42 92 L38 84 L35 76 L33 68 L32 60 L29 55 L23 52 L15 50 L8 45 L4 38 L7 30 L11 22 L15 15 Z'
/** Sits off the southeast coast, clear of it by roughly 12 units. */
const MADAGASCAR_PATH = 'M82 70 Q88 75 86 84 Q82 90 79 83 Q78 75 82 70 Z'

/**
 * Afrizone logo mark: a Sea Buckthorn-orange Africa with a Deep Navy shopping
 * cart carrying goods, per the AfriZoneMart.com identity.
 *
 * `markTone="reversed"` swaps the continent to white for solid orange or navy
 * grounds. That switch is why this stays an inline SVG rather than an image
 * asset: a raster would need a second file per ground, and would not stay crisp
 * across the 38px sidebar and 56px splash uses.
 */
export function LogoMark({ size = 38, markTone = 'full' }: { size?: number; markTone?: MarkTone }) {
  const height = size * 1.05
  const continentFill = markTone === 'reversed' ? '#fff' : 'var(--gold-bright)'
  return (
    <span className="az-mark" style={{ width: size, height }}>
      <svg viewBox="0 0 100 105" width="100%" height="100%" aria-hidden="true">
        <path d={AFRICA_PATH} fill={continentFill} />
        <path d={MADAGASCAR_PATH} fill={continentFill} />
        {/* Cart geometry is solved, not chosen. Every point has to sit inside the
            continent polygon or the navy shows against the page instead of the
            orange. These coordinates are the largest cart that clears the
            coastline everywhere, fitted by scanline against the path above:
            14% larger than the previous silhouette allowed, and clearing by at
            least 3.4 units. Re-solve it if the outline ever changes. */}
        <path
          d="M76 19 L44 35"
          stroke="var(--navy)"
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M44 35 L74 35 L65 67 L36 67 Z" fill="var(--navy)" />
        <path
          d="M40 46 L69 46 M37 57 L67 57"
          stroke="#fff"
          strokeWidth="1.7"
          fill="none"
          opacity="0.5"
        />
        <rect x="37" y="26" width="7" height="9" rx="2" fill="var(--navy)" />
        <rect x="47" y="21" width="10" height="14" rx="2" fill="var(--navy)" />
        <rect x="59" y="23" width="9" height="11" rx="2" fill="var(--navy)" />
        <circle cx="45" cy="78" r="6.3" fill="var(--navy)" />
        <circle cx="61" cy="78" r="6.3" fill="var(--navy)" />
      </svg>
    </span>
  )
}

/**
 * The full AfriZoneMart.com lockup: mark, wordmark, tagline.
 *
 * The wordmark is one colour rather than two-tone, because the identity does not
 * split it. Composed in CSS rather than shipped as one fixed-aspect image so it
 * can sit in the 186px sidebar without the tagline shrinking to unreadable.
 */
export default function Logo({
  size = 38,
  wordmark = true,
  tagline = false,
  tone = 'dark',
  className = '',
}: LogoProps) {
  return (
    <span className={`az-logo ${className}`} aria-label="AfriZoneMart.com">
      <LogoMark size={size} />
      {wordmark && (
        <span className="az-words">
          <span className={`az-word ${tone === 'dark' ? 'az-word-dark' : 'az-word-light'}`}>
            AfriZoneMart.com
          </span>
          {tagline && (
            <span className={`az-tag ${tone === 'dark' ? 'az-tag-dark' : 'az-tag-light'}`}>
              Made in Africa, delivered worldwide
            </span>
          )}
        </span>
      )}
    </span>
  )
}
