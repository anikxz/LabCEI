import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, shadow } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useAuth, canEdit } from '../lib/auth';

export default function AddInstrument() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  const [form, setForm] = useState({
    name: '', model: '', serial_number: '', location: '', category: '',
    status: 'operational',
    purchase_date: '', last_maintenance: '', next_maintenance: '',
    last_calibration: '', next_calibration: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) {
      (async () => {
        const { data } = await supabase.from('instruments').select('*').eq('id', id).single();
        if (data) setForm({
          name: data.name || '',
          model: data.model || '',
          serial_number: data.serial_number || '',
          location: data.location || '',
          category: data.category || '',
          status: data.status || 'operational',
          purchase_date: data.purchase_date || '',
          last_maintenance: data.last_maintenance || '',
          next_maintenance: data.next_maintenance || '',
          last_calibration: data.last_calibration || '',
          next_calibration: data.next_calibration || '',
          notes: data.notes || '',
        });
      })();
    }
  }, [id, editing]);

  if (!user) {
    return (
      <View style={styles.root}>
        <View style={styles.authGate}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
          <Text style={styles.gateTitle}>Authentication required</Text>
          <Pressable style={styles.btn} onPress={() => router.push('/login?redirect=/add-instrument')}>
            <Text style={styles.btnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!canEdit(user.role)) {
    return (
      <View style={styles.root}>
        <View style={styles.authGate}>
          <Ionicons name="shield-outline" size={48} color={colors.textMuted} />
          <Text style={styles.gateTitle}>Insufficient permissions</Text>
          <Text style={styles.gateSub}>Your role ({user.role}) cannot add or edit instruments.</Text>
        </View>
      </View>
    );
  }

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
  setError('');
  if (!form.name.trim()) {
    setError('Name is required');
    return;
  }

  setSaving(true);

  const payload: any = { updated_at: new Date().toISOString() };

  // ✅ Correct handling for update + clear fields
  Object.keys(form).forEach((k) => {
    if (form[k] === '') {
      payload[k] = null; // allow clearing field
    } else {
      payload[k] = form[k]; // normal update
    }
  });

  let res;
  if (editing) {
    res = await supabase
      .from('instruments')
      .update(payload)
      .eq('id', id);
  } else {
    res = await supabase
      .from('instruments')
      .insert(payload)
      .select()
      .single();
  }

  setSaving(false);

  if (res.error) {
    setError(res.error.message);
    return;
  }

  const newId = editing ? id : (res.data as any)?.id;
  router.replace(`/instrument/${newId}`);
};



  const del = async () => {
    if (!editing) return;
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete this instrument? This cannot be undone.')) return;
      await supabase.from('instruments').delete().eq('id', id);
      router.replace('/instruments');
    } else {
      Alert.alert('Delete Instrument', 'Delete this instrument? This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('instruments').delete().eq('id', id); router.replace('/instruments'); } },
      ]);
    }
  };

  const statusOptions = ['operational', 'maintenance', 'calibration_due', 'out_of_service'];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>{editing ? 'Edit Instrument' : 'Add New Instrument'}</Text>
        <Text style={styles.subtitle}>
          {editing ? 'Update instrument details and compliance tracking.' : 'Register a new laboratory instrument. A QR code will be generated automatically.'}
        </Text>

        <View style={[styles.card, shadow]}>
          <Text style={styles.section}>Basic Information</Text>
          <Field label="Name *" value={form.name} onChange={(v) => update('name', v)} placeholder="e.g. Optical Microscope X1" />
          <View style={styles.row2}>
            <Field label="Model" value={form.model} onChange={(v) => update('model', v)} placeholder="Zeiss Axio Imager M2" />
            <Field label="Serial Number" value={form.serial_number} onChange={(v) => update('serial_number', v)} placeholder="SN-XXX-001" />
          </View>
          <View style={styles.row2}>
            <Field label="Category" value={form.category} onChange={(v) => update('category', v)} placeholder="Microscope, Centrifuge..." />
            <Field label="Location" value={form.location} onChange={(v) => update('location', v)} placeholder="Lab A - Room 101" />
          </View>

          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.statusRow}>
            {statusOptions.map((s) => (
              <Pressable key={s} style={[styles.statusBtn, form.status === s && styles.statusBtnActive]} onPress={() => update('status', s)}>
                <Text style={[styles.statusText, form.status === s && styles.statusTextActive]}>{s.replace('_', ' ')}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.section, { marginTop: 20 }]}>Compliance Schedule</Text>
          <View style={styles.row2}>
            <Field label="Purchase Date" value={form.purchase_date} onChange={(v) => update('purchase_date', v)} placeholder="YYYY-MM-DD" />
            <View style={{ flex: 1 }} />
          </View>
          <View style={styles.row2}>
            <Field label="Last Maintenance" value={form.last_maintenance} onChange={(v) => update('last_maintenance', v)} placeholder="YYYY-MM-DD" />
            <Field label="Next Maintenance" value={form.next_maintenance} onChange={(v) => update('next_maintenance', v)} placeholder="YYYY-MM-DD" />
          </View>
          <View style={styles.row2}>
            <Field label="Last Calibration" value={form.last_calibration} onChange={(v) => update('last_calibration', v)} placeholder="YYYY-MM-DD" />
            <Field label="Next Calibration" value={form.next_calibration} onChange={(v) => update('next_calibration', v)} placeholder="YYYY-MM-DD" />
          </View>

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={form.notes}
            onChangeText={(v) => update('notes', v)}
            placeholder="Additional notes about this instrument..."
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={4}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            {editing && user.role === 'admin' && (
              <Pressable style={styles.dangerBtn} onPress={del}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={styles.dangerText}>Delete</Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Ionicons name="save-outline" size={16} color="#fff" />
              <Text style={styles.btnText}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Instrument'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={{ flex: 1, marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textLight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, maxWidth: 900, alignSelf: 'center', width: '100%' },
  authGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  gateTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 12 },
  gateSub: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colors.border },
  section: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 12 },
  row2: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text,
    backgroundColor: '#fff',
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  statusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  statusBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff',
  },
  statusBtnActive: { backgroundColor: colors.primary + '10', borderColor: colors.primary },
  statusText: { fontSize: 13, color: colors.textMuted, fontWeight: '600', textTransform: 'capitalize' },
  statusTextActive: { color: colors.primary },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.danger + '40' },
  dangerText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
