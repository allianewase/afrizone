/**
 * Skills picker.
 *
 * Every selection is local until "Save", and the whole set goes up in one
 * request. That is not laziness about incremental saves - it is the point. A
 * worker tapping through fifteen chips on a patchy connection must not end up
 * with an arbitrary subset stored, and the server's PUT is a replace-set for
 * the same reason.
 *
 * There is deliberately no verified badge anywhere on this screen. Skills are
 * the worker's own word and unlock nothing; only credentials do. Saying
 * otherwise here would be a promise the eligibility engine breaks.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { LoadingState, ErrorState, EmptyState } from '../../src/components/Feedback';
import { colors, spacing, type, radii, fontFamily } from '../../src/theme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import type { Skill, MySkill } from '../../src/api/types';

export default function SkillsScreen() {
  const router = useRouter();
  const catalogue = useAsync((signal) => api.skillCatalogue(signal));
  const mine = useAsync((signal) => api.mySkills(signal));

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the local selection once the worker's current set arrives.
  useEffect(() => {
    if (mine.data && selected === null) {
      setSelected(new Set(mine.data.map((s: MySkill) => s.skillId)));
    }
  }, [mine.data, selected]);

  const groups = useMemo(() => {
    const list = (catalogue.data ?? []).filter((s: Skill) =>
      query.trim() ? s.name.toLowerCase().includes(query.trim().toLowerCase()) : true
    );
    const map = new Map<string, Skill[]>();
    for (const s of list) {
      const arr = map.get(s.group) ?? [];
      arr.push(s);
      map.set(s.group, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalogue.data, query]);

  // A skill retired from the catalogue after this worker declared it. Shown so
  // their profile does not appear to have silently lost an entry.
  const retired = (mine.data ?? []).filter((s: MySkill) => s.retired);

  const dirty = useMemo(() => {
    if (!selected || !mine.data) return false;
    const before = new Set(mine.data.map((s: MySkill) => s.skillId));
    if (before.size !== selected.size) return true;
    for (const id of selected) if (!before.has(id)) return true;
    return false;
  }, [selected, mine.data]);

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveMySkills([...selected].map((skillId) => ({ skillId })));
      mine.reload();
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not save your skills.');
    } finally {
      setSaving(false);
    }
  }

  const loading = catalogue.loading || mine.loading;
  const error = catalogue.error ?? mine.error;
  const count = selected?.size ?? 0;

  return (
    <Screen
      title="Your skills"
      subtitle={count > 0 ? `${count} selected` : 'What can you do?'}
      back
    >
      <Card style={styles.explainer}>
        <Icon name="alert" size={15} color={colors.goldInk} />
        <Text style={styles.explainerText}>
          Skills help us match you to work. They are not checked, so they do not unlock locked
          tasks on their own — add your documents for that.
        </Text>
      </Card>

      {loading ? (
        <LoadingState label="Loading skills…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { catalogue.reload(); mine.reload(); }} />
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Icon name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search skills"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
            />
          </View>

          {groups.length === 0 ? (
            <EmptyState icon="search" title="No matches" message="Try a different word." />
          ) : (
            groups.map(([group, items]) => (
              <View key={group} style={styles.group}>
                <Text style={styles.groupTitle}>{group}</Text>
                <View style={styles.chips}>
                  {items.map((s) => {
                    const on = selected?.has(s.id) ?? false;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => toggle(s.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={s.name}
                        style={[styles.chip, on && styles.chipOn]}
                      >
                        {on ? <Icon name="check" size={13} color={colors.clayDeep} /> : null}
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}

          {retired.length > 0 && (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>No longer offered</Text>
              <Text style={styles.retiredNote}>
                These stay on your profile, but cannot be re-added if you remove them.
              </Text>
              <View style={styles.chips}>
                {retired.map((s) => (
                  <View key={s.skillId} style={[styles.chip, styles.chipRetired]}>
                    <Text style={styles.chipText}>{s.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
          {saved && !dirty ? <Text style={styles.saved}>Saved</Text> : null}

          <View style={styles.actions}>
            <Button
              label={dirty ? 'Save skills' : 'No changes to save'}
              onPress={save}
              loading={saving}
              disabled={!dirty || saving}
            />
            <Button label="Back to profile" variant="ghost" onPress={() => router.back()} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  explainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.amberSoft,
    borderColor: colors.amberSoft,
    marginBottom: spacing.md,
  },
  explainerText: { flex: 1, color: colors.text, fontSize: type.size.sm, lineHeight: 19 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  search: { flex: 1, paddingVertical: spacing.sm, color: colors.text, fontSize: type.size.base },
  group: { marginBottom: spacing.lg },
  groupTitle: {
    color: colors.textMuted,
    fontSize: type.size.xs,
    fontFamily: fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  retiredNote: { color: colors.textMuted, fontSize: type.size.xs, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.clay, backgroundColor: colors.claySoft },
  chipRetired: { opacity: 0.6, borderStyle: 'dashed' },
  chipText: { color: colors.text, fontSize: type.size.sm },
  chipTextOn: { color: colors.clayDeep, fontFamily: fontFamily.bold },
  error: { color: colors.dangerInk, fontSize: type.size.sm, marginBottom: spacing.sm },
  saved: { color: colors.moneyInk, fontSize: type.size.sm, marginBottom: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
