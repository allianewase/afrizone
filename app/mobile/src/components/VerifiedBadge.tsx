/**
 * What a credential's standing means, in words a worker can act on.
 *
 * The wording is the point. Each label says either what Afrizone has done or
 * what the worker should do next - never an internal status name. In
 * particular "Added by you" is kept strictly separate from "Checked by us":
 * a self-declared entry must never borrow the appearance of something a person
 * verified, because the difference is exactly what decides whether it can
 * unlock work.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors, spacing, type, fontFamily } from '../theme';
import type { CredentialState } from '../api/types';

type Tone = 'ok' | 'wait' | 'bad' | 'plain';

const STATES: Record<CredentialState, { label: string; tone: Tone; icon: IconName }> = {
  VERIFIED: { label: 'Checked by us', tone: 'ok', icon: 'check-circle' },
  PENDING: { label: 'Being checked', tone: 'wait', icon: 'clock' },
  REJECTED: { label: 'Send a clearer copy', tone: 'bad', icon: 'alert' },
  REVOKED: { label: 'No longer accepted', tone: 'bad', icon: 'alert' },
  EXPIRED: { label: 'Expired', tone: 'bad', icon: 'alert' },
  SELF_DECLARED: { label: 'Added by you', tone: 'plain', icon: 'id' },
};

const TONES: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: colors.moneySoft, fg: colors.moneyInk },
  wait: { bg: colors.amberSoft, fg: colors.goldInk },
  bad: { bg: colors.dangerSoft, fg: colors.dangerInk },
  plain: { bg: colors.surfaceSand, fg: colors.textMuted },
};

export function VerifiedBadge({ state, small }: { state: CredentialState; small?: boolean }) {
  const cfg = STATES[state] ?? STATES.PENDING;
  const tone = TONES[cfg.tone];
  return (
    <View style={[styles.wrap, { backgroundColor: tone.bg }, small && styles.small]}>
      <Icon name={cfg.icon} size={small ? 11 : 13} color={tone.fg} />
      <Text style={[styles.label, { color: tone.fg }, small && styles.labelSmall]} numberOfLines={1}>
        {cfg.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: 100,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 7, paddingVertical: 3 },
  label: { fontSize: type.size.xs, fontFamily: fontFamily.bold },
  labelSmall: { fontSize: 10 },
});
