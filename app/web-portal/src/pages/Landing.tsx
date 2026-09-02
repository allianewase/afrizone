import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AccountType } from '../lib/types'
import Logo from '../components/Logo'
import './Landing.css'

/**
 * The front door of the Part-Time portal.
 *
 * The whole page is one question — "how will you use AfriZone Part Time?" —
 * because the three answers genuinely diverge afterwards: a store signs in at a
 * counter and works orders, a courier company manages riders, and an individual
 * belongs on the mobile app rather than here at all.
 *
 * WHAT THE CHOICE DOES NOT DO: it does not decide which dashboard anybody lands
 * on. That comes from the account type stored on the server (see lib/auth.tsx).
 * Someone who picks the wrong card and then signs in arrives where their account
 * actually belongs, with no correction and no dead end. Which is also why "Sign
 * in" sits outside the three cards — you do not have to declare what you are in
 * order to log in.
 *
 * PICK, THEN CONFIRM. The cards used to be links: one click and you were in a
 * registration form. They are now a radio group with a Continue button, which
 * costs a second click and buys two things. A person choosing how a business
 * they own will be represented gets a beat to read all three before committing,
 * and the button names the choice back to them — "Continue as a store" — so a
 * mis-click is caught here rather than three fields into the wrong form.
 */

interface Option {
  key: AccountType
  title: string
  blurb: string
  bullets: string[]
  /** Where the choice leads. Individuals get a page about the app, not a form. */
  to: string
  /** Named on the Continue button, so the button says what it will do. */
  confirm: string
  glyph: JSX.Element
}

const OPTIONS: Option[] = [
  {
    key: 'INDIVIDUAL',
    title: 'Individual',
    blurb: 'For people taking on paid work — field tasks, promotions, media and sourcing.',
    bullets: [
      'Find work matched to your skills and tier',
      'Record your hours and submit proof of work',
      'Get paid into your own bank account',
    ],
    to: '/individual',
    confirm: 'Continue as an individual',
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
    blurb: 'For shops and businesses fulfilling orders placed on AfriZoneMart.',
    bullets: [
      'Receive orders and confirm what you can fulfil',
      'Prepare each order for courier collection',
      'Track settlements and what you are owed',
    ],
    to: '/register/STORE',
    confirm: 'Continue as a store',
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
    blurb: 'For riders and dispatch companies delivering AfriZoneMart orders.',
    bullets: [
      'Take delivery jobs from shops near you',
      'Manage collection, drop-off and proof of delivery',
      'Confirm each delivery with the customer’s code',
    ],
    to: '/register/COURIER',
    confirm: 'Continue as a courier',
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

/** Where Afrizone's own staff belong. Mirrors WEB_ADMIN_URL on the server. */
const ADMIN_CONSOLE = 'https://admin.parttime.afrizonemart.com'

export default function Landing() {
  const [chosen, setChosen] = useState<AccountType | null>(null)
  const navigate = useNavigate()
  const selected = OPTIONS.find((o) => o.key === chosen) ?? null

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
          <p className="lp-eyebrow">Create an account</p>
          <h1>How will you use AfriZone Part Time?</h1>
          <p className="lp-sub">
            Choose the option that describes you. It determines the account we set up, the work you
            are shown, and how you are paid. If your situation changes later, our team can move you.
          </p>
        </div>

        {/*
          A radio group rather than three buttons: one answer is expected, arrow
          keys move between them, and a screen reader announces "2 of 3" without
          any of that being written by hand.
        */}
        <div className="lp-cards" role="radiogroup" aria-label="Account type">
          {OPTIONS.map((o) => {
            const on = chosen === o.key
            return (
              <button
                type="button"
                key={o.key}
                role="radio"
                aria-checked={on}
                className={`lp-card${on ? ' is-on' : ''}`}
                onClick={() => setChosen(o.key)}
                onDoubleClick={() => navigate(o.to)}
              >
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
                {/* The tick is the whole confirmation the card owes: the border
                    and tint are colour alone, and colour alone is not a state
                    somebody with low vision can read. */}
                <span className="lp-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            )
          })}
        </div>

        <div className="lp-go">
          <button
            type="button"
            className="lp-continue"
            disabled={!selected}
            onClick={() => selected && navigate(selected.to)}
          >
            {/* Names the choice back, so a mis-click is caught here rather than
                three fields into the wrong registration form. */}
            {selected ? selected.confirm : 'Select an option to continue'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="lp-already">
            Already registered? <Link to="/signin">Sign in instead</Link>
          </p>
        </div>

        {/* Afrizone's own people do not belong in this list — they are not an
            outside party, and their console is a different application with a
            different sign-in. Saying so here saves a support ticket. */}
        <p className="lp-staff">
          Afrizone staff sign in on the{' '}
          <a href={ADMIN_CONSOLE} rel="noreferrer">
            admin console
          </a>
          .
        </p>
      </main>
    </div>
  )
}
