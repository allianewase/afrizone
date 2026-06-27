import Logo from './Logo'
import './Splash.css'

/**
 * Branded full-screen boot splash — shown while the session hydrates (and as the
 * static boot screen in index.html, so there's no white flash before React).
 */
export default function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading Afrizone">
      <div className="splash-glow splash-glow-gold" aria-hidden="true" />
      <div className="splash-glow splash-glow-clay" aria-hidden="true" />
      <div className="splash-inner">
        <div className="splash-logo">
          <Logo size={56} tone="dark" tagline />
        </div>
        <div className="splash-spinner" aria-hidden="true" />
        <div className="splash-caption">Operations console</div>
      </div>
    </div>
  )
}
