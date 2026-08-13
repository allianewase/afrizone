import React, { useId } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import Svg, { Path, Defs, Pattern, RadialGradient, Stop, Mask, Rect } from 'react-native-svg';

/**
 * "Sunrise Cut" chevron motif: a repeating geometric pattern echoing the
 * angular lines of the Africa+cart logo mark. See DESIGN_SPEC §1.5 (Adinkra/
 * kente geometry) and the "Sunrise Cut" visual system. Two usages only:
 * a thin section divider, and a large low-opacity background watermark on
 * brand moments: never behind dense data.
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

const TOPO_UNIT = 64;
// Three nested wavy contour lines per tile: an organic, map-like texture
// (distinct from the angular chevron above) for the welcome hero panel only.
const TOPO_LINES = [
  `M0 18 Q16 4 32 18 T64 18`,
  `M0 34 Q16 20 32 34 T64 34`,
  `M0 50 Q16 36 32 50 T64 50`,
];

interface TopoPatternProps {
  color: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}

/** Repeating topographic contour-line texture: fills its container. */
export function TopoPattern({ color, opacity = 0.16, style }: TopoPatternProps) {
  const id = `topo-${useId()}`;
  return (
    <View style={[{ opacity, overflow: 'hidden' }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${TOPO_UNIT * 3} ${TOPO_UNIT * 3}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id={id} width={TOPO_UNIT} height={TOPO_UNIT} patternUnits="userSpaceOnUse">
            {TOPO_LINES.map((d, i) => (
              <Path key={i} d={d} stroke={color} strokeWidth={1.4} fill="none" />
            ))}
          </Pattern>
        </Defs>
        <Path d={`M0 0 H${TOPO_UNIT * 3} V${TOPO_UNIT * 3} H0 Z`} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

interface WaveDividerProps {
  color: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/** Organic wave shape that caps a hero panel (Saad Shaikh-style onboarding),
 * replacing a straight edge between the colored hero and the content below. */
export function WaveDivider({ color, height = 56, style }: WaveDividerProps) {
  return (
    <View style={[{ height }, style]}>
      <Svg width="100%" height={height} viewBox="0 0 100 30" preserveAspectRatio="none">
        <Path d="M0 8 C 22 24, 45 0, 68 12 C 82 19, 92 10, 100 6 L100 30 L0 30 Z" fill={color} />
      </Svg>
    </View>
  );
}
