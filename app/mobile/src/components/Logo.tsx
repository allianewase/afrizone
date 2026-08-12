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
}: LogoProps) {
  return (
    <View style={styles.row} accessibilityLabel="AfriZoneMart.com" accessibilityRole="image">
      <LogoMark size={size} />
      {wordmark && (
        <View style={styles.words}>
          {/* One colour, not the previous two-tone "Afrizone" + orange "Part
              Time": the identity does not split the wordmark, and "Part Time"
              no longer appears in the interface. */}
          <Text style={[styles.word, tone === 'dark' ? styles.wordDark : styles.wordLight]}>
            AfriZoneMart.com
          </Text>
          {/* Tone-aware for the same reason as the wordmark: textMuted is a
              body ink and measures 2.31:1 on navy. */}
          {tagline && (
            <Text style={[styles.tag, tone === 'dark' ? styles.tagDark : styles.tagLight]}>
              Made in Africa, delivered worldwide
            </Text>
          )}
        </View>
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
});
