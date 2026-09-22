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
import { obColors } from '../onboarding/onboardingTheme';
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

/**
 * `icon` and `ink` differ only where the tone's own colour cannot carry a
 * 10px label on its own tint. That is amber alone: `orangeInk` is 3.12:1
 * there and has no darker variant, so it keeps the colour in the glyph. The
 * rest clear 4.5:1 (forest 7.2, dangerInk 5.67 on its tint).
 */
const TONES: Record<Tone, { bg: string; icon: string; ink: string }> = {
  ok: { bg: obColors.mgreenBg, icon: obColors.forest, ink: obColors.forest },
  wait: { bg: obColors.orangeInkBg, icon: obColors.orangeInk, ink: obColors.text },
  bad: { bg: obColors.dangerBg, icon: obColors.danger, ink: obColors.dangerInk },
  plain: { bg: obColors.sand, icon: obColors.textMut, ink: obColors.text },
};

export function VerifiedBadge({ state, small }: { state: CredentialState; small?: boolean }) {
  const cfg = STATES[state] ?? STATES.PENDING;
  const tone = TONES[cfg.tone];
  return (
    <View style={[styles.wrap, { backgroundColor: tone.bg }, small && styles.small]}>
      <Icon name={cfg.icon} size={small ? 11 : 13} color={tone.icon} />
      <Text style={[styles.label, { color: tone.ink }, small && styles.labelSmall]} numberOfLines={1}>
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
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 100,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 7, paddingVertical: 3 },
  label: { fontSize: 11, fontWeight: '700' },
  labelSmall: { fontSize: 10 },
});
