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
} from 'react-native';
import { Screen } from '../src/components/Screen';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { colors, spacing, type, radii } from '../src/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const CONTACT_EMAIL = 'support@afrizone.work';
const WHATSAPP_NUMBER = '2348000000000';

function openEmail() {
  void Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Afrizone%20Part%20Time%20Support`);
}

function openWhatsApp() {
  void Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}`);
}

export default function SupportScreen() {
  return (
    <Screen title="Help & support" back scroll>
      {/* Quick contact */}
      <Card style={styles.contactCard}>
        <Text style={styles.contactTitle}>Reach us directly</Text>
        <Text style={styles.contactSub}>
          Our team is available Mon – Sat, 8 am – 6 pm WAT.
        </Text>
        <View style={styles.contactRow}>
          <ContactBtn
            icon="phone"
            label="WhatsApp"
            color={colors.money}
            bg={colors.moneySoft}
            onPress={openWhatsApp}
          />
          <ContactBtn
            icon="mail"
            label="Email us"
            color={colors.clay}
            bg={colors.claySoft}
            onPress={openEmail}
          />
        </View>
      </Card>

      <Text style={styles.faqHeader}>Frequently asked questions</Text>

      <View style={styles.faqList}>
        {FAQS.map((faq, i) => (
          <FaqItem key={i} q={faq.q} a={faq.a} />
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
    </Screen>
  );
}

function ContactBtn({
  icon,
  label,
  color,
  bg,
  onPress,
}: {
  icon: any;
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

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }

  return (
    <View style={styles.faqItem}>
      <Pressable
        onPress={toggle}
        style={styles.faqQuestion}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.faqQ}>{q}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={18} color={colors.textMuted} />
        </View>
      </Pressable>
      {open ? <Text style={styles.faqA}>{a}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  contactCard: { gap: spacing.md },
  contactTitle: { color: colors.text, fontSize: type.size.lg, fontWeight: '800' },
  contactSub: { color: colors.textMuted, fontSize: type.size.base, lineHeight: 20 },
  contactRow: { flexDirection: 'row', gap: spacing.md },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    minHeight: 44,
  },
  contactBtnText: { fontWeight: '700', fontSize: type.size.base },
  faqHeader: {
    color: colors.text,
    fontSize: type.size.lg,
    fontWeight: '800',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  faqList: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    minHeight: 52,
  },
  faqQ: {
    flex: 1,
    color: colors.text,
    fontSize: type.size.base,
    fontWeight: '700',
    lineHeight: 20,
  },
  faqA: {
    color: colors.textMuted,
    fontSize: type.size.base,
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  footer: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: type.size.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  footerLink: { color: colors.clay, fontWeight: '700' },
});
