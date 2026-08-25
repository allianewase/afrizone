/**
 * Renders a stored KYC/credential document that cannot be fetched by the
 * browser on its own.
 *
 * `<img src>` cannot send an Authorization header, and this route is
 * ownership-checked rather than public - so the bytes are fetched with the
 * app's token and handed to the tag as an object URL.
 *
 * Extracted from Workers.tsx when the credential review desk needed the same
 * thing. Two copies of this would drift, and the half that drifts is always
 * the PDF branch, which is the half that matters: a reviewer being shown a
 * broken image instead of the certificate they are judging is exactly the
 * failure this component exists to prevent.
 */
import { useEffect, useState } from 'react'
import { fetchAuthedObjectUrl } from '../../api/client'
import Icon from '../Icon'

export default function AuthedImage({
  url,
  alt,
  style,
  onClick,
  variant = 'thumb',
}: {
  url: string
  alt: string
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent) => void
  /** 'full' renders a PDF inline so it can actually be read; 'thumb' badges it. */
  variant?: 'thumb' | 'full'
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [mime, setMime] = useState<string>('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let created: string | null = null
    setObjectUrl(null)
    setMime('')
    setFailed(false)
    fetchAuthedObjectUrl(url)
      .then(({ url: objUrl, type }) => {
        if (cancelled) {
          URL.revokeObjectURL(objUrl)
          return
        }
        created = objUrl
        setObjectUrl(objUrl)
        setMime(type)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [url])

  if (failed) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', color: 'var(--muted)', fontSize: 11 }}>
        Failed to load
      </div>
    )
  }
  if (!objectUrl) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)' }}>
        <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
      </div>
    )
  }
  // A PDF cannot go in an <img> - it renders as a broken image. Documents may
  // now be PDFs (CVs, certificates), so show an openable placard instead.
  if (mime === 'application/pdf') {
    // In the lightbox, render it so the admin can actually read the document
    // they are being asked to verify.
    if (variant === 'full') {
      return (
        <iframe
          src={objectUrl}
          title={alt}
          onClick={onClick}
          style={{ ...style, width: '90vw', height: '88vh', border: 'none', background: '#fff' }}
        />
      )
    }
    return (
      <div
        style={{
          ...style,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: 'var(--bg2)',
          color: 'var(--muted)',
          cursor: onClick ? 'pointer' : 'default',
        }}
        onClick={onClick}
      >
        <Icon name="file" size={22} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>PDF</span>
      </div>
    )
  }
  return <img src={objectUrl} alt={alt} style={style} onClick={onClick} />
}
