/**
 * Colors and shapes matching C:\Users\hb\Downloads\afrizone-mobile-prototype
 * (1).html - a full interactive prototype (Home, My Tasks, Wallet, Jobs,
 * Profile, Store dashboard, task detail, notifications, a withdraw sheet,
 * loading/empty/error states) using the SAME real navy/gold Afrizone brand
 * as the earlier onboarding mock (afrizone-onboarding-screens.html), not a
 * new palette - this file's exact values now come from that prototype's own
 * `:root` CSS variables, not estimated from a screenshot.
 *
 * This supersedes the brief AgriPlant-green version of this file (that
 * detour is fully reverted - every value below is back to real navy/gold).
 *
 * Despite the file's path, it is no longer onboarding-only: this is also
 * the palette the main app screens (Home first, per rollout order) are
 * being restyled to, reusing these tokens rather than inventing a second
 * set. Not merged into src/theme.ts (the pre-existing app-wide system) -
 * that stays the source of truth for every screen not yet touched by this
 * restyle, same reasoning as before, just a wider "not yet" list now.
 */
export const obColors = {
  navy: '#000066',
  navyPress: '#00004D',
  gold: '#FBAC34',
  goldDeep: '#E8901A',
  bg: '#FAF6EF',
  sand: '#F1E8D6',
  white: '#FFFFFF',
  text: '#1B1A2E',
  textMut: '#6C6B85',
  textFaint: '#A6A5BD',
  line: '#EAE2CF',
  violet: '#7C6FE0',
  violetBg: '#EFEDFC',
  /** Prototype's "in progress" pill tone - amber/orange, distinct from `gold`
   * (which is a fill only, illegible as small text - see design-decisions.md
   * on the same problem with the app-wide --amber). */
  orangeInk: '#C2760F',
  orangeInkBg: '#FCEEDA',
  indigo: '#4A4FA0',
  indigoBg: '#ECEDF8',
  mgreen: '#1E9E5A',
  mgreenBg: '#E6F7EE',
  /** Prototype's "paid out" pill tone - settled/terminal, deliberately
   * distinct from the active mgreen (mirrors web-admin's Paid/forest choice,
   * see global.css). */
  forest: '#215B3B',
  forestBg: '#E3EEE7',
  /** Fills, borders and icons only. `danger` is 4.38:1 on white and 3.77:1
   * on its own tint, so it cannot legibly carry small text either way -
   * exactly the same trap `gold` has, and the reason `orangeInk` exists. */
  danger: '#D64545',
  dangerBg: '#FBEAEA',
  /** Red as TEXT: 6.59:1 on white, 5.67:1 on dangerBg. Not a new colour -
   * this is the old theme's own `dangerInk`, which the palette swap dropped
   * while keeping the fill, leaving every error message and destructive
   * label below the 4.5 floor. */
  dangerInk: '#A6362C',
  roleSelectedBg: '#FFF8EC',
  /** The mint-green splash-only ground (screen 01 in the earlier reference) -
   * unused now that Splash reverted to navy, kept in case that changes back. */
  splashBg: '#E3F5E1',
} as const;

/**
 * The prototype's own `.cut-*` classes: a CSS clip-path diagonal corner,
 * which has no RN equivalent - approximated the same way this app's
 * "Sunrise Cut" already does it (a small border-radius on just the top-right
 * corner against a larger radius everywhere else), at this prototype's own
 * radius values rather than the previous mock's.
 */
export const obRadii = {
  card: 20,
  cardCut: 6,
  field: 12,
  btn: 16,
  btnCut: 6,
  chip: 14,
  otp: 12,
  pill: 999,
  dropzone: 14,
  /** The wallet balance hero / bottom sheet's larger radius (prototype's --r-hero/--cut-hero). */
  hero: 26,
  heroCut: 8,
} as const;
