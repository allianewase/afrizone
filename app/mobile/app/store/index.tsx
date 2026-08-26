/**
 * The store dashboard.
 *
 * THREE STATES, AND THE FIRST TWO ARE NOT ERRORS:
 *
 *   No store. A brand-new STORE account belongs to nothing - declaring yourself
 *   a store is not the same as being on one. This is the state most people will
 *   see first, so it says what happens next rather than showing an empty list
 *   or a spinner that never resolves.
 *
 *   Not approved yet. Afrizone approves every store before it can take orders,
 *   which is the whole reason Store.status defaults PENDING. Its own people can
 *   still see and complete the profile - refusing that would make approval
 *   unreachable.
 *
 *   Approved, with orders still to come. Orders arrive from AfriZoneMart, which
 *   is not connected yet, so that section says so plainly instead of rendering
 *   a hopeful empty list that looks like a bug.
 *
 * Everything here is scoped by the server: GET /api/stores returns only the
 * stores this person may act for. The screen never filters by id, because a
 * screen that filters is a screen that can be made not to.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { NotificationBell } from '../../src/components/NotificationBell';
import { LoadingState, ErrorState, EmptyState, Banner } from '../../src/components/Feedback';
import { colors, spacing, type, radii, fontFamily } from '../../src/theme';
import { api } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { useAuth } from '../../src/auth/AuthContext';
import type { Store, StoreMember } from '../../src/api/types';

export default function StoreHomeScreen() {
  const { user, signOut } = useAuth();
  const stores = useAsync<Store[]>((signal) => api.myStores(signal), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = stores.data ?? [];
  // One store is the overwhelmingly common case, so it opens straight into it
  // and the picker never appears. Selecting is local state rather than a route
  // of its own: a second screen would need its own fetch and its own ownership
  // check, and GET /api/stores has already returned everything this person may
  // act for.
  const store = list.length === 1 ? list[0] : list.find((s) => s.id === selectedId) ?? null;

  return (
    <Screen
      title={store ? store.name : 'Your store'}
      subtitle={store ? store.address ?? 'AfriZoneMart store' : 'AfriZoneMart fulfilment'}
      right={<NotificationBell />}
      onRefresh={stores.reload}
      refreshing={stores.loading && !!stores.data}
    >
      {stores.loading && !stores.data ? (
        <LoadingState label="Loading your store…" />
      ) : stores.error ? (
        <ErrorState message={stores.error} onRetry={stores.reload} />
      ) : list.length === 0 ? (
        <NoStoreYet name={user?.name ?? undefined} onSignOut={signOut} />
      ) : store ? (
        <>
          {list.length > 1 ? (
            <Pressable
              onPress={() => setSelectedId(null)}
              accessibilityRole="button"
              style={styles.switchRow}
            >
              <Icon name="chevron-left" size={16} color={colors.clay} />
              <Text style={styles.switchText}>Switch store</Text>
            </Pressable>
          ) : null}
          <StoreDetail store={store} />
        </>
      ) : (
        <>
          <Text style={styles.section}>Choose a store</Text>
          <View style={{ gap: spacing.md }}>
            {list.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setSelectedId(s.id)}
                accessibilityRole="button"
              >
                <Card style={styles.pickRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>{s.name}</Text>
                    <Text style={styles.pickMeta}>
                      {s.myRole === 'OWNER' ? 'Owner' : 'Staff'} · {statusLabel(s.status)}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.textMuted} />
                </Card>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function statusLabel(status: Store['status']): string {
  // Never the raw enum. "PENDING" tells a shopkeeper nothing about whether they
  // should be doing something.
  if (status === 'ACTIVE') return 'Open for orders';
  if (status === 'SUSPENDED') return 'Paused by Afrizone';
  return 'Waiting for approval';
}

function NoStoreYet({ name, onSignOut }: { name?: string; onSignOut: () => void }) {
  return (
    <>
      <EmptyState
        icon="cart"
        title="No store on your account yet"
        message="Someone from your store needs to add you, or Afrizone needs to register the store. Once that is done it shows up here."
      />
      <Card style={styles.helpCard}>
        <Text style={styles.helpTitle}>What to do</Text>
        <Text style={styles.helpLine}>
          1. If your store is already on Afrizone, ask the owner to add {name ?? 'you'} using this
          account.
        </Text>
        <Text style={styles.helpLine}>
          2. If it is not, contact Afrizone to register it. We approve every store before it can take
          orders.
        </Text>
      </Card>
      <View style={{ marginTop: spacing.lg }}>
        <Button label="Sign out" variant="ghost" onPress={onSignOut} />
      </View>
    </>
  );
}

function StoreDetail({ store }: { store: Store }) {
  const members = useAsync<StoreMember[]>((signal) => api.storeMembers(store.id, signal), [store.id]);

  return (
    <>
      {store.status !== 'ACTIVE' ? (
        <Banner
          tone={store.status === 'SUSPENDED' ? 'danger' : 'amber'}
          icon="alert"
          title={statusLabel(store.status)}
          message={
            store.status === 'SUSPENDED'
              ? 'This store cannot take orders right now. Afrizone will be in touch.'
              : 'You can finish setting up your store now. Orders start once Afrizone approves it.'
          }
        />
      ) : null}

      <Text style={styles.section}>Orders</Text>
      <Card style={styles.soonCard}>
        <Icon name="cart" size={18} color={colors.textMuted} />
        <Text style={styles.soonText}>
          Orders from AfriZoneMart will appear here. That connection is not switched on yet.
        </Text>
      </Card>

      <Text style={styles.section}>Store details</Text>
      <Card style={{ gap: spacing.sm }}>
        <DetailRow label="Name" value={store.name} />
        {store.address ? <DetailRow label="Address" value={store.address} /> : null}
        {store.phone ? <DetailRow label="Phone" value={store.phone} /> : null}
        <DetailRow
          label="Payout account"
          // Only ever the mask on this screen. The full number comes back to an
          // OWNER from the API, but a dashboard is read over people's shoulders.
          value={store.bankMasked ? `${store.bankMasked}${store.bankName ? ` · ${store.bankName}` : ''}` : 'Not set'}
        />
      </Card>

      <Text style={styles.section}>People</Text>
      {members.loading && !members.data ? (
        <LoadingState label="Loading…" />
      ) : members.error ? (
        <ErrorState message={members.error} onRetry={members.reload} />
      ) : (
        <Card style={{ gap: spacing.md }}>
          {(members.data ?? []).map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.name ?? m.email ?? 'Member'}</Text>
                {m.email ? <Text style={styles.memberMeta}>{m.email}</Text> : null}
              </View>
              <View style={[styles.rolePill, m.role === 'OWNER' && styles.rolePillOwner]}>
                <Text style={[styles.roleText, m.role === 'OWNER' && styles.roleTextOwner]}>
                  {m.role === 'OWNER' ? 'Owner' : 'Staff'}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    color: colors.text,
    fontSize: type.size.lg,
    fontFamily: fontFamily.extrabold,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  switchText: { color: colors.clay, fontSize: type.size.sm, fontFamily: fontFamily.bold },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pickName: { color: colors.text, fontSize: type.size.md, fontFamily: fontFamily.bold },
  pickMeta: { color: colors.textMuted, fontSize: type.size.sm, marginTop: 2 },
  helpCard: { gap: spacing.sm, marginTop: spacing.lg },
  helpTitle: { color: colors.text, fontSize: type.size.base, fontFamily: fontFamily.bold },
  helpLine: { color: colors.textMuted, fontSize: type.size.sm, lineHeight: 20 },
  soonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSand,
    borderColor: colors.line,
  },
  soonText: { flex: 1, color: colors.textMuted, fontSize: type.size.sm, lineHeight: 19 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  detailLabel: { width: 118, color: colors.textMuted, fontSize: type.size.sm },
  detailValue: { flex: 1, color: colors.text, fontSize: type.size.sm, fontFamily: fontFamily.bold },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberName: { color: colors.text, fontSize: type.size.base, fontFamily: fontFamily.bold },
  memberMeta: { color: colors.textMuted, fontSize: type.size.sm, marginTop: 1 },
  rolePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSand,
  },
  rolePillOwner: { backgroundColor: colors.claySoft },
  roleText: { color: colors.textMuted, fontSize: type.size.xs, fontFamily: fontFamily.bold },
  roleTextOwner: { color: colors.clayDeep },
});
