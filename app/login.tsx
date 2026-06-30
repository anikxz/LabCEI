import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, shadow } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function Login() {
  const router = useRouter();
  const { login, refreshProfile } = useAuth();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');

    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    if (mode === 'signup' && !fullName) {
      setError('Please enter your full name');
      return;
    }

    try {
      setLoading(true);

      // =========================
      // ✅ SIGN UP + AUTO LOGIN
      // =========================
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        // 🔥 immediately log in (fixes redirect issue)
        await login(email, password);

        // 🔥 ensure profile is ready
        await refreshProfile();

        // 🔥 redirect (QR SAFE)
        if (redirect) {
          router.replace(redirect as any);
        } else {
          router.replace('/');
        }

        return;
      }

      // =========================
      // ✅ SIGN IN
      // =========================
      await login(email, password);

      await refreshProfile();

      if (redirect) {
        router.replace(redirect as any);
      } else {
        router.replace('/');
      }

    } catch (err: any) {
      if (err.message?.includes('Email not confirmed')) {
        setError('Please confirm your email before signing in.');
      } else {
        setError(err.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={[styles.card, shadow]}>

        <View style={styles.logoWrap}>
          <View style={styles.logo}>
            <Ionicons name="flask" size={28} color="#fff" />
          </View>
        </View>

        <Text style={styles.title}>Laboratory CEI System</Text>

        <Text style={styles.subtitle}>
          {mode === 'signin'
            ? 'Sign in to access dashboard'
            : 'Create your account'}
        </Text>

        {/* TOGGLE */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === 'signin' && styles.tabActive]}
            onPress={() => setMode('signin')}
          >
            <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>
              Sign In
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tab, mode === 'signup' && styles.tabActive]}
            onPress={() => setMode('signup')}
          >
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
              Sign Up
            </Text>
          </Pressable>
        </View>

        {/* FULL NAME */}
        {mode === 'signup' && (
          <View style={styles.field}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Dr. Jane Smith"
              placeholderTextColor={colors.textLight}
              value={fullName}
              onChangeText={setFullName}
            />
          </View>
        )}

        {/* EMAIL */}
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@lab.io"
            placeholderTextColor={colors.textLight}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        {/* PASSWORD */}
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.textLight}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.submit} onPress={handleSubmit} disabled={loading}>
          <Text style={styles.submitText}>
            {loading
              ? 'Processing...'
              : mode === 'signin'
              ? 'Sign In'
              : 'Create Account'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>

        <Pressable onPress={() => router.push('/')} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoWrap: { alignItems: 'center', marginBottom: 16 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
  tabs: { flexDirection: 'row', marginBottom: 16, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 },
  error: { color: colors.danger, textAlign: 'center', marginBottom: 10 },
  submit: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  submitText: { color: '#fff', fontWeight: '700' },
  back: { marginTop: 16, alignItems: 'center' },
  backText: { color: colors.textMuted },
});
