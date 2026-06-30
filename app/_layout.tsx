import { unregisterForeignServiceWorkers } from './unregister-foreign-sw';
import { Stack, useRouter, useSegments, usePathname } from "expo-router";
import { AuthProvider, useAuth } from "../lib/auth";
import { useEffect } from "react";
import { ActivityIndicator, View, Platform, useWindowDimensions } from "react-native";

import Header from "./components/Header";
import BottomNav from "./components/BottomNav";

// Polyfill fetch
if (typeof globalThis.fetch === "undefined") {
  // @ts-ignore
  globalThis.fetch = fetch;
}

const DESKTOP_BREAKPOINT = 768;

// 🔒 Route protection + role control
function RootNavigation() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const { width } = useWindowDimensions();

  const isDesktop = width >= DESKTOP_BREAKPOINT;

  // ✅ Clean up any foreign service workers on web
  useEffect(() => {
    if (Platform.OS === 'web') {
      unregisterForeignServiceWorkers();
    }
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthScreen = segments[0] === "login";

    if (!user && !inAuthScreen) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    if (user && inAuthScreen) {
      router.replace("/");
      return;
    }

    if (segments[0] === "admin" && user?.role !== "admin") {
      router.replace("/");
      return;
    }
  }, [user, loading, segments, pathname]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  const showBottomNav = segments[0] !== "login" && !isDesktop;

  return (
    <View style={{ flex: 1 }}>
      {/* ✅ TOP HEADER (includes nav on desktop) */}
      <Header />

      {/* ✅ MAIN SCREENS */}
      <View style={{ flex: 1, paddingBottom: showBottomNav ? 70 : 0 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#f8fafc" },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="instruments" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="add-instrument" />
          <Stack.Screen name="calendar" />
          <Stack.Screen name="trends" />
          <Stack.Screen name="documents" />
          <Stack.Screen name="chemicals" />   {/* ← ADDED */}
          <Stack.Screen name="instrument/[id]" />
          <Stack.Screen name="admin/users" />
        </Stack>
      </View>

      {/* ✅ BOTTOM NAV — mobile only, hide on login */}
      {showBottomNav && <BottomNav />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigation />
    </AuthProvider>
  );
}
