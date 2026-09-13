// Beda dengan riwayat.tsx (browse SEMUA riwayat), halaman ini fokus
// nampilin pemeriksaan PALING BARU secara lebih detail - buat pasien yang
// baru selesai diperiksa dan mau cepat lihat hasilnya tanpa scroll riwayat.
//
// PRINSIP HEMAT KUOTA: cache AsyncStorage + TIDAK auto-refetch di
// useFocusEffect (sama seperti riwayat.tsx & resep.tsx). Query dibatasi
// limit(1) di sisi Firestore, jadi walau "refresh", cuma 1 dokumen
// medicalRecords + dokumen resep terkait yang dibaca.

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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { MedicalRecord } from '@/types/medicalRecords';
import type { Resep } from '@/types/resep';
import type { DokterProfile } from '@/types/dokter';

interface CacheShape {
  record: MedicalRecord | null;
  resepList: Resep[];
  dokterLabel: string;
  fetchedAt: number;
}

const cacheKey = (uid: string) => `pasien_hasil_cache_v1_${uid}`;

export default function HasilPemeriksaanPasien() {
  const { user, profile } = useAuth();
  const nik = profile?.nik ?? null;

  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [resepList, setResepList] = useState<Resep[]>([]);
  const [dokterLabel, setDokterLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFromFirestore = useCallback(async () => {
    if (!user || !nik) return;
    try {
      const q = query(
        collection(db, 'medicalRecords'),
        where('pasienNik', '==', nik),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setRecord(null);
        setResepList([]);
        setDokterLabel('');
        return;
      }

      const d0 = snap.docs[0];
      const rec = { id: d0.id, ...(d0.data() as Omit<MedicalRecord, 'id'>) };
      // Rekam medis sudah ketemu - tampilkan SEKARANG, jangan tunggu resep &
      // nama dokter (yang di-fetch di bawah). Kalau salah satu dari keduanya
      // gagal karena sebab lain di masa depan, hasil pemeriksaan tetap
      // tampil - cuma bagian resep/nama dokter yang kosong, bukan semuanya.
      setRecord(rec);

      const [resepSnap, dokterSnap] = await Promise.all([
        // WAJIB include where('pasienNik', '==', nik) - rule resep butuh
        // resource.data.pasienNik buat query multi-dokumen (getDocs), bukan
        // cuma where('medicalRecordId', ...). Tanpa ini Firestore menolak
        // SELURUH query dengan permission-denied (bukan cuma hasil kosong),
        // walau secara logika resep-nya memang milik pasien ini - Firestore
        // tidak bisa membuktikan itu tanpa filter yang cocok dengan rule.
        // Lihat juga riwayat.tsx yang sengaja TIDAK query resep sama sekali.
        getDocs(
          query(
            collection(db, 'resep'),
            where('medicalRecordId', '==', rec.id),
            where('pasienNik', '==', nik)
          )
        ),
        getDoc(doc(db, 'dokterProfile', rec.dokterUid)),
      ]);

      const resep = resepSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Resep, 'id'>) }));
      const label = dokterSnap.exists()
        ? `dr. ${(dokterSnap.data() as DokterProfile).nama} — ${(dokterSnap.data() as DokterProfile).poliNama}`
        : 'Dokter tidak ditemukan';

      setResepList(resep);
      setDokterLabel(label);

      try {
        const cache: CacheShape = { record: rec, resepList: resep, dokterLabel: label, fetchedAt: Date.now() };
        await AsyncStorage.setItem(cacheKey(user.uid), JSON.stringify(cache));
      } catch (err) {
        console.warn('Gagal menyimpan cache hasil pemeriksaan:', err);
      }
    } catch (err) {
      console.error('Gagal memuat hasil pemeriksaan:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, nik]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!user || !nik) {
        setLoading(false);
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(cacheKey(user.uid));
        if (raw && !cancelled) {
          const parsed: CacheShape = JSON.parse(raw);
          setRecord(parsed.record);
          setResepList(parsed.resepList ?? []);
          setDokterLabel(parsed.dokterLabel ?? '');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Gagal membaca cache hasil pemeriksaan:', err);
      }
      if (cancelled) return;
      await fetchFromFirestore();
    }
    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, nik]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchFromFirestore();
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} testID="pasien-hasil-loading" />;

  if (!nik) {
    return (
      <View style={styles.center} testID="pasien-hasil-no-nik">
        <Ionicons name="alert-circle-outline" size={40} color="#888" />
        <Text style={styles.warningTitle}>Data NIK belum tersedia</Text>
        <Text style={styles.warning}>Hubungi admin/petugas pendaftaran untuk menautkan akun kamu.</Text>
      </View>
    );
  }

  if (!record) {
    return (
      <ScrollView
        contentContainerStyle={styles.centerScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        testID="pasien-hasil-empty">
        <Ionicons name="clipboard-outline" size={40} color="#888" />
        <Text style={styles.warningTitle}>Belum ada hasil pemeriksaan</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      testID="pasien-hasil-scroll">
      <Text style={styles.eyebrow}>PEMERIKSAAN TERAKHIR</Text>
      <Text style={styles.tanggal}>{record.tanggalPeriksa}</Text>
      <Text style={styles.dokterNama}>{dokterLabel}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Keluhan</Text>
        <Text style={styles.value}>{record.keluhan}</Text>

        <Text style={styles.label}>Diagnosa</Text>
        <Text style={styles.value}>{record.diagnosa}</Text>

        {record.tindakan ? (
          <>
            <Text style={styles.label}>Tindakan</Text>
            <Text style={styles.value}>{record.tindakan}</Text>
          </>
        ) : null}

        {record.catatan ? (
          <>
            <Text style={styles.label}>Catatan Dokter</Text>
            <Text style={styles.value}>{record.catatan}</Text>
          </>
        ) : null}
      </View>

      {resepList.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>Resep</Text>
          {resepList.map((r) => (
            <View key={r.id} style={{ marginTop: 4 }}>
              {r.items.map((it, i) => (
                <Text key={i} style={styles.value}>
                  • {it.namaObat} — {it.dosis} ({it.jumlah})
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 10 },
  centerScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  warningTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  warning: { textAlign: 'center', color: '#888', fontSize: 13, lineHeight: 18 },
  eyebrow: { fontSize: 11, fontWeight: '700', color: '#BE123C', letterSpacing: 1 },
  tanggal: { fontSize: 20, fontWeight: '700', color: '#111', marginTop: 2 },
  dokterNama: { fontSize: 13, color: '#666', marginBottom: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 4,
    marginBottom: 10,
  },
  label: { fontSize: 12, fontWeight: '700', color: '#BE123C', marginTop: 8 },
  value: { fontSize: 14, color: '#333' },
});