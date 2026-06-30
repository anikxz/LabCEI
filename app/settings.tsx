import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Switch, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, shadow } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Settings = {
  id?: string;
  email: string;
  full_name: string;
  role: string;
  cadence: 'daily' | 'weekly' | 'off';
  alert_overdue: boolean;
  alert_upcoming: boolean;
  alert_out_of_service: boolean;
  alert_low_cei: boolean;
  alert_chem_low_stock: boolean;
  alert_chem_out_of_stock: boolean;
  alert_chem_expiring: boolean;
  upcoming_days: number;
  expiring_days: number;
  last_sent_at?: string | null;
};

const DEFAULTS: Omit<Settings, 'email' | 'role' | 'full_name'> = {
  cadence: 'daily',
  alert_overdue: true,
  alert_upcoming: true,
  alert_out_of_service: true,
  alert_low_cei: false,
  alert_chem_low_stock: true,
  alert_chem_out_of_stock: true,
  alert_chem_expiring: true,
  upcoming_days: 7,
  expiring_days: 30,
};

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [preview, setPreview] = useState<any>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Fetch the user's row
    const { data } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();

    if (data) {
      setSettings(data as Settings);
    } else {
      // Create default settings for this user
      const newRow = {
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        ...DEFAULTS,
      };
      const { data: created } = await supabase
        .from('notification_settings')
        .upsert(newRow, { onConflict: 'email' })
        .select()
        .single();
      setSettings((created as Settings) || { ...newRow } as Settings);
    }

    // Fetch recent logs for this user
    const { data: logData } = await supabase
      .from('notifications_log')
      .select('*')
      .eq('email', user.email)
      .order('sent_at', { ascending: false })
      .limit(10);
    setLogs(logData || []);

    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!user && !loading) router.replace('/login?redirect=/settings');
  }, [user, loading, router]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const payload = {
      email: settings.email,
      full_name: settings.full_name,
      role: settings.role,
      cadence: settings.cadence,
      alert_overdue: settings.alert_overdue,
      alert_upcoming: settings.alert_upcoming,
      alert_out_of_service: settings.alert_out_of_service,
      alert_low_cei: settings.alert_low_cei,
      alert_chem_low_stock: settings.alert_chem_low_stock,
      alert_chem_out_of_stock: settings.alert_chem_out_of_stock,
      alert_chem_expiring: settings.alert_chem_expiring,
      upcoming_days: settings.upcoming_days,
      expiring_days: settings.expiring_days,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('notification_settings')
      .update(payload)
      .eq('email', settings.email);
    setSaving(false);
    if (!error) setSavedAt(new Date());
  };

  const sendNow = async () => {
    if (!settings) return;
    setSending(true);
    try {
      const { data } = await supabase.functions.invoke('send-notifications', {
        body: { email: settings.email, force: true },
      });
      // Refresh log
      await load();
      // Show result as alert-ish banner
      setSavedAt(new Date());
      console.log('send-now result:', data);
    } finally {
      setSending(false);
    }
  };

  const runDigestForAll = async () => {
    setSending(true);
    try {
      await supabase.functions.invoke('send-notifications', { body: { force: true } });
      await load();
      setSavedAt(new Date());
    } finally {
      setSending(false);
    }
  };

  const viewLog = (log: any) => {
    setPreview(log);
  };

  if (!user) return null;

  if (loading || !settings) {
    return (
      <View style={styles.root}>
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.push('/')} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.primary} />
          <Text style={styles.backText}>Dashboard</Text>
        </Pressable>

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Notification Settings</Text>
            <Text style={styles.subtitle}>
              Configure when and what compliance alerts you receive. Digests are generated automatically on your chosen cadence.
            </Text>
          </View>
          {savedAt && (
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={styles.savedText}>Saved</Text>
            </View>
          )}
        </View>

        {/* Profile */}
        <View style={[styles.card, shadow]}>
          <Text style={styles.section}>Recipient</Text>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={settings.full_name || ''}
                onChangeText={(v) => update('full_name', v)}
                placeholder="Your name"
                placeholderTextColor={colors.textLight}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Email (read-only)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bg, color: colors.textMuted }]}
                value={settings.email}
                editable={false}
              />
            </View>
          </View>
        </View>

        {/* Cadence */}
        <View style={[styles.card, shadow]}>
          <Text style={styles.section}>Digest Cadence</Text>
          <Text style={styles.sectionSub}>How often should we send you a summary email?</Text>
          <View style={styles.cadenceRow}>
            {(['daily', 'weekly', 'off'] as const).map((c) => (
              <Pressable
                key={c}
                onPress={() => update('cadence', c)}
                style={[styles.cadenceCard, settings.cadence === c && styles.cadenceCardActive]}
              >
                <View style={[styles.cadenceIcon, settings.cadence === c && { backgroundColor: colors.primary }]}>
                  <Ionicons
                    name={c === 'daily' ? 'sunny-outline' : c === 'weekly' ? 'calendar-outline' : 'notifications-off-outline'}
                    size={20}
                    color={settings.cadence === c ? '#fff' : colors.primary}
                  />
                </View>
                <Text style={[styles.cadenceTitle, settings.cadence === c && { color: colors.primary }]}>
                  {c === 'daily' ? 'Daily' : c === 'weekly' ? 'Weekly' : 'Off'}
                </Text>
                <Text style={styles.cadenceHint}>
                  {c === 'daily' ? 'Every morning' : c === 'weekly' ? 'Every Monday' : 'No emails'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Alerts */}
        <View style={[styles.card, shadow]}>
          <Text style={styles.section}>Alert Types</Text>
          <Text style={styles.sectionSub}>Select which categories to include in your digests</Text>

          <AlertToggle
            icon="alert-circle-outline"
            color={colors.danger}
            title="Overdue Items"
            desc="Maintenance or calibration past the due date"
            value={settings.alert_overdue}
            onChange={(v) => update('alert_overdue', v)}
          />
          <AlertToggle
            icon="time-outline"
            color={colors.warning}
            title="Upcoming Due"
            desc="Items due within your configured window"
            value={settings.alert_upcoming}
            onChange={(v) => update('alert_upcoming', v)}
            extra={
              settings.alert_upcoming && (
                <View style={styles.windowRow}>
                  <Text style={styles.windowLabel}>Warn me</Text>
                  <View style={styles.windowChips}>
                    {[3, 7, 14, 30].map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => update('upcoming_days', d)}
                        style={[styles.windowChip, settings.upcoming_days === d && styles.windowChipActive]}
                      >
                        <Text style={[styles.windowChipText, settings.upcoming_days === d && { color: '#fff' }]}>
                          {d}d
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.windowLabel}>in advance</Text>
                </View>
              )
            }
          />
          <AlertToggle
            icon="close-circle-outline"
            color={colors.textMuted}
            title="Out of Service"
            desc="Instruments flagged as out of service"
            value={settings.alert_out_of_service}
            onChange={(v) => update('alert_out_of_service', v)}
          />
          <AlertToggle
            icon="trending-down-outline"
            color={colors.danger}
            title="Low CEI Score"
            desc="Compliance Efficiency Index below 70"
            value={settings.alert_low_cei}
            onChange={(v) => update('alert_low_cei', v)}
          />
          <AlertToggle
            icon="flask-outline"
            color="#f59e0b"
            title="Chemical Low Stock"
            desc="Chemicals at or below minimum stock level"
            value={settings.alert_chem_low_stock}
            onChange={(v) => update('alert_chem_low_stock', v)}
          />
          <AlertToggle
            icon="warning-outline"
            color={colors.danger}
            title="Chemical Out of Stock"
            desc="Chemicals with zero quantity remaining"
            value={settings.alert_chem_out_of_stock}
            onChange={(v) => update('alert_chem_out_of_stock', v)}
          />
          <AlertToggle
            icon="calendar-outline"
            color="#8b5cf6"
            title="Chemical Expiring Soon"
            desc="Chemicals approaching or past their expiry date"
            value={settings.alert_chem_expiring}
            onChange={(v) => update('alert_chem_expiring', v)}
            extra={
              settings.alert_chem_expiring && (
                <View style={styles.windowRow}>
                  <Text style={styles.windowLabel}>Warn me</Text>
                  <View style={styles.windowChips}>
                    {[7, 14, 30, 60].map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => update('expiring_days', d)}
                        style={[styles.windowChip, settings.expiring_days === d && styles.windowChipActive]}
                      >
                        <Text style={[styles.windowChipText, settings.expiring_days === d && { color: '#fff' }]}>
                          {d}d
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.windowLabel}>in advance</Text>
                </View>
              )
            }
          />
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Ionicons name="save-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Save Preferences'}</Text>
          </Pressable>
          <Pressable style={[styles.secondaryBtn, sending && { opacity: 0.6 }]} onPress={sendNow} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="send-outline" size={16} color={colors.primary} />}
            <Text style={styles.secondaryBtnText}>{sending ? 'Generating...' : 'Send Preview to Me'}</Text>
          </Pressable>
          {user.role === 'admin' && (
            <Pressable style={[styles.adminBtn, sending && { opacity: 0.6 }]} onPress={runDigestForAll} disabled={sending}>
              <Ionicons name="flash-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Run Digest for All Users</Text>
            </Pressable>
          )}
        </View>

        {/* Schedule info */}
        <View style={[styles.infoCard, shadow]}>
          <View style={styles.infoIcon}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Automated Scheduling</Text>
            <Text style={styles.infoText}>
              The <Text style={styles.code}>send-notifications</Text> edge function is ready to be scheduled.
              Trigger it daily at 8:00 AM UTC via an external cron service (cron-job.org, GitHub Actions, or a cloud scheduler).
              Each user's cadence preference is respected so daily recipients won't get weekly duplicates.
            </Text>
            {settings.last_sent_at && (
              <Text style={styles.infoMeta}>
                Your last digest: {new Date(settings.last_sent_at).toLocaleString()}
              </Text>
            )}
          </View>
        </View>

        {/* Recent digest log */}
        <View style={[styles.card, shadow]}>
          <Text style={styles.section}>Recent Digests ({logs.length})</Text>
          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No digests sent yet. Use "Send Preview to Me" to generate one.</Text>
          ) : (
            logs.map((log, idx) => (
              <Pressable key={log.id} onPress={() => viewLog(log)} style={[styles.logRow, idx < logs.length - 1 && styles.logBorder]}>
                <View style={[styles.statusDot, {
                  backgroundColor:
                    log.delivery_status === 'sent' ? colors.success :
                    log.delivery_status === 'failed' ? colors.danger :
                    colors.warning
                }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.logSubject} numberOfLines={1}>{log.subject}</Text>
                  <Text style={styles.logMeta}>{log.summary}</Text>
                  <Text style={styles.logTime}>{new Date(log.sent_at).toLocaleString()} · {log.delivery_status}</Text>
                </View>
                <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </View>

        <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
          <View style={styles.backdrop}>
            <View style={styles.previewModal}>
              <View style={styles.previewHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewTitle}>{preview?.subject}</Text>
                  <Text style={styles.previewMeta}>
                    To: {preview?.email} · {preview ? new Date(preview.sent_at).toLocaleString() : ''}
                  </Text>
                </View>
                <Pressable onPress={() => setPreview(null)}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>
              {Platform.OS === 'web' ? (
                <iframe
                  srcDoc={preview?.html_body || ''}
                  style={{ flex: 1, border: 'none', width: '100%', height: '100%' } as any}
                  title="Digest preview"
                />
              ) : (
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                  <Text>{preview?.summary}</Text>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

function AlertToggle({ icon, color, title, desc, value, onChange, extra }: any) {
  return (
    <View style={styles.toggleWrap}>
      <View style={styles.toggleRow}>
        <View style={[styles.toggleIcon, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>{title}</Text>
          <Text style={styles.toggleDesc}>{desc}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>
      {extra}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, maxWidth: 900, alignSelf: 'center', width: '100%' },
  loading: { flex: 1, padding: 60, alignItems: 'center', justifyContent: 'center' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, maxWidth: 620 },
  savedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: colors.success + '15',
  },
  savedText: { fontSize: 12, color: colors.success, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
  section: { fontSize: 15, fontWeight: '700', color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 14 },
  row2: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 10 },
  label: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text,
    backgroundColor: '#fff',
  },
  cadenceRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  cadenceCard: {
    flex: 1, minWidth: 140, padding: 16, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border, backgroundColor: '#fff',
    alignItems: 'flex-start',
  },
  cadenceCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '05' },
  cadenceIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  cadenceTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cadenceHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  toggleWrap: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  toggleDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginLeft: 48, flexWrap: 'wrap' },
  windowLabel: { fontSize: 12, color: colors.textMuted },
  windowChips: { flexDirection: 'row', gap: 4 },
  windowChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  windowChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  windowChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primaryDark, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10,
  },
  infoCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: colors.primary + '08',
    borderWidth: 1, borderColor: colors.primary + '30',
    borderRadius: 12, padding: 16, marginBottom: 14,
  },
  infoIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  infoText: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  infoMeta: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 8 },
  code: { fontFamily: 'monospace', backgroundColor: '#fff', paddingHorizontal: 4, borderRadius: 3, fontSize: 12 },
  emptyText: { padding: 16, textAlign: 'center', color: colors.textMuted, fontSize: 13 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  logBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  logSubject: { fontSize: 14, fontWeight: '600', color: colors.text },
  logMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  logTime: { fontSize: 11, color: colors.textLight, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  previewModal: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 760, height: '90%', overflow: 'hidden', flexDirection: 'column' as any },
  previewHeader: { flexDirection: 'row', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  previewTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  previewMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
