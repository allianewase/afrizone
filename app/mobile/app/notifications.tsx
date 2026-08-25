/**
 * The worker's notification inbox.
 *
 * This is the DURABLE side of notifications. Push is best-effort and fails
 * silently for anyone who declined the permission or whose token expired, so
 * this screen - not the push - is what a worker can actually rely on to find
 * out that their application was decided, their credential rejected or their
 * payment released. See app/server/src/services/push.ts.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../src/components/Screen';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { LoadingState, ErrorState, EmptyState } from '../src/components/Feedback';
import { colors, spacing, type, radii, fontFamily } from '../src/theme';
import { api, ApiError } from '../src/api/client';
import { useAsync } from '../src/lib/useAsync';
import { formatDate } from '../src/lib/format';
import type { Notification } from '../src/api/types';

/**
 * Where a notification's deep link goes. The server sends a bare screen name
 * (`{ screen: 'wallet' }`), so the mapping to an actual route lives here.
 * Anything unrecognised simply isn't tappable, rather than navigating nowhere.
 */
const SCREEN_ROUTES: Record<string, string> = {
  tasks: '/(tabs)/tasks',
  wallet: '/(tabs)/wallet',
  kyc: '/(auth)/kyc',
  disputes: '/disputes',
};

/** Icon per destination, so the list is scannable without reading every line. */
const SCREEN_ICONS: Record<string, 'list' | 'wallet' | 'id' | 'alert'> = {
  tasks: 'list',
  wallet: 'wallet',
  kyc: 'id',
  disputes: 'alert',
};

function NotificationRow({
  item,
  onPress,
}: {
  item: Notification;
  onPress: (item: Notification) => void;
}) {
  const screen = item.data?.screen;
  const icon = (screen && SCREEN_ICONS[screen]) || 'bell';
  const target = screen ? SCREEN_ROUTES[screen] : undefined;

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}${item.read ? '' : '. Unread'}`}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={[styles.card, !item.read && styles.cardUnread] as any}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, !item.read && styles.iconWrapUnread]}>
            <Icon name={icon as any} size={16} color={item.read ? colors.textMuted : colors.clay} />
          </View>

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, !item.read && styles.titleUnread]}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              {!item.read ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.message} numberOfLines={3}>
              {item.body}
            </Text>
            <Text style={styles.when}>{formatDate(item.createdAt)}</Text>
          </View>

          {target ? (
            <Icon name="chevron-right" size={16} color={colors.textMuted} />
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { data, loading, error, reload } = useAsync((signal) => api.notifications(signal));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Optimistic local copy: marking read must not make the list flash through a
  // loading state, and the row the worker just tapped is usually the one they
  // are navigating away from.
  const [readOverrides, setReadOverrides] = useState<Record<string, true>>({});

  const items = (data?.items ?? []).map((n) =>
    readOverrides[n.id] ? { ...n, read: true } : n
  );
  const unreadCount = items.filter((n) => !n.read).length;

  const open = useCallback(
    async (item: Notification) => {
      setActionError(null);
      if (!item.read) {
        setReadOverrides((prev) => ({ ...prev, [item.id]: true }));
        // Best-effort: a failed mark-read must not block the navigation the
        // worker actually asked for. The next load corrects the state.
        api.markNotificationRead(item.id).catch(() => {
          setReadOverrides((prev) => {
            const next = { ...prev };
            delete next[item.id];
            return next;
          });
        });
      }
      const screen = item.data?.screen;
      const target = screen ? SCREEN_ROUTES[screen] : undefined;
      if (target) router.push(target as any);
    },
    [router]
  );

  async function markAll() {
    setBusy(true);
    setActionError(null);
    try {
      await api.markAllNotificationsRead();
      reload();
    } catch (e) {
      setActionError(
        e instanceof ApiError || e instanceof Error ? e.message : 'Could not update your inbox.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Notifications"
      subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
      back
      onRefresh={reload}
      refreshing={loading && !!data}
      right={
        unreadCount > 0 ? (
          <Pressable
            onPress={markAll}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
            hitSlop={8}
          >
            <Text style={[styles.markAll, busy && styles.markAllBusy]}>Mark all read</Text>
          </Pressable>
        ) : null
      }
    >
      {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

      {loading && !data ? (
        <LoadingState label="Loading your notifications…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Nothing yet"
          message="Decisions about your applications, documents and payments will appear here."
        />
      ) : (
        <View style={styles.list}>
          {items.map((n) => (
            <NotificationRow key={n.id} item={n} onPress={open} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  pressed: { opacity: 0.7 },
  card: { padding: spacing.md },
  cardUnread: { borderColor: colors.claySoft, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapUnread: { backgroundColor: colors.claySoft },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontSize: type.size.base, fontFamily: fontFamily.bold },
  titleUnread: { fontFamily: fontFamily.extrabold },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.clay },
  message: { color: colors.textMuted, fontSize: type.size.sm, lineHeight: 19 },
  when: { color: colors.textMuted, fontSize: type.size.xs, marginTop: 2 },
  markAll: { color: colors.clay, fontSize: type.size.sm, fontFamily: fontFamily.bold },
  markAllBusy: { opacity: 0.5 },
  actionError: {
    color: colors.dangerInk,
    fontSize: type.size.sm,
    marginBottom: spacing.sm,
  },
});
