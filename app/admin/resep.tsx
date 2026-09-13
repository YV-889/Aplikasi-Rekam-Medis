// Admin: lihat SEMUA resep dari semua dokter (read-only).
//
// PRINSIP HEMAT KUOTA (konsisten dengan admin/rekam_medis.tsx &
// admin/pemeriksaan.tsx):
// - getDocs sekali + useFocusEffect (bukan onSnapshot).
// - Nama pasien di-cache di memori (getDoc per NIK yang belum ada).
// - namaObat sudah DIDENORMALISASI di dalam field items[].namaObat
//   (lihat types/resep.ts) - jadi TIDAK perlu getDoc ke collection obat
//   sama sekali di halaman ini. Sangat hemat.
// - limit(50) per fetch.
// - Admin tidak perlu filter `dokterUid` di query (rules izinkan admin
//   baca semua - berbeda dengan pasien yang WAJIB where pasienNik).

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
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
import { SimpleSelect } from '@/components/SimpleSelect';
import type { DokterProfile } from '@/types/dokter';
import type { PasienProfile } from '@/types/pasien';
import type { Resep } from '@/types/resep';

const PAGE_SIZE = 50;

export default function ResepAdmin() {
  const [resepList, setResepList] = useState<Resep[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [dokterMap, setDokterMap] = useState<Record<string, DokterProfile>>({});
  const [filterDokterUid, setFilterDokterUid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pasienNameCache, setPasienNameCache] = useState<Record<string, string>>({});

  // dokterProfile: koleksi kecil, cukup 1x saat mount.
  useEffect(() => {
    async function loadDokter() {
      try {
        const snap = await getDocs(collection(db, 'dokterProfile'));
        const map: Record<string, DokterProfile> = {};
        snap.docs.forEach((d) => { map[d.id] = d.data() as DokterProfile; });
        setDokterMap(map);
      } catch (err) {
        console.error('Gagal memuat daftar dokter:', err);
      }
    }
    loadDokter();
  }, []);

  // Cache nama pasien per NIK (hanya fetch yang belum ada di cache).
  const fetchMissingPasienNames = useCallback((niks: string[]) => {
    setPasienNameCache((currentCache) => {
      const missing = Array.from(new Set(niks)).filter((nik) => !(nik in currentCache));
      if (missing.length === 0) return currentCache;
      (async () => {
        const entries = await Promise.all(
          missing.map(async (nik) => {
            try {
              const snap = await getDoc(doc(db, 'pasienProfile', nik));
              return [nik, snap.exists() ? (snap.data() as PasienProfile).nama : null] as const;
            } catch {
              return [nik, null] as const;
            }
          })
        );
        setPasienNameCache((prev) => {
          const next = { ...prev };
          entries.forEach(([nik, nama]) => { if (nama) next[nik] = nama; });
          return next;
        });
      })();
      return currentCache;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const q = filterDokterUid
        ? query(
            collection(db, 'resep'),
            where('dokterUid', '==', filterDokterUid),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE)
          )
        : query(collection(db, 'resep'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Resep, 'id'>) }));
      setResepList(list);
      fetchMissingPasienNames(list.map((r) => r.pasienNik));
    } catch (err) {
      console.error('Gagal memuat resep:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterDokterUid, fetchMissingPasienNames]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return resepList;
    return resepList.filter((r) =>
      r.pasienNik.includes(q) ||
      (pasienNameCache[r.pasienNik] ?? '').toLowerCase().includes(q) ||
      r.items.some((it) => it.namaObat.toLowerCase().includes(q))
    );
  }, [resepList, search, pasienNameCache]);

  const dokterOptions = Object.entries(dokterMap).map(([uid, d]) => ({
    label: `dr. ${d.nama} — ${d.poliNama ?? ''}`,
    value: uid,
  }));

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#f7f7f8' }}>
      {/* Filter & Search */}
      <View style={styles.filterRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari NIK, nama pasien, nama obat..."
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#aaa" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <SimpleSelect
          label="Filter Dokter"
          placeholder="Semua Dokter"
          options={dokterOptions}
          selectedValue={filterDokterUid}
          onSelect={(v) => setFilterDokterUid(filterDokterUid === v ? null : v)}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search || filterDokterUid ? 'Tidak ada hasil yang cocok.' : 'Belum ada data resep.'}
          </Text>
        }
        renderItem={({ item }) => {
          const expanded = expandedId === item.id;
          const dokter = dokterMap[item.dokterUid];
          const namaPasien = pasienNameCache[item.pasienNik];
          const tanggal = item.createdAt?.toDate
            ? item.createdAt.toDate().toLocaleDateString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric',
              })
            : '-';

          return (
            <Pressable
              style={styles.card}
              onPress={() => setExpandedId(expanded ? null : item.id)}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tanggal}>{tanggal}</Text>
                  <Text style={styles.namaPasien}>
                    {namaPasien ?? `NIK: ${item.pasienNik}`}
                  </Text>
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#888"
                />
              </View>

              {/* Ringkasan nama obat di kartu tertutup */}
              <Text style={styles.obatRingkas} numberOfLines={1}>
                {item.items.map((it) => it.namaObat).join(', ')}
              </Text>
              <Text style={styles.dokterLabel}>
                {dokter ? `dr. ${dokter.nama} · ${dokter.poliNama ?? ''}` : 'Dokter tidak ditemukan'}
              </Text>

              {expanded && (
                <View style={styles.detail}>
                  <Text style={styles.detailLabel}>NIK Pasien</Text>
                  <Text style={styles.detailText}>{item.pasienNik}</Text>

                  <Text style={styles.detailLabel}>Daftar Obat</Text>
                  {item.items.map((it, i) => (
                    <View key={i} style={styles.obatRow}>
                      <Ionicons name="ellipse" size={6} color="#6366f1" style={{ marginTop: 5 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.obatNama}>{it.namaObat}</Text>
                        <Text style={styles.obatDetail}>
                          {it.dosis} · Jumlah: {it.jumlah}
                        </Text>
                      </View>
                    </View>
                  ))}

                  {item.catatan ? (
                    <>
                      <Text style={styles.detailLabel}>Catatan</Text>
                      <Text style={styles.detailText}>{item.catatan}</Text>
                    </>
                  ) : null}
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  searchInput: { flex: 1, fontSize: 14 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  tanggal: { fontWeight: '700', color: '#111', fontSize: 14 },
  namaPasien: { color: '#333', fontSize: 14, marginTop: 2 },
  obatRingkas: { fontSize: 13, color: '#555', marginTop: 2 },
  dokterLabel: { fontSize: 12, color: '#6366f1', marginTop: 2 },
  detail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 2,
  },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#4338CA', marginTop: 6 },
  detailText: { fontSize: 13, color: '#333' },
  obatRow: { flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'flex-start' },
  obatNama: { fontSize: 13, fontWeight: '600', color: '#111' },
  obatDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
});