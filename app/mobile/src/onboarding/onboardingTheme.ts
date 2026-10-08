import { colors } from '../theme';

/**
 * `obColors` is now an ALIAS MAP onto src/theme.ts, not a palette.
 *
 * It used to hold its own hexes, taken from the interactive prototype's
 * `:root` variables, and its header explained that it deliberately was not
 * merged into src/theme.ts because that file "stays the source of truth for
 * every screen not yet touched by this restyle". The 2026-09-22 restyle
 * emptied that list - every screen reads AppUI or ObUI, and both read this
 * file - so the two palettes were simply both live at once. They are now one,
 * and the prototype's values are the ones that survived: see src/theme.ts's
 * header for what moved, what was dropped on contrast grounds, and what that
 * costs in agreement with web-admin and web-portal.
 *
 * The names below are kept because ~60 files use them, and renaming the
 * vocabulary of two component kits is a different change from unifying their
 * colours. New code can use either name; `colors` is the one that will
 * outlive this file.
 *
 * NOTE the deliberate gap: there is no `obColors.textFaint`. Its old value
 * (#A6A5BD) measured 2.23:1 on the page ground, and it was carrying 22
 * placeholders, the inactive tab tint and a dozen 11px timestamps. Light
 * grounds now use `textMut`; the navy ones use `onNavyMuted`, which is that
 * same value under a name that says where it works. If a future call site
 * reaches for `textFaint`, the typechecker should stop it - that is the point.
 */
export const obColors = {
  navy: colors.navy,
  navyPress: colors.navyDeep,
  gold: colors.gold,
  goldDeep: colors.clayDeep,
  bg: colors.bg,
  sand: colors.surfaceSand,
  white: colors.white,
  text: colors.text,
  textMut: colors.textMuted,
  /** Secondary text on NAVY grounds only, where it is 7.33:1. On light it is
   * 2.23:1, which is what retired the old `textFaint`. */
  onNavyMuted: colors.onNavyMuted,
  line: colors.line,
  violet: colors.pending,
  violetBg: colors.pendingSoft,
  violetInk: colors.pendingInk,
  violetInkMut: colors.pendingInkMuted,
  violetLine: colors.pendingLine,
  /** Fill and glyph only - 3.56:1 on white. Words go in `amberInk`. */
  orangeInk: colors.amber,
  orangeInkBg: colors.amberSoft,
  /** Amber as TEXT: 5.92:1 on white, 5.18:1 on its own tint. */
  amberInk: colors.goldInk,
  indigo: colors.indigo,
  indigoBg: colors.indigoSoft,
  /** Fill and glyph only - 3.45:1 on white. Words go in `mgreenInk`. */
  mgreen: colors.money,
  /** Green as TEXT: 6.59:1 on white, 5.93:1 on its own tint. Added when four
   * screens were found writing words in `mgreen`. */
  mgreenInk: colors.moneyInk,
  mgreenBg: colors.moneySoft,
  /** Translucent `mgreen`, for the one circle that sits on a dark ground. */
  mgreenVeil: colors.moneyVeil,
  /** Settled/terminal green, deliberately distinct from the active `mgreen`
   * (mirrors web-admin's Paid/forest choice, see global.css). */
  forest: colors.forest,
  forestBg: colors.forestSoft,
  /** Fills, borders and icons only - 4.38:1 on white, 3.77:1 on its tint. */
  danger: colors.danger,
  dangerBg: colors.dangerSoft,
  /** Red as TEXT: 6.59:1 on white, 5.67:1 on dangerBg. */
  dangerInk: colors.dangerInk,
  roleSelectedBg: colors.claySoft,
  /** Backdrop behind sheets and modals. Ten screens had this inlined. */
  scrim: colors.scrim,
  /** The mint-green splash-only ground (screen 01 in the earliest reference) -
   * unused now that Splash reverted to navy, kept in case that changes back. */
  splashBg: colors.splashBg,
} as const;

/**
 * The prototype's own `.cut-*` classes: a CSS clip-path diagonal corner,
 * which has no RN equivalent - approximated the same way this app's
 * "Sunrise Cut" already does it (a small border-radius on just the top-right
 * corner against a larger radius everywhere else), at this prototype's own
 * radius values rather than the previous mock's.
 *
 * These are still a second set of shape tokens alongside src/theme.ts's
 * `radii`, which the palette merge did NOT touch: the two disagree about
 * card (20 vs 16) and button (16 vs 12) radii, and reconciling shape is a
 * visual decision about which silhouette is right, not a duplicate-hex
 * cleanup. The live app's shapes all come from here.
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
