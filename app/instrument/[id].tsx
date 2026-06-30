import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import { colors, shadow } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import StatusBadge from '../components/StatusBadge';
import QRCode from '../components/QRCode';
import FileUpload from '../components/FileUpload';
import AddLogModal from '../components/AddLogModal';
import { useAuth, canEdit, canDelete } from '../../lib/auth';
import { generateInstrumentHTML, printHTML } from '../../lib/generatePDF';

export default function InstrumentDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [instrument, setInstrument] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  // ✅ NEW: prediction state
  const [predLoading, setPredLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: inst }, { data: logData }, { data: docData }] = await Promise.all([
      supabase.from('instruments').select('*').eq('id', id).single(),
      supabase.from('maintenance_logs').select('*').eq('instrument_id', id).order('log_date', { ascending: false }),
      supabase.from('documents').select('*').eq('instrument_id', id).order('created_at', { ascending: false }),
    ]);
    setInstrument(inst);
    setLogs(logData || []);
    setDocs(docData || []);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!user && !loading) {
      router.replace(`/login?redirect=/instrument/${id}`);
    }
  }, [user, loading, id, router]);

  const runAI = async () => {
    if (!instrument) return;
    setAiLoading(true);
    try {
      const { data } = await supabase.functions.invoke('ai-analysis', {
        body: { action: 'risk_and_cei', instrument, logs },
      });
      if (!data) return;
      setInstrument((prev: any) => ({
        ...prev,
        risk_score: data.risk_score,
        cei_score: data.cei_score,
      }));
      setAiResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  // ✅ NEW: run failure prediction
  const runPrediction = async () => {
    if (!instrument) return;
    setPredLoading(true);
    try {
      const { data } = await supabase.functions.invoke('ai-analysis', {
        body: { action: 'predict_failure', instrument, logs },
      });
      if (!data) return;
      // Merge prediction columns back into instrument state immediately
      setInstrument((prev: any) => ({
        ...prev,
        predicted_failure_days: data.predicted_failure_days,
        failure_probability: data.failure_probability,
        prediction_confidence: data.prediction_confidence,
        prediction_reasoning: data.reasoning,
        prediction_updated_at: new Date().toISOString(),
      }));
    } catch (e) {
      console.error('Prediction error:', e);
    } finally {
      setPredLoading(false);
    }
  };

  // ✅ EXPORT PDF
  const exportPDF = () => {
    if (Platform.OS !== 'web') return;
    const html = generateInstrumentHTML(instrument, logs, docs);
    printHTML(html, `${instrument.name} — Compliance Report`);
  };

  const deleteLog = async (logId: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete this log entry?')) return;
      await supabase.from('maintenance_logs').delete().eq('id', logId);
      load();
    } else {
      Alert.alert('Delete Log', 'Delete this log entry?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('maintenance_logs').delete().eq('id', logId); load(); } },
      ]);
    }
  };

  const deleteDoc = async (docId: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete this document?')) return;
      await supabase.from('documents').delete().eq('id', docId);
      load();
    } else {
      Alert.alert('Delete Document', 'Delete this document?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('documents').delete().eq('id', docId); load(); } },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }

  if (!instrument) {
    return (
      <View style={styles.root}>
        <View style={styles.loading}>
          <Text>Instrument not found</Text>
          <Pressable onPress={() => router.push('/instruments')} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary }}>← Back to instruments</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const today = new Date();
  const daysBetween = (d?: string) => d ? Math.floor((new Date(d).getTime() - today.getTime()) / 86400000) : null;
  const maintDays = daysBetween(instrument.next_maintenance);
  const calibDays = daysBetween(instrument.next_calibration);

  const siteUrl = (Platform.OS === 'web' && typeof window !== 'undefined') ? window.location.origin : 'https://lab.app';
  const qrUrl = `${siteUrl}/instrument/${instrument.id}`;

  const cei = instrument.cei_score ?? 0;
  const ceiColor = cei >= 85 ? colors.success : cei >= 65 ? colors.warning : colors.danger;
  const risk = instrument.risk_score ?? 0;
  const riskColor = risk <= 20 ? colors.success : risk <= 50 ? colors.warning : colors.danger;

  // ✅ NEW: prediction derived values
  const predDays = instrument.predicted_failure_days;
  const predProb = instrument.failure_probability;
  const predConf = instrument.prediction_confidence;
  const predDaysColor = predDays == null ? colors.textMuted : predDays <= 14 ? colors.danger : predDays <= 30 ? colors.warning : colors.success;

  const openDoc = async (filePath: string) => {
    try {
      let url = filePath;
      if (!filePath.startsWith('http')) {
        const { data } = supabase.storage.from('lab-documents').getPublicUrl(filePath);
        url = data.publicUrl;
      }
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('Open doc error:', err);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.push('/instruments')} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.primary} />
          <Text style={styles.backText}>All Instruments</Text>
        </Pressable>

        {/* ✅ TITLE ROW WITH EXPORT BUTTON */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text style={styles.title}>{instrument.name}</Text>
              <StatusBadge status={instrument.status} />
            </View>
            <Text style={styles.subtitle}>{instrument.model} · {instrument.category || 'Uncategorized'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {Platform.OS === 'web' && (
              <Pressable style={styles.exportBtn} onPress={exportPDF}>
                <Ionicons name="download-outline" size={16} color={colors.success} />
                <Text style={styles.exportBtnText}>Export PDF</Text>
              </Pressable>
            )}
            {canEdit(user?.role) && (
              <Pressable style={styles.editBtn} onPress={() => router.push(`/add-instrument?id=${instrument.id}`)}>
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.mainGrid}>
          {/* Left column */}
          <View style={styles.leftCol}>

            {/* Compliance scores */}
            <View style={[styles.card, shadow]}>
              <Text style={styles.sectionTitle}>Compliance Metrics</Text>
              <View style={styles.scoreGrid}>
                <View style={styles.scoreBox}>
                  <View style={[styles.scoreRing, { borderColor: ceiColor }]}>
                    <Text style={styles.scoreValue}>{cei}</Text>
                  </View>
                  <Text style={styles.scoreLabel}>CEI Score</Text>
                  <Text style={styles.scoreHint}>Compliance Efficiency Index</Text>
                </View>
                <View style={styles.scoreBox}>
                  <View style={[styles.scoreRing, { borderColor: riskColor }]}>
                    <Text style={styles.scoreValue}>{risk}</Text>
                  </View>
                  <Text style={styles.scoreLabel}>Risk Score</Text>
                  <Text style={styles.scoreHint}>AI-predicted maintenance risk</Text>
                </View>
              </View>
              <Pressable style={styles.aiBtn} onPress={runAI} disabled={aiLoading}>
                {aiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles" size={16} color="#fff" />}
                <Text style={styles.aiBtnText}>{aiLoading ? 'Analyzing...' : 'Run AI Analysis'}</Text>
              </Pressable>
              {aiResult?.recommendation && (
                <View style={styles.aiResult}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="bulb-outline" size={14} color={colors.primary} />
                    <Text style={styles.aiTitle}>AI Recommendation</Text>
                  </View>
                  <Text style={styles.aiText}>{aiResult.recommendation}</Text>
                </View>
              )}
            </View>

            {/* ✅ NEW: Failure Prediction card */}
            <View style={[styles.card, shadow]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Text style={styles.sectionTitle}>Failure Prediction</Text>
                {instrument.prediction_updated_at && (
                  <Text style={{ fontSize: 11, color: colors.textLight }}>
                    Updated {new Date(instrument.prediction_updated_at).toLocaleDateString()}
                  </Text>
                )}
              </View>

              {predDays != null ? (
                <>
                  {/* Metric row */}
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                    <View style={[styles.predMetric, { borderColor: predDaysColor }]}>
                      <Text style={[styles.predMetricValue, { color: predDaysColor }]}>
                        {predDays}d
                      </Text>
                      <Text style={styles.predMetricLabel}>Predicted failure in</Text>
                    </View>
                    <View style={[styles.predMetric, { borderColor: colors.border }]}>
                      <Text style={styles.predMetricValue}>
                        {Math.round((predProb ?? 0) * 100)}%
                      </Text>
                      <Text style={styles.predMetricLabel}>Failure probability</Text>
                    </View>
                  </View>

                  {/* Confidence bar */}
                  <View style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={styles.confLabel}>MODEL CONFIDENCE</Text>
                      <Text style={styles.confLabel}>
                        {Math.round((predConf ?? 0) * 100)}%
                      </Text>
                    </View>
                    <View style={styles.confBarBg}>
                      <View style={[styles.confBarFill, {
                        width: `${Math.round((predConf ?? 0) * 100)}%` as any,
                        backgroundColor: (predConf ?? 0) >= 0.7 ? colors.success : (predConf ?? 0) >= 0.4 ? colors.warning : colors.danger,
                      }]} />
                    </View>
                  </View>

                  {/* Reasoning */}
                  {instrument.prediction_reasoning && (
                    <View style={styles.reasoningBox}>
                      <Ionicons name="analytics-outline" size={14} color={colors.primary} style={{ marginTop: 1 }} />
                      <Text style={styles.reasoningText}>{instrument.prediction_reasoning}</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.predEmpty}>
                  <Ionicons name="bar-chart-outline" size={28} color={colors.textLight} />
                  <Text style={styles.predEmptyText}>
                    {instrument.prediction_reasoning ?? 'No prediction yet. Run the analysis below.'}
                  </Text>
                </View>
              )}

              <Pressable
                style={[styles.predBtn, predLoading && { opacity: 0.7 }]}
                onPress={runPrediction}
                disabled={predLoading}
              >
                {predLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="pulse-outline" size={16} color="#fff" />}
                <Text style={styles.predBtnText}>
                  {predLoading
                    ? 'Predicting...'
                    : predDays != null
                    ? 'Refresh Prediction'
                    : 'Run Failure Prediction'}
                </Text>
              </Pressable>
            </View>

            {/* Details */}
            <View style={[styles.card, shadow]}>
              <Text style={styles.sectionTitle}>Instrument Details</Text>
              <DetailRow label="Serial Number" value={instrument.serial_number} icon="barcode-outline" />
              <DetailRow label="Location" value={instrument.location} icon="location-outline" />
              <DetailRow label="Category" value={instrument.category} icon="pricetag-outline" />
              <DetailRow label="Purchase Date" value={instrument.purchase_date} icon="calendar-outline" />
              <View style={styles.divider} />
              <DetailRow label="Last Maintenance" value={instrument.last_maintenance} icon="construct-outline" />
              <DetailRow
                label="Next Maintenance"
                value={instrument.next_maintenance}
                icon="time-outline"
                valueColor={maintDays !== null ? (maintDays < 0 ? colors.danger : maintDays < 14 ? colors.warning : colors.text) : undefined}
                hint={maintDays !== null ? (maintDays < 0 ? `${Math.abs(maintDays)}d overdue` : maintDays <= 30 ? `in ${maintDays}d` : undefined) : undefined}
              />
              <DetailRow label="Last Calibration" value={instrument.last_calibration} icon="speedometer-outline" />
              <DetailRow
                label="Next Calibration"
                value={instrument.next_calibration}
                icon="timer-outline"
                valueColor={calibDays !== null ? (calibDays < 0 ? colors.danger : calibDays < 14 ? colors.warning : colors.text) : undefined}
                hint={calibDays !== null ? (calibDays < 0 ? `${Math.abs(calibDays)}d overdue` : calibDays <= 30 ? `in ${calibDays}d` : undefined) : undefined}
              />
              {instrument.notes ? (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.notesLabel}>Notes</Text>
                  <Text style={styles.notesText}>{instrument.notes}</Text>
                </>
              ) : null}
            </View>

            {/* Maintenance Logs */}
            <View style={[styles.card, shadow]}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Maintenance & Calibration Logs</Text>
                {canEdit(user?.role) && (
                  <Pressable style={styles.smallBtn} onPress={() => setShowLogModal(true)}>
                    <Ionicons name="add" size={14} color={colors.primary} />
                    <Text style={styles.smallBtnText}>Add Log</Text>
                  </Pressable>
                )}
              </View>
              {logs.length === 0 ? (
                <Text style={styles.emptyText}>No logs yet. Add the first maintenance record.</Text>
              ) : logs.map((log) => (
                <View key={log.id} style={styles.logCard}>
                  <View style={styles.logHeader}>
                    <View style={[styles.logIcon, { backgroundColor: colors.primary + '15' }]}>
                      <Ionicons
                        name={log.log_type === 'calibration' ? 'speedometer-outline' : log.log_type === 'repair' ? 'build-outline' : log.log_type === 'inspection' ? 'search-outline' : 'construct-outline'}
                        size={18} color={colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.logType}>{log.log_type}</Text>
                        <StatusBadge status={log.status} small />
                      </View>
                      <Text style={styles.logMeta}>{log.log_date} · {log.technician || 'Unknown'}</Text>
                    </View>
                    {canDelete(user?.role) && (
                      <Pressable onPress={() => deleteLog(log.id)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.logDesc}>{log.description}</Text>
                  <View style={styles.logFooter}>
                    {log.next_due_date && (
                      <View style={styles.logTag}>
                        <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
                        <Text style={styles.logTagText}>Next due: {log.next_due_date}</Text>
                      </View>
                    )}
                    {log.cost != null && (
                      <View style={styles.logTag}>
                        <Ionicons name="cash-outline" size={11} color={colors.textMuted} />
                        <Text style={styles.logTagText}>${Number(log.cost).toFixed(2)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* Documents */}
            <View style={[styles.card, shadow]}>
              <Text style={styles.sectionTitle}>Documents & Certificates</Text>
              {canEdit(user?.role) && (
                <View style={{ marginBottom: 14 }}>
                  <FileUpload instrumentId={instrument.id} onUploaded={() => load()} />
                </View>
              )}
              {docs.length === 0 ? (
                <Text style={styles.emptyText}>No documents uploaded.</Text>
              ) : docs.map((doc) => (
                <View key={doc.id} style={styles.docCard}>
                  <View style={[styles.docIcon, { backgroundColor: (doc.file_type?.includes('pdf') ? colors.danger : colors.primary) + '15' }]}>
                    <Ionicons name={doc.file_type?.includes('pdf') ? 'document-text-outline' : 'image-outline'} size={20} color={doc.file_type?.includes('pdf') ? colors.danger : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docName} numberOfLines={1}>{doc.file_name}</Text>
                    <Text style={styles.docMeta}>{new Date(doc.created_at).toLocaleDateString()}</Text>
                    {doc.ocr_text ? (
                      <View style={styles.ocrBox}>
                        <Text style={styles.ocrLabel}>OCR Extracted:</Text>
                        <Text style={styles.ocrText} numberOfLines={3}>{doc.ocr_text}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <Pressable onPress={() => openDoc(doc.file_path)} style={styles.docAction}>
                      <Ionicons name="open-outline" size={16} color={colors.primary} />
                    </Pressable>
                    {canDelete(user?.role) && (
                      <Pressable onPress={() => deleteDoc(doc.id)} style={styles.docAction}>
                        <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Right column */}
          <View style={styles.rightCol}>
            <QRCode url={qrUrl} title={`${instrument.name} QR`} />

            <View style={[styles.card, shadow, { marginTop: 16 }]}>
              <Text style={styles.sectionTitle}>Activity Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Logs</Text>
                <Text style={styles.summaryValue}>{logs.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Documents</Text>
                <Text style={styles.summaryValue}>{docs.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Failed Logs</Text>
                <Text style={styles.summaryValue}>{logs.filter(l => l.status === 'failed').length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Cost</Text>
                <Text style={styles.summaryValue}>
                  ${logs.reduce((s, l) => s + (Number(l.cost) || 0), 0).toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <AddLogModal
          visible={showLogModal}
          onClose={() => setShowLogModal(false)}
          instrumentId={instrument.id}
          technician={user?.fullName}
          onAdded={load}
        />
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, icon, valueColor, hint }: any) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconWrap}>
        <Ionicons name={icon} size={15} color={colors.textMuted} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={[styles.detailValue, valueColor && { color: valueColor }]}>{value || '—'}</Text>
      {hint && <Text style={[styles.detailHint, { color: valueColor }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, maxWidth: 1280, alignSelf: 'center', width: '100%' },
  loading: { flex: 1, padding: 60, alignItems: 'center', justifyContent: 'center' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: colors.success + '50',
    backgroundColor: colors.success + '08',
  },
  exportBtnText: { color: colors.success, fontWeight: '600' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff',
  },
  editBtnText: { color: colors.primary, fontWeight: '600' },
  mainGrid: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  leftCol: { flex: 2, minWidth: 320, gap: 16 },
  rightCol: { flex: 1, minWidth: 280 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.primary + '10' },
  smallBtnText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  scoreGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  scoreBox: { flex: 1, alignItems: 'center' },
  scoreRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  scoreLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 8 },
  scoreHint: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 8,
  },
  aiBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  aiResult: { marginTop: 12, padding: 12, backgroundColor: colors.primary + '08', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: colors.primary },
  aiTitle: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  aiText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  // ✅ NEW: prediction styles
  predMetric: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 10, borderWidth: 1.5,
  },
  predMetricValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  predMetricLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  confLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  confBarBg: { height: 6, backgroundColor: colors.border, borderRadius: 99, overflow: 'hidden' },
  confBarFill: { height: '100%', borderRadius: 99 },
  reasoningBox: {
    flexDirection: 'row', gap: 8, padding: 10,
    backgroundColor: colors.primary + '08', borderRadius: 8,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
    marginBottom: 12, alignItems: 'flex-start',
  },
  reasoningText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  predEmpty: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  predEmptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 260 },
  predBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7c3aed', paddingVertical: 10, borderRadius: 8, marginTop: 4,
  },
  predBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  // existing styles unchanged below
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  detailIconWrap: { width: 28, height: 28, borderRadius: 7, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  detailLabel: { fontSize: 13, color: colors.textMuted },
  detailValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  detailHint: { fontSize: 11, fontWeight: '700', marginLeft: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  notesLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', marginTop: 4, marginBottom: 6 },
  notesText: { fontSize: 13, color: colors.text, lineHeight: 20 },
  emptyText: { padding: 16, textAlign: 'center', color: colors.textMuted, fontSize: 13 },
  logCard: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  logIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  logType: { fontSize: 14, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  logMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  logDesc: { fontSize: 13, color: colors.text, lineHeight: 19, marginLeft: 46 },
  logFooter: { flexDirection: 'row', gap: 8, marginTop: 8, marginLeft: 46, flexWrap: 'wrap' },
  logTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.bg, borderRadius: 6 },
  logTagText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  deleteBtn: { padding: 6 },
  docCard: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-start' },
  docIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docName: { fontSize: 14, fontWeight: '600', color: colors.text },
  docMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  docAction: { padding: 8, borderRadius: 6, backgroundColor: colors.bg },
  ocrBox: { marginTop: 8, padding: 8, backgroundColor: colors.bg, borderRadius: 6 },
  ocrLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 2 },
  ocrText: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  summaryLabel: { fontSize: 13, color: colors.textMuted },
  summaryValue: { fontSize: 14, fontWeight: '700', color: colors.text },
});
