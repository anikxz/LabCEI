import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { colors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

type Props = {
  instrumentId: string;
  logId?: string;
  onUploaded?: (doc: any) => void;
};

export default function FileUpload({
  instrumentId,
  logId,
  onUploaded,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const pickFile = async () => {
    setError('');

    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        // ✅ WEB — unchanged
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';

        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return;
          await uploadFileWeb(file);
        };

        input.click();
      } else {
        // ✅ MOBILE — use expo-file-system, not fetch()
        const result = await DocumentPicker.getDocumentAsync({
          type: ['image/*', 'application/pdf'],
          copyToCacheDirectory: true,
        });

        if (result.canceled) return;

        const asset = result.assets[0];

        // Read file as base64 using expo-file-system (works on both iOS & Android)
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await uploadFileMobile({
          base64,
          name: asset.name,
          mimeType: asset.mimeType || 'application/octet-stream',
          size: asset.size || 0,
        });
      }
    } catch (err) {
      console.error('Pick file error:', err);
      setError('Failed to pick file');
    }
  };

  // ── Web upload (File object path) ─────────────────────────────────────────
  const uploadFileWeb = async (file: File) => {
    setError('');
    setUploading(true);

    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File too large (max 10MB)');
      }

      const ext = file.name.split('.').pop();
      const path = `${instrumentId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('lab-documents')
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadErr) throw uploadErr;

      await saveDocument({ path, fileName: file.name, fileType: file.type });
    } catch (e: any) {
      console.error('Upload error:', e);
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Mobile upload (base64 path) ───────────────────────────────────────────
  const uploadFileMobile = async ({
    base64,
    name,
    mimeType,
    size,
  }: {
    base64: string;
    name: string;
    mimeType: string;
    size: number;
  }) => {
    setError('');
    setUploading(true);

    try {
      if (size > 10 * 1024 * 1024) {
        throw new Error('File too large (max 10MB)');
      }

      // Decode base64 → Uint8Array → ArrayBuffer (no File constructor needed)
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const ext = name.split('.').pop();
      const path = `${instrumentId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('lab-documents')
        .upload(path, bytes.buffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadErr) throw uploadErr;

      await saveDocument({ path, fileName: name, fileType: mimeType });
    } catch (e: any) {
      console.error('Mobile upload error:', e);
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Shared: get public URL, run OCR, save to DB ───────────────────────────
  const saveDocument = async ({
    path,
    fileName,
    fileType,
  }: {
    path: string;
    fileName: string;
    fileType: string;
  }) => {
    const { data: pub } = supabase.storage
      .from('lab-documents')
      .getPublicUrl(path);

    const publicUrl = pub.publicUrl;

    let ocrText = '';

    if (fileType.startsWith('image/')) {
      try {
        const { data: ocr, error: ocrError } =
          await supabase.functions.invoke('ai-analysis', {
            body: { action: 'ocr', imageUrl: publicUrl },
          });

        if (ocrError) {
          console.error('OCR error:', ocrError);
        } else {
          ocrText = ocr?.text || '';
        }
      } catch (err) {
        console.error('OCR exception:', err);
      }
    }

    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .insert({
        instrument_id: instrumentId,
        log_id: logId || null,
        file_name: fileName,
        file_path: path,
        file_type: fileType,
        ocr_text: ocrText,
      })
      .select()
      .single();

    if (docErr) {
      // Roll back the orphaned upload so storage doesn't leak files
      await supabase.storage.from('lab-documents').remove([path]).catch(() => {});
      throw docErr;
    }

    onUploaded?.(doc);
  };

  return (
    <View>
      <Pressable style={styles.btn} onPress={pickFile} disabled={uploading}>
        {uploading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons
            name="cloud-upload-outline"
            size={16}
            color={colors.primary}
          />
        )}
        <Text style={styles.text}>
          {uploading ? 'Uploading & running OCR...' : 'Upload Document'}
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.hint}>
        PDF or image · OCR runs automatically on images
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary + '40',
    borderStyle: 'dashed',
    backgroundColor: colors.primary + '05',
    justifyContent: 'center',
  },
  text: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 6,
  },
  hint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
});
