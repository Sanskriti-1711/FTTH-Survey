import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useThemeStore } from '../../lib/stores/theme';
import { Radius } from '../../lib/theme/colors';
import { Home, User } from 'lucide-react-native';

// ── Tab Layout ────────────────────────────────────────────────────────────
// Home and Profile tabs only. The Map opens from a project (stack route),
// and the Survey form lives inside the feature detail screen.

export default function TabLayout() {
  const colors = useThemeStore((s) => s.colors);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        // The 64 px bar with 11 px labels clipped both labels on a 390 px
        // screen ("Ho…", "Pr…"). 13 px type and a little more height fix it
        // without making the bar feel like a toolbar.
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.outlineLight,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 92 : 72,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 30 : 10,
        },
        tabBarLabelStyle: {
          fontSize: 13,
          lineHeight: 17,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: { marginBottom: 0 },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
