import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, type, spacing, layout, motif, fontFamily } from '../theme';
import { Icon } from './Icon';
import { PatternDivider } from './Motif';

interface ScreenProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** Show a back chevron (for stacked screens). */
  back?: boolean;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  right?: React.ReactNode;
  contentStyle?: ViewStyle;
  /** Don't pad the content horizontally (e.g. full-bleed lists). */
  flush?: boolean;
}

export function Screen({
  children,
  title,
  subtitle,
  back,
  scroll = true,
  onRefresh,
  refreshing,
  right,
  contentStyle,
  flush,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const header =
    title || back ? (
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {back ? (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={styles.backBtn}
          >
            <Icon name="chevron-left" size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={styles.titleWrap}>
          {title ? (
            <>
              <Text style={styles.title}>{title}</Text>
              <PatternDivider
                color={colors.gold}
                opacity={motif.dividerOpacityLight}
                height={5}
                style={styles.titleMotif}
              />
            </>
          ) : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    ) : (
      <View style={{ height: insets.top }} />
    );

  const padding = {
    paddingHorizontal: flush ? 0 : layout.screenPadding,
    paddingBottom: insets.bottom + spacing.xxl,
  };

  if (!scroll) {
    return (
      <View style={styles.root}>
        {header}
        <View style={[styles.flex, padding, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[padding, contentStyle]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.clay}
              colors={[colors.clay]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: layout.hitTarget,
    height: layout.hitTarget,
    marginLeft: -spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1 },
  title: { color: colors.text, fontSize: type.size.xxl, fontFamily: fontFamily.extrabold, letterSpacing: -0.5 },
  titleMotif: { width: 44, marginTop: 4 },
  subtitle: { color: colors.textMuted, fontSize: type.size.base, marginTop: 2 },
});
