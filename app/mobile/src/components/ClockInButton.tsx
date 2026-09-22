import React from 'react';
import { Pressable, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { obColors } from '../onboarding/onboardingTheme';
import { Icon } from './Icon';

export type GeofenceState = 'in-fence' | 'out-of-fence' | 'syncing';

interface ClockInButtonProps {
  clockedIn: boolean;
  geofence: GeofenceState;
  /** Out-of-fence is a WARN (Open Q2) not a hard block by default. */
  blockOutOfFence?: boolean;
  busy?: boolean;
  onToggle: () => void;
}

/**
 * Big circular Clock in/out button with geofence state (§5 Active task).
 * Touch target well above 44px. Restyled onto the navy/gold palette with the
 * rest of the app; only this screen uses it, so nothing else moved.
 */
export function ClockInButton({
  clockedIn,
  geofence,
  blockOutOfFence = false,
  busy,
  onToggle,
}: ClockInButtonProps) {
  const blocked = blockOutOfFence && geofence === 'out-of-fence';
  const disabled = busy || blocked;
  // The fill has to carry a white label, so both of these are the palette's
  // ink-weight tones rather than its fills: `mgreen` is 3.45:1 under white -
  // the identical figure that got the old `money` rejected - and `danger` is
  // 4.38:1. `forest` is 8.0:1 and `dangerInk` 6.59:1.
  const color = clockedIn ? obColors.dangerInk : obColors.forest;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={clockedIn ? 'Clock out' : 'Clock in'}
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [
          styles.circle,
          { backgroundColor: color },
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={obColors.white} />
        ) : (
          <>
            <Icon name={clockedIn ? 'stop' : 'play'} size={34} color={obColors.white} />
            <Text style={styles.label}>{clockedIn ? 'Clock out' : 'Clock in'}</Text>
          </>
        )}
      </Pressable>

      <GeofencePill state={geofence} blocked={blocked} />
    </View>
  );
}

/**
 * Each state's fill and glyph take its brighter colour; the label takes the
 * ink-weight twin, since none of the fills carry 13px type on their own tint
 * (amber is 3.12:1 there).
 */
function GeofencePill({ state, blocked }: { state: GeofenceState; blocked: boolean }) {
  const meta =
    state === 'in-fence'
      ? { word: 'Inside work zone', fg: obColors.forest, ink: obColors.forest, bg: obColors.mgreenBg, icon: 'map-pin' as const }
      : state === 'syncing'
        ? { word: 'Checking location…', fg: obColors.indigo, ink: obColors.indigo, bg: obColors.indigoBg, icon: 'globe' as const }
        : {
            word: blocked ? 'Outside zone: blocked' : 'Outside work zone',
            fg: obColors.orangeInk,
            ink: obColors.amberInk,
            bg: obColors.orangeInkBg,
            icon: 'alert' as const,
          };
  return (
    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
      <Icon name={meta.icon} size={14} color={meta.fg} />
      <Text style={[styles.pillText, { color: meta.ink }]}>{meta.word}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 14 },
  circle: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.5 },
  label: { color: obColors.white, fontSize: 18, fontFamily: 'Raleway_800ExtraBold' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100,
  },
  pillText: { fontWeight: '700', fontSize: 13 },
});
