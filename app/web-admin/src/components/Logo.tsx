import './Logo.css'

type Tone = 'dark' | 'light'
type MarkTone = 'full' | 'reversed'

interface LogoProps {
  /** pixel width of the mark */
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
 * Intrinsic aspect of the artwork, 107x113. Used to derive height from `size`
 * so the mark never distorts. See docs/design-decisions.md.
 */
const MARK_ASPECT = 107 / 113

/**
 * The ladder in `srcSet` exists so the browser never has to reduce the mark by
 * an awkward ratio. At the 38px sidebar it picks the 76w file and halves it
 * exactly, or uses it 1:1 on a 2x screen. Scaling 107 to 38 directly is a 2.8x
 * reduction and it read as muddy. The variants are resampled in linear light
 * with premultiplied alpha, which the browser does not do.
 */

/**
 * Afrizone logo mark: the real AfriZoneMart.com artwork, cropped from the
 * brand asset rather than redrawn.
 *
 * `markTone="reversed"` swaps to the variant whose continent is white, for
 * grounds that clash with the orange. The cart sits inside the continent, so
 * the default works on light, sand and navy alike.
 *
 * The same two files back mobile, index.html and the favicon. All must change
 * together.
 */
export function LogoMark({ size = 38, markTone = 'full' }: { size?: number; markTone?: MarkTone }) {
  const height = Math.round(size / MARK_ASPECT)
  const stem = markTone === 'reversed' ? 'logo-mark-reversed' : 'logo-mark'
  return (
    <span className="az-mark" style={{ width: size, height }}>
      <img
        src={`/${stem}.png`}
        srcSet={`/${stem}-76.png 76w, /${stem}-92.png 92w, /${stem}.png 107w`}
        sizes={`${size}px`}
        width={size}
        height={height}
        alt=""
        aria-hidden="true"
        decoding="async"
      />
    </span>
  )
}

/**
 * The full AfriZoneMart.com lockup: mark, wordmark, tagline.
 *
 * Composed rather than shipped as one lockup image. The brand asset carries no
 * tagline, and a fixed 2.4:1 lockup would shrink the wordmark inside the 186px
 * sidebar. Composing also keeps the wordmark as live text, which the source
 * renders single-colour navy exactly as this does.
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
