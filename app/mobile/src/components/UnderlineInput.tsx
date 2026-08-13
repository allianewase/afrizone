import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors, spacing, type } from '../theme';

// RN Web supports `outlineStyle: 'none'` at runtime (it maps straight to CSS
// outline), but RN's TextStyle type only allows 'solid' | 'dotted' | 'dashed'
// since it's a web-only extension. Kept out of the StyleSheet.create object
// below (and typed as `any`) so the escape hatch doesn't widen that object's
// whole inferred type.
const noWebOutline: any = { outlineStyle: 'none' };

interface UnderlineInputProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  autoCorrect?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  accessibilityLabel?: string;
}

/**
 * Minimal underline-only field (label above, bottom border, no box) - the
 * input style from the "dove" reference design, replacing the boxed/bordered
 * inputs used elsewhere in the app. Scoped to the auth flow only.
 */
export function UnderlineInput({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  keyboardType,
  autoCapitalize,
  autoComplete,
  autoCorrect,
  autoFocus,
  onSubmitEditing,
  returnKeyType,
  accessibilityLabel,
}: UnderlineInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, error && styles.inputError, noWebOutline]}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        accessibilityLabel={accessibilityLabel ?? label}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
      />
      {error ? (
        <Text style={styles.errorHint}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: type.size.sm },
  errorHint: { color: colors.dangerInk, fontSize: type.size.sm },
  input: {
    borderBottomWidth: 1.5,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
    fontSize: type.size.md,
    color: colors.text,
  },
  inputError: { borderBottomColor: colors.danger },
});
