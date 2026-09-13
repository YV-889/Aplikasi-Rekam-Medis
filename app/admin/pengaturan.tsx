// Admin: Pengaturan aplikasi.
//
// Baru ada 1 pengaturan nyata sejauh ini: ambang batas "stok obat menipis"
// yang dipakai di Laporan (app/admin/laporan.tsx). Sebelumnya ini angka mati
// (STOK_MENIPIS_THRESHOLD = 10) langsung di kode - dipindah ke sini karena
// nilai ini masuk akal jadi keputusan admin per-klinik, bukan konstanta.
//
// PENYIMPANAN: dokumen singleton settings/app (BUKAN collection per-item -
// cuma ada 1 baris pengaturan global untuk seluruh klinik, jadi 1 dokumen
// sudah cukup, tidak perlu query/listener collection).
//
// Halaman lain yang mau baca nilai ini (laporan.tsx, dan nanti mungkin badge
// stok menipis di admin/obat.tsx) cukup getDoc(doc(db,'settings','app'))
// sekali - baca 1 dokumen kecil, bukan beban kuota yang berarti.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { showAlert } from '@/utils/alert';

// Sama dengan default di admin/laporan.tsx - dipakai kalau settings/app
// belum pernah disimpan sama sekali (klinik baru/pertama kali buka halaman).
const DEFAULT_STOK_MENIPIS_THRESHOLD = 10;

export default function PengaturanAdmin() {
  const { user } = useAuth();
  const [threshold, setThreshold] = useState(String(DEFAULT_STOK_MENIPIS_THRESHOLD));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'app'));
        const nilai = snap.exists() ? snap.data().stokMenipisThreshold : undefined;
        if (typeof nilai === 'number') {
          setThreshold(String(nilai));
        }
      } catch (err) {
        console.error('Gagal memuat pengaturan:', err);
        showAlert(
          'Gagal memuat pengaturan',
          `Menampilkan nilai default (${DEFAULT_STOK_MENIPIS_THRESHOLD}) sementara. Coba refresh halaman.`
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    const parsed = Number(threshold);
    if (!Number.isInteger(parsed) || parsed < 0) {
      showAlert('Nilai tidak valid', 'Ambang batas harus berupa angka bulat 0 atau lebih.');
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'settings', 'app'),
        {
          stokMenipisThreshold: parsed,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid ?? null,
        },
        { merge: true }
      );
      showAlert('Tersimpan', 'Pengaturan berhasil disimpan.');
    } catch (err) {
      console.error('Gagal menyimpan pengaturan:', err);
      showAlert('Gagal menyimpan', 'Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} testID="pengaturan-loading" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="medkit-outline" size={18} color="#4338CA" />
          <Text style={styles.sectionTitle}>Ambang Batas Stok Menipis</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Obat dengan stok kurang dari atau sama dengan angka ini akan dianggap &quot;menipis&quot; di
          halaman Laporan (kartu ringkasan, peringatan, dan sheet Excel).
        </Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={threshold}
          onChangeText={setThreshold}
          placeholder={String(DEFAULT_STOK_MENIPIS_THRESHOLD)}
          placeholderTextColor="#999"
          testID="pengaturan-threshold-input"
        />
        <Pressable
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
          testID="pengaturan-save-button">
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.saveButtonText}>Simpan</Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.infoNote}>
        <Ionicons name="information-circle-outline" size={14} color="#6b7280" />
        <Text style={styles.infoNoteText}>
          Berlaku untuk semua admin - halaman Laporan membaca nilai ini setiap kali dibuka, jadi
          perubahan langsung terasa tanpa perlu update aplikasi.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 10,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  sectionDesc: { fontSize: 13, color: '#666', lineHeight: 19 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111',
  },
  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4338CA',
    borderRadius: 10,
    padding: 12,
  },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
  },
  infoNoteText: { fontSize: 12, color: '#6b7280', flex: 1, lineHeight: 18 },
});