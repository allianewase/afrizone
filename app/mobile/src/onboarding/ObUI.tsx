import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TextInputProps,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, IconName } from '../components/Icon';
import { obColors, obRadii } from './onboardingTheme';

/**
 * Shared flat-design shell for the onboarding screens restyled to match
 * afrizone-onboarding-screens.html: warm peach ground, a small back chevron
 * instead of the app's navy hero, eyebrow/heading/subtitle block, scrollable
 * body, and a bottom-pinned primary action (the mock's `.btn.cut-sm`).
 */
export function ObScreen({
  onBack,
  eyebrow,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  primaryVariant = 'gold',
  footnote,
}: {
  onBack?: () => void;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Omit to render no primary button (rare - most steps have one). */
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  /** 'gold' = the mock's gradient fill; 'outline' = the mock's `.btn-out`. */
  primaryVariant?: 'gold' | 'outline';
  footnote?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={[styles.backBtn, { top: insets.top + 8 }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Icon name="chevron-left" size={20} color={obColors.navy} />
        </Pressable>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingTop: insets.top + 56 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.fields}>{children}</View>
      </ScrollView>

      {primaryLabel ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <ObButton
            label={primaryLabel}
            onPress={onPrimary}
            disabled={primaryDisabled}
            loading={primaryLoading}
            variant={primaryVariant}
          />
          {footnote}
        </View>
      ) : (
        footnote ? <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>{footnote}</View> : null
      )}
    </KeyboardAvoidingView>
  );
}

/** The mock's `.btn` (gold gradient) / `.btn-out` (navy outline). */
export function ObButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'gold',
}: {
  label: string;
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
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      style={({ pressed }) => [
        styles.btn,
        variant === 'outline' && styles.btnOutline,
        isDisabled && styles.btnDisabled,
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
      <Text style={[styles.btnText, variant === 'outline' && styles.btnTextOutline]}>
        {loading ? 'Please wait…' : label}
      </Text>
    </Pressable>
  );
}

/** The mock's `.field`: a plain white bordered row. Label sits above, mock-style. */
export function ObField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  leftAdorn,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  /** e.g. the "🇳🇬 +234" country chip on the phone field. */
  leftAdorn?: React.ReactNode;
} & Pick<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'autoCorrect' | 'autoFocus' | 'onSubmitEditing' | 'returnKeyType' | 'maxLength'>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.field}>
        {leftAdorn}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={obColors.textMut}
          style={styles.fieldInput}
          {...rest}
        />
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** Password variant of ObField - lock icon, show/hide toggle. Not in the
 * mock (it has no password screen) but register.tsx needs one, restyled to
 * match everything around it. */
export function ObPasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
} & Pick<TextInputProps, 'autoComplete' | 'textContentType' | 'onSubmitEditing' | 'returnKeyType' | 'autoFocus'>) {
  const [visible, setVisible] = React.useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.field}>
        <Icon name="lock" size={17} color={obColors.textMut} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          placeholder={placeholder ?? 'Password'}
          placeholderTextColor={obColors.textMut}
          style={styles.fieldInput}
          {...rest}
        />
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10} accessibilityRole="button">
          <Icon name={visible ? 'eye-off' : 'eye'} size={17} color={obColors.textMut} />
        </Pressable>
      </View>
      {error ? <Text style={[styles.fieldHint, { color: obColors.dangerInk }]}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** The mock's `.role-card` / `.role-card.sel`. */
export function ObRoleCard({
  icon,
  title,
  blurb,
  selected,
  onPress,
}: {
  icon: IconName;
  title: string;
  blurb: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.roleCard, selected && styles.roleCardSel]}
    >
      <View style={styles.roleIcon}>
        <Icon name={icon} size={18} color={obColors.navy} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleBlurb}>{blurb}</Text>
      </View>
      {selected ? <Icon name="check-circle" size={18} color={obColors.goldDeep} /> : null}
    </Pressable>
  );
}

/** The mock's `.chip` / `.chip.on`. */
export function ObChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** The mock's `.check-circle` + optional `.pill` beneath, for outcome screens. */
export function ObCheckCircle({ tone, dark, icon = 'check' }: { tone: 'money' | 'gold' | 'danger'; dark?: boolean; icon?: IconName }) {
  const bg = dark
    ? obColors.mgreenVeil
    : tone === 'money'
      ? obColors.mgreenBg
      : tone === 'danger'
        ? obColors.dangerBg
        : obColors.mgreenBg;
  const fg = dark ? obColors.gold : tone === 'money' ? obColors.mgreen : tone === 'danger' ? obColors.danger : obColors.goldDeep;
  return (
    <View style={[styles.checkCircle, { backgroundColor: bg }]}>
      <Icon name={icon} size={24} color={fg} strokeWidth={2.4} />
    </View>
  );
}

export function ObPill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <View style={styles.pillDot} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

/**
 * The reference's "Reset Successful" / "Successfull" card: a dimmed
 * backdrop with a white card centered on top - green check circle, title,
 * message, a green button, and a small X close in the corner.
 */
export function ObSuccessModal({
  visible,
  title,
  message,
  actionLabel,
  onAction,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  /** Omit to hide the X - some outcomes (e.g. a completed reset) shouldn't be dismissable back to the form behind them. */
  onClose?: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {onClose ? (
            <Pressable onPress={onClose} hitSlop={10} style={styles.modalClose} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={16} color={obColors.textMut} />
            </Pressable>
          ) : null}
          <ObCheckCircle tone="money" />
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>
          <View style={{ alignSelf: 'stretch', marginTop: 6 }}>
            <ObButton label={actionLabel} onPress={onAction} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Small back-chevron variant used from a plain (non-ObScreen) context. */
export function ObBackButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={10}
      style={[styles.backBtn, { top: insets.top + 8 }]}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Icon name="chevron-left" size={20} color={obColors.navy} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  backBtn: {
    position: 'absolute',
    left: 12,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 24 },
  eyebrow: { fontSize: 11, fontWeight: '600', color: obColors.textMut },
  title: { fontSize: 22, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy, marginTop: 2 },
  subtitle: { fontSize: 14, color: obColors.textMut, lineHeight: 20, marginTop: 6 },
  fields: { gap: 16, marginTop: 22 },
  footer: { paddingHorizontal: 20, paddingTop: 10, gap: 10 },

  btn: {
    minHeight: 50,
    borderRadius: obRadii.btn,
    borderTopRightRadius: obRadii.btnCut,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnOutline: { borderWidth: 1.3, borderColor: obColors.navy, backgroundColor: 'transparent' },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: 'Raleway_800ExtraBold', fontSize: 15, color: obColors.navyPress },
  btnTextOutline: { color: obColors.navy },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: obColors.textMut },
  field: {
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.field,
    minHeight: 50,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldInput: { flex: 1, fontSize: 15, color: obColors.text, paddingVertical: 0 },
  fieldHint: { fontSize: 12, color: obColors.textMut, lineHeight: 16 },

  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: obColors.white,
    borderWidth: 1.3,
    borderColor: obColors.line,
    borderRadius: 14,
    padding: 14,
  },
  roleCardSel: { borderColor: obColors.goldDeep, backgroundColor: obColors.roleSelectedBg },
  roleIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: obColors.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTitle: { fontSize: 15, fontWeight: '700', color: obColors.text },
  roleBlurb: { fontSize: 12.5, color: obColors.textMut, marginTop: 2 },

  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: obRadii.chip,
    backgroundColor: obColors.white,
    borderWidth: 1.3,
    borderColor: obColors.line,
  },
  chipOn: { backgroundColor: obColors.navy, borderColor: obColors.navy },
  chipText: { fontSize: 13, fontWeight: '700', color: obColors.textMut },
  chipTextOn: { color: obColors.white },

  checkCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: obColors.indigoBg,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: obRadii.pill,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: obColors.indigo },
  pillText: { color: obColors.indigo, fontSize: 13, fontWeight: '700' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: obColors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: obColors.white,
    borderRadius: obRadii.card,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  modalClose: { position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: obColors.sand },
  modalTitle: { fontSize: 18, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy, textAlign: 'center', marginTop: 4 },
  modalMessage: { fontSize: 13, color: obColors.textMut, textAlign: 'center', lineHeight: 19 },
});
