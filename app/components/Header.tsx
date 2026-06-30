import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { colors } from '../../lib/theme';
import { useAuth } from '../../lib/auth';

const DESKTOP_BREAKPOINT = 768;

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, refreshProfile } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { width } = useWindowDimensions();

  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const navItems = useMemo(
    () => [
      { label: 'Dashboard',  path: '/',            icon: 'grid-outline'          as const },
      { label: 'Instruments',path: '/instruments',  icon: 'hardware-chip-outline' as const },
      { label: 'Calendar',   path: '/calendar',     icon: 'calendar-outline'      as const },
      { label: 'Trends',     path: '/trends',       icon: 'bar-chart-outline'     as const },
      { label: 'Documents',  path: '/documents',    icon: 'document-text-outline' as const },
      { label: 'Chemicals',  path: '/chemicals',    icon: 'flask-outline'         as const },
      { label: 'Settings',   path: '/settings',     icon: 'settings-outline'      as const },
      ...(user?.role === 'admin'
        ? [{ label: 'Users', path: '/admin/users',  icon: 'people-outline'        as const }]
        : []),
    ],
    [user?.role]
  );

  useEffect(() => {
    refreshProfile();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener);
    window.addEventListener('appinstalled', () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const showInstallBtn = Platform.OS === 'web' && installPrompt && !isInstalled;

  return (
    <>
      <View style={styles.wrap}>
        <View style={styles.inner}>

          {/* LEFT: HAMBURGER MENU (mobile only) + BRAND */}
          <View style={styles.left}>
            {!isDesktop && (
              <Pressable 
                onPress={() => setMobileMenuOpen(!mobileMenuOpen)} 
                style={styles.hamburger}
              >
                <Ionicons name="menu-outline" size={24} color={colors.text} />
              </Pressable>
            )}
            <Pressable style={styles.brand} onPress={() => router.push('/')}>
              <View style={styles.logo}>
                <Ionicons name="flask" size={18} color="#fff" />
              </View>
              <View>
                <Text style={styles.brandTitle}>LabCEI</Text>
                <Text style={styles.brandSub}>Compliance</Text>
              </View>
            </Pressable>
          </View>

          {/* CENTER: DESKTOP NAV */}
          {isDesktop && (
            <View style={styles.desktopNav}>
              {navItems.map((item) => {
                const active =
                  pathname === item.path ||
                  (item.path === '/instruments' && pathname.startsWith('/instrument'));
                return (
                  <Pressable
                    key={item.path}
                    onPress={() => router.push(item.path as any)}
                    style={[styles.navItem, active && styles.navItemActive]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={14}
                      color={active ? colors.primary : colors.textMuted}
                    />
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* RIGHT: INSTALL + AUTH */}
          <View style={styles.right}>
            {showInstallBtn && (
              <Pressable onPress={handleInstall} style={styles.installBtn}>
                <Ionicons name="download-outline" size={14} color={colors.primary} />
                <Text style={styles.installText}>Install</Text>
              </Pressable>
            )}

            {user ? (
              <Pressable onPress={logout} style={styles.logoutBtn}>
                <Ionicons name="log-out-outline" size={14} color="#fff" />
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push('/login')}
                style={styles.loginBtn}
              >
                <Ionicons name="log-in-outline" size={14} color="#fff" />
                <Text style={styles.loginText}>Sign In</Text>
              </Pressable>
            )}
          </View>

        </View>
      </View>

      {/* MOBILE MENU OVERLAY */}
      {!isDesktop && mobileMenuOpen && (
        <>
          <Pressable 
            style={styles.overlay} 
            onPress={() => setMobileMenuOpen(false)} 
          />
          <View style={styles.mobileMenu}>
            {navItems.map((item) => {
              const active =
                pathname === item.path ||
                (item.path === '/instruments' && pathname.startsWith('/instrument'));
              return (
                <Pressable
                  key={item.path}
                  onPress={() => {
                    router.push(item.path as any);
                    setMobileMenuOpen(false);
                  }}
                  style={[styles.mobileMenuItem, active && styles.mobileMenuItemActive]}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={active ? colors.primary : colors.text}
                  />
                  <Text style={[styles.mobileMenuLabel, active && styles.mobileMenuLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },

  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },

  hamburger: {
    padding: 4,
  },

  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  logo: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },

  brandSub: {
    fontSize: 9,
    color: colors.textMuted,
  },

  desktopNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: 8,
  },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },

  navItemActive: {
    backgroundColor: colors.primary + '12',
  },

  navLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },

  navLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },

  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },

  installText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },

  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.primary,
    borderRadius: 6,
  },

  loginText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },

  logoutText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },

  // Mobile menu styles
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999,
  },

  mobileMenu: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    margin: 16,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },

  mobileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },

  mobileMenuItemActive: {
    backgroundColor: colors.primary + '12',
  },

  mobileMenuLabel: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },

  mobileMenuLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
