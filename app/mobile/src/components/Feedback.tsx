import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, type, spacing, radii } from '../theme';
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
    amber: { fg: colors.amber, bg: colors.amberSoft },
    indigo: { fg: colors.indigo, bg: colors.indigoSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
    money: { fg: colors.money, bg: colors.moneySoft },
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
  muted: { color: colors.textMuted, fontSize: type.size.base, textAlign: 'center' },
  errorTitle: { color: colors.text, fontSize: type.size.md, fontWeight: '700' },
  retry: { marginTop: spacing.sm },
  motif: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.claySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
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
