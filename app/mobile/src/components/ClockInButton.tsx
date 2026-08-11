import React from 'react';
import { Pressable, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, type, spacing, shadow } from '../theme';
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
 * Touch target well above 44px.
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
  const color = clockedIn ? colors.danger : colors.money;

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
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Icon name={clockedIn ? 'stop' : 'play'} size={34} color={colors.white} />
            <Text style={styles.label}>{clockedIn ? 'Clock out' : 'Clock in'}</Text>
          </>
        )}
      </Pressable>

      <GeofencePill state={geofence} blocked={blocked} />
    </View>
  );
}

function GeofencePill({ state, blocked }: { state: GeofenceState; blocked: boolean }) {
  const meta =
    state === 'in-fence'
      ? { word: 'Inside work zone', fg: colors.money, bg: colors.moneySoft, icon: 'map-pin' as const }
      : state === 'syncing'
        ? { word: 'Checking location…', fg: colors.indigo, bg: colors.indigoSoft, icon: 'globe' as const }
        : {
            word: blocked ? 'Outside zone: blocked' : 'Outside work zone',
            fg: colors.amber,
            bg: colors.amberSoft,
            icon: 'alert' as const,
          };
  return (
    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
      <Icon name={meta.icon} size={14} color={meta.fg} />
      <Text style={[styles.pillText, { color: meta.fg }]}>{meta.word}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md },
  circle: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...shadow.card,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.5 },
  label: { color: colors.white, fontSize: type.size.lg, fontWeight: '800' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100,
  },
  pillText: { fontWeight: '600', fontSize: type.size.base },
});
