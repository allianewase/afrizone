import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { colors, type, spacing, layout } from '../theme';
import { Icon, IconName } from './Icon';

interface ListRowProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  chevron = true,
  danger,
}: ListRowProps) {
  const Wrapper: React.ElementType = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }: { pressed?: boolean }) => [styles.row, pressed && styles.pressed]}
    >
      {icon ? (
        <View style={styles.iconWrap}>
          <Icon name={icon} size={20} color={danger ? colors.danger : colors.clay} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={[styles.title, danger && { color: colors.dangerInk }]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && chevron && !right ? (
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      ) : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.6 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceSand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: type.size.md, fontWeight: '600' },
  subtitle: { color: colors.textMuted, fontSize: type.size.sm },
});
