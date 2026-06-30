import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../../lib/theme';

export default function QRCode({ url, size = 180, title }: { url: string; size?: number; title?: string }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size * 2}x${size * 2}&data=${encodeURIComponent(url)}&margin=10`;

  const copyUrl = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
  };

  const download = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(qrUrl, '_blank');
    }
  };

  return (
    <View style={[styles.card, shadow]}>
      <Text style={styles.title}>{title || 'Instrument QR Code'}</Text>
      <Text style={styles.subtitle}>Scan to access this instrument</Text>
      <View style={[styles.qrWrap, { width: size + 20, height: size + 20 }]}>
        <Image source={{ uri: qrUrl }} style={{ width: size, height: size }} contentFit="contain" />
      </View>
      <Text style={styles.urlText} numberOfLines={2}>{url}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={copyUrl}>
          <Ionicons name="copy-outline" size={14} color={colors.primary} />
          <Text style={styles.actionText}>Copy URL</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={download}>
          <Ionicons name="download-outline" size={14} color={colors.primary} />
          <Text style={styles.actionText}>Download</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 14 },
  qrWrap: {
    backgroundColor: '#fff', borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  urlText: { fontSize: 11, color: colors.textMuted, marginTop: 12, textAlign: 'center', maxWidth: 220 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: colors.primary + '10',
  },
  actionText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
});
