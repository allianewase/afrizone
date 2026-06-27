import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radii } from '../theme';

type Tone = 'dark' | 'light';

interface LogoProps {
  size?: number;
  wordmark?: boolean;
  tagline?: boolean;
  /** dark = white "Afrizone" (for dark bg, default); light = navy "Afrizone". */
  tone?: Tone;
}

/**
 * Afrizone Part Time logo — navy rounded-square mark with a bold gold "A"
 * (stroke path "M26 79 L50 23 L74 79" + crossbar "M37 60 H63"), recreated from
 * web-admin/src/components/Logo.tsx in react-native-svg.
 */
export function LogoMark({ size = 38 }: { size?: number }) {
  const inner = size * 0.68;
  return (
    <View
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size * 0.3 },
      ]}
    >
      <Svg width={inner} height={inner} viewBox="0 0 100 100">
        <Path
          d="M26 79 L50 23 L74 79"
          fill="none"
          stroke={colors.goldBright}
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M37 60 H63"
          fill="none"
          stroke={colors.goldBright}
          strokeWidth={12}
          strokeLinecap="round"
        />
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
    <View style={styles.row} accessibilityLabel="Afrizone Part Time" accessibilityRole="image">
      <LogoMark size={size} />
      {wordmark && (
        <View style={styles.words}>
          <Text style={styles.word}>
            <Text style={tone === 'dark' ? styles.afriDark : styles.afriLight}>Afrizone</Text>
            <Text style={styles.part}> Part Time</Text>
          </Text>
          {tagline && <Text style={styles.tag}>Made in Africa, delivered worldwide</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mark: {
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
  },
  words: { flexDirection: 'column' },
  word: { fontWeight: '800', fontSize: 19, letterSpacing: -0.4 },
  afriDark: { color: colors.white },
  afriLight: { color: colors.navy },
  part: { color: colors.goldBright },
  tag: { fontSize: 11, fontStyle: 'italic', color: colors.textMuted, marginTop: 3 },
});
