import React from 'react';
import { Tabs } from 'expo-router';
import { Icon, IconName } from '../../src/components/Icon';
import { colors, type } from '../../src/theme';

function tabIcon(name: IconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Icon name={name} size={24} color={color} strokeWidth={focused ? 2.4 : 2} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.clay,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: type.size.xs, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="tasks" options={{ title: 'My Tasks', tabBarIcon: tabIcon('list') }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet', tabBarIcon: tabIcon('wallet') }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: tabIcon('briefcase') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('user') }} />
    </Tabs>
  );
}
