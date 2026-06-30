import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { statusColor, statusLabel } from '../../lib/theme';

export default function StatusBadge({ status, small = false }: { status: string; small?: boolean }) {
  const color = statusColor(status);
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color + '40' }, small && styles.small]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }, small && { fontSize: 11 }]}>{statusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  text: { fontSize: 12, fontWeight: '600' },
});
