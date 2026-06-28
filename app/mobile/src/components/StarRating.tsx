import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

const STAR_PATH =
  'M12 2l2.9 6.3 6.8.6-5 4.7 1.5 6.8L12 17l-6.2 3.4 1.5-6.8-5-4.7 6.8-.6Z';

interface StarRatingProps {
  score: number;   // 1–5, may be fractional for aggregate display
  size?: number;
  gap?: number;
  color?: string;
  emptyColor?: string;
}

/**
 * Renders a row of 1–5 stars. Filled stars use `color` (gold by default);
 * empty stars use a faint stroke only. Supports fractional scores via a
 * half-filled middle star is not implemented — fractional scores are rounded
 * to the nearest whole star for display.
 */
export function StarRating({
  score,
  size = 16,
  gap = 3,
  color = colors.gold,
  emptyColor = colors.line,
}: StarRatingProps) {
  const filled = Math.round(Math.max(0, Math.min(5, score)));
  return (
    <View style={[styles.row, { gap }]}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <Path
            d={STAR_PATH}
            fill={i <= filled ? color : 'none'}
            stroke={i <= filled ? color : emptyColor}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
