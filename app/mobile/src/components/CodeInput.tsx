import React, { useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { colors, spacing, radii, type } from '../theme';

const CODE_LEN = 6;

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** Fired when all 6 digits are filled. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * Reusable 6-digit code input (2FA challenge, Security enrolment). Auto-advance,
 * backspace-to-previous, and full-code paste. Mirrors the OTP screen's boxes.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  error,
  autoFocus,
}: Props) {
  const inputs = useRef<Array<TextInput | null>>([]);
  const digits = Array(CODE_LEN)
    .fill('')
    .map((_, i) => value[i] ?? '');

  function emit(next: string) {
    onChange(next);
    if (next.length === CODE_LEN) onComplete?.(next);
  }

  function setDigit(index: number, raw: string) {
    const onlyDigits = raw.replace(/\D/g, '');
    if (onlyDigits.length > 1) {
      const next = onlyDigits.slice(0, CODE_LEN);
      emit(next);
      const last = Math.min(next.length, CODE_LEN) - 1;
      inputs.current[last]?.focus();
      return;
    }
    const arr = [...digits];
    arr[index] = onlyDigits;
    emit(arr.join('').replace(/\s/g, ''));
    if (onlyDigits && index < CODE_LEN - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function onKeyPress(
    index: number,
    e: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      const arr = [...digits];
      arr[index - 1] = '';
      onChange(arr.join(''));
    }
  }

  return (
    <View style={styles.boxes}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          value={d}
          onChangeText={(v) => setDigit(i, v)}
          onKeyPress={(e) => onKeyPress(i, e)}
          keyboardType="number-pad"
          maxLength={CODE_LEN}
          editable={!disabled}
          style={[
            styles.box,
            d ? styles.boxFilled : null,
            error ? styles.boxError : null,
          ]}
          accessibilityLabel={`Digit ${i + 1}`}
          autoFocus={autoFocus && i === 0}
          textContentType="oneTimeCode"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  box: {
    flex: 1,
    height: 58,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1.5,
    borderRadius: radii.input,
    textAlign: 'center',
    fontSize: type.size.xxl,
    fontWeight: '800',
    color: colors.text,
  },
  boxFilled: { borderColor: colors.clay, backgroundColor: colors.claySoft },
  boxError: { borderColor: colors.danger },
});
