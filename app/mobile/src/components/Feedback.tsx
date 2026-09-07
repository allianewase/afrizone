import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, type, spacing, radii, fontFamily, shadow } from '../theme';
import { Icon, IconName } from './Icon';
import { Button } from './Button';

/** Full-screen-ish loading state with skeleton-friendly spinner. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator color={colors.clay} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

/** Error state with retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Icon name="alert" size={36} color={colors.danger} />
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? (
        <View style={styles.retry}>
          <Button label="Try again" variant="secondary" onPress={onRetry} full={false} />
        </View>
      ) : null}
    </View>
  );
}

/** Empty state with brand motif feel (icon + copy). */
export function EmptyState({
  icon = 'list',
  title,
  message,
}: {
  icon?: IconName;
  title: string;
  message?: string;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.motif}>
        <Icon name={icon} size={30} color={colors.clay} />
      </View>
      <Text style={styles.errorTitle}>{title}</Text>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </View>
  );
}

/** Inline banner (KYC nudge, offline). */
export function Banner({
  tone = 'amber',
  icon = 'alert',
  title,
  message,
  action,
  onAction,
}: {
  tone?: 'amber' | 'indigo' | 'danger' | 'money';
  icon?: IconName;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  const palette = {
    amber: { fg: colors.goldInk, bg: colors.amberSoft },
    indigo: { fg: colors.indigo, bg: colors.indigoSoft },
    danger: { fg: colors.dangerInk, bg: colors.dangerSoft },
    money: { fg: colors.moneyInk, bg: colors.moneySoft },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Icon name={icon} size={20} color={palette.fg} />
      <View style={styles.bannerBody}>
        <Text style={[styles.bannerTitle, { color: palette.fg }]}>{title}</Text>
        {message ? <Text style={styles.bannerMsg}>{message}</Text> : null}
      </View>
      {action && onAction ? (
        <Button label={action} variant="ghost" onPress={onAction} full={false} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.sm,
    minHeight: 220,
  },
  // maxWidth keeps a long message reading as a sentence rather than a banner
  // stretched edge to edge on a wider phone - it is explanation, not a title.
  muted: {
    color: colors.textMuted,
    fontSize: type.size.base,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  // fontFamily, not the raw fontWeight this carried before: every other
  // title in the app sets Raleway's weight through fontFamily, and a numeric
  // fontWeight does not reliably select the matching custom weight face on
  // every platform the way the named family does.
  errorTitle: { color: colors.text, fontSize: type.size.md, fontFamily: fontFamily.extrabold },
  retry: { marginTop: spacing.sm },
  motif: {
    width: 72,
    height: 72,
    borderRadius: 24,
    // "Sunrise Cut": the sharp corner every surface in this app pairs with a
    // rounded radius on the opposite one. The icon well had been a plain
    // rounded square - the one shape nothing else here uses.
    borderTopRightRadius: radii.cut,
    backgroundColor: colors.claySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadow.tight,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
  },
  bannerBody: { flex: 1, gap: 2 },
  bannerTitle: { fontWeight: '700', fontSize: type.size.base },
  bannerMsg: { color: colors.text, fontSize: type.size.sm, lineHeight: 18 },
});
