import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import DateField from './DateField';

type Props = {
  visible: boolean;
  onClose: () => void;
  instrumentId: string;
  onAdded: () => void;
  technician?: string;
};

export default function AddLogModal({ visible, onClose, instrumentId, onAdded, technician }: Props) {
  const [form, setForm] = useState({
    log_type: 'maintenance',
    description: '',
    technician: technician || '',
    log_date: new Date().toISOString().slice(0, 10),
    next_due_date: '',
    cost: '',
    status: 'completed',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const types = ['maintenance', 'calibration', 'repair', 'inspection'];
  const statuses = ['completed', 'in_progress', 'failed'];

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setError('');
    if (!form.description.trim()) { setError('Description is required'); return; }
    setSaving(true);
    const payload: any = {
      instrument_id: instrumentId,
      log_type: form.log_type,
      description: form.description,
      technician: form.technician || null,
      log_date: form.log_date,
      next_due_date: form.next_due_date || null,
      cost: form.cost ? parseFloat(form.cost) : null,
      status: form.status,
    };
    const { error } = await supabase.from('maintenance_logs').insert(payload);

    // Update instrument's last maintenance/calibration & next dates
    if (!error && form.status === 'completed') {
      const updates: any = {};
      if (form.log_type === 'maintenance') {
        updates.last_maintenance = form.log_date;
        if (form.next_due_date) updates.next_maintenance = form.next_due_date;
      } else if (form.log_type === 'calibration') {
        updates.last_calibration = form.log_date;
        if (form.next_due_date) updates.next_calibration = form.next_due_date;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('instruments').update(updates).eq('id', instrumentId);
      }
    }

    setSaving(false);
    if (error) { setError(error.message); return; }
    setForm({ ...form, description: '', cost: '', next_due_date: '' });
    onAdded();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Maintenance Log</Text>
            <Pressable onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipRow}>
              {types.map((t) => (
                <Pressable key={t} onPress={() => update('log_type', t)} style={[styles.chip, form.log_type === t && styles.chipActive]}>
                  <Text style={[styles.chipText, form.log_type === t && styles.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={form.description}
              onChangeText={(v) => update('description', v)}
              placeholder="Describe the work performed..."
              placeholderTextColor={colors.textLight}
              multiline
            />

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Technician</Text>
                <TextInput style={styles.input} value={form.technician} onChangeText={(v) => update('technician', v)} placeholder="Name" placeholderTextColor={colors.textLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Cost ($)</Text>
                <TextInput style={styles.input} value={form.cost} onChangeText={(v) => update('cost', v)} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.textLight} />
              </View>
            </View>

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Log Date</Text>
                <DateField value={form.log_date} onChange={(v) => update('log_date', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Next Due Date</Text>
                <DateField value={form.next_due_date} onChange={(v) => update('next_due_date', v)} />
              </View>
            </View>

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRow}>
              {statuses.map((s) => (
                <Pressable key={s} onPress={() => update('status', s)} style={[styles.chip, form.status === s && styles.chipActive]}>
                  <Text style={[styles.chipText, form.status === s && styles.chipTextActive]}>{s.replace('_', ' ')}</Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <Pressable style={styles.cancelBtn} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Log'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90%', overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: '#fff' },
  row2: { flexDirection: 'row', gap: 10 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  chipActive: { backgroundColor: colors.primary + '10', borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: colors.primary },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.textMuted, fontWeight: '600' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700' },
});
