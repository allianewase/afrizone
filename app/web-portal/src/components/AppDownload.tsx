import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * The Android build a real person can actually install.
 *
 * HARD-CODED, AND IT HAS TO BE UPDATED WITH EVERY RELEASE. EAS gives each
 * build its own artifact URL; there is no "latest" address to point at.
 * Putting it in the code rather than an env var is deliberate — a stale link
 * is then visible in the diff of whichever commit shipped it, instead of
 * being a dashboard setting nobody remembers exists.
 */
export const ANDROID_APK =
  'https://expo.dev/artifacts/eas/a8UGAMNz1InkCJegYphv9JU8_3VdX0MVm-y2VHkMeac.apk'

/**
 * A QR code for the same link, generated client-side.
 *
 * WHY THIS EXISTS. The realistic way this app reaches a courier is not
 * someone typing a 78-character expo.dev URL into a phone browser — it is
 * someone showing them a screen, or a printed flyer taped to a counter, to
 * scan. A typed link is friction the person handing this over does not need.
 *
 * GENERATED LOCALLY, NOT VIA AN IMAGE-GENERATION API. The common shortcut is
 * an <img src="https://api.qrserver.com/..."> pointed at a third-party
 * service — which means every phone that renders this card leaks the
 * download link (and, incidentally, that someone is looking at Afrizone's
 * courier onboarding page) to that service, and the code stops rendering the
 * moment that service is slow, down, or blocked. `qrcode` renders an SVG
 * string in the browser from the URL alone: no network call, no dependency
 * on anything but the link already being right there in this bundle.
 */
export function AppQr({ size = 156 }: { size?: number }) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toString(ANDROID_APK, {
      type: 'svg',
      margin: 1,
      // 'M' (15% recoverable) rather than the library's 'L' default: this is
      // headed for a printed flyer as often as a screen, and a crease or a
      // bad-angle phone camera should not make it unscannable.
      errorCorrectionLevel: 'M',
      color: { dark: '#2c2c2c', light: '#ffffff' },
    })
      .then((s) => {
        if (!cancelled) setSvg(s)
      })
      .catch(() => {
        // No fallback needed: the text link sits right next to this in every
        // caller, so a QR code that fails to render loses nothing but the
        // convenience.
        if (!cancelled) setSvg(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!svg) return null
  return (
    <div
      className="app-qr"
      style={{ width: size, height: size }}
      // The SVG string comes from the `qrcode` package's own encoder, run on
      // a hard-coded constant above — never on anything a user can influence.
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-hidden="true"
    />
  )
}
