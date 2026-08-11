/**
 * Design tokens for the worker mobile app.
 *
 * These mirror web-admin's tokens.css value for value. Reasoning behind the
 * values lives in docs/design-decisions.md; several look wrong until you read
 * the measurement, so check there before changing one.
 */

export const colors = {
  // Brand, per the Afrizonemart.com identity.
  clay: '#FBAC34', // Sea Buckthorn, primary accent (was clay/terracotta)
  clayLight: '#FCC066', // lightened tint for hover/pressed states
  gold: '#FBAC34', // same hex; kept as a separate name for existing call sites
  goldBright: '#FBAC34', // logo mark colour
  navy: '#000066', // logo mark navy
  navyDeep: '#00004D',
  forest: '#14302B', // dark surfaces, Paid status
  forest700: '#1E4B41',

  // Status language, shared with web-admin and design-system.html.
  money: '#1F9D6B', // available / paid / success
  indigo: '#2D5BA8', // info / in review
  amber: '#E08A1E', // warnings only, not a status
  danger: '#C8453A', // errors / rejected
  pending: '#6B3F94', // violet, not amber: docs/design-decisions.md

  // Type versions of three fills that are illegible as small text on light.
  // Active shipped at 1.64:1, Available 2.86:1, Rejected 3.65:1.
  moneyInk: '#15794F',
  dangerInk: '#A6362C',
  goldInk: '#8A5A0F',

  // Neutrals: "Warm Refined". docs/design-decisions.md
  bg: '#FAF9F6', // app background, 16.61:1 against `text`
  surfaceSand: '#F4F2EC', // recessed surface
  surface: '#FFFFFF', // card
  line: '#E8E3DA', // hairline / border
  text: '#1C1917', // primary text
  textMuted: '#57534E', // secondary text, 7.25:1
  textFaint: '#706963', // placeholders and hints, 5.13:1
  white: '#FFFFFF',

  // Secondary ink for navy grounds, the twin of web-admin's --rail-muted.
  // 7.29:1 on navy, where textMuted is 2.31:1.
  railMuted: '#A1A5C4',

  // Pill fills: the exact tints web-admin composes (each status colour at 10 to
  // 16% over white), so a pill renders identically in both apps rather than
  // merely similarly, which is what DESIGN_SPEC 0.4 asks for.
  amberSoft: '#FBF1E4',
  pendingSoft: '#F0ECF4',
  claySoft: '#FFF5E7',
  indigoSoft: '#E6EBF5',
  moneySoft: '#E4F3ED',
  forestSoft: '#E3E6E5',
  dangerSoft: '#F8E9E7',
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
  // Soft warm shadow, restrained (fintech, not glass) per §1.5
  card: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 4,
  },
  soft: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
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
  medium: 'Raleway_500Medium',
} as const;

export type Theme = {
  colors: typeof colors;
  spacing: typeof spacing;
  radii: typeof radii;
  type: typeof type;
};

export const theme: Theme = { colors, spacing, radii, type };
