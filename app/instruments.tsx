import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, shadow } from '../lib/theme';
import { supabase } from '../lib/supabase';
import InstrumentCard from './components/InstrumentCard';
import { useAuth, canEdit } from '../lib/auth';

export default function Instruments() {
  const router = useRouter();
  const { user } = useAuth();
  const [instruments, setInstruments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'operational' | 'maintenance' | 'calibration_due' | 'out_of_service'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('instruments').select('*').order('name');
    setInstruments(data || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    return instruments.filter((i) => {
      if (filter !== 'all' && i.status !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          i.name?.toLowerCase().includes(q) ||
          i.model?.toLowerCase().includes(q) ||
          i.serial_number?.toLowerCase().includes(q) ||
          i.location?.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [instruments, query, filter]);

  const filterTabs = [
    { key: 'all', label: 'All', count: instruments.length },
    { key: 'operational', label: 'Operational', count: instruments.filter(i => i.status === 'operational').length },
    { key: 'maintenance', label: 'In Maintenance', count: instruments.filter(i => i.status === 'maintenance').length },
    { key: 'calibration_due', label: 'Calibration Due', count: instruments.filter(i => i.status === 'calibration_due').length },
    { key: 'out_of_service', label: 'Out of Service', count: instruments.filter(i => i.status === 'out_of_service').length },
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Instruments</Text>
            <Text style={styles.subtitle}>Manage your laboratory inventory, QR codes, and compliance records</Text>
          </View>
          {canEdit(user?.role) && (
            <Pressable style={styles.addBtn} onPress={() => router.push('/add-instrument')}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Add Instrument</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.searchBar, shadow]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.search}
            placeholder="Search by name, model, serial, or location..."
            placeholderTextColor={colors.textLight}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter tabs — uses plain View + CSS overflow on web to avoid aria-hidden conflict */}
        <View style={styles.tabsScrollWrapper}>
          <View style={styles.tabsRow}>
            {filterTabs.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setFilter(t.key as any)}
                style={[styles.tab, filter === t.key && styles.tabActive]}
              >
                <Text style={[styles.tabText, filter === t.key && styles.tabTextActive]}>{t.label}</Text>
                <View style={[styles.tabCount, filter === t.key && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, filter === t.key && { color: colors.primary }]}>{t.count}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : filtered.length === 0 ? (
          <View style={[styles.empty, shadow]}>
            <Ionicons name="flask-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyTitle}>No instruments found</Text>
            <Text style={styles.emptySub}>{query ? 'Try a different search term.' : 'Add your first instrument to get started.'}</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((inst) => (
              <InstrumentCard key={inst.id} instrument={inst} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, maxWidth: 1280, alignSelf: 'center', width: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.border, marginBottom: 14,
  },
  search: { flex: 1, fontSize: 14, color: colors.text, outlineStyle: 'none' as any },
  tabsScrollWrapper: {
    marginBottom: 16,
    ...(Platform.OS === 'web' ? {
      overflowX: 'auto',
      overflowY: 'hidden',
    } as any : {}),
  },
  tabsRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  tabCount: { backgroundColor: colors.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  tabCountActive: { backgroundColor: '#fff' },
  tabCountText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  loading: { padding: 60, alignItems: 'center' },
  empty: { backgroundColor: '#fff', padding: 40, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
