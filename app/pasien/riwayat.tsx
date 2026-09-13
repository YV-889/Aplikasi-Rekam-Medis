// Riwayat berobat milik pasien yang login (read-only, ringkasan saja).
//
// PRINSIP HEMAT KUOTA FIRESTORE:
// - TIDAK pakai onSnapshot: halaman ini tidak butuh update real-time.
//   Kunjungan baru terjadi jarang (paling sering harian, biasanya
//   mingguan/bulanan), jadi listener yang nyala terus cuma buang read.
// - Cache di AsyncStorage: pertama kali buka halaman ini setelah reload,
//   data langsung diambil dari cache lokal (0 read Firestore). Fetch ke
//   Firestore HANYA terjadi kalau (a) cache belum ada sama sekali, atau
//   (b) user manual tarik-untuk-refresh. TIDAK ada refetch otomatis pada
//   useFocusEffect - beda dengan halaman admin/dokter yang butuh selalu
//   segar.
// - limit(50): jaga-jaga supaya kalau riwayatnya sudah puluhan/ratusan
//   kunjungan, tidak sekaligus baca semuanya. 50 kunjungan terbaru sudah
//   sangat cukup untuk kebutuhan pasien.
// - Nama dokter di-JOIN via dokterProfile yang di-fetch SEKALI setelah
//   ada record, dan HANYA untuk uid dokter yang benar-benar muncul di
//   riwayat pasien ini (bukan getDocs semua dokter). Peta uid->nama juga
//   di-cache di AsyncStorage bareng recordnya, jadi kalau nama dokter
//   sama muncul di kunjungan-kunjungan berikutnya, tidak perlu getDoc lagi.
//
// RULES YANG DIPAKAI:
// - medicalRecords: `isPasien() && resource.data.pasienNik == myNik()`.
//   Karena itu query WAJIB include where('pasienNik','==',myNik) - tanpa
//   itu Firestore langsung tolak dengan permission-denied (bukan cuma
//   hasil kosong). NIK diambil dari AuthContext (users/{uid}.nik).
// - dokterProfile: allow read: if isSignedIn(), aman diakses pasien.
//
// SOFT-DELETE:
// Rekam medis yang di-soft-delete admin (punya field deletedAt) di-filter
// di client (rules Firestore tidak bisa membedakan berdasar field yang
// tidak selalu ada). Lihat penjelasan panjang di admin/rekam_medis.tsx.
//
// RINGKASAN SAJA (tanpa detail resep):
// Sesuai keputusan produk: kartu di halaman ini hanya menampilkan tanggal,
// diagnosa, dan nama dokter. Detail resep punya halaman sendiri (Resep
// Saya di /pasien/resep). Ini juga menghindari baca collection `resep`
// dari halaman riwayat - hemat kuota lagi.

import { useCallback, useEffect, useState } from 'react';
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
import type { MedicalRecord } from '@/types/medicalRecords';
import type { DokterProfile } from '@/types/dokter';

// Bentuk data yang disimpan di cache lokal (AsyncStorage).
// `fetchedAt` disimpan supaya kita bisa kasih tahu user kapan terakhir
// disegarkan - sekadar informasi, tidak dipakai untuk auto-refetch.
interface CacheShape {
  records: (MedicalRecord & { deletedAt?: any })[];
  dokterNames: Record<string, string>; // uid -> "dr. Nama — Poli"
  fetchedAt: number; // Date.now()
}

const PAGE_SIZE = 50;
const cacheKey = (uid: string) => `pasien_riwayat_cache_v1_${uid}`;

function formatFetchedAt(ts: number): string {
  const d = new Date(ts);
  // Format sederhana lokal, tidak butuh dependency date-fns.
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function RiwayatPasien() {
  const { user, profile } = useAuth();
  const nik = profile?.nik ?? null;

  const [records, setRecords] = useState<(MedicalRecord & { deletedAt?: any })[]>([]);
  const [dokterNames, setDokterNames] = useState<Record<string, string>>({});
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const [loading, setLoading] = useState(true); // first-paint (cek cache)
  const [refreshing, setRefreshing] = useState(false); // pull-to-refresh
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- Ambil nama dokter untuk uid yang belum ada di dokterNames -----------
  // getDoc satuan per uid (bukan getDocs seluruh dokterProfile) - hemat
  // dibanding baca semua dokter kalau jumlah dokter di sistem banyak.
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

  // --- Fetch data dari Firestore -------------------------------------------
  // Dipanggil hanya kalau (a) belum ada cache, atau (b) user pull-to-refresh.
  const fetchFromFirestore = useCallback(async () => {
    if (!user || !nik) return;
    try {
      const q = query(
        collection(db, 'medicalRecords'),
        where('pasienNik', '==', nik),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MedicalRecord, 'id'> & { deletedAt?: any }),
      }));

      // Ambil nama dokter untuk uid yang belum kita kenal. Gunakan dokterNames
      // saat ini sebagai starting cache supaya nama yang sudah pernah dimuat
      // (dari cache lokal atau fetch sebelumnya) tidak dibaca ulang.
      const uidsButuh = list.filter((r) => !r.deletedAt).map((r) => r.dokterUid);
      const nextDokterNames = await fetchMissingDokterNames(uidsButuh, dokterNames);

      const now = Date.now();
      setRecords(list);
      setDokterNames(nextDokterNames);
      setFetchedAt(now);

      // Simpan snapshot ke AsyncStorage untuk pemakaian berikutnya.
      // Kalau uid ada, aman. Kalau gagal simpan cache, tidak fatal -
      // data sudah tampil di UI.
      try {
        const cache: CacheShape = {
          records: list,
          dokterNames: nextDokterNames,
          fetchedAt: now,
        };
        await AsyncStorage.setItem(cacheKey(user.uid), JSON.stringify(cache));
      } catch (err) {
        console.warn('Gagal menyimpan cache riwayat:', err);
      }
    } catch (err: any) {
      console.error('Gagal memuat riwayat:', err);
      if (err?.code === 'failed-precondition') {
        showAlert(
          'Perlu index Firestore',
          'Query riwayat ini butuh composite index (pasienNik + createdAt) di collection medicalRecords yang belum dibuat. Buka DevTools Console untuk link pembuatan index otomatis dari Firebase, atau buat manual lewat Firebase Console → Firestore → Indexes.'
        );
      } else {
        showAlert('Gagal memuat riwayat', 'Tidak bisa memuat riwayat pemeriksaan. Coba refresh lagi.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, nik, dokterNames, fetchMissingDokterNames]);

  // --- First-paint: baca cache dulu, fetch cuma kalau cache kosong ---------
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!user || !nik) {
        // AuthContext masih loading atau user tidak punya NIK sama sekali.
        // profile.nik bisa null buat user role selain pasien - halaman ini
        // memang hanya untuk pasien; kalau kebetulan diakses tanpa NIK,
        // tampilkan empty state (bukan crash).
        setLoading(false);
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(cacheKey(user.uid));
        if (raw && !cancelled) {
          const parsed: CacheShape = JSON.parse(raw);
          setRecords(parsed.records ?? []);
          setDokterNames(parsed.dokterNames ?? {});
          setFetchedAt(parsed.fetchedAt ?? null);
          setLoading(false);
          return; // TIDAK fetch otomatis - hemat kuota, sesuai keputusan produk
        }
      } catch (err) {
        console.warn('Gagal membaca cache riwayat:', err);
      }
      if (cancelled) return;
      // Cache kosong -> fetch pertama kali
      await fetchFromFirestore();
    }
    boot();
    return () => {
      cancelled = true;
    };
    // Sengaja tidak masukkan fetchFromFirestore ke deps supaya boot tidak
    // dieksekusi berulang setiap kali fetch function di-recreate (identitasnya
    // berubah tiap render karena bergantung pada dokterNames state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, nik]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchFromFirestore();
  };

  // Filter soft-deleted + pencarian
  const searchTrimmed = search.trim().toLowerCase();
  const visibleRecords = records.filter((r) => !r.deletedAt);
  const filtered = searchTrimmed
    ? visibleRecords.filter((r) => {
        const namaDokter = (dokterNames[r.dokterUid] ?? '').toLowerCase();
        return (
          r.diagnosa.toLowerCase().includes(searchTrimmed) ||
          namaDokter.includes(searchTrimmed) ||
          r.tanggalPeriksa.includes(searchTrimmed)
        );
      })
    : visibleRecords;

  // --- Empty states khusus -------------------------------------------------
  // Pasien belum punya NIK di profile (misal profile masih loading atau
  // dokumen users belum lengkap). Tampilkan pesan bantu, jangan crash.
  if (!loading && !nik) {
    return (
      <View style={styles.centered} testID="pasien-riwayat-no-nik">
        <Ionicons name="alert-circle-outline" size={40} color="#888" />
        <Text style={styles.emptyTitle}>Data NIK belum tersedia</Text>
        <Text style={styles.emptyText}>
          Riwayat berobat ditautkan lewat NIK. Lengkapi profil di menu Profil terlebih dahulu.
        </Text>
      </View>
    );
  }

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} testID="pasien-riwayat-loading" />;
  }

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <Text style={styles.title} testID="pasien-riwayat-title">
        Riwayat Berobat
      </Text>
      <Text style={styles.note}>
        {fetchedAt
          ? `Terakhir disegarkan: ${formatFetchedAt(fetchedAt)}. `
          : ''}
        Tarik ke bawah untuk memuat data terbaru.
      </Text>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari tanggal, diagnosa, atau dokter..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
          testID="pasien-riwayat-search-input"
        />
      </View>
    </View>
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          // testID di RefreshControl tidak ter-render ke DOM di semua platform,
          // jadi test id utama untuk refresh flow ada di list & search.
        />
      }
      ListHeaderComponent={renderHeader()}
      ListEmptyComponent={
        <View style={styles.centered} testID="pasien-riwayat-empty">
          <Ionicons name="time-outline" size={40} color="#888" />
          <Text style={styles.emptyTitle}>Belum ada riwayat</Text>
          <Text style={styles.emptyText}>
            Riwayat pemeriksaan akan muncul di sini setelah dokter mencatat kunjungan Anda.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const expanded = expandedId === item.id;
        const dokterLabel = dokterNames[item.dokterUid] ?? 'Dokter tidak ditemukan';
        return (
          <Pressable
            style={styles.card}
            onPress={() => setExpandedId(expanded ? null : item.id)}
            testID={`pasien-riwayat-card-${item.id}`}>
            <View style={styles.cardHeader}>
              <View style={styles.tanggalBadge}>
                <Ionicons name="calendar-outline" size={14} color="#4338CA" />
                <Text style={styles.tanggalText}>{item.tanggalPeriksa}</Text>
              </View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#888" />
            </View>
            <Text style={styles.diagnosa}>{item.diagnosa}</Text>
            <View style={styles.dokterRow}>
              <Ionicons name="medkit-outline" size={13} color="#4338CA" />
              <Text style={styles.dokterNama} numberOfLines={1}>
                {dokterLabel}
              </Text>
            </View>

            {expanded && (
              <View style={styles.detail}>
                {/* Ringkasan saja: keluhan & tindakan opsional muncul,
                    detail resep sengaja TIDAK ditampilkan di sini
                    (ada di halaman Resep Saya - hemat 1x baca collection
                    resep tiap kartu dibuka). */}
                <Text style={styles.detailLabel}>Keluhan</Text>
                <Text style={styles.detailText}>{item.keluhan}</Text>

                {item.tindakan ? (
                  <>
                    <Text style={styles.detailLabel}>Tindakan</Text>
                    <Text style={styles.detailText}>{item.tindakan}</Text>
                  </>
                ) : null}
              </View>
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 32 },
  headerSection: { gap: 10, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  note: { color: '#666', fontSize: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    backgroundColor: '#fff',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#111' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tanggalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tanggalText: { color: '#4338CA', fontWeight: '700', fontSize: 13 },
  diagnosa: { color: '#111', fontSize: 15, fontWeight: '600', marginTop: 4 },
  dokterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dokterNama: { color: '#4338CA', fontSize: 12, flex: 1 },
  detail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 2,
  },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#4338CA', marginTop: 6 },
  detailText: { fontSize: 13, color: '#333' },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginTop: 6 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 18 },
});