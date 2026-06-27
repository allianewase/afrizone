/**
 * Afrizone Part Time — design tokens for the worker mobile app.
 * Mirrors DESIGN_SPEC.md §1 (brand) and the web-admin tokens.css so the
 * two apps stay visually identical.
 */

export const colors = {
  // Brand
  clay: '#C2502E', // --clay-600 primary
  clayLight: '#D2691E', // --clay-500 hover
  gold: '#E9A23B', // --gold-500 accent
  goldBright: '#F2A93B', // logo gold (matches web --gold-bright)
  navy: '#1E2643', // logo square / brand navy
  navyDeep: '#151B33',
  forest: '#14302B', // --forest-900 ink / dark surfaces
  forest700: '#1E4B41',

  // Functional / semantic (shared status language)
  money: '#1F9D6B', // --money-600 available / paid / success
  indigo: '#2D5BA8', // --indigo-600 info / in review
  amber: '#E08A1E', // --amber-500 pending / awaiting
  danger: '#C8453A', // --danger-600 errors / rejected

  // Neutrals (warm-tinted, never pure gray)
  bg: '#FBF5EC', // --sand-50 app background
  surfaceSand: '#F4EADB', // --sand-100 surface
  surface: '#FFFFFF', // card
  line: '#E7DCC9', // hairline / border
  text: '#241C15', // primary text
  textMuted: '#7A6B58', // muted text
  white: '#FFFFFF',

  // Tints for status pill backgrounds (semi-opaque feel without alpha math)
  amberSoft: '#FBEBD3',
  claySoft: '#F6E0D5',
  indigoSoft: '#DDE6F4',
  moneySoft: '#D6F0E4',
  forestSoft: '#D6E2DE',
  dangerSoft: '#F6DAD7',
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
} as const;

export const shadow = {
  // Soft warm shadow — restrained (fintech, not glass) per §1.5
  card: {
    shadowColor: '#241C15',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 4,
  },
  soft: {
    shadowColor: '#241C15',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
} as const;

/**
 * Typography. We use system fonts by default (Bricolage Grotesque + Inter
 * would be loaded via expo-font in a follow-up; weights below approximate the
 * display/body split from §1.4). `tabular` is used for money/timesheets.
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

export type Theme = {
  colors: typeof colors;
  spacing: typeof spacing;
  radii: typeof radii;
  type: typeof type;
};

export const theme: Theme = { colors, spacing, radii, type };
