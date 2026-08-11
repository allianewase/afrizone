import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
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

// Hand-drawn (not auto-traced) simplified Africa silhouette: straight-line
// points only, so the path data stays easy to verify and adjust. Includes
// the Horn of Africa (right) and West Africa bulge (left) as the two key
// recognizable features, plus a small separate Madagascar blob.
const AFRICA_PATH =
  'M32 6 L48 3 L62 8 L68 14 L74 22 L88 26 L100 34 L86 40 L80 52 L84 60 L76 72 L68 84 L58 96 L50 104 L40 96 L32 84 L26 70 L20 60 L10 54 L0 48 L12 40 L8 28 L18 16 Z';
const MADAGASCAR_PATH = 'M80 78 Q86 82 84 90 Q80 95 77 89 Q75 82 80 78 Z';

/**
 * Afrizone logo mark: a Sea Buckthorn-orange Africa silhouette with a Deep
 * Navy Blue shopping-cart glyph, per the official Afrizonemart.com logo
 * redesign spec. `markTone="reversed"` swaps the continent to white for use
 * on solid orange/navy backgrounds, where the default orange fill would
 * otherwise have no contrast against the surface behind it.
 */
export function LogoMark({
  size = 38,
  markTone = 'full',
}: {
  size?: number;
  markTone?: MarkTone;
}) {
  const height = size * 1.05;
  const continentFill = markTone === 'reversed' ? colors.white : colors.goldBright;
  return (
    <View style={{ width: size, height, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={height} viewBox="0 0 100 105">
        <Path d={AFRICA_PATH} fill={continentFill} />
        <Path d={MADAGASCAR_PATH} fill={continentFill} />
        {/* cart: handle, basket, three "goods" bumps, two wheels */}
        <Path d="M66 38 L38 52" stroke={colors.navy} strokeWidth={4} strokeLinecap="round" fill="none" />
        <Path d="M38 52 L64 52 L56 80 L31 80 Z" fill={colors.navy} />
        <Path d="M34 62 L60 62 M32 71 L58 71" stroke={colors.white} strokeWidth={1.5} fill="none" opacity={0.5} />
        <Rect x={32} y={44} width={6} height={8} rx={2} fill={colors.navy} />
        <Rect x={40} y={40} width={9} height={12} rx={2} fill={colors.navy} />
        <Rect x={51} y={42} width={8} height={10} rx={2} fill={colors.navy} />
        <Circle cx={39} cy={90} r={5.5} fill={colors.navy} />
        <Circle cx={53} cy={90} r={5.5} fill={colors.navy} />
      </Svg>
    </View>
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
          {tagline && <Text style={styles.tag}>Made in Africa, delivered worldwide</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  words: { flexDirection: 'column' },
  word: { fontFamily: fontFamily.extrabold, fontSize: 19, letterSpacing: -0.4 },
  wordDark: { color: colors.white },
  wordLight: { color: colors.navy },
  tag: { fontSize: 11, fontStyle: 'italic', color: colors.textMuted, marginTop: 3 },
});
