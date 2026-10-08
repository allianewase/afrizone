/**
 * Design tokens for the worker mobile app. THE ONE PALETTE.
 *
 * Until 2026-10-08 there were two. This file held the Afrizonemart house
 * palette, verified against the shop's own named CSS classes and shared with
 * web-admin and web-portal; `src/onboarding/onboardingTheme.ts` held
 * `obColors`, taken from the interactive prototype's `:root` variables, and
 * said in its own header that it was deliberately not merged because this
 * file "stays the source of truth for every screen not yet touched by this
 * restyle". The 2026-09-22 restyle emptied that "not yet" list: every screen
 * now renders through AppUI or ObUI, both of which read `obColors`, so the
 * live app was the prototype palette while the fourteen shared components
 * inside those screens were still this one. Two reds, two indigos, two
 * muted greys, and two different grounds, on screen at once.
 *
 * THE PROTOTYPE VALUES WON, because they are what ships and what was signed
 * off screen by screen. Where they disagreed with the shop values the shop
 * lost: the ground is warm cream again (#FAF6EF, not #F7F7F7), text is
 * near-navy (#1B1A2E, not #2C2C2C), and the status fills moved. `obColors`
 * is now an alias map onto this object, so these hexes exist exactly once.
 *
 * WHAT THIS COSTS: mobile no longer matches web-admin and web-portal. That
 * agreement was already fiction - the restyle broke it in September and only
 * this file's header still claimed otherwise. Bringing the three back
 * together is a separate decision about which palette the other two should
 * follow, not something to quietly re-fork this file over.
 *
 * FOUR LIVE VALUES WERE NOT ADOPTED, because they failed the role they were
 * being used in. Ratios below are measured, not estimated:
 *   - `textFaint` (#A6A5BD) is GONE as a light-ground token: 2.23:1 on `bg`
 *     and 2.40:1 on `surface`, used for 22 placeholders, the inactive tab
 *     tint and a dozen 11px timestamps. Its 35 call sites moved to
 *     `textMuted`; the two that sit on navy, where it measures 7.33:1, moved
 *     to `onNavyMuted`, which keeps the value under a name that says where
 *     it works.
 *   - `money` (#1E9E5A) is a fill and an icon, never text: 3.45:1 on white.
 *     Four screens wrote words in it; they now use `moneyInk`.
 *   - `onGold` was #2C2C2C (7.35:1 on gold). Ink on gold is navy everywhere
 *     the live app does it - AppPrimaryButton's label is `navyDeep` - so
 *     this follows, at 9.98:1 on `clay` and 7.62:1 on `clayDeep`.
 *   - `scrim` was rgba(44,44,44,0.45) and dead, while ten screens inlined
 *     rgba(10,10,30,0.42) as a literal. The literal was right; it is now
 *     this token, and those ten screens reference it.
 *
 * `textMuted` (#6C6B85) is the only secondary tone on light grounds, and it
 * clears AA with little room: 4.78:1 on `bg`, 5.15:1 on `surface`, 4.23:1 on
 * `surfaceSand`. That last one is under the 4.5 floor, so body text does not
 * belong on a sand well - and there is no lighter legible step available, so
 * do not reintroduce one. Anything fainter than this is decoration.
 *
 * FILL-ONLY TOKENS, each illegible as small text on light: `clay`/`gold`
 * (1.90:1), `money` (3.45:1), `amber` (3.56:1), `danger` (4.38:1) and
 * `pending` (4.03:1). Each has an ink twin for type - `moneyInk`,
 * `goldInk`, `dangerInk` - except `pending`, which is only ever an icon
 * today and is 3.49:1 on its own tint, so do not put words in it either.
 *
 * Reasoning behind the pre-rebrand warm values lives in
 * docs/design-decisions.md. It explains what a token MEANS and why it
 * exists, which is still useful; its hex values are two palettes out of date.
 * docs/mobile-app-format.md §3 describes this file and the look it produces.
 */

export const colors = {
  // Brand. Both palettes always agreed on these two, which is why the app
  // still reads as itself despite everything above.
  clay: '#FBAC34', // Sea Buckthorn, the one accent colour
  gold: '#FBAC34', // same hex, kept as a separate name for existing call sites
  // The deep end of the brand gradient. Every gradient needs it: clay and
  // gold are the same hex, so a two-stop ramp between them renders flat.
  // #E8901A is the prototype's own stop, and the live AppPrimaryButton ramp.
  // Was #D88E1B, the shop's .to-amber-dark, whose only callers were the two
  // dead components (src/components/Button.tsx, Card.tsx).
  clayDeep: '#E8901A',
  navy: '#000066', // logo mark navy
  navyDeep: '#00004D', // pressed navy, and ink on gold
  forest: '#215B3B', // settled/terminal green, deliberately not `money`

  // Status language. Fills and icons unless the name ends in `Ink`.
  money: '#1E9E5A', // available / paid / success. FILL+ICON ONLY, 3.45:1
  indigo: '#4A4FA0', // info / in review. Safe as text too: 7.20:1 on surface
  amber: '#C2760F', // warnings. FILL+ICON ONLY, 3.56:1 - type uses goldInk
  danger: '#D64545', // errors / rejected. FILL+ICON ONLY, 4.38:1
  pending: '#7C6FE0', // awaiting approval. ICON ONLY, 4.03:1 and 3.49:1 on tint

  // Ink twins: the readable versions of three fills above. All three clear
  // AA on every ground this app has, including their own tints.
  moneyInk: '#1A6B2E', // 6.12:1 on bg, 6.59:1 on surface, 5.93:1 on moneySoft
  dangerInk: '#A6362C', // 6.12:1 on bg, 6.59:1 on surface, 5.67:1 on dangerSoft
  goldInk: '#8A5A0F', // 5.49:1 on bg, 5.92:1 on surface, 5.18:1 on amberSoft
  // Ink on a gold surface, matching AppPrimaryButton's own label colour.
  onGold: '#00004D',

  // Neutrals: warm, from the prototype. The cool greys this file used to
  // hold (#F7F7F7 / #EDEDED / #E8E8E8 / #2C2C2C) were the shop's.
  bg: '#FAF6EF', // page ground
  surfaceSand: '#F1E8D6', // recessed well. No body text on it: see header
  surface: '#FFFFFF', // card
  white: '#FFFFFF',
  line: '#EAE2CF', // hairline, decorative at 1.20:1 - never a state
  text: '#1B1A2E', // primary, 15.80:1 on bg
  textMuted: '#6C6B85', // the ONLY secondary tone on light: see header
  // Secondary ink for navy grounds only, where it is 7.33:1. This is the old
  // `textFaint` value and the old `railMuted` (#A1A5C4, 7.29:1) collapsed
  // into one token, since they were the same role a hair apart.
  onNavyMuted: '#A6A5BD',
  // Backdrop behind modals and bottom sheets. The value ten screens had
  // inlined; held here because that is what a token is for.
  scrim: 'rgba(10,10,30,0.42)',
  // `money` at 16%, the one tint that has to stay translucent: it is used on
  // a dark ground, where the opaque `moneySoft` would read as a light circle
  // instead of a dark green one. Replaces an inlined rgba(47,174,96,0.16),
  // whose green (#2FAE60) was two palettes old.
  moneyVeil: 'rgba(30,158,90,0.16)',

  // Tints. Each is the prototype's own pill ground, not a recomputed
  // rgba(status, 10-16%) over white - the two are a hair apart, and these
  // are the ones on screen.
  claySoft: '#FFF8EC', // gold tint, and the selected-role card ground
  amberSoft: '#FCEEDA',
  pendingSoft: '#EFEDFC',
  // The violet banner's own type and edge, which AppUI had inlined as
  // #3f3a7a / #5f5a92 / #DBD5F7. They stay violet rather than folding into
  // `text`/`textMuted` because `textMuted` measures 4.46:1 on `pendingSoft`
  // - just under the floor - while these are 8.67:1 and 5.41:1.
  pendingInk: '#3F3A7A',
  pendingInkMuted: '#5F5A92',
  pendingLine: '#DBD5F7', // decorative edge at 1.22:1, never a state
  indigoSoft: '#ECEDF8',
  moneySoft: '#E6F7EE',
  forestSoft: '#E3EEE7',
  dangerSoft: '#FBEAEA',
  // The mint splash ground from the earliest mock. Unused since Splash went
  // back to navy; kept because that has already changed twice.
  splashBg: '#E3F5E1',
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
