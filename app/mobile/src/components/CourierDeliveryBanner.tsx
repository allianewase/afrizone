/**
 * "You are carrying two orders" — on the home screen, above everything else.
 *
 * A DELIVERY IS THE ONLY WORK ON THIS PLATFORM WITH A CLOCK ON IT. Every other
 * task is claimed today and done this week; an order has a customer standing in
 * a doorway. Making a rider find it through Profile → Deliveries is three taps
 * too many, and the home screen is what opens when they unlock the phone.
 *
 * IT DISAPPEARS WHEN THERE IS NOTHING LIVE, rather than sitting there empty.
 * A permanent card that usually says "no deliveries" is a card people stop
 * reading, which is exactly the wrong habit for the one thing that is urgent.
 *
 * ONLY COURIERS FETCH. The request is skipped entirely for everybody else -
 * a photographer's home screen should not be making a call whose answer is
 * always an empty list.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from './Icon';
import { colors, spacing, type, radii, fontFamily, shadow } from '../theme';
import { api } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../auth/AuthContext';
import type { Delivery, DeliveryStatus } from '../api/types';

const LIVE: DeliveryStatus[] = ['RECEIVED', 'STORE_ACCEPTED', 'COURIER_ASSIGNED', 'PICKED_UP'];

/** The next thing to do, in the fewest words that are still true. */
function nextStep(d: Delivery): string {
  if (d.status === 'PICKED_UP') return `Deliver to ${d.dropoffAddress ?? 'the customer'}`;
  if (d.preparedAt) return `Collect from ${d.storeName ?? 'the store'} — packed and ready`;
  return `Collect from ${d.storeName ?? 'the store'}`;
}

export function CourierDeliveryBanner() {
  const router = useRouter();
  const { user } = useAuth();
  const isCourier = user?.accountType === 'COURIER';

  const q = useAsync<Delivery[]>(
    (signal) => (isCourier ? api.myDeliveries(signal) : Promise.resolve([])),
    [isCourier],
  );

  // Silent on failure, deliberately. This is a shortcut to a screen that also
  // exists in the profile menu; an error banner at the top of the home screen
  // for a convenience would be worse than the convenience is good.
  const live = (q.data ?? []).filter((d) => LIVE.includes(d.status));
  if (!isCourier || live.length === 0) return null;

  const first = live[0];

  return (
    <Pressable
      onPress={() => router.push('/deliveries')}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={`${live.length} live ${live.length === 1 ? 'delivery' : 'deliveries'}. Open deliveries.`}
    >
      <View style={styles.icon}>
        <Icon name="cart" size={20} color={colors.onGold} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>
          {live.length === 1 ? 'One delivery on the go' : `${live.length} deliveries on the go`}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {nextStep(first)}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={colors.goldInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.claySoft,
    borderRadius: radii.card,
    // The "Sunrise Cut": the same asymmetric silhouette every card carries.
    borderTopRightRadius: radii.cut,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.tight,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: type.size.base, fontFamily: fontFamily.bold, color: colors.text },
  sub: { fontSize: type.size.sm, color: colors.textMuted, lineHeight: 18 },
});
