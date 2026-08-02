import React, { useId } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import Svg, { Path, Defs, Pattern, RadialGradient, Stop, Mask, Rect } from 'react-native-svg';

/**
 * "Sunrise Cut" chevron motif — a repeating geometric pattern echoing the
 * angular lines of the Africa+cart logo mark. See DESIGN_SPEC §1.5 (Adinkra/
 * kente geometry) and the "Sunrise Cut" visual system. Two usages only:
 * a thin section divider, and a large low-opacity background watermark on
 * brand moments — never behind dense data.
 *
 * The chevron is drawn as a thin open stroke (not a filled shape) on a
 * generously-spaced tile, so tiled at low opacity it reads as a light
 * scatter of marks rather than a solid wallpaper block.
 */

const UNIT = 30;
const MARK = `M${UNIT * 0.28} ${UNIT * 0.62} L${UNIT / 2} ${UNIT * 0.32} L${UNIT * 0.72} ${UNIT * 0.62}`;

interface PatternDividerProps {
  color: string;
  opacity?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/** Thin repeating-chevron strip used in place of a plain hairline divider. */
export function PatternDivider({ color, opacity = 0.4, height = 10, style }: PatternDividerProps) {
  const id = `chevronDivider-${useId()}`;
  return (
    <View style={[{ height, opacity, overflow: 'hidden' }, style]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${UNIT * 8} ${UNIT}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id={id} width={UNIT} height={UNIT} patternUnits="userSpaceOnUse">
            <Path d={MARK} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Pattern>
        </Defs>
        <Path d={`M0 0 H${UNIT * 8} V${UNIT} H0 Z`} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

interface PatternWatermarkProps {
  color: string;
  opacity?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Large low-opacity chevron field for brand-moment backgrounds (auth hero,
 * empty states). Fades to nothing at the edges (SVG radial mask) so it never
 * shows a hard rectangular boundary against the surrounding surface.
 */
export function PatternWatermark({ color, opacity = 0.1, size = 260, style }: PatternWatermarkProps) {
  const uid = useId();
  const patternId = `chevronWatermark-${uid}`;
  const gradId = `chevronFade-${uid}`;
  const maskId = `chevronMask-${uid}`;
  return (
    <View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, opacity, overflow: 'hidden' }, style]}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <Pattern id={patternId} width={UNIT} height={UNIT} patternUnits="userSpaceOnUse">
            <Path d={MARK} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Pattern>
          <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#fff" stopOpacity={1} />
            <Stop offset="55%" stopColor="#fff" stopOpacity={1} />
            <Stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
          <Mask id={maskId}>
            <Rect x={0} y={0} width={size} height={size} fill={`url(#${gradId})`} />
          </Mask>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${patternId})`} mask={`url(#${maskId})`} />
      </Svg>
    </View>
  );
}
