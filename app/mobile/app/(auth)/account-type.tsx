/**
 * "How are you using Afrizone Part Time?" - the front door.
 *
 * WHAT THIS CHOICE DOES AND, MORE IMPORTANTLY, WHAT IT DOES NOT:
 *
 *   It picks the sign-up FLOW. Individuals sign up with a phone number and an
 *   OTP, which is how the platform has always onboarded workers; stores and
 *   couriers sign up with an email and a password, like every other credentialed
 *   account. So the answer here genuinely changes the next screen.
 *
 *   It does NOT decide which dashboard anyone lands on. That comes from the
 *   account type stored on the server, read after sign-in (see app/_layout.tsx).
 *   Someone who taps the wrong card here is not stranded and is not told off -
 *   they simply arrive where their account actually belongs. A front-door
 *   question that can lock a person out of their own account would be worse
 *   than no question at all.
 *
 * Which is also why signing in skips this screen entirely. You do not have to
 * declare what you are in order to log in; the server already knows.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreen, AuthFooterLink } from '../../src/components/AuthShell';
import { Icon, type IconName } from '../../src/components/Icon';
import { colors, spacing, type, radii, fontFamily } from '../../src/theme';
import type { AccountType } from '../../src/api/types';

type Option = {
  key: AccountType;
  icon: IconName;
  title: string;
  blurb: string;
  /** Where choosing this sends someone who is signing up. */
  route: string;
};

const OPTIONS: Option[] = [
  {
    key: 'INDIVIDUAL',
    icon: 'user',
    title: 'For myself',
    blurb: 'Pick up tasks, source products, get paid for the work you do.',
    route: '/(auth)/otp',
  },
  {
    key: 'STORE',
    icon: 'cart',
    title: 'For my store',
    blurb: 'Receive and fulfil orders from AfriZoneMart customers.',
    route: '/(auth)/register',
  },
  {
    key: 'COURIER',
    icon: 'map-pin',
    title: 'For deliveries',
    blurb: 'Pick up and deliver orders, on your own or with a courier company.',
    route: '/(auth)/register',
  },
];

export default function AccountTypeScreen() {
  const router = useRouter();

  function choose(opt: Option) {
    // Carried as a param rather than stored: it is a hint for the next screen,
    // not a fact about anybody yet. Nothing has been created, so there is
    // nothing worth persisting - and a stale choice left lying around is how a
    // person ends up signed up as something they picked days ago.
    router.push({ pathname: opt.route as never, params: { accountType: opt.key } as never });
  }

  return (
    <AuthScreen
      title="How will you use Afrizone?"
      subtitle="This sets up the right account for you."
      footer={
        <AuthFooterLink
          text="Already have an account?"
          linkText="Sign in"
          onPress={() => router.push('/(auth)/login')}
        />
      }
    >
      <View style={styles.list}>
        {OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => choose(opt)}
            accessibilityRole="button"
            accessibilityLabel={`${opt.title}. ${opt.blurb}`}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Icon name={opt.icon} size={20} color={colors.clay} />
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>{opt.title}</Text>
              <Text style={styles.blurb}>{opt.blurb}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.note}>
        Not sure? Choose “For myself”. You can always talk to us about adding a store or
        deliveries later.
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderTopRightRadius: radii.cut,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.claySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: type.size.md, fontFamily: fontFamily.bold },
  blurb: { color: colors.textMuted, fontSize: type.size.sm, lineHeight: 19 },
  note: {
    color: colors.textMuted,
    fontSize: type.size.sm,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
