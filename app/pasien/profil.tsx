// Profil pasien yang sedang login (read-only untuk pasien).
//
// DATA DARI DUA SUMBER:
// 1) users/{uid}     → nama, email (dari AuthContext, sudah di-load saat login)
// 2) pasienProfile/{nik} → data medis: tgl lahir, gol darah, alergi, dll
//    (di-fetch satu kali, di-cache AsyncStorage)
//
// KENAPA READ-ONLY UNTUK PASIEN:
// Data medis (alergi, gol darah, dll) diinput & diverifikasi oleh admin/dokter.
// Pasien tidak diizinkan mengubahnya sendiri — konsisten dengan Firestore rules
// pasienProfile: pasien hanya boleh update field uid/email/updatedAt (proses klaim
// NIK), bukan field data medis. Ini bukan bug, ini desain yang disengaja.
//
// CACHE AsyncStorage:
// Data pasienProfile jarang berubah (hanya admin yang bisa update).
// Di-cache supaya tidak getDocs ulang tiap buka halaman profil.
// Saat difokus: tampilkan cache dulu → refresh Firestore di background.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { PasienProfile } from '@/types/pasien';

// Cache key per-NIK supaya tidak tabrakan kalau beda pasien login di device yg sama
function cacheKey(nik: string) {
  return `cache_pasienProfile_v1_${nik}`;
}

// ── Baris info kecil yang berulang ──
function InfoRow({
  label,
  value,
  testID,
}: {
  label: string;
  value?: string | null;
  testID?: string;
}) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value} testID={testID}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 13, color: '#666', flex: 1 },
  value: { fontSize: 13, color: '#111', fontWeight: '500', flex: 2, textAlign: 'right' },
});

// ── Komponen utama ──
export default function ProfilPasien() {
  const { profile: authProfile } = useAuth();
  const nik = authProfile?.nik ?? null;

  const [pasienProfile, setPasienProfile] = useState<PasienProfile | null>(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!nik) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const key = cacheKey(nik);

      // 1) Tampilkan dari cache dulu (kecuali ini pull-to-refresh manual)
      if (!isRefresh) {
        try {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            setPasienProfile(JSON.parse(raw));
            setLoading(false);
          }
        } catch { /* cache kosong/rusak */ }
      }

      // 2) Refresh dari Firestore (selalu, di background)
      try {
        const snap = await getDoc(doc(db, 'pasienProfile', nik));
        if (snap.exists()) {
          const data = snap.data() as PasienProfile;
          setPasienProfile(data);
          await AsyncStorage.setItem(key, JSON.stringify(data));
        }
      } catch (err) {
        console.error('Gagal refresh pasienProfile:', err);
        // Cache lama tetap dipakai — tidak fatal
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [nik]
  );

  // Load saat pertama render
  useEffect(() => { load(); }, [load]);

  // Reload saat difokus (misal habis admin update data, pasien balik ke sini)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  // ── Edge case: pasien belum punya NIK ──
  if (!nik && !loading) {
    return (
      <View style={styles.center} testID="profil-no-nik">
        <Ionicons name="alert-circle-outline" size={40} color="#f59e0b" />
        <Text style={styles.centerTitle}>NIK belum terdaftar</Text>
        <Text style={styles.centerSubtitle}>
          Hubungi admin klinik untuk menautkan NIK kamu ke akun ini.
        </Text>
      </View>
    );
  }

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} testID="profil-loading" />;
  }

  const jk =
    pasienProfile?.jenisKelamin === 'L'
      ? 'Laki-laki'
      : pasienProfile?.jenisKelamin === 'P'
      ? 'Perempuan'
      : null;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      testID="profil-scroll"
    >
      {/* Avatar & nama */}
      <View style={styles.heroCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={36} color="#4338CA" />
        </View>
        <Text style={styles.heroNama} testID="profil-nama">
          {authProfile?.nama ?? pasienProfile?.nama ?? '—'}
        </Text>
        <Text style={styles.heroEmail} testID="profil-email">
          {authProfile?.email ?? '—'}
        </Text>
      </View>

      {/* Data identitas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identitas</Text>
        <InfoRow label="NIK" value={nik} testID="profil-nik" />
        <View style={styles.divider} />
        <InfoRow
          label="Tanggal Lahir"
          value={pasienProfile?.tanggalLahir}
          testID="profil-tgl-lahir"
        />
        <View style={styles.divider} />
        <InfoRow label="Jenis Kelamin" value={jk} testID="profil-jk" />
        <View style={styles.divider} />
        <InfoRow
          label="No. Telepon"
          value={pasienProfile?.noTelepon}
          testID="profil-telp"
        />
        <View style={styles.divider} />
        <InfoRow label="Alamat" value={pasienProfile?.alamat} testID="profil-alamat" />
      </View>

      {/* Data medis */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Medis</Text>
        <InfoRow
          label="Gol. Darah"
          value={pasienProfile?.golonganDarah}
          testID="profil-gol-darah"
        />
        <View style={styles.divider} />
        <InfoRow
          label="Alergi"
          value={pasienProfile?.alergi}
          testID="profil-alergi"
        />
      </View>

      {/* Catatan baca-saja */}
      <View style={styles.infoNote}>
        <Ionicons name="lock-closed-outline" size={14} color="#6b7280" />
        <Text style={styles.infoNoteText}>
          Data medis dikelola oleh klinik. Hubungi admin jika ada yang perlu diperbarui.
        </Text>
      </View>

      {/* Peringatan profil belum lengkap */}
      {pasienProfile && !pasienProfile.profilLengkap && (
        <View style={styles.warningNote} testID="profil-incomplete-warning">
          <Ionicons name="warning-outline" size={14} color="#b45309" />
          <Text style={styles.warningText}>
            Profil medis kamu belum lengkap. Minta admin klinik untuk melengkapinya.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { padding: 16, gap: 12 },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  centerTitle:    { fontSize: 16, fontWeight: '700', color: '#333', textAlign: 'center' },
  centerSubtitle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20 },

  heroCard: {
    backgroundColor: '#eef2ff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#c7d2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroNama:       { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center' },
  heroEmail:      { fontSize: 13, color: '#555' },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  sectionTitle:   { fontSize: 13, fontWeight: '700', color: '#4338CA', marginBottom: 4 },
  divider:        { height: 1, backgroundColor: '#f0f0f0' },

  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
  },
  infoNoteText:   { fontSize: 12, color: '#6b7280', flex: 1, lineHeight: 18 },

  warningNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 10,
  },
  warningText:    { fontSize: 12, color: '#b45309', flex: 1, lineHeight: 18 },
});