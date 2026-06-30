import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../../lib/theme';

type Props = {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  hint?: string;
};

export default function StatCard({ label, value, icon, color = colors.primary, hint }: Props) {
  return (
    <View style={[styles.card, shadow]}>
      <View style={[styles.iconWrap, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={[styles.hint, { color }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  value: { fontSize: 26, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  hint: { fontSize: 11, fontWeight: '600', marginTop: 6 },
});
