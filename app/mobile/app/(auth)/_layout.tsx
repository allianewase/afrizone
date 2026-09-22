import { Stack } from 'expo-router';
import { colors } from '../../src/theme';
import { OnboardingProvider } from '../../src/onboarding/OnboardingContext';

export default function AuthLayout() {
  return (
    // Scoped to the whole auth stack (not just the onboarding screens) so
    // account-type.tsx and register.tsx - reached before any onboarding
    // screen exists - can stash the chosen account type into it too.
    <OnboardingProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
        <Stack.Screen name="account-type" />
        <Stack.Screen name="register" />
        <Stack.Screen name="phone" />
        <Stack.Screen name="otp" />
        <Stack.Screen name="twofactor" />
        <Stack.Screen name="forgot" />
        <Stack.Screen name="reset" />
        {/* First-time onboarding, in order. kyc.tsx stays separately for
            re-verification after a rejection (linked from Profile), not part
            of this sequence any more. */}
        <Stack.Screen name="personal-details" />
        <Stack.Screen name="kyc-intro" />
        <Stack.Screen name="choose-tier" />
        <Stack.Screen name="id-upload" />
        <Stack.Screen name="selfie" />
        <Stack.Screen name="courier-setup" />
        <Stack.Screen name="store-details" />
        <Stack.Screen name="submitted" />
        <Stack.Screen name="verified" options={{ animation: 'fade' }} />
        <Stack.Screen name="kyc" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="privacy" />
      </Stack>
    </OnboardingProvider>
  );
}
