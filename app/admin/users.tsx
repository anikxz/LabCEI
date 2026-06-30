import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, TextInput, Modal, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { requireAdmin } from '../../lib/guards';
import { colors, shadow } from '../../lib/theme';
import { API_BASE } from '../../lib/apiClient';

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'technician' | 'viewer';
};

const ROLE_COLOR: Record<string, string> = {
  admin:      '#7c3aed',
  technician: '#0891b2',
  viewer:     '#64748b',
};

const ROLE_BG: Record<string, string> = {
  admin:      '#f3f0ff',
  technician: '#e0f7fa',
  viewer:     '#f1f5f9',
};

const EMPTY_FORM = { full_name: '', email: '', password: '', role: 'viewer' as UserRow['role'] };

export default function AdminUsers() {
  const { user, loading } = useAuth();
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch]     = useState('');

  // ── Create modal state ──
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formError, setFormError]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      setFetching(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role, full_name')
        .order('email');
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && requireAdmin(user?.role)) loadUsers();
  }, [loading, user?.role, loadUsers]);

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!requireAdmin(user?.role)) {
    return (
      <View style={styles.center}>
        <Ionicons name="shield-outline" size={48} color={colors.textMuted} />
        <Text style={styles.noAccess}>Admin access required</Text>
      </View>
    );
  }

  // ── Update role ──
  const updateRole = async (id: string, role: UserRow['role']) => {
    try {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch (err: any) {
      Alert.alert('Update failed', err.message);
    }
  };

  // ── Delete user ──
  const deleteUser = (target: UserRow) => {
    const doDelete = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/api/profiles/${target.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Delete failed');
        }
        setUsers((prev) => prev.filter((u) => u.id !== target.id));
      } catch (err: any) {
        Alert.alert('Error', err.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${target.email}? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert('Delete User', `Delete ${target.email}? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ── Create user ──
  const createUser = async () => {
    setFormError('');
    if (!form.email.trim())    return setFormError('Email is required');
    if (!form.password.trim()) return setFormError('Password is required');
    if (form.password.length < 6) return setFormError('Password must be at least 6 characters');

    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/profiles/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create user');
      setUsers((prev) => [...prev, json].sort((a, b) => a.email.localeCompare(b.email)));
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper to get current access token
  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    return (data.session as any)?.access_token ?? '';
  }

  const filtered = search.trim()
    ? users.filter((u) =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.full_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const renderItem = ({ item }: { item: UserRow }) => (
    <View style={[styles.card, shadow]}>
      {/* Avatar + info */}
      <View style={styles.cardLeft}>
        <View style={[styles.avatar, { backgroundColor: ROLE_BG[item.role] }]}>
          <Text style={[styles.avatarText, { color: ROLE_COLOR[item.role] }]}>
            {(item.full_name || item.email).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fullName} numberOfLines={1}>
            {item.full_name || '—'}
          </Text>
          <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
          <View style={[styles.rolePill, { backgroundColor: ROLE_BG[item.role] }]}>
            <Text style={[styles.rolePillText, { color: ROLE_COLOR[item.role] }]}>
              {item.role}
            </Text>
          </View>
        </View>
      </View>

      {/* Role buttons + delete */}
      <View style={styles.cardRight}>
        <View style={styles.roleBtns}>
          {(['viewer', 'technician', 'admin'] as const).map((r) => (
            <Pressable
              key={r}
              onPress={() => updateRole(item.id, r)}
              style={[styles.roleBtn, item.role === r && { backgroundColor: ROLE_COLOR[r], borderColor: ROLE_COLOR[r] }]}
              disabled={item.id === user?.id}
            >
              <Text style={[styles.roleBtnText, item.role === r && { color: '#fff' }]}>{r}</Text>
            </Pressable>
          ))}
        </View>

        {item.id !== user?.id && (
          <Pressable style={styles.deleteBtn} onPress={() => deleteUser(item)}>
            <Ionicons name="trash-outline" size={15} color={colors.danger} />
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {/* Header bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>User Management</Text>
          <Text style={styles.pageSub}>{users.length} account{users.length !== 1 ? 's' : ''}</Text>
        </View>
        <Pressable style={styles.createBtn} onPress={() => { setForm(EMPTY_FORM); setFormError(''); setShowCreate(true); }}>
          <Ionicons name="person-add-outline" size={16} color="#fff" />
          <Text style={styles.createBtnText}>Add User</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} style={{ marginRight: 10 }}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Role legend */}
      <View style={styles.legend}>
        {(['viewer', 'technician', 'admin'] as const).map((r) => (
          <View key={r} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: ROLE_COLOR[r] }]} />
            <Text style={styles.legendText}>{r}</Text>
          </View>
        ))}
        <Text style={styles.legendHint}>Tap a role button to reassign</Text>
      </View>

      {fetching ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />
      )}

      {/* ── Create User Modal ── */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, shadow]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New User</Text>
              <Pressable onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {/* Full name */}
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Jane Smith"
                placeholderTextColor={colors.textMuted}
                value={form.full_name}
                onChangeText={(v) => setForm((f) => ({ ...f, full_name: v }))}
              />

              {/* Email */}
              <Text style={styles.label}>Email <Text style={{ color: colors.danger }}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="user@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              />

              {/* Password */}
              <Text style={styles.label}>Password <Text style={{ color: colors.danger }}>*</Text></Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  value={form.password}
                  onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowPassword((p) => !p)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* Role */}
              <Text style={[styles.label, { marginTop: 14 }]}>Role</Text>
              <View style={styles.roleSelector}>
                {(['viewer', 'technician', 'admin'] as const).map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.roleSelectorBtn, form.role === r && { backgroundColor: ROLE_COLOR[r], borderColor: ROLE_COLOR[r] }]}
                    onPress={() => setForm((f) => ({ ...f, role: r }))}
                  >
                    <Text style={[styles.roleSelectorText, form.role === r && { color: '#fff' }]}>{r}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.roleDesc}>
                {form.role === 'viewer'     && 'Can view instruments and logs only.'}
                {form.role === 'technician' && 'Can add/edit instruments and maintenance logs.'}
                {form.role === 'admin'      && 'Full access including user management.'}
              </Text>

              {formError ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={createUser} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="person-add-outline" size={15} color="#fff" />}
                <Text style={styles.saveBtnText}>{saving ? 'Creating…' : 'Create User'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  noAccess: { fontSize: 16, color: colors.textMuted, marginTop: 8 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pageTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  pageSub:   { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, backgroundColor: '#fff',
    borderRadius: 10, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: colors.text },

  legend: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, marginBottom: 8, flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  legendHint: { fontSize: 11, color: colors.textLight, marginLeft: 'auto' as any },

  list: { paddingHorizontal: 16, paddingBottom: 100 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  },
  cardLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },

  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800' },

  fullName: { fontSize: 14, fontWeight: '700', color: colors.text },
  email:    { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  rolePill: {
    alignSelf: 'flex-start', marginTop: 5,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  rolePillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  roleBtns: { flexDirection: 'row', gap: 5 },
  roleBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7,
    borderWidth: 1, borderColor: colors.border,
  },
  roleBtnText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  deleteBtn: {
    padding: 7, borderRadius: 8,
    borderWidth: 1, borderColor: colors.danger + '40',
    backgroundColor: colors.danger + '08',
  },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { color: colors.textMuted, fontSize: 15 },

  // ── Modal ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalBox: {
    backgroundColor: '#fff', borderRadius: 18, padding: 24,
    width: '100%', maxWidth: 440,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },

  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: colors.text, backgroundColor: '#f8fafc',
    marginBottom: 14,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  eyeBtn: { padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#f8fafc' },

  roleSelector: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  roleSelectorBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 9,
    borderRadius: 9, borderWidth: 1.5, borderColor: colors.border,
  },
  roleSelectorText: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'capitalize' },
  roleDesc: { fontSize: 12, color: colors.textMuted, marginBottom: 6, minHeight: 18 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.danger + '10', borderRadius: 8,
    padding: 10, marginTop: 8, borderWidth: 1, borderColor: colors.danger + '30',
  },
  errorText: { color: colors.danger, fontSize: 13 },

  modalFooter: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  cancelBtnText: { fontWeight: '700', color: colors.textMuted },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
