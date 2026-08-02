import React from 'react';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Single-stroke icon set (Lucide-style, 2px) per §1.6. No emoji as icons.
 * Add new glyphs to PATHS below as needed.
 */
export type IconName =
  | 'home'
  | 'list'
  | 'wallet'
  | 'briefcase'
  | 'user'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'check'
  | 'check-circle'
  | 'clock'
  | 'map-pin'
  | 'globe'
  | 'alert'
  | 'arrow-up'
  | 'arrow-down'
  | 'shield'
  | 'bell'
  | 'bank'
  | 'logout'
  | 'phone'
  | 'camera'
  | 'id'
  | 'wifi-off'
  | 'play'
  | 'stop'
  | 'mail'
  | 'lock'
  | 'key'
  | 'search'
  | 'close'
  | 'filter'
  | 'star'
  | 'dollar'
  | 'cart';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color = colors.text, strokeWidth = 2 }: IconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image">
      {renderGlyph(name, common)}
    </Svg>
  );
}

function renderGlyph(
  name: IconName,
  c: {
    stroke: string;
    strokeWidth: number;
    strokeLinecap: 'round';
    strokeLinejoin: 'round';
    fill: 'none';
  }
) {
  switch (name) {
    case 'home':
      return (
        <>
          <Path d="M3 10.5 12 3l9 7.5" {...c} />
          <Path d="M5 9.5V21h14V9.5" {...c} />
        </>
      );
    case 'list':
      return (
        <>
          <Line x1="8" y1="6" x2="21" y2="6" {...c} />
          <Line x1="8" y1="12" x2="21" y2="12" {...c} />
          <Line x1="8" y1="18" x2="21" y2="18" {...c} />
          <Line x1="3" y1="6" x2="3.01" y2="6" {...c} />
          <Line x1="3" y1="12" x2="3.01" y2="12" {...c} />
          <Line x1="3" y1="18" x2="3.01" y2="18" {...c} />
        </>
      );
    case 'wallet':
      return (
        <>
          <Path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" {...c} />
          <Rect x="3" y="8" width="18" height="11" rx="2.5" {...c} />
          <Circle cx="16.5" cy="13.5" r="1.3" fill={c.stroke} />
        </>
      );
    case 'briefcase':
      return (
        <>
          <Rect x="3" y="7" width="18" height="13" rx="2" {...c} />
          <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...c} />
          <Line x1="3" y1="12" x2="21" y2="12" {...c} />
        </>
      );
    case 'user':
      return (
        <>
          <Circle cx="12" cy="8" r="4" {...c} />
          <Path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" {...c} />
        </>
      );
    case 'chevron-right':
      return <Polyline points="9 6 15 12 9 18" {...c} />;
    case 'chevron-left':
      return <Polyline points="15 6 9 12 15 18" {...c} />;
    case 'chevron-down':
      return <Polyline points="6 9 12 15 18 9" {...c} />;
    case 'check':
      return <Polyline points="20 6 9 17 4 12" {...c} />;
    case 'check-circle':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Polyline points="8.5 12 11 14.5 16 9" {...c} />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Polyline points="12 7 12 12 16 14" {...c} />
        </>
      );
    case 'map-pin':
      return (
        <>
          <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" {...c} />
          <Circle cx="12" cy="10" r="3" {...c} />
        </>
      );
    case 'globe':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Line x1="3" y1="12" x2="21" y2="12" {...c} />
          <Path d="M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" {...c} />
        </>
      );
    case 'alert':
      return (
        <>
          <Path d="M12 3 2 20h20L12 3Z" {...c} />
          <Line x1="12" y1="9" x2="12" y2="14" {...c} />
          <Line x1="12" y1="17.5" x2="12.01" y2="17.5" {...c} />
        </>
      );
    case 'arrow-up':
      return (
        <>
          <Line x1="12" y1="19" x2="12" y2="5" {...c} />
          <Polyline points="6 11 12 5 18 11" {...c} />
        </>
      );
    case 'arrow-down':
      return (
        <>
          <Line x1="12" y1="5" x2="12" y2="19" {...c} />
          <Polyline points="6 13 12 19 18 13" {...c} />
        </>
      );
    case 'shield':
      return <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" {...c} />;
    case 'bell':
      return (
        <>
          <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" {...c} />
          <Path d="M13.7 21a2 2 0 0 1-3.4 0" {...c} />
        </>
      );
    case 'bank':
      return (
        <>
          <Polyline points="3 9 12 4 21 9" {...c} />
          <Line x1="5" y1="9" x2="5" y2="18" {...c} />
          <Line x1="10" y1="9" x2="10" y2="18" {...c} />
          <Line x1="14" y1="9" x2="14" y2="18" {...c} />
          <Line x1="19" y1="9" x2="19" y2="18" {...c} />
          <Line x1="3" y1="20" x2="21" y2="20" {...c} />
        </>
      );
    case 'logout':
      return (
        <>
          <Path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" {...c} />
          <Polyline points="16 8 20 12 16 16" {...c} />
          <Line x1="20" y1="12" x2="9" y2="12" {...c} />
        </>
      );
    case 'phone':
      return (
        <Path
          d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 13l2 5v3a1 1 0 0 1-1 1A16 16 0 0 1 4 6a1 1 0 0 1 1-2Z"
          {...c}
        />
      );
    case 'camera':
      return (
        <>
          <Path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" {...c} />
          <Circle cx="12" cy="12.5" r="3.2" {...c} />
        </>
      );
    case 'id':
      return (
        <>
          <Rect x="3" y="5" width="18" height="14" rx="2" {...c} />
          <Circle cx="8.5" cy="11" r="2" {...c} />
          <Line x1="13" y1="9.5" x2="18" y2="9.5" {...c} />
          <Line x1="13" y1="13" x2="18" y2="13" {...c} />
        </>
      );
    case 'wifi-off':
      return (
        <>
          <Line x1="2" y1="2" x2="22" y2="22" {...c} />
          <Path d="M8.5 16.5a5 5 0 0 1 7 0" {...c} />
          <Path d="M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-3-2.2" {...c} />
          <Line x1="12" y1="20" x2="12.01" y2="20" {...c} />
        </>
      );
    case 'play':
      return <Path d="M7 5l12 7-12 7Z" {...c} />;
    case 'stop':
      return <Rect x="6" y="6" width="12" height="12" rx="2" {...c} />;
    case 'mail':
      return (
        <>
          <Rect x="3" y="5" width="18" height="14" rx="2" {...c} />
          <Path d="m3 7 9 6 9-6" {...c} />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect x="4" y="11" width="16" height="9" rx="2" {...c} />
          <Path d="M8 11V7a4 4 0 0 1 8 0v4" {...c} />
        </>
      );
    case 'key':
      return (
        <>
          <Circle cx="8" cy="8" r="4" {...c} />
          <Path d="M11 11l9 9M17 17l2-2M14 14l2-2" {...c} />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="7" {...c} />
          <Line x1="21" y1="21" x2="16.65" y2="16.65" {...c} />
        </>
      );
    case 'close':
      return (
        <>
          <Line x1="18" y1="6" x2="6" y2="18" {...c} />
          <Line x1="6" y1="6" x2="18" y2="18" {...c} />
        </>
      );
    case 'filter':
      return (
        <>
          <Line x1="4" y1="6" x2="20" y2="6" {...c} />
          <Line x1="7" y1="12" x2="17" y2="12" {...c} />
          <Line x1="10" y1="18" x2="14" y2="18" {...c} />
        </>
      );
    case 'star':
      // Five-pointed star — filled when used with fill={color} override on the component.
      return (
        <Path
          d="M12 2l2.9 6.3 6.8.6-5 4.7 1.5 6.8L12 17l-6.2 3.4 1.5-6.8-5-4.7 6.8-.6Z"
          stroke={c.stroke}
          strokeWidth={c.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={c.fill}
        />
      );
    case 'dollar':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Path d="M12 7v10M9.5 9.5h3a1.5 1.5 0 0 1 0 3h-1a1.5 1.5 0 0 0 0 3H15" {...c} />
        </>
      );
    case 'cart':
      return (
        <>
          <Circle cx="9" cy="21" r="1" {...c} />
          <Circle cx="20" cy="21" r="1" {...c} />
          <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" {...c} />
        </>
      );
    default:
      return null;
  }
}
