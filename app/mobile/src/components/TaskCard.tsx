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
  const filled = task.filledCount ?? 0;
  const fillPct = task.slots > 0 ? Math.min(100, Math.round((filled / task.slots) * 100)) : 0;

  // Straight from the server. The card must never work this out for itself:
  // a card that says one thing and an Apply button that does another is the
  // single failure the eligibility engine exists to prevent.
  const el = task.eligibility;
  const locked = !!el && !el.eligible;
  // The nearest thing to do about it, in the worker's own words. Beyond one
  // blocker the card just says how many, because a card is a decision about
  // whether to tap, not the place to fix anything.
  const lockLine = locked
    ? el!.blockers.length === 1
      ? el!.blockers[0].message
      : `${el!.blockers.length} things needed before you can apply`
    : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        locked
          ? `${task.title}, ${payLabel(task.payModel, task.rate, task.budget)}, locked: ${lockLine}`
          : `${task.title}, ${payLabel(task.payModel, task.rate, task.budget)}`
      }
      style={({ pressed }) => [styles.card, locked && styles.cardLocked, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <TierBadge tier={task.tier} small />
        {locked ? (
          <View style={styles.lockChip}>
            <Icon name="lock" size={11} color={colors.goldInk} />
            <Text style={styles.lockChipText}>Locked</Text>
          </View>
        ) : (
          <Text style={styles.category}>{task.category}</Text>
        )}
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

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${fillPct}%` }]} />
      </View>

      {lockLine ? (
        <View style={styles.lockRow}>
          <Icon name="alert" size={13} color={colors.goldInk} />
          <Text style={styles.lockText} numberOfLines={2}>
            {lockLine}
          </Text>
        </View>
      ) : task.requirementsSummary ? (
        <View style={styles.reqRow}>
          <Icon name="shield" size={13} color={colors.textMuted} />
          <Text style={styles.reqText} numberOfLines={1}>
            {task.requirementsSummary}
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <MoneyText
          amount={task.payModel === 'HOURLY' ? task.rate : task.budget ?? task.rate}
          size={type.size.lg}
          color={colors.clay}
        />
        <Text style={styles.payUnit}>{task.payModel === 'HOURLY' ? '/hr' : ' fixed'}</Text>
        <View style={styles.spacer} />
        <Text style={styles.slots}>
          {filled} of {task.slots} filled
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
  // Dimmed, not hidden. A locked task is still worth seeing - it is the reason
  // to go and upload the document - so it stays legible and stays tappable.
  cardLocked: { borderColor: colors.amberSoft, backgroundColor: colors.surfaceSand },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  lockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 100,
    backgroundColor: colors.amberSoft,
  },
  lockChipText: { color: colors.goldInk, fontSize: 10, fontFamily: fontFamily.bold },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockText: { flex: 1, color: colors.goldInk, fontSize: type.size.sm, lineHeight: 18 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reqText: { flex: 1, color: colors.textMuted, fontSize: type.size.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { color: colors.textMuted, fontSize: type.size.xs, fontWeight: '600' },
  title: { color: colors.text, fontSize: type.size.md, fontFamily: fontFamily.bold, lineHeight: 22 },
  metaRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { color: colors.textMuted, fontSize: type.size.sm },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceSand,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.clay },
  footer: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  payUnit: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  spacer: { flex: 1 },
  slots: { color: colors.text, fontSize: type.size.sm, fontWeight: '600' },
});
