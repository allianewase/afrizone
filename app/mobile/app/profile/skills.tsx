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
 *
 * Restyled onto the navy/gold palette; the selection, grouping, search,
 * dirty-tracking and replace-set save are all unchanged. The chips are local
 * rather than AppChip because a multi-select needs a tick to say what is
 * chosen - AppChip's single-select fill carries no such mark.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppBackHeader,
  AppSearchBar,
  AppPrimaryButton,
  AppEmptyState,
  AppErrorState,
  AppLoadingCards,
} from '../../src/appui/AppUI';
import { Icon } from '../../src/components/Icon';
import { obColors, obRadii } from '../../src/onboarding/onboardingTheme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import type { Skill, MySkill } from '../../src/api/types';

export default function SkillsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AppBackHeader title="Your skills" onBack={() => router.back()} />
        <Text style={styles.subtitle}>{count > 0 ? `${count} selected` : 'What can you do?'}</Text>

        <View style={styles.explainer}>
          <Icon name="alert" size={15} color={obColors.orangeInk} />
          <Text style={styles.explainerText}>
            Skills help us match you to work. They are not checked, so they do not unlock locked
            tasks on their own — add your documents for that.
          </Text>
        </View>

        {loading ? (
          <AppLoadingCards count={2} />
        ) : error ? (
          <AppErrorState message={error} onRetry={() => { catalogue.reload(); mine.reload(); }} />
        ) : (
          <>
            <View style={{ marginBottom: 16 }}>
              <AppSearchBar value={query} onChangeText={setQuery} placeholder="Search skills" />
            </View>

            {groups.length === 0 ? (
              <AppEmptyState icon="search" title="No matches" message="Try a different word." />
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
                          {on ? <Icon name="check" size={13} color={obColors.goldDeep} /> : null}
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
              <AppPrimaryButton
                label={dirty ? 'Save skills' : 'No changes to save'}
                onPress={save}
                loading={saving}
                disabled={!dirty || saving}
              />
              <AppPrimaryButton label="Back to profile" variant="outline" onPress={() => router.back()} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  subtitle: { fontSize: 13, color: obColors.textMut, marginTop: -8, marginBottom: 16 },
  explainer: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: obColors.orangeInkBg,
    borderRadius: obRadii.card,
    padding: 13,
    marginBottom: 16,
  },
  explainerText: { flex: 1, color: obColors.text, fontSize: 12.5, lineHeight: 18 },
  group: { marginBottom: 20 },
  groupTitle: {
    color: obColors.textMut,
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  retiredNote: { color: obColors.textMut, fontSize: 11.5, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
    minHeight: 40,
    borderRadius: obRadii.chip,
    borderWidth: 1.3,
    borderColor: obColors.line,
    backgroundColor: obColors.white,
  },
  chipOn: { borderColor: obColors.goldDeep, backgroundColor: obColors.roleSelectedBg },
  chipRetired: { opacity: 0.6, borderStyle: 'dashed' },
  chipText: { color: obColors.text, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: obColors.navy, fontWeight: '800' },
  error: { color: obColors.dangerInk, fontSize: 12.5, marginBottom: 8 },
  saved: { color: obColors.forest, fontSize: 12.5, fontWeight: '700', marginBottom: 8 },
  actions: { gap: 10, marginTop: 12 },
});
