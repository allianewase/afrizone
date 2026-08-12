import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Logo from './Logo';
import { Icon } from './Icon';
import { WaveDivider, PatternDivider } from './Motif';
import { colors, spacing, type, layout, motif, fontFamily } from '../theme';

interface AuthScreenProps {
  /** 'lg' for the welcome/Get Started screen, 'sm' for every other auth step. */
  heroSize?: 'lg' | 'sm';
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** The navy strip at the very bottom: usually an <AuthFooterLink>. */
  footer?: React.ReactNode;
}

/**
 * Every auth screen's shell: a navy hero (logo + wave transition), a white
 * content body, and a navy footer strip for the secondary link - the
 * three-part layout from the "dove" reference design, in Afrizone's own
 * navy/gold rather than the reference's purple.
 */
export function AuthScreen({ heroSize = 'sm', onBack, title, subtitle, children, footer }: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lg = heroSize === 'lg';

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.hero, lg ? styles.heroLg : styles.heroSm]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={[styles.backBtn, { top: insets.top + spacing.sm }]}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
          >
            <Icon name="chevron-left" size={22} color={colors.white} />
          </Pressable>
        ) : null}
        <View style={[styles.logoWrap, { paddingTop: insets.top + (lg ? spacing.xxl : spacing.lg) }]}>
          <Logo size={lg ? 44 : 30} tone="dark" />
        </View>
        <WaveDivider color={colors.bg} style={styles.wave} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.fields}>{children}</View>
      </ScrollView>

      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <PatternDivider color={colors.gold} opacity={motif.dividerOpacityDark} style={styles.footerDivider} />
          {footer}
          <Text style={styles.legalText}>
            By continuing you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => router.push('/(auth)/terms')}>
              Terms
            </Text>{' '}
            &{' '}
            <Text style={styles.legalLink} onPress={() => router.push('/(auth)/privacy')}>
              Privacy Policy
            </Text>
          </Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** Muted "Have an account? Sign in" row for AuthScreen's footer slot. */
export function AuthFooterLink({
  text,
  linkText,
  onPress,
}: {
  text: string;
  linkText: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.footerLinkRow} hitSlop={8}>
      <Text style={styles.footerText}>
        {text} <Text style={styles.footerLink}>{linkText}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  hero: { backgroundColor: colors.navy, overflow: 'hidden' },
  heroLg: { height: '32%' },
  heroSm: { height: 148 },
  backBtn: {
    position: 'absolute',
    left: spacing.md,
    width: layout.hitTarget,
    height: layout.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  logoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wave: { position: 'absolute', left: 0, right: 0, bottom: -1 },
  body: { flex: 1, backgroundColor: colors.bg },
  bodyContent: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: { color: colors.text, fontSize: type.size.xxl, fontFamily: fontFamily.extrabold, textAlign: 'center' },
  subtitle: {
    color: colors.textMuted,
    fontSize: type.size.base,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  fields: { gap: spacing.lg, marginTop: spacing.xl },
  footer: { backgroundColor: colors.navy, alignItems: 'center', paddingTop: spacing.lg },
  footerDivider: { width: 120, marginBottom: spacing.md },
  footerLinkRow: { paddingVertical: spacing.xs },
  footerText: { color: colors.railMuted, fontSize: type.size.base },
  footerLink: { color: colors.gold, fontWeight: '700' },
  legalText: {
    color: colors.railMuted,
    fontSize: type.size.xs,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: layout.screenPadding,
  },
  legalLink: { color: colors.gold, fontWeight: '600' },
});
