import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Animated, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, IconName } from '../components/Icon';
import { formatNaira } from '../lib/format';
import { obColors, obRadii } from '../onboarding/onboardingTheme';

/**
 * Shared presentational kit for the main-app screens being restyled to match
 * C:\Users\hb\Downloads\afrizone-mobile-prototype (1).html - starting with
 * Home, and built for reuse by Wallet/Tasks/Jobs/Profile next rather than
 * being Home-only. Deliberately separate from the existing shared components
 * (KpiCard, TaskCard, Card, Feedback...) rather than editing those in place:
 * those are used by every screen, restyled and not, and editing them now
 * would ripple the new look everywhere at once - the opposite of the
 * one-screen-at-a-time rollout this was asked for.
 */

// ─── KPI card ───────────────────────────────────────────────────────────────

export function AppKpiCard({
  icon,
  iconColor,
  iconBg,
  label,
  value,
  money,
  decimals = 0,
}: {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  label: string;
  value: number;
  money?: boolean;
  decimals?: number;
}) {
  const displayValue = money ? formatNaira(value) : value.toFixed(decimals);
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={15} color={iconColor} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {displayValue}
      </Text>
    </View>
  );
}

// ─── Icon button (notification bell chrome) ────────────────────────────────

export function AppIconButton({
  icon,
  onPress,
  showDot,
  accessibilityLabel,
}: {
  icon: IconName;
  onPress: () => void;
  showDot?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={styles.iconBtn}>
      <Icon name={icon} size={18} color={obColors.text} />
      {showDot ? <View style={styles.iconBtnDot} /> : null}
    </Pressable>
  );
}

// ─── Banner ─────────────────────────────────────────────────────────────────

export function AppBanner({
  title,
  message,
  icon = 'alert',
  onPress,
}: {
  title: string;
  message: string;
  icon?: IconName;
  onPress?: () => void;
}) {
  const Wrapper: React.ElementType = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={styles.banner} accessibilityRole={onPress ? 'button' : undefined}>
      <Icon name={icon} size={19} color={obColors.violet} />
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerMsg}>{message}</Text>
      </View>
      {onPress ? <Icon name="chevron-right" size={16} color={obColors.violet} /> : null}
    </Wrapper>
  );
}

// ─── Search bar + chips ─────────────────────────────────────────────────────

export function AppSearchBar({
  value,
  onChangeText,
  placeholder,
  onFilterPress,
  filterActive,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  onFilterPress?: () => void;
  filterActive?: boolean;
}) {
  return (
    <View style={styles.searchBar}>
      <Icon name="search" size={15} color={obColors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={obColors.textFaint}
        style={styles.searchInput}
        returnKeyType="search"
      />
      {onFilterPress ? (
        <Pressable onPress={onFilterPress} hitSlop={8} accessibilityLabel="Filters">
          <Icon name="filter" size={16} color={filterActive ? obColors.goldDeep : obColors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function AppChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowContent}>
      {children}
    </ScrollView>
  );
}

export function AppChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

// ─── Back header (stacked/detail screens) ──────────────────────────────────

export function AppBackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.backHead}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={styles.backBtn}>
        <Icon name="chevron-left" size={17} color={obColors.navy} />
      </Pressable>
      <Text style={styles.backHeadTitle} numberOfLines={1}>{title}</Text>
      {right ?? <View style={{ width: 36 }} />}
    </View>
  );
}

/** Icon + label/value pair, wrapping in a row - the prototype's `.meta-strip .m`. */
export function AppMetaItem({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size={13} color={obColors.textMut} />
      <View>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Segmented control ──────────────────────────────────────────────────────

export function AppSegmented<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K;
  onChange: (k: K) => void;
  options: { key: K; label: string }[];
}) {
  return (
    <View style={styles.segWrap}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segBtn, active && styles.segBtnActive]}>
            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Status pill ────────────────────────────────────────────────────────────

export type AppPillTone = 'await' | 'progress' | 'review' | 'ready' | 'paid' | 'attn';

const PILL_TONE: Record<AppPillTone, { fg: string; bg: string }> = {
  await: { fg: obColors.violet, bg: obColors.violetBg },
  progress: { fg: obColors.orangeInk, bg: obColors.orangeInkBg },
  review: { fg: obColors.indigo, bg: obColors.indigoBg },
  // forest, not mgreen: mgreen on its own tint is 3.10:1, well under what an
  // 11px label needs. `paid` keeps its own darker tint so the two stay apart.
  ready: { fg: obColors.forest, bg: obColors.mgreenBg },
  paid: { fg: obColors.forest, bg: obColors.forestBg },
  attn: { fg: obColors.dangerInk, bg: obColors.dangerBg },
};

export function AppStatusPill({ tone, label }: { tone: AppPillTone; label: string }) {
  const t = PILL_TONE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <View style={[styles.pillDotSm, { backgroundColor: t.fg }]} />
      <Text style={[styles.pillTextSm, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ─── Balance hero (Wallet) ──────────────────────────────────────────────────

export function AppBalanceHero({
  label,
  amount,
  split,
  children,
}: {
  label: string;
  amount: string;
  split: { label: string; value: string }[];
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.heroAmt}>{amount}</Text>
      <View style={styles.heroSplit}>
        {split.map((s) => (
          <View key={s.label} style={{ flex: 1 }}>
            <Text style={styles.heroSplitLabel}>{s.label}</Text>
            <Text style={styles.heroSplitValue}>{s.value}</Text>
          </View>
        ))}
      </View>
      {children ? <View style={{ marginTop: 16 }}>{children}</View> : null}
    </View>
  );
}

export function AppPrimaryButton({
  label,
  icon,
  onPress,
  disabled,
  loading,
  variant = 'gold',
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'gold' | 'outline';
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.primaryBtn,
        variant === 'outline' && styles.primaryBtnOutline,
        isDisabled && { opacity: 0.5 },
        pressed && !isDisabled && { opacity: 0.85 },
      ]}
    >
      {variant === 'gold' && (
        <LinearGradient
          colors={[obColors.gold, obColors.goldDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {icon ? <Icon name={icon} size={15} color={variant === 'outline' ? obColors.navy : obColors.navyPress} /> : null}
      <Text style={[styles.primaryBtnText, variant === 'outline' && { color: obColors.navy }]}>
        {loading ? 'Please wait…' : label}
      </Text>
    </Pressable>
  );
}

// ─── List card / list row ───────────────────────────────────────────────────

export function AppListCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.listCard}>{children}</View>;
}

export function AppListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  last,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const Wrapper: React.ElementType = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={[styles.listRow, !last && styles.listRowDivider]}>
      <View style={styles.listRowIcon}>
        <Icon name={icon} size={17} color={obColors.navy} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.listRowTitle} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={styles.listRowSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </Wrapper>
  );
}

// ─── Section title ──────────────────────────────────────────────────────────

export function AppSectionTitle({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={styles.secTitle}>
      <Text style={styles.secTitleH}>{title}</Text>
      {aside ? <Text style={styles.secTitleAside}>{aside}</Text> : null}
    </View>
  );
}

// ─── Empty / error states ───────────────────────────────────────────────────

export function AppEmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  isError,
}: {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  isError?: boolean;
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, isError && styles.emptyIconError]}>
        <Icon name={icon} size={22} color={isError ? obColors.danger : obColors.navy} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMsg}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.emptyBtn}>
          <Text style={styles.emptyBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AppErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <AppEmptyState icon="alert" title="Couldn't load this" message={message} actionLabel="Retry" onAction={onRetry} isError />;
}

// ─── Loading skeleton ───────────────────────────────────────────────────────

function Shimmer({ style }: { style: object }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, style, { opacity }]} />;
}

export function AppLoadingCards({ count = 2 }: { count?: number }) {
  return (
    <View style={{ gap: 10 }}>
      <Shimmer style={{ width: '40%', height: 11, borderRadius: 6 }} />
      {Array.from({ length: count }).map((_, i) => (
        <Shimmer key={i} style={{ height: 80, borderRadius: obRadii.card }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: obColors.white, borderWidth: 1, borderColor: obColors.line, alignItems: 'center', justifyContent: 'center' },
  backHeadTitle: { flex: 1, fontSize: 18, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy },
  metaItem: { flexDirection: 'row', gap: 8, width: '50%', paddingVertical: 8, alignItems: 'flex-start' },
  metaLabel: { fontSize: 10.5, color: obColors.textMut },
  metaValue: { fontSize: 13, color: obColors.text, fontWeight: '700', marginTop: 1 },

  segWrap: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: 999,
    padding: 4,
  },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999 },
  segBtnActive: { backgroundColor: obColors.navy },
  segText: { fontSize: 13, fontWeight: '700', color: obColors.textMut },
  segTextActive: { color: obColors.white },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start' },
  pillDotSm: { width: 6, height: 6, borderRadius: 3 },
  pillTextSm: { fontSize: 11.5, fontWeight: '700' },

  listCard: { backgroundColor: obColors.white, borderWidth: 1, borderColor: obColors.line, borderRadius: obRadii.card, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  listRowDivider: { borderBottomWidth: 1, borderBottomColor: obColors.line },
  listRowIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: obColors.sand, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  listRowTitle: { fontSize: 14, fontWeight: '700', color: obColors.text },
  listRowSub: { fontSize: 12, color: obColors.textMut, marginTop: 2 },

  hero: {
    backgroundColor: obColors.navy,
    borderRadius: obRadii.hero,
    borderTopRightRadius: obRadii.heroCut,
    padding: 22,
  },
  heroLabel: { fontSize: 12, color: '#B9B9E8', fontWeight: '600' },
  heroAmt: { fontFamily: 'Raleway_800ExtraBold', fontSize: 30, color: obColors.white, marginTop: 6, marginBottom: 4 },
  heroSplit: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 14, marginTop: 12 },
  heroSplitLabel: { fontSize: 10.5, color: '#9C9CD6' },
  heroSplitValue: { fontSize: 14, fontWeight: '800', fontFamily: 'Raleway_800ExtraBold', color: obColors.white, marginTop: 3 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: obRadii.btn,
    borderTopRightRadius: obRadii.btnCut,
    overflow: 'hidden',
  },
  primaryBtnOutline: { borderWidth: 1.5, borderColor: obColors.navy, backgroundColor: 'transparent' },
  primaryBtnText: { fontFamily: 'Raleway_800ExtraBold', fontSize: 14, color: obColors.navyPress },

  kpiCard: {
    flex: 1,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    borderTopRightRadius: obRadii.cardCut,
    padding: 13,
  },
  kpiIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiLabel: { fontSize: 11.5, color: obColors.textMut, fontWeight: '600' },
  kpiValue: { fontSize: 16.5, fontWeight: '800', color: obColors.navy, marginTop: 2 },

  iconBtn: {
    width: 40,
    height: 40,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.chip,
    borderTopRightRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDot: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: obColors.goldDeep,
    borderWidth: 1.5,
    borderColor: obColors.white,
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: obColors.violetBg,
    borderWidth: 1,
    borderColor: '#DBD5F7',
    padding: 13,
    borderRadius: 16,
    borderTopRightRadius: 5,
  },
  bannerTitle: { fontSize: 13.5, fontWeight: '700', color: '#3f3a7a' },
  bannerMsg: { fontSize: 12, color: '#5f5a92', marginTop: 1 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: obColors.text, padding: 0 },
  chipRow: { flexGrow: 0 },
  chipRowContent: { gap: 8, paddingRight: 4 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: obRadii.chip,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
  },
  chipOn: { backgroundColor: obColors.navy, borderColor: obColors.navy },
  chipText: { fontSize: 12.5, fontWeight: '700', color: obColors.textMut },
  chipTextOn: { color: obColors.white },

  secTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  secTitleH: { fontSize: 13.5, fontWeight: '700', color: obColors.navy, letterSpacing: 0.1 },
  secTitleAside: { fontSize: 12, color: obColors.textMut, fontWeight: '600' },

  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: obColors.sand, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyIconError: { backgroundColor: obColors.dangerBg },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: obColors.text, marginBottom: 4, textAlign: 'center' },
  emptyMsg: { fontSize: 12.5, color: obColors.textMut, textAlign: 'center', lineHeight: 18 },
  emptyBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: obRadii.btn,
    borderTopRightRadius: 5,
    borderWidth: 1.5,
    borderColor: obColors.navy,
  },
  emptyBtnText: { fontSize: 12.5, fontWeight: '700', color: obColors.navy },

  skeleton: { backgroundColor: obColors.sand },
});
