import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { ListRow } from '../../src/components/ListRow';
import { Button } from '../../src/components/Button';
import { TierBadge } from '../../src/components/TierBadge';
import { StatusPill, toCanonical } from '../../src/components/StatusPill';
import { Icon } from '../../src/components/Icon';
import { LoadingState } from '../../src/components/Feedback';
import { colors, spacing, type } from '../../src/theme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { useAuth } from '../../src/auth/AuthContext';
import type { User, Contract } from '../../src/api/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { user: authUser, signOut } = useAuth();
  const [notifTasks, setNotifTasks] = useState(true);
  const [notifPay, setNotifPay] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);

  // REAL: GET /api/me — fresh profile (falls back to the cached auth user).
  const me = useAsync<User>((signal) => api.meWorker(signal), []);
  // REAL: GET /api/me/contracts
  const contracts = useAsync<Contract[]>((signal) => api.myContracts(signal), []);

  const user = me.data ?? authUser;
  const kyc = user?.kycStatus ?? 'PENDING';

  function confirmLogout() {
    if (Platform.OS === 'web') {
      void signOut();
      return;
    }
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen
      title="Profile"
      subtitle={user?.email ?? undefined}
      onRefresh={() => {
        me.reload();
        contracts.reload();
      }}
      refreshing={me.loading && !!me.data}
    >
      {/* Identity card */}
      <Card style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? 'A')
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </Text>
        </View>
        <View style={styles.identityBody}>
          <Text style={styles.name}>{user?.name ?? 'Worker'}</Text>
          <View style={styles.tiers}>
            {(user?.tiers ?? []).map((t) => (
              <TierBadge key={t} tier={t} small />
            ))}
          </View>
        </View>
        {user?.rating ? (
          <View style={styles.rating}>
            <Text style={styles.ratingValue}>{user.rating.toFixed(1)}</Text>
            <Text style={styles.ratingLabel}>rating</Text>
          </View>
        ) : null}
      </Card>

      <Section title="Verification">
        <Card padded={false} style={styles.list}>
          <ListRow
            icon="shield"
            title="KYC status"
            subtitle="Identity & tier verification"
            right={<StatusPill status={toCanonical(kyc)} small label={kyc} />}
            chevron={false}
          />
          <Divider />
          <ListRow icon="id" title="Documents" subtitle="ID, certifications" onPress={() => {}} />
        </Card>
      </Section>

      <Section title="Security">
        <Card padded={false} style={styles.list}>
          <ListRow
            icon="shield"
            title="Two-factor authentication"
            subtitle="Add a code from an authenticator app"
            right={
              <StatusPill
                status={user?.totpEnabled ? 'paid' : 'pending'}
                small
                label={user?.totpEnabled ? 'On' : 'Off'}
              />
            }
            onPress={() => router.push('/security')}
          />
        </Card>
      </Section>

      <Section title="Contracts">
        <Card padded={false} style={styles.list}>
          {contracts.loading && !contracts.data ? (
            <View style={{ paddingVertical: spacing.lg }}>
              <LoadingState />
            </View>
          ) : (contracts.data?.length ?? 0) === 0 ? (
            <ListRow
              icon="id"
              title="No contracts yet"
              subtitle="Service agreements appear once you’re approved for a task."
              chevron={false}
            />
          ) : (
            (contracts.data ?? []).map((c, i) => (
              <View key={c.id}>
                <ContractRow contract={c} onSigned={contracts.reload} />
                {i < (contracts.data?.length ?? 0) - 1 ? <Divider /> : null}
              </View>
            ))
          )}
        </Card>
      </Section>

      <Section title="Payments & tax">
        <Card padded={false} style={styles.list}>
          <ListRow
            icon="bank"
            title="Bank account"
            subtitle={user?.bankMasked ?? 'Add a payout account'}
            onPress={() => {}}
          />
          <Divider />
          <ListRow icon="wallet" title="Tax info (TIN)" subtitle="For WHT statements" onPress={() => {}} />
        </Card>
      </Section>

      <Section title="Notifications">
        <Card style={styles.notif}>
          <NotifRow label="Task matches & approvals" value={notifTasks} onChange={setNotifTasks} />
          <Divider />
          <NotifRow label="Payments & withdrawals" value={notifPay} onChange={setNotifPay} />
          <Divider />
          <NotifRow label="Email summaries" value={notifEmail} onChange={setNotifEmail} />
        </Card>
      </Section>

      <Section title="Support">
        <Card padded={false} style={styles.list}>
          <ListRow icon="bell" title="Help & support" onPress={() => {}} />
        </Card>
      </Section>

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Log out" variant="secondary" icon="logout" onPress={confirmLogout} />
      </View>
      <Text style={styles.version}>Afrizone Part Time · v1.0.0</Text>
    </Screen>
  );
}

function ContractRow({ contract, onSigned }: { contract: Contract; onSigned: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signed = contract.status === 'SIGNED';

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      // REAL: POST /api/contracts/:id/sign
      await api.signContract(contract.id);
      onSigned();
    } catch (e) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Could not sign contract.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.contractRow}>
      <Icon name="id" size={20} color={colors.clay} />
      <View style={styles.contractBody}>
        <Text style={styles.contractTitle} numberOfLines={2}>
          {contract.task?.title ?? 'Service agreement'}
        </Text>
        {error ? <Text style={styles.contractError}>{error}</Text> : null}
      </View>
      {signed ? (
        <StatusPill status="paid" small label="Signed" />
      ) : (
        <Button label="Sign" full={false} onPress={sign} loading={busy} />
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function NotifRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.notifRow}>
      <Text style={styles.notifLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.clay, false: colors.line }}
        thumbColor={colors.white}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.gold, fontSize: type.size.lg, fontWeight: '800' },
  identityBody: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontSize: type.size.lg, fontWeight: '800' },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rating: { alignItems: 'center' },
  ratingValue: { color: colors.clay, fontSize: type.size.xl, fontWeight: '800' },
  ratingLabel: { color: colors.textMuted, fontSize: type.size.xs },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: type.size.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  list: { paddingHorizontal: spacing.lg },
  contractRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  contractBody: { flex: 1, gap: 2 },
  contractTitle: { color: colors.text, fontSize: type.size.base, fontWeight: '700' },
  contractError: { color: colors.danger, fontSize: type.size.xs },
  notif: { gap: 0 },
  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, minHeight: 44 },
  notifLabel: { color: colors.text, fontSize: type.size.md, fontWeight: '600', flex: 1, paddingRight: spacing.md },
  divider: { height: 1, backgroundColor: colors.line },
  version: { color: colors.textMuted, fontSize: type.size.sm, textAlign: 'center', marginTop: spacing.lg },
});
