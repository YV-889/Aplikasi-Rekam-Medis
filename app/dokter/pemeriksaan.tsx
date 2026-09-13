// Form pemeriksaan dokter untuk satu pasien (dibawa dari daftar_pasien.tsx
// lewat query param `nik`). Setelah tersimpan, dokter diarahkan ke resep.tsx
// membawa medicalRecordId supaya resep bisa langsung ditautkan ke pemeriksaan ini.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import { showAlert, showConfirm } from '@/utils/alert';
import type { PasienProfile } from '@/types/pasien';
import type { DokterProfile } from '@/types/dokter';

function todayIso() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export default function PemeriksaanDokter() {
  const router = useRouter();
  const { nik } = useLocalSearchParams<{ nik: string }>();

  const [pasien, setPasien] = useState<PasienProfile | null>(null);
  const [dokterProfile, setDokterProfile] = useState<DokterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pemeriksaanHariIniCount, setPemeriksaanHariIniCount] = useState(0);

  const [keluhan, setKeluhan] = useState('');
  const [diagnosa, setDiagnosa] = useState('');
  const [tindakan, setTindakan] = useState('');
  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Ambil data pasien (by NIK) + profil dokter yang login (buat ambil poliId)
  useEffect(() => {
    async function load() {
      if (!nik) {
        showAlert('NIK tidak ditemukan', 'Kembali ke Daftar Pasien dan pilih pasien lagi.');
        router.back();
        return;
      }
      try {
        const pasienSnap = await getDoc(doc(db, 'pasienProfile', nik));
        if (!pasienSnap.exists()) {
          showAlert('Pasien tidak ditemukan', `NIK ${nik} tidak ada di data pasien.`);
          router.back();
          return;
        }
        setPasien(pasienSnap.data() as PasienProfile);

        const uid = auth.currentUser?.uid;

        // PENTING: query ini WAJIB ikut filter dokterUid == uid, karena
        // rules medicalRecords cuma izinkan dokter baca dokumen miliknya
        // sendiri (resource.data.dokterUid == request.auth.uid). Firestore
        // tidak bisa memverifikasi rule itu untuk query yang tidak ikut
        // membatasi field yang sama - tanpa where('dokterUid', ...) di
        // sini, SELURUH query ditolak permission-denied walau dokumennya
        // sebenarnya milik dokter ini. (Ini penyebab bug "gagal memuat
        // data" / "data belum lengkap" kemarin.)
        if (uid) {
          const existingQ = query(
            collection(db, 'medicalRecords'),
            where('pasienNik', '==', nik),
            where('tanggalPeriksa', '==', todayIso()),
            where('dokterUid', '==', uid)
          );
          const existingSnap = await getDocs(existingQ);
          setPemeriksaanHariIniCount(existingSnap.size);

          const dokterSnap = await getDoc(doc(db, 'dokterProfile', uid));
          if (dokterSnap.exists()) {
            setDokterProfile(dokterSnap.data() as DokterProfile);
          }
        }
      } catch (err) {
        console.error('Gagal memuat data pemeriksaan:', err);
        showAlert('Gagal memuat data', 'Coba lagi.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [nik, router]);

  const handleSimpan = async () => {
    if (!pasien || !dokterProfile) {
      showAlert('Data belum lengkap', 'Profil dokter atau pasien belum termuat.');
      return;
    }
    if (!keluhan.trim() || !diagnosa.trim()) {
      showAlert('Lengkapi form', 'Keluhan dan diagnosa wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const ref = await addDoc(collection(db, 'medicalRecords'), {
        pasienNik: pasien.nik,
        dokterUid: dokterProfile.uid,
        poliId: dokterProfile.poliId,
        tanggalPeriksa: todayIso(),
        keluhan: keluhan.trim(),
        diagnosa: diagnosa.trim(),
        tindakan: tindakan.trim() || null,
        catatan: catatan.trim() || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showConfirm(
        'Pemeriksaan tersimpan',
        'Data sudah tersimpan aman. Lanjut isi resep sekarang?',
        () => {
          router.replace({
            pathname: '/dokter/resep',
            params: { medicalRecordId: ref.id, nik: pasien.nik },
          });
        },
        'Lanjut ke Resep'
      );
      // Kalau dokter pilih "Batal": data pemeriksaan TETAP tersimpan
      // (sudah tersimpan di atas, sebelum dialog ini). Resepnya bisa
      // ditambahkan belakangan lewat tombol "+ Beri Resep" di halaman
      // Riwayat Pasien - lihat riwayat_pasien.tsx.
    } catch (err) {
      console.error('Gagal menyimpan pemeriksaan:', err);
      showAlert('Gagal menyimpan', 'Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }

  return (
    <KeyboardAvoidingView
  style={{ flex: 1 }}
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.container}
    keyboardShouldPersistTaps="handled">
      <View style={styles.pasienCard}>
        <Text style={styles.pasienNama}>{pasien?.nama}</Text>
        <Text style={styles.pasienMeta}>NIK: {pasien?.nik}</Text>
        {pasien?.alergi ? (
          <Text style={styles.alergi}>⚠ Alergi: {pasien.alergi}</Text>
        ) : null}
      </View>

      {pemeriksaanHariIniCount > 0 && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            ℹ Pasien ini sudah diperiksa {pemeriksaanHariIniCount}x hari ini. Pastikan ini memang pemeriksaan/kontrol baru, bukan input ganda yang tidak sengaja.
          </Text>
        </View>
      )}

      <Text style={styles.label}>Keluhan</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={keluhan}
        onChangeText={setKeluhan}
        placeholder="Keluhan pasien..."
        multiline
      />

      <Text style={styles.label}>Diagnosa</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={diagnosa}
        onChangeText={setDiagnosa}
        placeholder="Diagnosa dokter..."
        multiline
      />

      <Text style={styles.label}>Tindakan (opsional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={tindakan}
        onChangeText={setTindakan}
        placeholder="Tindakan yang dilakukan..."
        multiline
      />

      <Text style={styles.label}>Catatan tambahan (opsional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={catatan}
        onChangeText={setCatatan}
        placeholder="Catatan lain..."
        multiline
      />

      <Pressable
        style={[styles.button, submitting && { opacity: 0.6 }]}
        onPress={handleSimpan}
        disabled={submitting}>
        <Text style={styles.buttonText}>
          {submitting ? 'Menyimpan...' : 'Simpan & Lanjut ke Resep'}
        </Text>
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
    infoBanner: {
    backgroundColor: '#fff7ed',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },

  infoBannerText: {
    color: '#9a3412',
    fontSize: 13,
  },
  container: { padding: 16, gap: 12 },
  pasienCard: {
    backgroundColor: '#eaf1ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  pasienNama: { fontSize: 17, fontWeight: '700', color: '#111' },
  pasienMeta: { fontSize: 13, color: '#555', marginTop: 2 },
  alergi: { fontSize: 13, color: '#c2410c', marginTop: 6, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});