import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, shadow } from '../../lib/theme';
import StatusBadge from './StatusBadge';

type Instrument = {
  id: string;
  name: string;
  model?: string;
  serial_number?: string;
  location?: string;
  category?: string;
  status: string;
  cei_score?: number;
  risk_score?: number;
  next_calibration?: string;
};

export default function InstrumentCard({ instrument }: { instrument: Instrument }) {
  const router = useRouter();
  const cei = instrument.cei_score ?? 0;
  const ceiColor = cei >= 85 ? colors.success : cei >= 65 ? colors.warning : colors.danger;

  return (
    <Pressable
      onPress={() => router.push(`/instrument/${instrument.id}`)}
      style={({ pressed }) => [styles.card, shadow, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="hardware-chip-outline" size={22} color={colors.primary} />
        </View>
        <View style={[styles.ceiPill, { backgroundColor: ceiColor + '15' }]}>
          <Text style={[styles.ceiText, { color: ceiColor }]}>CEI {cei}</Text>
        </View>
      </View>

      <Text style={styles.name} numberOfLines={1}>{instrument.name}</Text>
      <Text style={styles.model} numberOfLines={1}>{instrument.model || '—'}</Text>

      <View style={styles.row}>
        <Ionicons name="location-outline" size={13} color={colors.textMuted} />
        <Text style={styles.meta} numberOfLines={1}>{instrument.location || 'Unknown'}</Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="barcode-outline" size={13} color={colors.textMuted} />
        <Text style={styles.meta} numberOfLines={1}>{instrument.serial_number || '—'}</Text>
      </View>

      <View style={styles.footer}>
        <StatusBadge status={instrument.status} small />
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
    minWidth: 260,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  ceiPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  ceiText: { fontSize: 12, fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  model: { fontSize: 13, color: colors.textMuted, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  meta: { fontSize: 12, color: colors.textMuted, flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
});
