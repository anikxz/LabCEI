import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, shadow } from '../lib/theme';
import { supabase } from '../lib/supabase';

type Instrument = {
  id: string;
  name: string;
  model?: string;
  cei_score: number;
  risk_score: number;
  status: string;
  next_maintenance?: string;
  next_calibration?: string;
  created_at: string;
};

type Log = {
  instrument_id: string;
  log_date: string;
  log_type: string;
  status: string;
  cost?: number;
};

export default function TrendsScreen() {
  const router = useRouter();
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: instData }, { data: logData }] = await Promise.all([
      supabase.from('instruments').select('*').order('cei_score', { ascending: false }),
      supabase.from('maintenance_logs').select('*').order('log_date', { ascending: true }),
    ]);
    setInstruments(instData || []);
    setLogs(logData || []);
    if (instData && instData.length > 0) setSelected(instData[0].id);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const selectedInst = instruments.find(i => i.id === selected);
  const selectedLogs = logs.filter(l => l.instrument_id === selected);

  // Fleet averages
  const avgCEI = instruments.length
    ? Math.round(instruments.reduce((s, i) => s + (i.cei_score || 0), 0) / instruments.length) : 0;
  const avgRisk = instruments.length
    ? Math.round(instruments.reduce((s, i) => s + (i.risk_score || 0), 0) / instruments.length) : 0;
  const totalCost = logs.reduce((s, l) => s + (Number(l.cost) || 0), 0);
  const failRate = logs.length
    ? Math.round((logs.filter(l => l.status === 'failed').length / logs.length) * 100) : 0;

  // Build monthly activity from logs (last 6 months)
  const monthlyActivity = buildMonthlyActivity(logs);

  // CEI distribution buckets
  const ceiBuckets = {
    excellent: instruments.filter(i => i.cei_score >= 85).length,
    good: instruments.filter(i => i.cei_score >= 65 && i.cei_score < 85).length,
    poor: instruments.filter(i => i.cei_score < 65).length,
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Trends & Analytics</Text>
      <Text style={styles.pageSubtitle}>Fleet health overview and per-instrument history</Text>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <>
          {/* ── Fleet KPIs ── */}
          <View style={styles.kpiRow}>
            <KPICard label="Avg CEI" value={avgCEI} suffix="/100"
              color={avgCEI >= 85 ? colors.success : avgCEI >= 65 ? colors.warning : colors.danger}
              icon="speedometer-outline" />
            <KPICard label="Avg Risk" value={avgRisk} suffix="/100"
              color={avgRisk <= 20 ? colors.success : avgRisk <= 50 ? colors.warning : colors.danger}
              icon="warning-outline" />
            <KPICard label="Total Cost" value={`$${totalCost.toFixed(0)}`}
              color={colors.primary} icon="cash-outline" />
            <KPICard label="Fail Rate" value={failRate} suffix="%"
              color={failRate <= 10 ? colors.success : failRate <= 25 ? colors.warning : colors.danger}
              icon="close-circle-outline" />
          </View>

          {/* ── CEI Distribution bar chart ── */}
          <View style={[styles.card, shadow]}>
            <Text style={styles.cardTitle}>CEI Score Distribution</Text>
            <Text style={styles.cardSubtitle}>{instruments.length} instruments total</Text>
            <View style={styles.distRow}>
              <DistBar
                label="Excellent (85–100)"
                count={ceiBuckets.excellent}
                total={instruments.length}
                color={colors.success}
              />
              <DistBar
                label="Good (65–84)"
                count={ceiBuckets.good}
                total={instruments.length}
                color={colors.warning}
              />
              <DistBar
                label="Poor (0–64)"
                count={ceiBuckets.poor}
                total={instruments.length}
                color={colors.danger}
              />
            </View>
          </View>

          {/* ── Monthly Activity Chart ── */}
          <View style={[styles.card, shadow]}>
            <Text style={styles.cardTitle}>Monthly Activity</Text>
            <Text style={styles.cardSubtitle}>Log entries over the last 6 months</Text>
            <BarChart data={monthlyActivity} />
          </View>

          {/* ── Top instruments by CEI ── */}
          <View style={[styles.card, shadow]}>
            <Text style={styles.cardTitle}>Fleet CEI Rankings</Text>
            <Text style={styles.cardSubtitle}>Tap an instrument to view its history</Text>
            {instruments.slice(0, 10).map((inst, idx) => (
              <Pressable
                key={inst.id}
                onPress={() => setSelected(inst.id === selected ? null : inst.id)}
                style={[styles.rankRow, inst.id === selected && styles.rankRowSelected]}
              >
                <Text style={styles.rankNum}>#{idx + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankName} numberOfLines={1}>{inst.name}</Text>
                  <Text style={styles.rankModel} numberOfLines={1}>{inst.model || '—'}</Text>
                </View>
                {/* Mini CEI bar */}
                <View style={styles.miniBarWrap}>
                  <View style={styles.miniBarBg}>
                    <View style={[
                      styles.miniBarFill,
                      {
                        width: `${inst.cei_score}%` as any,
                        backgroundColor: inst.cei_score >= 85 ? colors.success : inst.cei_score >= 65 ? colors.warning : colors.danger,
                      },
                    ]} />
                  </View>
                  <Text style={styles.miniBarLabel}>{inst.cei_score}</Text>
                </View>
                <Ionicons
                  name={inst.id === selected ? 'chevron-up' : 'chevron-down'}
                  size={16} color={colors.textMuted}
                />
              </Pressable>
            ))}
          </View>

          {/* ── Per-instrument detail ── */}
          {selectedInst && (
            <View style={[styles.card, shadow]}>
              <View style={styles.instDetailHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{selectedInst.name}</Text>
                  <Text style={styles.cardSubtitle}>{selectedInst.model} · {selectedLogs.length} log entries</Text>
                </View>
                <Pressable
                  onPress={() => router.push(`/instrument/${selectedInst.id}`)}
                  style={styles.viewBtn}
                >
                  <Text style={styles.viewBtnText}>View →</Text>
                </Pressable>
              </View>

              {/* Score gauges */}
              <View style={styles.gaugeRow}>
                <Gauge label="CEI Score" value={selectedInst.cei_score}
                  color={selectedInst.cei_score >= 85 ? colors.success : selectedInst.cei_score >= 65 ? colors.warning : colors.danger} />
                <Gauge label="Risk Score" value={selectedInst.risk_score}
                  color={selectedInst.risk_score <= 20 ? colors.success : selectedInst.risk_score <= 50 ? colors.warning : colors.danger} />
              </View>

              {/* Log timeline */}
              {selectedLogs.length === 0 ? (
                <Text style={styles.emptyText}>No maintenance logs recorded yet.</Text>
              ) : (
                <>
                  <Text style={[styles.cardTitle, { fontSize: 13, marginBottom: 10 }]}>Log History</Text>
                  <LogTimeline logs={selectedLogs} />
                </>
              )}

              {/* Cost breakdown */}
              {selectedLogs.some(l => l.cost) && (
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Total maintenance cost</Text>
                  <Text style={styles.costValue}>
                    ${selectedLogs.reduce((s, l) => s + (Number(l.cost) || 0), 0).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ─── Helper: build monthly activity ───────────────────────────────────────
function buildMonthlyActivity(logs: Log[]) {
  const now = new Date();
  const months: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short' });
    const count = logs.filter(l => l.log_date?.startsWith(key)).length;
    months.push({ label, count });
  }
  return months;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function KPICard({ label, value, suffix = '', color, icon }: any) {
  return (
    <View style={[styles.kpiCard, shadow]}>
      <View style={[styles.kpiIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value}{suffix}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function DistBar({ label, count, total, color }: any) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={styles.distItem}>
      <View style={styles.distLabelRow}>
        <View style={[styles.distDot, { backgroundColor: color }]} />
        <Text style={styles.distLabel}>{label}</Text>
        <Text style={[styles.distCount, { color }]}>{count}</Text>
      </View>
      <View style={styles.distBarBg}>
        <View style={[styles.distBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function BarChart({ data }: { data: { label: string; count: number }[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <View style={styles.barChart}>
      {data.map((d, i) => (
        <View key={i} style={styles.barCol}>
          <Text style={styles.barCountLabel}>{d.count > 0 ? d.count : ''}</Text>
          <View style={styles.barTrack}>
            <View style={[
              styles.barFill,
              { height: `${Math.round((d.count / maxCount) * 100)}%` as any },
            ]} />
          </View>
          <Text style={styles.barMonthLabel}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.gaugeBox}>
      <View style={[styles.gaugeRing, { borderColor: color }]}>
        <Text style={[styles.gaugeValue, { color }]}>{value ?? 0}</Text>
      </View>
      <Text style={styles.gaugeLabel}>{label}</Text>
      {/* Linear gauge */}
      <View style={styles.gaugeBg}>
        <View style={[styles.gaugeFill, { width: `${value ?? 0}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function LogTimeline({ logs }: { logs: Log[] }) {
  const recent = [...logs].reverse().slice(0, 8);
  return (
    <View style={styles.timeline}>
      {recent.map((log, idx) => {
        const isLast = idx === recent.length - 1;
        const dotColor = log.status === 'completed' ? colors.success
          : log.status === 'failed' ? colors.danger : colors.warning;
        return (
          <View key={idx} style={styles.timelineRow}>
            <View style={styles.timelineLeft}>
              <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
              {!isLast && <View style={styles.timelineLine} />}
            </View>
            <View style={styles.timelineBody}>
              <Text style={styles.timelineType}>{log.log_type} · <Text style={{ color: dotColor }}>{log.status}</Text></Text>
              <Text style={styles.timelineDate}>{log.log_date}</Text>
              {log.cost ? <Text style={styles.timelineCost}>${Number(log.cost).toFixed(2)}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, maxWidth: 1280, alignSelf: 'center', width: '100%', paddingBottom: 40 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: colors.text },
  pageSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 20 },
  loading: { padding: 60, alignItems: 'center' },

  kpiRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  kpiCard: {
    flex: 1, minWidth: 130, backgroundColor: '#fff', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'flex-start',
  },
  kpiIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiValue: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: '600' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 14 },

  distRow: { gap: 12 },
  distItem: { marginBottom: 4 },
  distLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  distDot: { width: 8, height: 8, borderRadius: 4 },
  distLabel: { flex: 1, fontSize: 12, color: colors.textMuted },
  distCount: { fontSize: 13, fontWeight: '700' },
  distBarBg: { height: 8, backgroundColor: colors.bg, borderRadius: 999, overflow: 'hidden' },
  distBarFill: { height: '100%', borderRadius: 999 },

  barChart: { flexDirection: 'row', height: 120, alignItems: 'flex-end', gap: 8, paddingTop: 20 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barCountLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '700', marginBottom: 2 },
  barTrack: { width: '100%', flex: 1, backgroundColor: colors.bg, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: colors.primary, borderRadius: 6 },
  barMonthLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4, fontWeight: '600' },

  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
  rankRowSelected: { backgroundColor: colors.primary + '08', marginHorizontal: -18, paddingHorizontal: 18, borderRadius: 0 },
  rankNum: { fontSize: 12, fontWeight: '700', color: colors.textMuted, width: 24 },
  rankName: { fontSize: 14, fontWeight: '700', color: colors.text },
  rankModel: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  miniBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniBarBg: { width: 60, height: 6, backgroundColor: colors.bg, borderRadius: 999, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 999 },
  miniBarLabel: { fontSize: 12, fontWeight: '700', color: colors.text, width: 24, textAlign: 'right' },

  instDetailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
  viewBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.primary + '10', borderRadius: 8 },
  viewBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  gaugeRow: { flexDirection: 'row', gap: 16, marginBottom: 20, marginTop: 4 },
  gaugeBox: { flex: 1, alignItems: 'center' },
  gaugeRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 6, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  gaugeValue: { fontSize: 22, fontWeight: '800' },
  gaugeLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  gaugeBg: { width: '100%', height: 6, backgroundColor: colors.bg, borderRadius: 999, overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 999 },

  emptyText: { color: colors.textMuted, fontSize: 13, padding: 8, textAlign: 'center' },

  timeline: { marginBottom: 12 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 16 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  timelineBody: { flex: 1, paddingBottom: 14 },
  timelineType: { fontSize: 13, fontWeight: '600', color: colors.text, textTransform: 'capitalize' },
  timelineDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  timelineCost: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 2 },

  costRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4,
  },
  costLabel: { fontSize: 13, color: colors.textMuted },
  costValue: { fontSize: 16, fontWeight: '800', color: colors.primary },
});
