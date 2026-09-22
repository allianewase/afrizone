import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackHeader } from '../src/appui/AppUI';
import { Icon, IconName } from '../src/components/Icon';
import { obColors, obRadii } from '../src/onboarding/onboardingTheme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Restyled onto the navy/gold palette. Every answer below, the contact
 * details and the expand/collapse behaviour are unchanged.
 */
const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I apply for a task?',
    a: 'Open any task on the Home tab, tap "Apply for this task", write a short pitch about your availability, and submit. You\'ll see it under My Tasks → Applied while the admin reviews your application.',
  },
  {
    q: 'When will my application be approved?',
    a: 'Admins typically review applications within 1–2 business days. You\'ll receive a push notification when your status changes. Once approved, the task moves to My Tasks → Active and you can clock in.',
  },
  {
    q: 'How does clock in / clock out work?',
    a: 'Go to My Tasks → Active, tap your approved task, then press the clock button to start recording time. Clock out before you leave. Once done, tap "Submit timesheet": your hours go to the admin for approval.',
  },
  {
    q: 'How long does KYC verification take?',
    a: 'Usually 1–3 business days after you submit all documents. You\'ll be notified when your tier is approved. Until then, you can browse tasks but cannot apply.',
  },
  {
    q: 'How do I get paid?',
    a: 'Once an admin approves your timesheet or marks a fixed-price task complete, earnings appear in your Wallet as "Pending". They move to "Available" after the release period. You can then withdraw to your registered bank account (minimum ₦5,000).',
  },
  {
    q: 'What is WHT (withholding tax)?',
    a: 'By law, 5% withholding tax is deducted from your gross earnings and remitted to FIRS on your behalf. Your wallet always shows the net amount. You can download an annual WHT statement from the Wallet tab.',
  },
  {
    q: 'How long does a withdrawal take?',
    a: 'Withdrawals are processed via Paystack and typically arrive within 1 business day (T+1). You\'ll receive a notification when the transfer is complete.',
  },
  {
    q: 'I forgot my password. What do I do?',
    a: 'On the login screen, tap "Forgot password?" and enter your email. You\'ll receive a reset link. If you signed up with your phone number only, log in with OTP instead.',
  },
];

const CONTACT_EMAIL = 'support@afrizonemart.com';
const WHATSAPP_NUMBER = '2347036149590';

function openEmail() {
  void Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Afrizone%20Part%20Time%20Support`);
}

function openWhatsApp() {
  void Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}`);
}

export default function SupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <AppBackHeader title="Help & support" onBack={() => router.back()} />

        {/* Quick contact */}
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Reach us directly</Text>
          <Text style={styles.contactSub}>
            Our team is available Mon – Sat, 8 am – 6 pm WAT.
          </Text>
          <View style={styles.contactRow}>
            <ContactBtn
              icon="phone"
              label="WhatsApp"
              color={obColors.forest}
              bg={obColors.mgreenBg}
              onPress={openWhatsApp}
            />
            <ContactBtn
              icon="mail"
              label="Email us"
              color={obColors.navy}
              bg={obColors.sand}
              onPress={openEmail}
            />
          </View>
        </View>

        <Text style={styles.faqHeader}>Frequently asked questions</Text>

        <View style={styles.faqList}>
          {FAQS.map((faq, i) => (
            <FaqItem key={i} q={faq.q} a={faq.a} last={i === FAQS.length - 1} />
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Still stuck? Email us at{' '}
            <Text style={styles.footerLink} onPress={openEmail}>
              {CONTACT_EMAIL}
            </Text>{' '}
            and we'll get back to you within 24 hours.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ContactBtn({
  icon,
  label,
  color,
  bg,
  onPress,
}: {
  icon: IconName;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.contactBtn, { backgroundColor: bg }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={20} color={color} />
      <Text style={[styles.contactBtnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function FaqItem({ q, a, last }: { q: string; a: string; last: boolean }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }

  return (
    <View style={[!last && styles.faqItemDivider]}>
      <Pressable
        onPress={toggle}
        style={styles.faqQuestion}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.faqQ}>{q}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={18} color={obColors.textMut} />
        </View>
      </Pressable>
      {open ? <Text style={styles.faqA}>{a}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  contactCard: {
    gap: 10,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    borderTopRightRadius: obRadii.cardCut,
    padding: 16,
  },
  contactTitle: { color: obColors.navy, fontSize: 15.5, fontFamily: 'Raleway_800ExtraBold' },
  contactSub: { color: obColors.textMut, fontSize: 12.5, lineHeight: 18 },
  contactRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: obRadii.btn,
    borderTopRightRadius: obRadii.btnCut,
    minHeight: 48,
  },
  contactBtnText: { fontWeight: '700', fontSize: 13.5 },
  faqHeader: {
    color: obColors.navy,
    fontSize: 15.5,
    fontFamily: 'Raleway_800ExtraBold',
    marginTop: 24,
    marginBottom: 10,
  },
  faqList: {
    borderRadius: obRadii.card,
    borderWidth: 1,
    borderColor: obColors.line,
    backgroundColor: obColors.white,
    overflow: 'hidden',
  },
  faqItemDivider: { borderBottomWidth: 1, borderBottomColor: obColors.line },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    minHeight: 52,
  },
  faqQ: {
    flex: 1,
    color: obColors.text,
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 19,
  },
  faqA: {
    color: obColors.textMut,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  footer: {
    marginTop: 24,
    padding: 16,
    borderRadius: obRadii.card,
    backgroundColor: obColors.sand,
    borderWidth: 1,
    borderColor: obColors.line,
  },
  footerText: {
    color: obColors.textMut,
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  footerLink: { color: obColors.goldDeep, fontWeight: '700' },
});
