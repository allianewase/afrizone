import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radii, type, fontFamily } from '../theme';
import { Icon } from './Icon';
import { Button } from './Button';

interface SuccessCardProps {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  children?: React.ReactNode;
}

/** Full celebratory confirmation state (password reset, account created, etc.): a
 * big gold check badge in place of a plain inline banner. */
export function SuccessCard({ title, message, actionLabel, onAction, children }: SuccessCardProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Icon name="check-circle" size={36} color={colors.goldBright} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {children}
      <Button label={actionLabel} icon="chevron-right" onPress={onAction} style={styles.action} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderTopRightRadius: radii.cut * 3,
    backgroundColor: colors.claySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { color: colors.text, fontSize: type.size.xl, fontFamily: fontFamily.extrabold, textAlign: 'center' },
  message: {
    color: colors.textMuted,
    fontSize: type.size.base,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },
});
