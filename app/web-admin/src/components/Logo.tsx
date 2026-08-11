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

/* Hand-drawn (not auto-traced) simplified Africa silhouette, straight-line
   points only so the path data stays easy to verify and adjust. Keeps the West
   Africa bulge and the Horn as the two recognisable features, plus Madagascar
   as a separate shape. Kept identical to mobile's src/components/Logo.tsx. */
const AFRICA_PATH =
  'M32 6 L48 3 L62 8 L68 14 L74 22 L88 26 L100 34 L86 40 L80 52 L84 60 L76 72 L68 84 L58 96 L50 104 L40 96 L32 84 L26 70 L20 60 L10 54 L0 48 L12 40 L8 28 L18 16 Z'
const MADAGASCAR_PATH = 'M80 78 Q86 82 84 90 Q80 95 77 89 Q75 82 80 78 Z'

/**
 * Afrizone logo mark: a Sea Buckthorn-orange Africa silhouette with a Deep Navy
 * shopping-cart glyph carrying goods, per the AfriZoneMart.com identity.
 *
 * `markTone="reversed"` swaps the continent to white for solid orange or navy
 * grounds, where the default orange fill has no contrast against the surface.
 * That switch is the reason this stays an inline SVG rather than an image asset:
 * a raster lockup would need a second file per ground, and would not stay crisp
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
        {/* Cart: handle, basket, three goods, two wheels.
            These coordinates are constrained, not chosen. Every point has to sit
            inside the continent polygon or the navy shows against the page
            instead of the orange. The first placement put the left wheel 2.5
            units outside the coastline at y=90, where the continent has narrowed
            toward its southern tip. Shifting the group +3x/-4y clears every
            point by at least 3.2 units. Check that before moving any of it. */}
        <path
          d="M69 34 L41 48"
          stroke="var(--navy)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M41 48 L67 48 L59 76 L34 76 Z" fill="var(--navy)" />
        <path
          d="M37 58 L63 58 M35 67 L61 67"
          stroke="#fff"
          strokeWidth="1.5"
          fill="none"
          opacity="0.5"
        />
        <rect x="35" y="40" width="6" height="8" rx="2" fill="var(--navy)" />
        <rect x="43" y="36" width="9" height="12" rx="2" fill="var(--navy)" />
        <rect x="54" y="38" width="8" height="10" rx="2" fill="var(--navy)" />
        <circle cx="42" cy="86" r="5.5" fill="var(--navy)" />
        <circle cx="56" cy="86" r="5.5" fill="var(--navy)" />
      </svg>
    </span>
  )
}

/**
 * The full AfriZoneMart.com lockup: mark, wordmark, tagline.
 *
 * The wordmark is one colour rather than the previous two-tone "Afrizone" plus
 * orange "Part Time", because the identity does not split it. "Part Time" no
 * longer appears in the interface at all.
 *
 * Composed in CSS rather than shipped as one fixed-aspect image so it can sit in
 * the 186px sidebar without the tagline shrinking to unreadable, which a 2.3:1
 * raster lockup would have done.
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
