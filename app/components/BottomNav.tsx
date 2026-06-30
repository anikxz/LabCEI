import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { colors } from '../../lib/theme';
import { useAuth } from '../../lib/auth';

const MOBILE_BREAKPOINT = 768;

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  const isMobile = width < MOBILE_BREAKPOINT;

  const navItems = useMemo(
    () => [
      { label: 'Dashboard',   path: '/',            icon: 'grid-outline'          as const },
      { label: 'Instruments', path: '/instruments', icon: 'hardware-chip-outline' as const },
      { label: 'Calendar',    path: '/calendar',    icon: 'calendar-outline'      as const },
      { label: 'Trends',      path: '/trends',      icon: 'bar-chart-outline'     as const },
      { label: 'Documents',   path: '/documents',   icon: 'document-text-outline' as const },
      { label: 'Chemicals',   path: '/chemicals',   icon: 'flask-outline'         as const },
      { label: 'Settings',    path: '/settings',    icon: 'settings-outline'      as const },
      ...(user?.role === 'admin'
        ? [{ label: 'Users', path: '/admin/users', icon: 'people-outline' as const }]
        : []),
    ],
    [user?.role]
  );

  // Only show bottom nav on mobile
  if (!isMobile) return null;

  return (
    <View style={styles.container}>
      {navItems.map((item) => {
        const active =
          pathname === item.path ||
          (item.path === '/instruments' && pathname.startsWith('/instrument'));
        return (
          <Pressable
            key={item.path}
            onPress={() => router.push(item.path as any)}
            style={styles.item}
          >
            <Ionicons
              name={item.icon}
              size={24}
              color={active ? colors.primary : colors.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 60,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 8,
  },
  item: { 
    alignItems: 'center', 
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
