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
  'M18 10 L30 5 L44 4 L58 6 L70 10 L77 15 L81 21 L85 27 L90 32 L96 38 L100 42 L93 45 L87 44 L84 50 L82 58 L78 66 L74 74 L69 82 L63 90 L57 98 L51 103 L46 99 L42 92 L38 84 L35 76 L33 68 L32 60 L29 55 L23 52 L15 50 L8 45 L4 38 L7 30 L11 22 L15 15 Z';
const MADAGASCAR_PATH = 'M82 70 Q88 75 86 84 Q82 90 79 83 Q78 75 82 70 Z';

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
        <Path d="M76 19 L44 35" stroke={colors.navy} strokeWidth={4.5} strokeLinecap="round" fill="none" />
        <Path d="M44 35 L74 35 L65 67 L36 67 Z" fill={colors.navy} />
        <Path d="M40 46 L69 46 M37 57 L67 57" stroke={colors.white} strokeWidth={1.7} fill="none" opacity={0.5} />
        <Rect x={37} y={26} width={7} height={9} rx={2} fill={colors.navy} />
        <Rect x={47} y={21} width={10} height={14} rx={2} fill={colors.navy} />
        <Rect x={59} y={23} width={10} height={11} rx={2} fill={colors.navy} />
        <Circle cx={45} cy={78} r={6.3} fill={colors.navy} />
        <Circle cx={61} cy={78} r={6.3} fill={colors.navy} />
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
