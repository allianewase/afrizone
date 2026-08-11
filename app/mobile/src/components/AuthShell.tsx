import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PatternWatermark } from './Motif';
import { Icon } from './Icon';
import { colors, spacing, radii, type, layout, motif } from '../theme';

interface AuthShellProps {
  children: React.ReactNode;
  watermarkSize?: number;
  watermarkStyle?: StyleProp<ViewStyle>;
}

/** Shared navy backdrop (brand glows + chevron watermark) used by every
 * auth screen: welcome, sign in/up, OTP, forgot/reset password, so the
 * whole flow reads as one continuous dark, branded moment. */
export function AuthShell({ children, watermarkSize = 320, watermarkStyle }: AuthShellProps) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.glowGold} pointerEvents="none" />
      <View style={styles.glowClay} pointerEvents="none" />
      <PatternWatermark
        color={colors.goldBright}
        opacity={motif.watermarkOpacityDark}
        size={watermarkSize}
        style={[styles.watermarkDefault, watermarkStyle]}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface AuthCardProps {
  title?: string;
  onBack?: () => void;
  children: React.ReactNode;
}

/** The floating cream card every auth screen's content sits on. Shows a
 * back arrow + centered title when navigating deeper than the sign-in hub. */
export function AuthCard({ title, onBack, children }: AuthCardProps) {
  return (
    <View style={styles.card}>
      {title || onBack ? (
        <View style={styles.cardHeader}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={10}
              style={styles.backBtn}
              accessibilityLabel="Back"
              accessibilityRole="button"
            >
              <Icon name="chevron-left" size={20} color={colors.text} />
            </Pressable>
          ) : (
            <View style={styles.backBtnSpacer} />
          )}
          {title ? <Text style={styles.cardTitle}>{title}</Text> : <View style={{ flex: 1 }} />}
          <View style={styles.backBtnSpacer} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

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
  watermarkDefault: { top: -40, left: '50%', marginLeft: -160 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    gap: spacing.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: colors.bg,
    borderRadius: radii.sheet,
    borderTopRightRadius: radii.cut * 2,
    padding: layout.screenPadding,
    gap: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: -spacing.xs },
  backBtn: {
    width: layout.hitTarget,
    height: layout.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.md,
  },
  backBtnSpacer: { width: layout.hitTarget },
  cardTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: type.size.md,
    fontWeight: '700',
    color: colors.text,
  },
});
