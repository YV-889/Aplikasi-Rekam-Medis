// Daftar pasien untuk sisi dokter. Dokter TIDAK bisa mengubah data medis
// dasar (nama, alamat, alergi, dll) di sini — itu wewenang admin di
// admin/pasien.tsx. Halaman ini murni untuk MENCARI pasien, lalu lanjut
// ke pemeriksaan.tsx dengan membawa NIK terpilih lewat query param.
//
// Read-only by design: rules Firestore memang mengizinkan dokter baca
// semua pasienProfile (perlu lihat data medis pasien yang mau diperiksa),
// tapi TIDAK mengizinkan dokter menulis ke pasienProfile.
//
// SENGAJA pakai getDocs (baca sekali) + refresh saat halaman difokus,
// BUKAN onSnapshot - konsisten dengan riwayat_pasien.tsx. Halaman pilih
// pasien tidak butuh update real-time; kalau tetap pakai listener ke
// SELURUH koleksi pasienProfile, setiap dokter yang membiarkan halaman
// ini terbuka di background akan tetap dapat kiriman ulang snapshot
// setiap kali admin mengubah satu data pasien saja - boros kuota untuk
// manfaat yang kecil. Ada tombol pull-to-refresh kalau perlu lihat
// pasien yang baru saja diinput admin tanpa keluar-masuk halaman.

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

import { db } from '@/config/firebase';
import type { PasienProfile } from '@/types/pasien';

export default function DaftarPasienDokter() {
  const router = useRouter();
  const [pasienList, setPasienList] = useState<PasienProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const q = query(collection(db, 'pasienProfile'), orderBy('nama'));
      const snap = await getDocs(q);
      setPasienList(snap.docs.map((d) => d.data() as PasienProfile));
    } catch (err) {
      console.error('Gagal memuat daftar pasien:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Muat ulang tiap kali halaman ini difokus (misal habis admin nambah
  // pasien baru lalu dokter balik ke sini) - tetap 1x baca per kunjungan,
  // bukan listener yang nyala terus.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pasienList;
    return pasienList.filter(
      (p) => p.nama.toLowerCase().includes(q) || p.nik.includes(q)
    );
  }, [pasienList, search]);

  const handlePilih = (p: PasienProfile) => {
    // Bawa NIK ke halaman pemeriksaan lewat query param expo-router.
    router.push({ pathname: '/dokter/pemeriksaan', params: { nik: p.nik } });
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama atau NIK pasien..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.nik}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search ? 'Tidak ada pasien yang cocok.' : 'Belum ada data pasien. Minta admin input dulu.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => handlePilih(item)}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nama}>{item.nama}</Text>
                <Text style={styles.nik}>NIK: {item.nik}</Text>
                {!item.profilLengkap && (
                  <Text style={styles.warn}>Profil medis belum lengkap</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f8' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    marginBottom: 4,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
  },
  searchInput: { flex: 1, fontSize: 15 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#eaf1ff',
    justifyContent: 'center', alignItems: 'center',
  },
  nama: { fontSize: 15, fontWeight: '600', color: '#111' },
  nik: { fontSize: 13, color: '#888', marginTop: 2 },
  warn: { fontSize: 12, color: '#c2410c', marginTop: 2 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
});