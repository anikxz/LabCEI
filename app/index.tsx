import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, shadow } from '../lib/theme';
import { supabase } from '../lib/supabase';
import StatCard from './components/StatCard';
import InstrumentCard from './components/InstrumentCard';
import StatusBadge from './components/StatusBadge';
import InstallButton from './components/InstallButton';
import { useAuth } from '../lib/auth';
import { generateFleetHTML, printHTML } from '../lib/generatePDF';

type Instrument = any;

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ Bulk AI state
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkDone, setBulkDone] = useState(false);

  // ✅ Auto-status state
  const [autoStatusRunning, setAutoStatusRunning] = useState(false);
  const [autoStatusResult, setAutoStatusResult] = useState<string | null>(null);

  // ✅ NEW: Bulk predictions state
  const [bulkPredRunning, setBulkPredRunning] = useState(false);
  const [bulkPredProgress, setBulkPredProgress] = useState({ done: 0, total: 0 });
  const [bulkPredDone, setBulkPredDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: instData }, { data: logData }] = await Promise.all([
      supabase.from('instruments').select('*').order('created_at', { ascending: false }),
      supabase.from('maintenance_logs').select('*, instruments(name)').order('log_date', { ascending: false }).limit(6),
    ]);
    setInstruments(instData || []);
    setLogs(logData || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = new Date();
  const daysBetween = (d?: string) => d ? Math.floor((new Date(d).getTime() - today.getTime()) / 86400000) : 999;

  const overdue = instruments.filter(i => daysBetween(i.next_maintenance) < 0 || daysBetween(i.next_calibration) < 0);
  const upcoming = instruments.filter(i => {
    const m = daysBetween(i.next_maintenance);
    const c = daysBetween(i.next_calibration);
    return (m >= 0 && m <= 30) || (c >= 0 && c <= 30);
  });
  const outOfService = instruments.filter(i => i.status === 'out_of_service');
  const avgCEI = instruments.length
    ? Math.round(instruments.reduce((s, i) => s + (i.cei_score || 0), 0) / instruments.length)
    : 0;

  // ✅ NEW: instruments predicted to fail within 30 days with ≥40% probability
  const atRisk = instruments.filter(
    (i) =>
      i.predicted_failure_days != null &&
      i.predicted_failure_days <= 30 &&
      i.failure_probability != null &&
      i.failure_probability >= 0.4
  );

  // =============================================
  // ✅ BULK AI ANALYSIS
  // =============================================
  const runBulkAI = async () => {
    if (bulkRunning || instruments.length === 0) return;

    setBulkRunning(true);
    setBulkDone(false);
    setBulkProgress({ done: 0, total: instruments.length });

    for (let i = 0; i < instruments.length; i++) {
      const inst = instruments[i];
      try {
        const { data: instLogs } = await supabase
          .from('maintenance_logs')
          .select('*')
          .eq('instrument_id', inst.id);

        await supabase.functions.invoke('ai-analysis', {
          body: {
            action: 'risk_and_cei',
            instrument: inst,
            logs: instLogs || [],
          },
        });
      } catch (e) {
        console.error(`AI failed for ${inst.name}:`, e);
      }
      setBulkProgress({ done: i + 1, total: instruments.length });
    }

    setBulkRunning(false);
    setBulkDone(true);
    await load();
    setTimeout(() => setBulkDone(false), 4000);
  };

  // =============================================
  // ✅ NEW: BULK PREDICTIONS
  // =============================================
  const runBulkPredictions = async () => {
    if (bulkPredRunning || instruments.length === 0) return;

    setBulkPredRunning(true);
    setBulkPredDone(false);
    setBulkPredProgress({ done: 0, total: instruments.length });

    for (let i = 0; i < instruments.length; i++) {
      const inst = instruments[i];
      try {
        const { data: instLogs } = await supabase
          .from('maintenance_logs')
          .select('*')
          .eq('instrument_id', inst.id);

        await supabase.functions.invoke('ai-analysis', {
          body: {
            action: 'predict_failure',
            instrument: inst,
            logs: instLogs || [],
          },
        });
      } catch (e) {
        console.error(`Prediction failed for ${inst.name}:`, e);
      }
      setBulkPredProgress({ done: i + 1, total: instruments.length });
    }

    setBulkPredRunning(false);
    setBulkPredDone(true);
    await load();
    setTimeout(() => setBulkPredDone(false), 4000);
  };

  // =============================================
  // ✅ FLEET PDF EXPORT
  // =============================================
  const exportFleetPDF = async () => {
    if (Platform.OS !== 'web') return;
    const { data: allLogs } = await supabase.from('maintenance_logs').select('*');
    const html = generateFleetHTML(instruments, allLogs || []);
    printHTML(html, 'Fleet Compliance Report');
  };

  // =============================================
  // ✅ RUN AUTO-STATUS MANUALLY
  // =============================================
  const runAutoStatus = async () => {
    if (autoStatusRunning) return;
    setAutoStatusRunning(true);
    setAutoStatusResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('auto-status', {
        body: {},
      });

      if (error) throw error;

      const msg = data.updated === 0
        ? 'All statuses up to date'
        : `${data.updated} instrument${data.updated > 1 ? 's' : ''} updated`;

      setAutoStatusResult(msg);
      await load();
      setTimeout(() => setAutoStatusResult(null), 5000);
    } catch (e: any) {
      console.error('Auto-status error:', e);
      setAutoStatusResult('Failed to run');
      setTimeout(() => setAutoStatusResult(null), 3000);
    } finally {
      setAutoStatusRunning(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroEyebrow}>COMPLIANCE DASHBOARD</Text>
            <Text style={styles.heroTitle}>
              Welcome{user ? `, ${user.fullName}` : ''}
            </Text>
            <Text style={styles.heroSubtitle}>
              Monitor laboratory instrument health, track calibration schedules, and maintain audit-ready compliance records.
            </Text>
            <View style={styles.heroActions}>
              <Pressable style={styles.primaryBtn} onPress={() => router.push('/instruments')}>
                <Ionicons name="hardware-chip-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>View Instruments</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => router.push('/add-instrument')}>
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.secondaryBtnText}>Add Instrument</Text>
              </Pressable>

              {/* ✅ PWA install (web only; renders when installable) */}
              <InstallButton />

              {/* ✅ BULK AI BUTTON — ADMIN ONLY */}
              {user?.role === 'admin' && (
                <Pressable
                  style={[styles.aiBtn, bulkRunning && styles.aiBtnDisabled]}
                  onPress={runBulkAI}
                  disabled={bulkRunning}
                >
                  {bulkRunning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : bulkDone ? (
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  ) : (
                    <Ionicons name="sparkles" size={16} color="#fff" />
                  )}
                  <Text style={styles.aiBtnText}>
                    {bulkRunning
                      ? `Analyzing ${bulkProgress.done}/${bulkProgress.total}...`
                      : bulkDone
                      ? 'Analysis Complete!'
                      : 'Run AI on All'}
                  </Text>
                </Pressable>
              )}

              {/* ✅ NEW: BULK PREDICTIONS BUTTON — ADMIN ONLY */}
              {user?.role === 'admin' && (
                <Pressable
                  style={[styles.predBtn, bulkPredRunning && styles.aiBtnDisabled]}
                  onPress={runBulkPredictions}
                  disabled={bulkPredRunning}
                >
                  {bulkPredRunning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : bulkPredDone ? (
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  ) : (
                    <Ionicons name="pulse-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.aiBtnText}>
                    {bulkPredRunning
                      ? `Predicting ${bulkPredProgress.done}/${bulkPredProgress.total}...`
                      : bulkPredDone
                      ? 'Predictions Done!'
                      : 'Run Predictions'}
                  </Text>
                </Pressable>
              )}

              {/* ✅ FLEET REPORT BUTTON — ADMIN ONLY */}
              {user?.role === 'admin' && Platform.OS === 'web' && (
                <Pressable style={styles.exportBtn} onPress={exportFleetPDF}>
                  <Ionicons name="document-text-outline" size={16} color={colors.success} />
                  <Text style={styles.exportBtnText}>Fleet Report</Text>
                </Pressable>
              )}

              {/* ✅ SYNC STATUSES BUTTON — ADMIN ONLY */}
              {user?.role === 'admin' && (
                <Pressable
                  style={[styles.autoStatusBtn, autoStatusRunning && styles.aiBtnDisabled]}
                  onPress={runAutoStatus}
                  disabled={autoStatusRunning}
                >
                  {autoStatusRunning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="refresh-circle-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.autoStatusBtnText}>
                    {autoStatusRunning ? 'Checking...' : 'Sync Statuses'}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* ✅ PROGRESS BAR — bulk AI */}
            {bulkRunning && user?.role === 'admin' && (
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` as any },
                  ]}
                />
              </View>
            )}

            {/* ✅ NEW: PROGRESS BAR — bulk predictions */}
            {bulkPredRunning && user?.role === 'admin' && (
              <View style={[styles.progressBar, { marginTop: bulkRunning ? 4 : 14 }]}>
                <View
                  style={[
                    styles.progressFillPred,
                    { width: `${Math.round((bulkPredProgress.done / bulkPredProgress.total) * 100)}%` as any },
                  ]}
                />
              </View>
            )}

            {/* ✅ AUTO-STATUS RESULT TOAST */}
            {autoStatusResult && (
              <View style={styles.toast}>
                <Ionicons
                  name={autoStatusResult === 'Failed to run' ? 'alert-circle' : 'checkmark-circle'}
                  size={14}
                  color="#fff"
                />
                <Text style={styles.toastText}>{autoStatusResult}</Text>
              </View>
            )}
          </View>

          <View style={styles.heroRight}>
            <View style={[styles.ceiRing, { borderColor: avgCEI >= 85 ? colors.success : avgCEI >= 65 ? colors.warning : colors.danger }]}>
              <Text style={styles.ceiValue}>{avgCEI}</Text>
              <Text style={styles.ceiLabel}>Avg CEI</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <StatCard label="Total Instruments" value={instruments.length} icon="hardware-chip-outline" color={colors.primary} />
              <StatCard label="Overdue Items" value={overdue.length} icon="alert-circle-outline" color={colors.danger} hint={overdue.length > 0 ? 'Action required' : 'All clear'} />
              <StatCard label="Due Within 30 Days" value={upcoming.length} icon="time-outline" color={colors.warning} />
              <StatCard label="Out of Service" value={outOfService.length} icon="close-circle-outline" color={colors.textMuted} />
              {/* ✅ NEW: at-risk stat card */}
              <StatCard label="At Risk (AI)" value={atRisk.length} icon="pulse-outline" color="#7c3aed" hint={atRisk.length > 0 ? 'Predicted ≤30d' : 'No alerts'} />
            </View>

            {/* ✅ Quick Access tiles */}
            <View style={styles.quickAccessGrid}>
              {[
                { label: 'Calendar',  icon: 'calendar-outline',        color: '#0891b2', bg: '#e0f2fe', route: '/calendar'  },
                { label: 'Trends',    icon: 'bar-chart-outline',        color: '#7c3aed', bg: '#ede9fe', route: '/trends'    },
                { label: 'Documents', icon: 'document-text-outline',    color: '#16a34a', bg: '#dcfce7', route: '/documents' },
                { label: 'Chemicals', icon: 'flask-outline',            color: '#ea580c', bg: '#ffedd5', route: '/chemicals' },
              ].map((tile) => (
                <Pressable
                  key={tile.label}
                  style={({ pressed }) => [styles.quickTile, shadow, pressed && { opacity: 0.85 }]}
                  onPress={() => router.push(tile.route as any)}
                >
                  <View style={[styles.quickTileIcon, { backgroundColor: tile.bg }]}>
                    <Ionicons name={tile.icon as any} size={24} color={tile.color} />
                  </View>
                  <Text style={[styles.quickTileLabel, { color: tile.color }]}>{tile.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={tile.color} style={{ marginTop: 2 }} />
                </Pressable>
              ))}
            </View>

            {/* ✅ Overdue banner — unchanged */}
            {overdue.length > 0 && (
              <View style={[styles.alertBanner, shadow]}>
                <View style={styles.alertIcon}><Ionicons name="warning" size={22} color={colors.danger} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>{overdue.length} instrument{overdue.length > 1 ? 's' : ''} overdue</Text>
                  <Text style={styles.alertSub}>Maintenance or calibration past due. Review and schedule service.</Text>
                </View>
                <Pressable style={styles.alertBtn} onPress={() => router.push('/instruments?filter=overdue')}>
                  <Text style={styles.alertBtnText}>Review</Text>
                </Pressable>
              </View>
            )}

            {/* ✅ NEW: At-risk prediction banner */}
            {atRisk.length > 0 && (
              <View style={[styles.atRiskBanner, shadow]}>
                <View style={styles.atRiskIcon}>
                  <Ionicons name="pulse" size={22} color="#7c3aed" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.atRiskTitle}>
                    {atRisk.length} instrument{atRisk.length > 1 ? 's' : ''} predicted to fail within 30 days
                  </Text>
                  <Text style={styles.alertSub}>
                    {atRisk.map((i: any) => i.name).slice(0, 3).join(', ')}
                    {atRisk.length > 3 ? ` and ${atRisk.length - 3} more` : ''}
                  </Text>
                </View>
                <Pressable style={styles.atRiskBtn} onPress={() => router.push('/instruments?filter=at_risk')}>
                  <Text style={styles.alertBtnText}>Review</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Overdue & Upcoming</Text>
              <Pressable onPress={() => router.push('/instruments')}><Text style={styles.link}>View all →</Text></Pressable>
            </View>

            <View style={styles.grid}>
              {[...new Map([...overdue, ...upcoming].map((i) => [i.id, i])).values()]
                .slice(0, 6)
                .map((inst) => (
                  <InstrumentCard key={inst.id} instrument={inst} />
                ))}
              {overdue.length === 0 && upcoming.length === 0 && (
                <View style={[styles.empty, shadow]}>
                  <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                  <Text style={styles.emptyTitle}>All compliance on track</Text>
                  <Text style={styles.emptySub}>No overdue or upcoming items within 30 days.</Text>
                </View>
              )}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 12 }]}>Recent Activity</Text>
            <View style={[styles.card, shadow]}>
              {logs.length === 0 ? (
                <Text style={styles.emptyText}>No maintenance activity yet.</Text>
              ) : logs.map((log, idx) => (
                <View key={log.id} style={[styles.logRow, idx < logs.length - 1 && styles.logBorder]}>
                  <View style={[styles.logIcon, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name={log.log_type === 'calibration' ? 'speedometer-outline' : log.log_type === 'repair' ? 'build-outline' : 'construct-outline'} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logTitle} numberOfLines={1}>{log.instruments?.name || 'Instrument'} — {log.log_type}</Text>
                    <Text style={styles.logDesc} numberOfLines={1}>{log.description}</Text>
                    <Text style={styles.logMeta}>{log.technician || 'Unknown'} · {log.log_date}</Text>
                  </View>
                  <StatusBadge status={log.status} small />
                </View>
              ))}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Laboratory Maintenance & Compliance Efficiency Index</Text>
              <Text style={styles.footerSub}>Powered by AI-driven risk analysis · {new Date().getFullYear()}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, maxWidth: 1280, alignSelf: 'center', width: '100%' },
  heroSection: {
    backgroundColor: colors.primaryDark,
    borderRadius: 20, padding: 28,
    flexDirection: 'row', alignItems: 'center', gap: 20,
    flexWrap: 'wrap', marginBottom: 24,
  },
  heroLeft: { flex: 1, minWidth: 260 },
  heroEyebrow: { color: '#93c5fd', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  heroSubtitle: { color: '#cbd5e1', fontSize: 14, lineHeight: 22, maxWidth: 560 },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 18, flexWrap: 'wrap' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primaryLight, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7c3aed', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  // ✅ NEW: predictions button (teal to distinguish from AI purple)
  predBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0891b2', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  aiBtnDisabled: { opacity: 0.7 },
  aiBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.success + '18',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: colors.success + '40',
  },
  exportBtnText: { color: colors.success, fontWeight: '700', fontSize: 14 },
  autoStatusBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0891b2',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  autoStatusBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  progressBar: {
    marginTop: 14, height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999, overflow: 'hidden', width: '100%',
  },
  progressFill: {
    height: '100%', backgroundColor: '#a78bfa', borderRadius: 999,
  },
  // ✅ NEW: teal fill for prediction progress bar
  progressFillPred: {
    height: '100%', backgroundColor: '#67e8f9', borderRadius: 999,
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
  },
  toastText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  heroRight: { alignItems: 'center', justifyContent: 'center' },
  ceiRing: {
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  ceiValue: { fontSize: 40, fontWeight: '800', color: colors.text },
  ceiLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  loading: { padding: 60, alignItems: 'center' },
  statsGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  quickAccessGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  quickTile: {
    flex: 1, minWidth: 130, backgroundColor: '#fff',
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  quickTileIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  quickTileLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.danger + '10',
    borderWidth: 1, borderColor: colors.danger + '30',
    padding: 16, borderRadius: 12, marginBottom: 12,
  },
  alertIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.danger + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  alertTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  alertSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  alertBtn: { backgroundColor: colors.danger, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  alertBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  // ✅ NEW: at-risk banner styles
  atRiskBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#7c3aed' + '10',
    borderWidth: 1, borderColor: '#7c3aed' + '30',
    padding: 16, borderRadius: 12, marginBottom: 20,
  },
  atRiskIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#7c3aed' + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  atRiskTitle: { fontSize: 15, fontWeight: '700', color: '#5b21b6' },
  atRiskBtn: { backgroundColor: '#7c3aed', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  link: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  empty: { flex: 1, backgroundColor: '#fff', padding: 32, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 10 },
  emptySub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 8, borderWidth: 1, borderColor: colors.border },
  emptyText: { padding: 20, textAlign: 'center', color: colors.textMuted },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  logBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  logIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: 14, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  logDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  logMeta: { fontSize: 11, color: colors.textLight, marginTop: 2 },
  footer: { marginTop: 40, paddingVertical: 24, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  footerText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  footerSub: { fontSize: 11, color: colors.textLight, marginTop: 4 },
});
