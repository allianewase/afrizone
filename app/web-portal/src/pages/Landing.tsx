import { Link } from 'react-router-dom'
import type { AccountType } from '../lib/types'
import Logo from '../components/Logo'
import './Landing.css'

/**
 * The front door of the Part-Time portal.
 *
 * The whole page is one question — "how will you use Afrizone Part Time?" —
 * because the three answers genuinely diverge afterwards: a store signs in at a
 * counter and works orders, a courier company manages riders, and an individual
 * belongs on the mobile app rather than here at all.
 *
 * WHAT THE CHOICE DOES NOT DO: it does not decide which dashboard anybody
 * lands on. That comes from the account type stored on the server (see
 * lib/auth.tsx). Someone who taps the wrong card and then signs in arrives
 * where their account actually belongs, with no correction and no dead end.
 * Which is also why "Sign in" sits outside the three cards - you do not have to
 * declare what you are in order to log in.
 */

interface Option {
  key: AccountType
  title: string
  blurb: string
  bullets: string[]
  /** Individuals are pointed at the app instead of a registration form. */
  cta: string
  to: string
  glyph: JSX.Element
}

const OPTIONS: Option[] = [
  {
    key: 'INDIVIDUAL',
    title: 'Individual',
    blurb: 'You pick up tasks and get paid for the work you do.',
    bullets: ['Find and accept tasks', 'Submit proof of work', 'Track your earnings'],
    cta: 'Continue',
    to: '/individual',
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.5 20c0-4.1 3.4-6.4 7.5-6.4s7.5 2.3 7.5 6.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'STORE',
    title: 'AfriZoneMart Store',
    blurb: 'Your shop fulfils orders placed by AfriZoneMart customers.',
    bullets: ['Receive and confirm orders', 'Prepare and hand over', 'Track what you are owed'],
    cta: 'Continue',
    to: '/register/STORE',
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M3.6 9.2 5 4.5h14l1.4 4.7" strokeLinejoin="round" />
        <path d="M3.6 9.2h16.8v2.1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-4.8 2.4Z" strokeLinejoin="round" />
        <path d="M5.2 13.6V20h13.6v-6.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'COURIER',
    title: 'Courier / Dispatch',
    blurb: 'You deliver orders, on your own or with a courier company.',
    bullets: ['Accept delivery jobs', 'Pick up and drop off', 'Confirm with the customer'],
    cta: 'Continue',
    to: '/register/COURIER',
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="5.6" cy="17.2" r="3" />
        <circle cx="18.4" cy="17.2" r="3" />
        <path d="M8.6 17.2h6.2l-2.4-7.4H9.6" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M12.4 9.8 14 6.4h3" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    ),
  },
]

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-top">
        <Logo size={34} className="lp-brand" />
        <Link className="lp-signin" to="/signin">
          Sign in
        </Link>
      </header>

      <main className="lp-main">
        <div className="lp-intro">
          <p className="lp-eyebrow">Get started</p>
          <h1>How will you use AfriZone Part Time?</h1>
          <p className="lp-sub">
            Pick the one that describes you. It sets up the right account and takes you to the right
            place — you can always talk to us if that changes.
          </p>
        </div>

        <div className="lp-cards">
          {OPTIONS.map((o) => (
            <Link key={o.key} to={o.to} className="lp-card">
              <span className="lp-glyph" aria-hidden="true">
                {o.glyph}
              </span>
              <h2>{o.title}</h2>
              <p className="lp-blurb">{o.blurb}</p>
              <ul className="lp-bullets">
                {o.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <span className="lp-cta">
                {o.cta}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
          ))}
        </div>

        {/* Afrizone's own people do not belong in this list - they are not an
            outside party, and their console is a different application with a
            different sign-in. Saying so here saves a support ticket. */}
        <p className="lp-staff">
          Afrizone staff sign in on the <span>admin console</span>, not here.
        </p>
      </main>
    </div>
  )
}
