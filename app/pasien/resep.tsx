// Semua resep milik pasien yang login (read-only, ringkasan obat + dokter).
//
// PRINSIP HEMAT KUOTA (konsisten dengan pasien/riwayat.tsx):
// - Cache di AsyncStorage, TIDAK auto-refetch di useFocusEffect.
// - limit(50): resep terbaru saja.
// - Nama obat sudah didenormalisasi di Resep.items (namaObat) - TIDAK perlu
//   query ke collection 'obat' sama sekali di halaman ini.
// - Nama dokter di-JOIN cuma untuk uid yang benar-benar muncul di resep
//   yang sedang ditampilkan (bukan getDocs semua dokter), dan di-cache
//   supaya dokter yang sama di resep lain tidak dibaca ulang.
//
// RULES: resep -> allow read: if isPasien() && resource.data.pasienNik ==
// myNik(). Makanya query WAJIB where('pasienNik','==', nik).

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
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
import { showAlert } from '@/utils/alert';
import type { Resep } from '@/types/resep';
import type { DokterProfile } from '@/types/dokter';

interface CacheShape {
  resepList: Resep[];
  dokterNames: Record<string, string>;
  fetchedAt: number;
}

const PAGE_SIZE = 50;
const cacheKey = (uid: string) => `pasien_resep_cache_v1_${uid}`;

export default function ResepPasien() {
  const { user, profile } = useAuth();
  const nik = profile?.nik ?? null;

  const [resepList, setResepList] = useState<Resep[]>([]);
  const [dokterNames, setDokterNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMissingDokterNames = useCallback(
    async (uids: string[], currentNames: Record<string, string>) => {
      const missing = Array.from(new Set(uids)).filter((u) => u && !(u in currentNames));
      if (missing.length === 0) return currentNames;

      const entries = await Promise.all(
        missing.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'dokterProfile', uid));
            if (!snap.exists()) return [uid, ''] as const;
            const d = snap.data() as DokterProfile;
            return [uid, `dr. ${d.nama} — ${d.poliNama}`] as const;
          } catch {
            return [uid, ''] as const;
          }
        })
      );
      const next = { ...currentNames };
      entries.forEach(([uid, label]) => {
        if (label) next[uid] = label;
      });
      return next;
    },
    []
  );

  const fetchFromFirestore = useCallback(async () => {
    if (!user || !nik) return;
    try {
      const q = query(
        collection(db, 'resep'),
        where('pasienNik', '==', nik),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Resep, 'id'>) }));

      const nextDokterNames = await fetchMissingDokterNames(
        list.map((r) => r.dokterUid),
        dokterNames
      );

      setResepList(list);
      setDokterNames(nextDokterNames);

      try {
        const cache: CacheShape = { resepList: list, dokterNames: nextDokterNames, fetchedAt: Date.now() };
        await AsyncStorage.setItem(cacheKey(user.uid), JSON.stringify(cache));
      } catch (err) {
        console.warn('Gagal menyimpan cache resep:', err);
      }
    } catch (err: any) {
      console.error('Gagal memuat resep:', err);
      if (err?.code === 'failed-precondition') {
        showAlert(
          'Perlu index Firestore',
          'Query resep ini butuh composite index (pasienNik + createdAt) di collection resep yang belum dibuat. Buka DevTools Console untuk link pembuatan index otomatis dari Firebase.'
        );
      } else {
        showAlert('Gagal memuat', 'Tidak bisa memuat resep. Coba refresh lagi.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, nik, dokterNames, fetchMissingDokterNames]);

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
          setResepList(parsed.resepList ?? []);
          setDokterNames(parsed.dokterNames ?? {});
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Gagal membaca cache resep:', err);
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

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} testID="pasien-resep-loading" />;

  if (!nik) {
    return (
      <View style={styles.center} testID="pasien-resep-no-nik">
        <Ionicons name="alert-circle-outline" size={40} color="#888" />
        <Text style={styles.warningTitle}>Data NIK belum tersedia</Text>
        <Text style={styles.warning}>Hubungi admin/petugas pendaftaran untuk menautkan akun kamu.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={resepList}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListEmptyComponent={
        <View style={styles.center} testID="pasien-resep-empty">
          <Ionicons name="document-text-outline" size={40} color="#888" />
          <Text style={styles.warningTitle}>Belum ada resep</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card} testID={`pasien-resep-card-${item.id}`}>
          <Text style={styles.dokterNama}>{dokterNames[item.dokterUid] ?? 'Dokter tidak ditemukan'}</Text>
          {item.items.map((it, i) => (
            <Text key={i} style={styles.itemText}>
              • {it.namaObat} — {it.dosis} ({it.jumlah})
            </Text>
          ))}
          {item.catatan ? <Text style={styles.catatan}>Catatan: {item.catatan}</Text> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8, marginTop: 40 },
  warningTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  warning: { textAlign: 'center', color: '#888', fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#eee', gap: 4 },
  dokterNama: { color: '#BE123C', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  itemText: { fontSize: 14, color: '#333' },
  catatan: { fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 6 },
});