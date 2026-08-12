import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, type, shadow, fontFamily } from '../theme';
import { Icon } from './Icon';
import { TierBadge } from './TierBadge';
import { MoneyText } from './MoneyText';
import { payLabel, formatDate } from '../lib/format';
import type { Task } from '../api/types';

interface TaskCardProps {
  task: Task;
  onPress?: () => void;
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const remote = task.locationType === 'REMOTE';
  const slotsLeft = Math.max(0, task.slots - (task.filledCount ?? 0));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${payLabel(task.payModel, task.rate, task.budget)}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <TierBadge tier={task.tier} small />
        <Text style={styles.category}>{task.category}</Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {task.title}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Icon name={remote ? 'globe' : 'map-pin'} size={14} color={colors.textMuted} />
          <Text style={styles.metaText} numberOfLines={1}>
            {remote ? 'Remote' : task.address || 'On-site'}
          </Text>
        </View>
        <View style={styles.meta}>
          <Icon name="clock" size={14} color={colors.textMuted} />
          <Text style={styles.metaText}>Closes {formatDate(task.deadline)}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <MoneyText
          amount={task.payModel === 'HOURLY' ? task.rate : task.budget ?? task.rate}
          size={type.size.lg}
          color={colors.clay}
        />
        <Text style={styles.payUnit}>{task.payModel === 'HOURLY' ? '/hr' : ' fixed'}</Text>
        <View style={styles.spacer} />
        <Text style={styles.slots}>
          {slotsLeft} {slotsLeft === 1 ? 'slot' : 'slots'} left
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderTopRightRadius: radii.cut,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.soft,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { color: colors.textMuted, fontSize: type.size.xs, fontWeight: '600' },
  title: { color: colors.text, fontSize: type.size.md, fontFamily: fontFamily.bold, lineHeight: 22 },
  metaRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { color: colors.textMuted, fontSize: type.size.sm },
  footer: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  payUnit: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  spacer: { flex: 1 },
  slots: { color: colors.text, fontSize: type.size.sm, fontWeight: '600' },
});
