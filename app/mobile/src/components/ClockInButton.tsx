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
  // The fill has to carry a white label, and the palette swap re-opened the
  // contrast question the old comment here settled. `mgreen` is 3.45:1 under
  // white - the identical figure that got the old `money` rejected - so
  // clock-in uses `forest` at 8.0:1. Clock-out keeps red, but the new
  // `danger` is 4.38:1 where the old one was 4.81:1, which is why the label
  // below is 19px: bold type at 18.66px or more is large text, so the floor
  // it must clear is 3:1 rather than 4.5:1.
  const color = clockedIn ? obColors.danger : obColors.forest;

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
 * The state colour lives in the fill and the icon; the words are `text`
 * throughout. Tinting 13px labels to match their own pill puts the amber
 * state at 3.12:1 on its own background, and picking a darker ink for that
 * one case only would leave three pills that disagree about what a pill is.
 */
function GeofencePill({ state, blocked }: { state: GeofenceState; blocked: boolean }) {
  const meta =
    state === 'in-fence'
      ? { word: 'Inside work zone', fg: obColors.forest, bg: obColors.mgreenBg, icon: 'map-pin' as const }
      : state === 'syncing'
        ? { word: 'Checking location…', fg: obColors.indigo, bg: obColors.indigoBg, icon: 'globe' as const }
        : {
            word: blocked ? 'Outside zone: blocked' : 'Outside work zone',
            fg: obColors.orangeInk,
            bg: obColors.orangeInkBg,
            icon: 'alert' as const,
          };
  return (
    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
      <Icon name={meta.icon} size={14} color={meta.fg} />
      <Text style={styles.pillText}>{meta.word}</Text>
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
  label: { color: obColors.white, fontSize: 19, fontFamily: 'Raleway_800ExtraBold' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100,
  },
  pillText: { color: obColors.text, fontWeight: '700', fontSize: 13 },
});
