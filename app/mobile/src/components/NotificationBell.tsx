/**
 * Header bell with an unread badge, linking to the notification inbox.
 *
 * The badge is deliberately fed by the count-only endpoint rather than by
 * loading the inbox itself: it is checked far more often than the list is
 * opened, and the server answers the count straight from an index without
 * reading any rows.
 *
 * The count refreshes whenever the host screen regains focus, so returning
 * from the inbox after reading something clears the badge without a manual
 * pull-to-refresh.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Icon } from './Icon';
import { colors, type, fontFamily } from '../theme';
import { api } from '../api/client';

export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const ctrl = new AbortController();
      let active = true;
      api
        .unreadNotificationCount(ctrl.signal)
        .then((r) => {
          if (active) setUnread(r.unreadCount);
        })
        // A badge is not worth surfacing an error for: the inbox itself
        // reports failures properly, and a stale count is harmless.
        .catch(() => {});
      return () => {
        active = false;
        ctrl.abort();
      };
    }, [])
  );

  const label =
    unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={styles.wrap}
    >
      <Icon name="bell" size={22} color={colors.text} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {unread > 9 ? '9+' : String(unread)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 2 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.clay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: type.size.xs,
    lineHeight: 15,
    fontFamily: fontFamily.bold,
  },
});
