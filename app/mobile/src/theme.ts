/**
 * Design tokens for the worker mobile app.
 *
 * THE NEUTRALS AND STATUS FILLS NOW MIRROR THE AFRIZONEMART HOUSE PALETTE
 * (web-portal/src/styles.css), not web-admin's tokens.css. They used to mirror
 * web-admin value for value, which is why some comments below still say so —
 * those are now aspirational rather than true, and are worth reading as "this
 * is where it should end up," not "this is where it is."
 *
 * TWO SURFACES ARE ON THE SHOP PALETTE, ONE IS NOT. The portal moved first and
 * was verified against the shop's own stylesheet; this file follows it exactly
 * so an amount that reads green here reads the same green there. web-admin has
 * not moved, so a handful of tokens tied explicitly to it in the comments below
 * (onGold, clayDeep, railMuted) are LEFT UNCHANGED on purpose — they are
 * derivatives of admin tokens that have not moved, and changing them alone
 * would make them wrong rather than early.
 *
 * Reasoning behind the ORIGINAL warm values lives in docs/design-decisions.md;
 * that document was written for the palette this file just left, and reading
 * it as authority on today's hex values will mislead more than it helps. It is
 * still the right place to understand what a token means and why it exists.
 */

export const colors = {
  // Brand, per the Afrizonemart.com identity.
  clay: '#FBAC34', // Sea Buckthorn, primary accent (was clay/terracotta)
  clayLight: '#FCC066', // lightened tint for hover/pressed states
  // The deep end of the brand gradient, the twin of web-admin's --clay-deep.
  // Every gradient needs it: clay and gold are the same hex, so a two-stop ramp
  // between them renders as a flat fill. docs/design-decisions.md
  clayDeep: '#C98518',
  gold: '#FBAC34', // same hex; kept as a separate name for existing call sites
  goldBright: '#FBAC34', // logo mark colour
  navy: '#000066', // logo mark navy
  navyDeep: '#00004D',
  forest: '#14302B', // dark surfaces, Paid status
  forest700: '#1E4B41',

  // Status language. money and danger now follow the shop palette; indigo,
  // amber and pending have no equivalent on suppliers.afrizonemart.com and are
  // unchanged internal choices, still shared with web-admin and design-system.html.
  money: '#2FA152', // available / paid / success — AfriZoneMart green
  indigo: '#2D5BA8', // info / in review
  // Warnings only, not a status, and a FILL only: as text or as an icon it is
  // 2.55:1 on the page. Warning type uses goldInk. There is deliberately no
  // amberInk, because darkening amber lands on goldInk. docs/design-decisions.md
  amber: '#E08A1E',
  danger: '#C0392B', // errors / rejected — AfriZoneMart red
  pending: '#6B3F94', // violet, not amber: docs/design-decisions.md

  // Type versions of three fills that are illegible as small text on light.
  // Active shipped at 1.64:1, Available 2.86:1, Rejected 3.65:1.
  // 1A6B2E replaces 15794F: same role (the readable ink for `money`, which is
  // 3.31:1 as text and only safe as a fill or an icon-on-its-own), recomputed
  // for the new green. 6.59:1 on white.
  moneyInk: '#1A6B2E',
  dangerInk: '#A6362C',
  goldInk: '#8A5A0F',
  // UNCHANGED - twin of web-admin's --on-gold, which has not moved. Revisit
  // together with clayDeep and railMuted when web-admin does.
  onGold: '#1C1917',

  // Neutrals: the shop palette, not "Warm Refined" any more.
  bg: '#F7F7F7', // app background, 13.04:1 against `text`
  surfaceSand: '#EDEDED', // recessed surface
  surface: '#FFFFFF', // card
  line: '#E8E8E8', // hairline / border
  text: '#2C2C2C', // primary text
  textMuted: '#5B5B5B', // secondary text, 6.34:1 on `bg`, 6.79:1 on `surface`
  // The old warm value (706963) was 4.30:1 on the old FAF9F6 ground - a
  // near-miss of AA's 4.5 floor. 6B6B6B clears it on both new grounds:
  // 4.97:1 on `bg`, 5.33:1 on `surface`.
  textFaint: '#6B6B6B', // placeholders and hints
  white: '#FFFFFF',

  // Secondary ink for navy grounds, the twin of web-admin's --rail-muted.
  // 7.29:1 on navy, where textMuted is 2.31:1.
  railMuted: '#A1A5C4',

  // Backdrop behind modals and bottom sheets, derived from `text`. Held here
  // because seven screens had it inlined as a literal, and two of those
  // literals were still the pre-rebrand warm black.
  scrim: 'rgba(44,44,44,0.45)',

  // Pill fills: the exact tints web-admin composes (each status colour at 10 to
  // 16% over white), so a pill renders identically in both apps rather than
  // merely similarly, which is what DESIGN_SPEC 0.4 asks for.
  amberSoft: '#FBF1E4',
  pendingSoft: '#F0ECF4',
  claySoft: '#FFF5E7',
  indigoSoft: '#E6EBF5',
  moneySoft: '#EAFAF1', // the shop's tint for `money`, not web-admin's
  forestSoft: '#E3E6E5',
  dangerSoft: '#FDEDEC', // the shop's tint for `danger`, not web-admin's
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  input: 12,
  button: 12,
  card: 16,
  sheet: 22,
  pill: 100,
  /** "Sunrise Cut" signature: the sharp corner paired with `card`/`button`
   * on the opposite corner to give every surface an asymmetric, angular
   * silhouette instead of a uniform rounded rectangle. */
  cut: 4,
} as const;

/**
 * "Sunrise Cut" motif: a repeating chevron pattern echoing the angular
 * lines of the Africa+cart logo mark. Used sparingly as a thin section
 * divider or a low-opacity background watermark on brand moments only
 * (never behind dense data, per DESIGN_SPEC §7).
 */
export const motif = {
  watermarkOpacityDark: 0.12,
  watermarkOpacityLight: 0.05,
  dividerOpacityDark: 0.35,
  dividerOpacityLight: 0.5,
} as const;

export const shadow = {
  // Soft shadow, restrained (fintech, not glass) per §1.5. Bumped from the
  // original 0.1/0.08 opacities: against `bg` sitting this close to `surface`
  // (#FFFFFF), that value rendered as barely perceptible on web, so every card
  // read as flat. This is the same shape, just visible. colors.text rather than
  // a literal, so this stays correct if the palette moves again.
  card: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 6,
  },
  soft: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 3,
  },
  /** Smaller-radius lift for compact surfaces (segmented control thumb, chips). */
  tight: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;

/**
 * Typography. Sizes/weights approximate the display/body split from §1.4;
 * Raleway is applied via `fontFamily` below on brand-critical text. `tabular`
 * is used for money/timesheets.
 */
export const type = {
  // sizes from the §1.4 scale
  size: {
    xs: 12,
    sm: 13,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    display: 30,
    displayLg: 38,
    hero: 48,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
  lineHeight: 1.5,
} as const;

export const layout = {
  /** Minimum accessible touch target (§7). */
  hitTarget: 44,
  screenPadding: spacing.xl,
} as const;

/**
 * Raleway (per the brand spec: extrabold headings, medium body), loaded via
 * @expo-google-fonts/raleway in app/_layout.tsx. Applied explicitly on the
 * highest-visibility shared/brand text (screen headers, logo, buttons)
 * rather than every style in the app, because React Native registers each static
 * weight as its own font family name, so a blanket global override isn't a
 * simple one-line change the way it is on web.
 */
export const fontFamily = {
  extrabold: 'Raleway_800ExtraBold',
  bold: 'Raleway_700Bold',
  medium: 'Raleway_500Medium',
} as const;

export type Theme = {
  colors: typeof colors;
  spacing: typeof spacing;
  radii: typeof radii;
  type: typeof type;
};

export const theme: Theme = { colors, spacing, radii, type };
