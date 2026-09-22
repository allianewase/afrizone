/**
 * The store dashboard. Restyled to match afrizone-mobile-prototype
 * (1).html's Store screen - the "Approval pending" status hero is the one
 * state that reference actually depicts; the other two real states (no
 * store yet, active-with-orders-not-connected) and the multi-store picker
 * are extended to match the same visual language, not copied from anywhere
 * new. All real logic (org fetch, status labels, member list, the "pick a
 * store" flow for someone on more than one) is unchanged from before.
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
 * The prototype's own "Approval pending" screen suggests a "While you wait"
 * checklist ("3 of 5 documents uploaded", "Set up payouts") - dropped rather
 * than copied, since neither is real: this app has no document-progress
 * tracking for stores, and no edit flow for store payout details exists on
 * this screen (or anywhere else in the mobile app) to link a "set up
 * payouts" row to. A checklist item with nothing behind it would be exactly
 * the kind of dead affordance this codebase has been careful to avoid all
 * session.
 *
 * Everything here is scoped by the server: GET /api/stores returns only the
 * stores this person may act for. The screen never filters by id, because a
 * screen that filters is a screen that can be made not to.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppListCard, AppListRow, AppStatusPill, AppSectionTitle, AppEmptyState, AppErrorState, AppLoadingCards, AppPrimaryButton, type AppPillTone } from '../../src/appui/AppUI';
import { AppNotificationBell } from '../../src/appui/AppNotificationBell';
import { Icon } from '../../src/components/Icon';
import { obColors, obRadii } from '../../src/onboarding/onboardingTheme';
import { api } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { useAuth } from '../../src/auth/AuthContext';
import type { Organization, OrgMember } from '../../src/api/types';

export default function StoreHomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  // kind=STORE, filtered server-side: somebody who is also a rider for a
  // courier company must not find it listed on the store dashboard.
  const stores = useAsync<Organization[]>((signal) => api.myOrganizations('STORE', signal), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = stores.data ?? [];
  const store = list.length === 1 ? list[0] : list.find((s) => s.id === selectedId) ?? null;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={stores.loading && !!stores.data} onRefresh={stores.reload} tintColor={obColors.navy} />}
      >
        <View style={styles.topRow}>
          <View>
            <Text style={styles.eyebrow}>Store account</Text>
            <Text style={styles.h2}>{store ? store.name : 'Your store'}</Text>
          </View>
          <AppNotificationBell />
        </View>

        {stores.loading && !stores.data ? (
          <AppLoadingCards count={2} />
        ) : stores.error ? (
          <AppErrorState message={stores.error} onRetry={stores.reload} />
        ) : list.length === 0 ? (
          <NoStoreYet name={user?.name ?? undefined} onSignOut={signOut} />
        ) : store ? (
          <>
            {list.length > 1 ? (
              <Pressable onPress={() => setSelectedId(null)} accessibilityRole="button" style={styles.switchRow}>
                <Icon name="chevron-left" size={15} color={obColors.goldDeep} />
                <Text style={styles.switchText}>Switch store</Text>
              </Pressable>
            ) : null}
            <StoreDetail store={store} />
          </>
        ) : (
          <>
            <AppSectionTitle title="Choose a store" />
            <View style={{ gap: 10 }}>
              {list.map((s) => (
                <Pressable key={s.id} onPress={() => setSelectedId(s.id)} accessibilityRole="button" style={styles.pickRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>{s.name}</Text>
                    <Text style={styles.pickMeta}>{s.myRole === 'OWNER' ? 'Owner' : 'Staff'} · {statusLabel(s.status)}</Text>
                  </View>
                  <Icon name="chevron-right" size={17} color={obColors.textMut} />
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function statusLabel(status: Organization['status']): string {
  // Never the raw enum. "PENDING" tells a shopkeeper nothing about whether they
  // should be doing something.
  if (status === 'ACTIVE') return 'Open for orders';
  if (status === 'SUSPENDED') return 'Paused by Afrizone';
  return 'Waiting for approval';
}

function statusPillTone(status: Organization['status']): AppPillTone {
  if (status === 'ACTIVE') return 'ready';
  if (status === 'SUSPENDED') return 'attn';
  return 'review';
}

function NoStoreYet({ name, onSignOut }: { name?: string; onSignOut: () => void }) {
  return (
    <>
      <AppEmptyState
        icon="cart"
        title="No store on your account yet"
        message="Someone from your store needs to add you, or Afrizone needs to register the store. Once that is done it shows up here."
      />
      <View style={styles.helpCard}>
        <Text style={styles.helpTitle}>What to do</Text>
        <Text style={styles.helpLine}>1. If your store is already on Afrizone, ask the owner to add {name ?? 'you'} using this account.</Text>
        <Text style={styles.helpLine}>2. If it is not, contact Afrizone to register it. We approve every store before it can take orders.</Text>
      </View>
      <View style={{ marginTop: 20 }}>
        <AppPrimaryButton label="Sign out" variant="outline" onPress={onSignOut} />
      </View>
    </>
  );
}

function StoreDetail({ store }: { store: Organization }) {
  const members = useAsync<OrgMember[]>((signal) => api.organizationMembers(store.id, signal), [store.id]);
  const pending = store.status !== 'ACTIVE';

  return (
    <>
      {pending ? (
        <View style={styles.statusCard}>
          <View style={[styles.statusIcon, store.status === 'SUSPENDED' && styles.statusIconDanger]}>
            <Icon name="alert" size={22} color={store.status === 'SUSPENDED' ? obColors.danger : obColors.orangeInk} />
          </View>
          <Text style={styles.statusTitle}>{statusLabel(store.status)}</Text>
          <Text style={styles.statusMsg}>
            {store.status === 'SUSPENDED'
              ? 'This store cannot take orders right now. Afrizone will be in touch.'
              : 'Your store profile and documents are under review. You can finish setting up your store now - orders start once Afrizone approves it.'}
          </Text>
          <View style={{ marginTop: 12 }}>
            <AppStatusPill tone={statusPillTone(store.status)} label={statusLabel(store.status)} />
          </View>
        </View>
      ) : null}

      <View style={{ height: pending ? 20 : 0 }} />
      <AppSectionTitle title="Orders" />
      <View style={styles.soonCard}>
        <Icon name="cart" size={17} color={obColors.textMut} />
        <Text style={styles.soonText}>Orders from AfriZoneMart will appear here. That connection is not switched on yet.</Text>
      </View>

      <View style={{ height: 20 }} />
      <AppSectionTitle title="Store details" />
      <View style={styles.detailCard}>
        <DetailRow label="Name" value={store.name} />
        {store.address ? <DetailRow label="Address" value={store.address} /> : null}
        {store.phone ? <DetailRow label="Phone" value={store.phone} /> : null}
        <DetailRow
          label="Payout account"
          value={store.bankMasked ? `${store.bankMasked}${store.bankName ? ` · ${store.bankName}` : ''}` : 'Not set'}
          last
        />
      </View>

      <View style={{ height: 20 }} />
      <AppSectionTitle title="People" />
      {members.loading && !members.data ? (
        <AppLoadingCards count={1} />
      ) : members.error ? (
        <AppErrorState message={members.error} onRetry={members.reload} />
      ) : (
        <AppListCard>
          {(members.data ?? []).map((m, i) => (
            <AppListRow
              key={m.id}
              icon="user"
              title={m.name ?? m.email ?? 'Member'}
              subtitle={m.email ?? undefined}
              last={i === (members.data?.length ?? 1) - 1}
              right={
                <View style={[styles.rolePill, m.role === 'OWNER' && styles.rolePillOwner]}>
                  <Text style={[styles.roleText, m.role === 'OWNER' && styles.roleTextOwner]}>{m.role === 'OWNER' ? 'Owner' : 'Staff'}</Text>
                </View>
              }
            />
          ))}
        </AppListCard>
      )}
    </>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && styles.detailRowDivider]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  eyebrow: { fontSize: 12.5, color: obColors.textMut, fontWeight: '600' },
  h2: { fontSize: 19, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy, marginTop: 2 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 4 },
  switchText: { color: obColors.goldDeep, fontSize: 13, fontWeight: '700' },

  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    padding: 14,
  },
  pickName: { fontSize: 14, fontWeight: '700', color: obColors.text },
  pickMeta: { fontSize: 12, color: obColors.textMut, marginTop: 2 },

  helpCard: { backgroundColor: obColors.white, borderWidth: 1, borderColor: obColors.line, borderRadius: obRadii.card, padding: 16, gap: 6, marginTop: 16 },
  helpTitle: { fontSize: 13.5, fontWeight: '700', color: obColors.text },
  helpLine: { color: obColors.textMut, fontSize: 12.5, lineHeight: 19 },

  statusCard: { backgroundColor: obColors.white, borderWidth: 1, borderColor: obColors.line, borderRadius: obRadii.card, borderTopRightRadius: obRadii.cardCut, padding: 20, alignItems: 'center' },
  statusIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: obColors.orangeInkBg, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statusIconDanger: { backgroundColor: obColors.dangerBg },
  statusTitle: { fontSize: 15.5, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy },
  statusMsg: { fontSize: 12.5, color: obColors.textMut, textAlign: 'center', lineHeight: 18, marginTop: 6 },

  soonCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: obColors.sand, borderWidth: 1, borderColor: obColors.line, borderRadius: obRadii.card, padding: 14 },
  soonText: { flex: 1, color: obColors.textMut, fontSize: 12.5, lineHeight: 18 },

  detailCard: { backgroundColor: obColors.white, borderWidth: 1, borderColor: obColors.line, borderRadius: obRadii.card, paddingHorizontal: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  detailRowDivider: { borderBottomWidth: 1, borderBottomColor: obColors.line },
  detailLabel: { width: 110, color: obColors.textMut, fontSize: 12.5 },
  detailValue: { flex: 1, color: obColors.text, fontSize: 12.5, fontWeight: '700' },

  rolePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: obColors.sand },
  rolePillOwner: { backgroundColor: obColors.roleSelectedBg },
  roleText: { color: obColors.textMut, fontSize: 10.5, fontWeight: '700' },
  roleTextOwner: { color: obColors.goldDeep },
});
