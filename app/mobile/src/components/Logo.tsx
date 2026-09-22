import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, fontFamily } from '../theme';

type Tone = 'dark' | 'light';
type MarkTone = 'full' | 'reversed';

interface LogoProps {
  size?: number;
  wordmark?: boolean;
  tagline?: boolean;
  /** dark = white wordmark (for dark bg, default); light = navy wordmark. */
  tone?: Tone;
  /** Sit the wordmark back on the mark's trailing edge (x=104/107, the
   * published lockup's own measurement) instead of spacing it beside the
   * mark with a gap. Off by default - see the note where it's used below. */
  overlap?: boolean;
}

// Intrinsic aspect of the brand artwork, 107x113. Height is derived from
// `size` so the mark never distorts. See docs/design-decisions.md.
const MARK_ASPECT = 107 / 113;

const MARK_FULL = require('../../assets/logo-mark.png');
const MARK_REVERSED = require('../../assets/logo-mark-reversed.png');

/**
 * Afrizone logo mark: the real AfriZoneMart.com artwork, cropped from the
 * brand asset rather than redrawn.
 *
 * `markTone="reversed"` swaps to the variant whose continent is white, for
 * grounds that clash with the orange (the welcome hero). The cart sits inside
 * the continent, so the default works on light, sand and navy alike.
 *
 * Kept in step with web-admin's src/components/Logo.tsx, which uses the same
 * two files.
 */
export function LogoMark({
  size = 38,
  markTone = 'full',
}: {
  size?: number;
  markTone?: MarkTone;
}) {
  const height = Math.round(size / MARK_ASPECT);
  return (
    <Image
      source={markTone === 'reversed' ? MARK_REVERSED : MARK_FULL}
      style={{ width: size, height }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

export default function Logo({
  size = 38,
  wordmark = true,
  tagline = false,
  tone = 'dark',
  overlap = false,
}: LogoProps) {
  // The published lockup's own measurement (docs/design-decisions.md): the
  // wordmark starts at x=104 of the mark's 107px source width - i.e. right
  // at the mark's trailing edge, not beside it with a gap. That reconstructed
  // asset already had those letters surgically removed and the coastline
  // healed behind them, specifically so live text could sit back on top of
  // it here. `overlap` is opt-in per call site (not the default): most of
  // this component's call sites are small header lockups where negative
  // margin at that many different sizes is more fragile than useful; this is
  // for the few brand-moment renders (Splash) where it's worth doing exactly.
  // docs/design-decisions.md's "wordmark starts at x=104 of 107" is measured
  // in the SOURCE image's coordinate space, before it was cropped to this
  // 107px asset's own ink bounds - so that ratio doesn't translate directly
  // onto this file without redecoding pixels to find the crop offset, which
  // is more precision than a splash-screen placement needs. This fraction
  // (how far into the mark's width the text starts) is instead tuned by eye
  // against the reference photo; nudge OVERLAP_FRACTION if it drifts.
  // Re-tuned against the exact reference photo (transparent-ground export of
  // the real lockup): the wordmark starts roughly at the mark's own
  // midpoint, not as far back as the previous estimate had it.
  const OVERLAP_FRACTION = 0.5;
  const overlapPx = overlap ? -Math.round(11 + size * OVERLAP_FRACTION) : 0;
  const markHeight = Math.round(size / MARK_ASPECT);
  const taglineText = 'Made in Africa, delivered worldwide';
  const taglineStyle = [styles.tag, tone === 'dark' ? styles.tagDark : styles.tagLight];

  // The tagline is taken out of flow below (see the comment further down),
  // so nothing after this component would otherwise know to leave room for
  // it - this reserves that space explicitly instead.
  const TAGLINE_RESERVE = 18;

  return (
    <View style={tagline && overlap ? { paddingBottom: TAGLINE_RESERVE } : undefined}>
      <View style={styles.row} accessibilityLabel="AfriZoneMart.com" accessibilityRole="image">
        <LogoMark size={size} />
        {wordmark && (
          <View style={[styles.words, overlap && { marginLeft: overlapPx }]}>
            {/* Single colour, per the source artwork (docs/design-decisions.md:
                "The wordmark is single-colour navy, so the tone-switched live
                text matches the source rather than merely resembling it."). */}
            <Text style={[styles.word, tone === 'dark' ? styles.wordDark : styles.wordLight]}>
              AfriZoneMart.com
            </Text>
            {/* Only when NOT overlapping: the tagline sits directly under the
                wordmark here, left-aligned to it, in normal flow. */}
            {tagline && !overlap && <Text style={taglineStyle}>{taglineText}</Text>}
          </View>
        )}
      </View>
      {/* When overlap is on: a straight line, centered under the whole
          mark+wordmark block (not indented to the wordmark's own start).
          Positioned absolutely (left:0/right:0 spanning the row, centered
          within it) rather than stacked in flow - a flow-positioned tagline
          this much longer than the wordmark widens the whole component's own
          box past the row's width, which then throws off any *outer*
          centering around this component (the row ends up flush-left inside
          that wider box instead of visually centered). Absolute positioning
          takes it out of flow entirely, so the component's size stays the
          row's size, same as when there's no tagline at all. */}
      {tagline && overlap && (
        <Text style={[taglineStyle, styles.tagBelow, { position: 'absolute', top: markHeight, left: 0, right: 0 }]}>
          {taglineText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  words: { flexDirection: 'column' },
  word: { fontFamily: fontFamily.extrabold, fontSize: 19, letterSpacing: -0.4, fontStyle: 'italic' },
  wordDark: { color: colors.white },
  wordLight: { color: colors.navy },
  tag: { fontSize: 11, fontStyle: 'italic', marginTop: 3 },
  tagDark: { color: colors.railMuted },
  tagLight: { color: colors.textMuted },
  tagBelow: { marginTop: 4, textAlign: 'center' },
});
