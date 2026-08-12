import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../src/components/Icon';
import { colors, type, fontFamily } from '../../src/theme';

function tabIcon(name: IconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <View style={[iconStyles.wrap, focused && iconStyles.wrapActive]}>
      <Icon name={name} size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
    </View>
  );
}

const iconStyles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 30,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapActive: { backgroundColor: colors.claySoft },
});

export default function TabsLayout() {
  // Bottom tabs normally add the safe-area inset themselves, but overriding
  // `height` opts out of that. Without this the Android gesture bar sits on top
  // of the labels: on a Pixel 8 it struck straight through "Wallet".
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // goldInk, not clay: the tint colours both a 12px label and a 24px icon
        // against colors.surface, where clay is 1.90:1. goldInk is 5.92:1.
        tabBarActiveTintColor: colors.goldInk,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          height: 64 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 8,
          // Lifted bar instead of a flat hairline-bordered strip: matches the
          // shadow treatment every card in the app now carries.
          shadowColor: '#1C1917',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarLabelStyle: { fontSize: type.size.xs, fontFamily: fontFamily.bold, marginTop: 2 },
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
