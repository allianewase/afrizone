import React, { useCallback, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { AppIconButton } from './AppUI';
import { api } from '../api/client';

/**
 * Same real unread-count polling as src/components/NotificationBell.tsx
 * (left untouched for screens not yet restyled) - restyled chrome only, to
 * the prototype's icon-button-with-dot (not a numbered badge).
 */
export function AppNotificationBell() {
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
        .catch(() => {});
      return () => {
        active = false;
        ctrl.abort();
      };
    }, []),
  );

  return (
    <AppIconButton
      icon="bell"
      onPress={() => router.push('/notifications')}
      showDot={unread > 0}
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    />
  );
}
