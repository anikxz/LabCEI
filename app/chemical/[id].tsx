import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Platform, Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors, shadow } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import QRCode from '../components/QRCode';
import { useAuth, canEdit, canDelete } from '../../lib/auth';

// ─── NFPA data (mirrors chemicals.tsx) ───────────────────────────────────────
type HazardRating = 0 | 1 | 2 | 3 | 4;

const NFPA_MEANINGS: Record<string, Record<number, string>> = {
  H: {
    0: 'No hazard',
    1: 'Slight hazard — minor irritation possible',
    2: 'Moderate hazard — intense exposure could incapacitate',
    3: 'Serious hazard — can cause serious or permanent injury',
    4: 'Severe hazard — very short exposure could be fatal',
  },
  F: {
    0: 'Will not burn',
    1: 'Burns above 93 °C — combustible',
    2: 'Burns above 38 °C — needs moderate heat',
    3: 'Ignites at room temperature (flash pt < 38 °C)',
    4: 'Extremely flammable gas or liquid (flash pt < 23 °C)',
  },
  I: {
    0: 'Normally stable — not reactive with water',
    1: 'Normally stable — unstable at high temp',
    2: 'Violent chemical change possible — use water carefully',
    3: 'Capable of detonation with strong initiating source',
    4: 'Readily capable of detonation or explosive decomposition',
  },
};
const NFPA_LABEL: Record<string, string> = { H: 'Health', F: 'Flammability', I: 'Instability' };
const HAZARD_COLOR: Record<number, string> = { 0: '#22c55e', 1: '#84cc16', 2: '#eab308', 3: '#f97316', 4: '#ef4444' };

const SPECIAL_INFO: Record<string, { label: string; color: string; bg: string; icon: string; desc: string; handling: string }> = {
  'OX':   { label: 'Oxidizer',    color: '#92400e', bg: '#fffbeb', icon: '🔵', desc: 'Oxidizing agent — supplies oxygen and can intensify fires.', handling: 'Keep away from flammables & organics. Store separately. Use non-sparking tools.' },
  'COR':  { label: 'Corrosive',   color: '#7c2d12', bg: '#fff7ed', icon: '⚠️', desc: 'Corrosive — causes severe burns to skin, eyes, and tissue on contact.', handling: 'Wear acid-resistant gloves, face shield, and apron. Neutralize spills before cleanup.' },
  'ALK':  { label: 'Alkali',      color: '#1e3a5f', bg: '#eff6ff', icon: '🧪', desc: 'Strong alkali (base) — highly caustic, pH > 11. Causes chemical burns.', handling: 'Avoid contact with skin/eyes. Store away from acids. Neutralize spills with weak acid.' },
  'ACID': { label: 'Acid',        color: '#7f1d1d', bg: '#fef2f2', icon: '⚗️', desc: 'Strong acid — highly corrosive, pH < 3. Reacts violently with bases and metals.', handling: 'Use fume hood. Wear PPE. Never add water to acid — always add acid to water.' },
  '-W-':  { label: 'Water React', color: '#1e3a5f', bg: '#f0f9ff', icon: '💧', desc: 'Reacts dangerously with water — may produce flammable/toxic gases or explode.', handling: 'Keep completely dry. Use dry sand or Class D extinguisher. Never use water to fight fire.' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nfpaColor(label: 'H' | 'F' | 'I'): string {
  if (label === 'H') return '#3b82f6';
  if (label === 'F') return '#ef4444';
  return '#f59e0b';
}

// ─── NFPABadge — tappable, shows tooltip modal ────────────────────────────────
function NFPABadge({ label, value }: { label: 'H' | 'F' | 'I'; value: number }) {
  const [open, setOpen] = useState(false);
  const meaning = NFPA_MEANINGS[label]?.[value] ?? '';
  const dotColor = HAZARD_COLOR[value] ?? '#94a3b8';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.nfpaBadge, { backgroundColor: nfpaColor(label) }]}
        accessibilityRole="button"
        accessibilityLabel={`${NFPA_LABEL[label]} hazard level ${value}: ${meaning}`}
      >
        <Text style={styles.nfpaValue}>{value}</Text>
        <Text style={styles.nfpaLabel}>{label}</Text>
        {/* small "tap" hint dot */}
        <View style={styles.nfpaTapHint} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.tooltipOverlay} onPress={() => setOpen(false)}>
          <View style={styles.tooltipBox}>
            {/* Header */}
            <View style={styles.tooltipHdr}>
              <View style={[styles.tooltipDot, { backgroundColor: dotColor }]}>
                <Text style={styles.tooltipDotText}>{value}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tooltipTitle}>{NFPA_LABEL[label]}</Text>
                <Text style={styles.tooltipSub}>NFPA 704 · Level {value}</Text>
              </View>
              <View style={[styles.tooltipBadge, { backgroundColor: nfpaColor(label) }]}>
                <Text style={styles.tooltipBadgeText}>{label}</Text>
              </View>
            </View>
            {/* Meaning */}
            <Text style={styles.tooltipDesc}>{meaning}</Text>
            <Text style={styles.tooltipDismiss}>Tap anywhere to close</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── SpecialBadge — tappable, shows tooltip modal ────────────────────────────
function SpecialBadge({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const info = SPECIAL_INFO[code];

  if (!info) {
    return (
      <View style={styles.nfpaSpecial}>
        <Text style={styles.nfpaSpecialText}>{code}</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.nfpaSpecial, { backgroundColor: info.bg }]}
        accessibilityRole="button"
        accessibilityLabel={`${info.label}: ${info.desc}`}
      >
        <Text style={[styles.nfpaSpecialText, { color: info.color }]}>{code}</Text>
        <View style={styles.nfpaTapHint} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.tooltipOverlay} onPress={() => setOpen(false)}>
          <View style={styles.tooltipBox}>
            {/* Header */}
            <View style={styles.tooltipHdr}>
              <Text style={{ fontSize: 24 }}>{info.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.tooltipTitle}>{info.label}</Text>
                <Text style={styles.tooltipSub}>NFPA 704 Special Hazard · {code}</Text>
              </View>
            </View>
            {/* Description */}
            <Text style={styles.tooltipDesc}>{info.desc}</Text>
            {/* Handling */}
            <View style={styles.tooltipHandlingBox}>
              <Text style={styles.tooltipHandlingTitle}>Handling</Text>
              <Text style={styles.tooltipHandlingText}>{info.handling}</Text>
            </View>
            <Text style={styles.tooltipDismiss}>Tap anywhere to close</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
function stockStatus(qty: number, min: number): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (qty === 0) return 'out_of_stock';
  if (qty <= min) return 'low_stock';
  return 'in_stock';
}
function stockColor(s: string) {
  if (s === 'out_of_stock') return colors.danger;
  if (s === 'low_stock')    return colors.warning;
  return colors.success;
}
function stockLabel(s: string) {
  if (s === 'out_of_stock') return 'Out of Stock';
  if (s === 'low_stock')    return 'Low Stock';
  return 'In Stock';
}
function daysUntilExpiry(d: string | null): number | null {
  if (!d) return null;
  return Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
}

// ─── Detail row ───────────────────────────────────────────────────────────────
function DetailRow({ label, value, icon, valueColor }: {
  label: string; value: string; icon: string; valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon as any} size={15} color={colors.textMuted} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor ? { color: valueColor } : {}]}>{value || '—'}</Text>
    </View>
  );
}

// ─── Adjust Stock Modal ───────────────────────────────────────────────────────
function AdjustModal({ chemical, onClose, onSaved }: {
  chemical: any; onClose: () => void; onSaved: () => void;
}) {
  const [mode, setMode]     = useState<'use' | 'add' | 'set'>('use');
  const [qty, setQty]       = useState('');
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);

  const inputVal = parseFloat(qty) || 0;
  const newQty = mode === 'use'
    ? Math.max(0, chemical.quantity - inputVal)
    : mode === 'add'
    ? chemical.quantity + inputVal
    : inputVal;
  const delta = newQty - chemical.quantity;
  const deltaValid = qty !== '' && !isNaN(inputVal) && delta !== 0;

  const submit = async () => {
    if (qty === '') return;
    setSaving(true);
    const finalQty = parseFloat(newQty.toFixed(4));
    await supabase.from('chemical_stock').update({ quantity: finalQty, updated_at: new Date().toISOString() }).eq('id', chemical.id);
    await supabase.from('chemical_activity').insert({
      action: 'adjust', chemical_id: chemical.id,
      description: `${chemical.name}: ${chemical.quantity} → ${finalQty} ${chemical.unit}${note ? ` (${note})` : ''}`,
      logged_by: 'user', time: new Date().toISOString(),
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  const tabActive  = (active: boolean, color: string) => ({
    flex: 1 as const, paddingVertical: 8, borderRadius: 8,
    backgroundColor: active ? color + '18' : '#f8fafc',
    borderWidth: 1.5, borderColor: active ? color : '#e2e8f0',
  });
  const tabText = (active: boolean, color: string) => ({
    textAlign: 'center' as const, fontWeight: '700' as const, fontSize: 12,
    color: active ? color : '#64748b',
  });

  const saveBg = mode === 'use' ? '#dc2626' : mode === 'add' ? '#15803d' : '#1d4ed8';

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHdr}>
            <Text style={styles.modalTitle}>⚖ Adjust Stock</Text>
            <Pressable onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable>
          </View>
          <Text style={styles.modalSub}>{chemical.name}</Text>

          {/* Current stock banner */}
          <View style={styles.stockBanner}>
            <Text style={styles.stockBannerLabel}>CURRENT STOCK</Text>
            <Text style={styles.stockBannerValue}>{chemical.quantity} <Text style={styles.stockBannerUnit}>{chemical.unit}</Text></Text>
          </View>

          {/* Mode tabs */}
          <Text style={styles.inputLabel}>Adjustment Type</Text>
          <View style={[styles.tabs, { gap: 6 }]}>
            <Pressable style={tabActive(mode === 'use', '#dc2626')} onPress={() => { setMode('use'); setQty(''); }}>
              <Text style={tabText(mode === 'use', '#dc2626')}>🔬 Used / Consumed</Text>
            </Pressable>
            <Pressable style={tabActive(mode === 'add', '#15803d')} onPress={() => { setMode('add'); setQty(''); }}>
              <Text style={tabText(mode === 'add', '#15803d')}>📦 Restock / Add</Text>
            </Pressable>
            <Pressable style={tabActive(mode === 'set', '#7c3aed')} onPress={() => { setMode('set'); setQty(String(chemical.quantity)); }}>
              <Text style={tabText(mode === 'set', '#7c3aed')}>✏️ Set Exact</Text>
            </Pressable>
          </View>

          {/* Amount input */}
          <Text style={[styles.inputLabel, { marginTop: 12 }]}>
            {mode === 'use' ? `Quantity Used (${chemical.unit})` : mode === 'add' ? `Quantity to Add (${chemical.unit})` : `New Total Quantity (${chemical.unit})`}
          </Text>
          <TextInput
            style={[styles.input, { fontSize: 18, fontWeight: '700' }]}
            placeholder={mode === 'set' ? String(chemical.quantity) : '0'}
            keyboardType="numeric"
            value={qty}
            onChangeText={setQty}
            autoFocus
          />

          {/* Delta preview */}
          {deltaValid && (
            <View style={[styles.deltaBox, { backgroundColor: delta > 0 ? '#f0fdf4' : '#fef2f2', borderColor: delta > 0 ? '#bbf7d0' : '#fecaca' }]}>
              <Text style={[styles.deltaText, { color: delta > 0 ? '#15803d' : '#dc2626' }]}>
                {delta > 0 ? '▲ Adding' : '▼ Removing'} {Math.abs(delta).toFixed(2)} {chemical.unit}
              </Text>
              <Text style={[styles.deltaText, { color: delta > 0 ? '#15803d' : '#dc2626', opacity: 0.75 }]}>
                → {newQty.toFixed(2)} {chemical.unit}
              </Text>
            </View>
          )}
          {mode === 'use' && inputVal > chemical.quantity && qty !== '' && (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>⚠️ Amount exceeds current stock — stock will be set to 0</Text>
            </View>
          )}

          {/* Reason */}
          <Text style={[styles.inputLabel, { marginTop: 12 }]}>Reason (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder={mode === 'use' ? 'e.g. Used in experiment, titration…' : mode === 'add' ? 'e.g. Restocked from supplier…' : 'e.g. Manual inventory count…'}
            value={note}
            onChangeText={setNote}
          />

          {/* Footer buttons */}
          <View style={styles.modalFooter}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, { flex: 1, backgroundColor: saveBg, opacity: qty === '' ? 0.6 : 1 }]}
              onPress={submit}
              disabled={saving || qty === ''}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.modalBtnText}>💾 Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ chemical, onClose, onSaved }: {
  chemical: any; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name:          chemical.name          ?? '',
    cas_number:    chemical.cas_number    ?? '',
    supplier:      chemical.supplier      ?? '',
    location:      chemical.location      ?? '',
    storage_class: chemical.storage_class ?? '',
    notes:         chemical.notes         ?? '',
    expiry_date:   chemical.expiry_date   ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    await supabase.from('chemical_stock').update({ ...form, updated_at: new Date().toISOString() }).eq('id', chemical.id);
    await supabase.from('chemical_activity').insert({
      action: 'edit', chemical_id: chemical.id,
      description: `Chemical details updated`,
      logged_by: 'user', time: new Date().toISOString(),
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { maxHeight: '85%' }]}>
          <ScrollView>
            <View style={styles.modalHdr}>
              <Text style={styles.modalTitle}>Edit Chemical</Text>
              <Pressable onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable>
            </View>
            {[
              { key: 'name',          label: 'Name' },
              { key: 'cas_number',    label: 'CAS Number' },
              { key: 'supplier',      label: 'Supplier' },
              { key: 'location',      label: 'Location' },
              { key: 'storage_class', label: 'Storage Class' },
              { key: 'expiry_date',   label: 'Expiry Date (YYYY-MM-DD)' },
              { key: 'notes',         label: 'Notes' },
            ].map(({ key, label }) => (
              <View key={key} style={{ marginBottom: 10 }}>
                <Text style={styles.inputLabel}>{label}</Text>
                <TextInput
                  style={[styles.input, key === 'notes' && { height: 72, textAlignVertical: 'top' }]}
                  value={(form as any)[key]}
                  onChangeText={v => set(key, v)}
                  multiline={key === 'notes'}
                />
              </View>
            ))}
            <Pressable style={[styles.modalBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>Save Changes</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ChemicalDetail() {
  const router   = useRouter();
  const { id }   = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [chemical, setChemical] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<'adjust' | 'edit' | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: chem }, { data: acts }] = await Promise.all([
      supabase.from('chemical_stock').select('*').eq('id', id).single(),
      supabase.from('chemical_activity')
        .select('*').eq('chemical_id', id)
        .order('time', { ascending: false }).limit(20),
    ]);
    setChemical(chem);
    setActivity(acts || []);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Back: try router.back(), fall back to /chemicals ─────────────────────
  const goBack = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/chemicals');
    }
  };

  const handleDelete = async () => {
    if (!chemical) return;
    Alert.alert(
      'Delete Chemical',
      `Are you sure you want to delete "${chemical.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await supabase.from('chemical_activity').delete().eq('chemical_id', chemical.id);
            await supabase.from('chemical_stock').delete().eq('id', chemical.id);
            router.replace('/chemicals');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!chemical) {
    return (
      <View style={styles.root}>
        <View style={styles.loading}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
          <Text style={{ marginTop: 12, color: colors.textMuted }}>Chemical not found.</Text>
          <Pressable onPress={goBack} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>← Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const siteUrl = (Platform.OS === 'web' && typeof window !== 'undefined')
    ? window.location.origin : 'https://lab.app';
  const qrUrl = `${siteUrl}/chemical/${chemical.id}`;

  const ss       = stockStatus(chemical.quantity, chemical.min_stock);
  const ssColor  = stockColor(ss);
  const exp      = daysUntilExpiry(chemical.expiry_date);
  const expWarn  = exp !== null && exp <= 30;

  const actionIcon:  Record<string, string> = { add: 'add-circle-outline', edit: 'create-outline', delete: 'trash-outline', adjust: 'swap-vertical-outline' };
  const actionColor: Record<string, string> = { add: colors.success, edit: colors.primary, delete: colors.danger, adjust: '#7c3aed' };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Back */}
        <Pressable style={styles.backLink} onPress={goBack}>
          <Ionicons name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.backText}>Chemicals</Text>
        </Pressable>

        {/* Title row */}
        <View style={styles.titleRow}>
          <View style={[styles.titleIcon, { backgroundColor: '#fff7ed' }]}>
            <Ionicons name="flask" size={28} color="#ea580c" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{chemical.name}</Text>
            {chemical.cas_number
              ? <Text style={styles.subtitle}>CAS {chemical.cas_number}</Text>
              : null}
          </View>
          <View style={[styles.stockBadge, { backgroundColor: ssColor + '15', borderColor: ssColor + '40' }]}>
            <Text style={[styles.stockBadgeText, { color: ssColor }]}>{stockLabel(ss)}</Text>
          </View>
        </View>

        {/* Main grid */}
        <View style={styles.mainGrid}>
          {/* Left column */}
          <View style={styles.leftCol}>

            {/* Action buttons */}
            <View style={[styles.card, shadow, { gap: 8 }]}>
              <Text style={styles.sectionTitle}>Actions</Text>
              <Pressable style={styles.actionBtn} onPress={() => setModal('adjust')}>
                <Ionicons name="swap-vertical-outline" size={16} color="#7c3aed" />
                <Text style={[styles.actionBtnText, { color: '#7c3aed' }]}>Adjust Stock</Text>
              </Pressable>
              {user?.role === 'admin' && (
                <Pressable style={styles.actionBtn} onPress={() => setModal('edit')}>
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                  <Text style={[styles.actionBtnText, { color: colors.primary }]}>Edit Chemical</Text>
                </Pressable>
              )}
              {canDelete(user?.role) && (
                <Pressable style={[styles.actionBtn, { borderColor: colors.danger + '40', backgroundColor: colors.danger + '08' }]} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={[styles.actionBtnText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              )}
            </View>

            {/* Stock card */}
            <View style={[styles.card, shadow]}>
              <Text style={styles.sectionTitle}>Stock Information</Text>
              <View style={styles.stockRow}>
                <View style={styles.stockMetric}>
                  <Text style={[styles.stockBigValue, { color: ssColor }]}>{chemical.quantity}</Text>
                  <Text style={styles.stockUnit}>{chemical.unit}</Text>
                  <Text style={styles.stockMetricLabel}>Current Stock</Text>
                </View>
                <View style={styles.stockDivider} />
                <View style={styles.stockMetric}>
                  <Text style={styles.stockBigValue}>{chemical.min_stock}</Text>
                  <Text style={styles.stockUnit}>{chemical.unit}</Text>
                  <Text style={styles.stockMetricLabel}>Min. Required</Text>
                </View>
              </View>
              <View style={styles.stockBarBg}>
                <View style={[
                  styles.stockBarFill,
                  {
                    width: `${Math.min(100, chemical.min_stock > 0 ? (chemical.quantity / (chemical.min_stock * 2)) * 100 : 100)}%` as any,
                    backgroundColor: ssColor,
                  }
                ]} />
              </View>
              <DetailRow label="Supplier"      value={chemical.supplier}      icon="business-outline" />
              <View style={styles.divider} />
              <DetailRow label="Location"      value={chemical.location}      icon="location-outline" />
              <View style={styles.divider} />
              <DetailRow
                label="Expiry Date"
                value={chemical.expiry_date
                  ? `${new Date(chemical.expiry_date).toLocaleDateString()}${exp !== null ? (exp < 0 ? ` (Expired ${Math.abs(exp)}d ago)` : ` (${exp}d left)`) : ''}`
                  : '—'}
                icon="calendar-outline"
                valueColor={expWarn ? (exp! < 0 ? colors.danger : colors.warning) : undefined}
              />
              <View style={styles.divider} />
              <DetailRow label="Storage Class" value={chemical.storage_class} icon="shield-checkmark-outline" />
            </View>

            {/* Hazard card */}
            <View style={[styles.card, shadow]}>
              <Text style={styles.sectionTitle}>NFPA Hazard Ratings</Text>
              <View style={styles.nfpaRow}>
                <NFPABadge label="H" value={chemical.health      ?? 0} />
                <NFPABadge label="F" value={chemical.fire        ?? 0} />
                <NFPABadge label="I" value={chemical.instability ?? 0} />
                {chemical.special
                  ? chemical.special
                      .split(',')
                      .map((c: string) => c.trim())
                      .filter(Boolean)
                      .map((code: string) => <SpecialBadge key={code} code={code} />)
                  : null}
              </View>
              <View style={styles.nfpaLegend}>
                <Text style={[styles.nfpaLegendItem, { color: '#3b82f6' }]}>H = Health</Text>
                <Text style={[styles.nfpaLegendItem, { color: '#ef4444' }]}>F = Fire</Text>
                <Text style={[styles.nfpaLegendItem, { color: '#f59e0b' }]}>I = Instability</Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>
                💡 Tap any badge for details
              </Text>
            </View>

            {/* Notes */}
            {chemical.notes ? (
              <View style={[styles.card, shadow]}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.notesText}>{chemical.notes}</Text>
              </View>
            ) : null}

            {/* Activity log */}
            <View style={[styles.card, shadow]}>
              <Text style={styles.sectionTitle}>Activity Log</Text>
              {activity.length === 0 ? (
                <Text style={styles.emptyText}>No activity recorded yet.</Text>
              ) : activity.map((a, idx) => (
                <View key={a.id} style={[styles.actRow, idx < activity.length - 1 && styles.actBorder]}>
                  <View style={[styles.actIcon, { backgroundColor: (actionColor[a.action] ?? colors.textMuted) + '18' }]}>
                    <Ionicons name={(actionIcon[a.action] ?? 'ellipse-outline') as any} size={17} color={actionColor[a.action] ?? colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actDesc}>{a.description}</Text>
                    <Text style={styles.actMeta}>{a.logged_by || a.user || 'System'} · {a.time ? new Date(a.time).toLocaleString() : ''}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Right column */}
          <View style={styles.rightCol}>
            <QRCode url={qrUrl} title={`${chemical.name} QR`} subtitle="Scan to access this chemical" />

            <View style={[styles.card, shadow, { marginTop: 16 }]}>
              <Text style={styles.sectionTitle}>Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Activity</Text>
                <Text style={styles.summaryValue}>{activity.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Stock Status</Text>
                <Text style={[styles.summaryValue, { color: ssColor }]}>{stockLabel(ss)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Last Updated</Text>
                <Text style={styles.summaryValue}>{chemical.updated_at ? new Date(chemical.updated_at).toLocaleDateString() : '—'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Added On</Text>
                <Text style={styles.summaryValue}>{chemical.created_at ? new Date(chemical.created_at).toLocaleDateString() : '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>LabCEI · Chemical Registry</Text>
        </View>
      </ScrollView>

      {/* Modals */}
      {modal === 'adjust' && (
        <AdjustModal chemical={chemical} onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal === 'edit' && user?.role === 'admin' && (
        <EditModal chemical={chemical} onClose={() => setModal(null)} onSaved={load} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, maxWidth: 1280, alignSelf: 'center', width: '100%' },
  loading: { flex: 1, padding: 60, alignItems: 'center', justifyContent: 'center' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  backText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' },
  titleIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontFamily: 'monospace' },
  stockBadge:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  stockBadgeText: { fontSize: 13, fontWeight: '700' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff',
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },

  mainGrid: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  leftCol:  { flex: 2, minWidth: 300, gap: 16 },
  rightCol: { flex: 1, minWidth: 260 },
  card:     { backgroundColor: '#fff', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 14 },

  stockRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  stockMetric:     { flex: 1, alignItems: 'center' },
  stockBigValue:   { fontSize: 36, fontWeight: '800', color: colors.text },
  stockUnit:       { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  stockMetricLabel:{ fontSize: 11, color: colors.textMuted, marginTop: 4 },
  stockDivider:    { width: 1, height: 60, backgroundColor: colors.border },
  stockBarBg:      { height: 8, backgroundColor: colors.border, borderRadius: 99, overflow: 'hidden', marginBottom: 16 },
  stockBarFill:    { height: '100%', borderRadius: 99 },

  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  detailIcon: { width: 28, height: 28, borderRadius: 7, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  detailLabel:{ fontSize: 13, color: colors.textMuted, flex: 1 },
  detailValue:{ fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'right', maxWidth: 200 },
  divider:    { height: 1, backgroundColor: colors.border },

  nfpaRow:         { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  nfpaBadge:       { width: 60, height: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  nfpaValue:       { fontSize: 22, fontWeight: '800', color: '#fff' },
  nfpaLabel:       { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  nfpaSpecial:     { backgroundColor: '#0f172a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, position: 'relative' },
  nfpaSpecialText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  nfpaLegend:      { flexDirection: 'row', gap: 14 },
  nfpaLegendItem:  { fontSize: 11, fontWeight: '600' },
  nfpaTapHint:     { position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },

  // Tooltip modal
  tooltipOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  tooltipBox:          { backgroundColor: '#1e293b', borderRadius: 14, padding: 18, width: '100%', maxWidth: 340 },
  tooltipHdr:          { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  tooltipDot:          { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tooltipDotText:      { fontSize: 16, fontWeight: '800', color: '#fff' },
  tooltipBadge:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tooltipBadgeText:    { fontSize: 12, fontWeight: '800', color: '#fff' },
  tooltipTitle:        { fontSize: 14, fontWeight: '700', color: '#f1f5f9' },
  tooltipSub:          { fontSize: 11, color: '#64748b', marginTop: 1 },
  tooltipDesc:         { fontSize: 13, color: '#e2e8f0', lineHeight: 20, marginBottom: 12 },
  tooltipHandlingBox:  { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 9, padding: 12, marginBottom: 12 },
  tooltipHandlingTitle:{ fontSize: 11, fontWeight: '700', color: '#7dd3fc', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  tooltipHandlingText: { fontSize: 12, color: '#94a3b8', lineHeight: 18 },
  tooltipDismiss:      { fontSize: 11, color: '#475569', textAlign: 'center' as const },

  notesText: { fontSize: 13, color: colors.text, lineHeight: 20 },
  emptyText: { padding: 16, textAlign: 'center', color: colors.textMuted, fontSize: 13 },

  actRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  actBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  actIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actDesc:   { fontSize: 13, fontWeight: '600', color: colors.text },
  actMeta:   { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  summaryLabel: { fontSize: 13, color: colors.textMuted },
  summaryValue: { fontSize: 14, fontWeight: '700', color: colors.text },

  footer:     { marginTop: 40, paddingVertical: 24, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  footerText: { fontSize: 12, color: colors.textLight },

  // Modals
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox:    { backgroundColor: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 420 },
  modalHdr:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle:  { fontSize: 17, fontWeight: '800', color: colors.text },
  modalSub:    { fontSize: 13, color: colors.textMuted, marginBottom: 12 },
  tabs:        { flexDirection: 'row', borderRadius: 10, marginBottom: 4 },
  input:       { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, fontSize: 14, color: colors.text, backgroundColor: '#fff', marginBottom: 10 },
  inputLabel:  { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 4 },
  preview:     { fontSize: 13, color: colors.primary, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  modalBtn:    { borderRadius: 10, paddingVertical: 12, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 4 },
  modalBtnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  stockBanner: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 14 },
  stockBannerLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  stockBannerValue: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  stockBannerUnit:  { fontSize: 13, color: '#64748b' },
  deltaBox:    { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  deltaText:   { fontSize: 13, fontWeight: '600' },
  warnBox:     { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  warnText:    { fontSize: 12, fontWeight: '600', color: '#b45309' },
  modalFooter: { flexDirection: 'row' as const, gap: 10, marginTop: 4 },
  cancelBtn:   { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center' as const, justifyContent: 'center' as const },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#334155' },
});
