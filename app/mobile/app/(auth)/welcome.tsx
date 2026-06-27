import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Logo from '../../src/components/Logo';
import { Icon, IconName } from '../../src/components/Icon';
import { colors, spacing, radii, type, layout } from '../../src/theme';

interface Slide {
  icon: IconName;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'briefcase',
    title: 'Flexible work,\nnear you',
    body: 'Browse paid tasks matched to your skills and location — from one-day gigs to longer projects.',
  },
  {
    icon: 'wallet',
    title: 'Get paid\nto your wallet',
    body: 'Track every naira you earn and cash out to your bank. You always see the math — gross, tax, and net.',
  },
  {
    icon: 'shield',
    title: 'Verified\n& trusted',
    body: 'KYC-verified workers, clear digital contracts, and tasks backed by Afrizone. Honest work, every time.',
  },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  function finish() {
    router.replace('/(auth)/login');
  }

  function next() {
    if (isLast) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  }

  return (
    <View style={styles.root}>
      {/* decorative brand glow */}
      <View style={styles.glowGold} pointerEvents="none" />
      <View style={styles.glowClay} pointerEvents="none" />

      {/* top bar */}
      <View style={[styles.topbar, { paddingTop: insets.top + spacing.md }]}>
        <Logo size={34} tone="dark" />
        <Pressable onPress={finish} accessibilityRole="button" hitSlop={10} style={styles.skip}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      {/* slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        style={styles.slides}
      >
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <View style={styles.badgeWrap}>
              <View style={styles.badgeRing} />
              <View style={styles.badge}>
                <Icon name={s.icon} size={58} color={colors.goldBright} />
              </View>
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* dots */}
      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      {/* CTAs */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable
          onPress={next}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>{isLast ? 'Get started' : 'Next'}</Text>
          <Icon name="chevron-right" size={20} color={colors.navy} />
        </Pressable>

        <Pressable onPress={finish} accessibilityRole="button" style={styles.altRow}>
          <Text style={styles.altText}>
            Already have an account? <Text style={styles.altLink}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const BADGE = 168;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, overflow: 'hidden' },
  glowGold: {
    position: 'absolute',
    top: -120,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.gold,
    opacity: 0.16,
  },
  glowClay: {
    position: 'absolute',
    bottom: -140,
    left: -100,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: colors.clay,
    opacity: 0.18,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.sm,
  },
  skip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  skipText: { color: 'rgba(255,255,255,0.7)', fontSize: type.size.base, fontWeight: '600' },
  slides: { flex: 1 },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.xl,
  },
  badgeWrap: {
    width: BADGE + 40,
    height: BADGE + 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  badgeRing: {
    position: 'absolute',
    width: BADGE + 40,
    height: BADGE + 40,
    borderRadius: (BADGE + 40) / 2,
    borderWidth: 1,
    borderColor: 'rgba(242,169,59,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: colors.navyDeep,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.white,
    fontSize: type.size.displayLg,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 42,
    textAlign: 'center',
  },
  body: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: type.size.md,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 340,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 26,
    backgroundColor: colors.goldBright,
  },
  footer: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 54,
    borderRadius: radii.button,
    backgroundColor: colors.goldBright,
  },
  ctaPressed: { opacity: 0.88 },
  ctaText: { color: colors.navy, fontSize: type.size.lg, fontWeight: '800' },
  altRow: { alignItems: 'center', paddingVertical: spacing.sm },
  altText: { color: 'rgba(255,255,255,0.65)', fontSize: type.size.base },
  altLink: { color: colors.goldBright, fontWeight: '700' },
});
