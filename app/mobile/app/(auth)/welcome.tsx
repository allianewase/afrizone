import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreen, AuthFooterLink } from '../../src/components/AuthShell';
import { Button } from '../../src/components/Button';
import { colors, spacing, type } from '../../src/theme';

/**
 * Front door of the auth flow: adapted from the "dove" reference concept
 * (navy hero + wave + white body + navy footer link), dove swapped for the
 * real Afrizone logo mark.
 */
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <AuthScreen
      heroSize="lg"
      title="Let's get started!"
      subtitle="Sign in to your account below, or create a new one to start finding work."
      footer={
        <AuthFooterLink
          text="Don't have an account?"
          linkText="Create account"
          onPress={() => router.push('/(auth)/register')}
        />
      }
    >
      <Button label="Have an account? Sign in" onPress={() => router.push('/(auth)/login')} />
      <Pressable
        onPress={() => router.push('/(auth)/forgot')}
        accessibilityRole="button"
        style={styles.forgotRow}
      >
        <Text style={styles.forgotText}>Forgot password?</Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  forgotRow: { alignItems: 'center', paddingVertical: spacing.sm },
  forgotText: { color: colors.goldInk, fontSize: type.size.base, fontWeight: '700' },
});
