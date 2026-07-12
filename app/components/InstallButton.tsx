import React, { useEffect, useState } from 'react';
import { Pressable, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * PWA "Install" button (web only).
 *
 * Listens for the browser's `beforeinstallprompt` event, suppresses the default
 * mini-infobar, and exposes a button that triggers the native install prompt.
 * Renders nothing when the app is already installed, on native, or when the
 * browser hasn't offered an install prompt (e.g. iOS Safari, or already installed).
 */
export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // Already running as an installed PWA?
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (standalone) { setInstalled(true); return; }

    const onBeforeInstall = (e: any) => {
      e.preventDefault();          // stop the automatic mini-infobar
      setDeferredPrompt(e);        // stash it so we can trigger it on demand
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore — the browser resolves/rejects depending on user action
    }
    // A prompt can only be used once
    setDeferredPrompt(null);
  };

  if (installed || !deferredPrompt) return null;

  return (
    <Pressable style={styles.btn} onPress={handleInstall}>
      <Ionicons name="download-outline" size={16} color="#fff" />
      <Text style={styles.text}>Install App</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#16a34a', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  text: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
