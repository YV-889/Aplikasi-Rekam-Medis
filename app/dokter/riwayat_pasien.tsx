// Riwayat pemeriksaan yang PERNAH dibuat dokter ini (read-only).
//
// SENGAJA pakai getDocs + tombol refresh manual, BUKAN onSnapshot -
// halaman riwayat tidak butuh live-update detik itu juga, jadi kita hemat
// baca Firestore dengan cuma fetch ulang kalau user benar-benar minta
// (pull-to-refresh / tombol refresh / halaman difokus ulang), bukan
// dengerin terus-menerus.
//
// Resep per pemeriksaan HANYA di-fetch untuk kartu yang sedang terbuka -
// bukan untuk semua kartu sekaligus - supaya tetap hemat kuota.
//
// PENTING: query ke collection `resep` WAJIB ikut filter dokterUid == uid,
// sama seperti alasan di pemeriksaan.tsx - rules resep cuma izinkan dokter
// baca dokumen miliknya sendiri (resource.data.dokterUid ==
// request.auth.uid), dan Firestore tidak bisa memverifikasi itu untuk
// query yang tidak ikut membatasi field yang sama - tanpa
// where('dokterUid', ...), SELURUH query ditolak permission-denied.

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import type { MedicalRecord } from '@/types/medicalRecords';
import type { Resep } from '@/types/resep';

interface RecordWithResep extends MedicalRecord {
  resepList?: Resep[];
  loadingResep?: boolean;
}

export default function RiwayatPasienDokter() {
  const router = useRouter();
  const [records, setRecords] = useState<RecordWithResep[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Ambil resep untuk SATU pemeriksaan tertentu (dipakai baik saat kartu
  // ditap pertama kali, maupun saat halaman ini difokus ulang sementara
  // kartu itu masih dalam keadaan terbuka - lihat load() di bawah).
  const fetchResepUntuk = useCallback(async (recordId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setRecords((prev) =>
      prev.map((r) => (r.id === recordId ? { ...r, loadingResep: true } : r))
    );
    try {
      const resepSnap = await getDocs(
        query(
          collection(db, 'resep'),
          where('medicalRecordId', '==', recordId),
          where('dokterUid', '==', uid)
        )
      );
      const resepList = resepSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Resep, 'id'>) }));
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, resepList, loadingResep: false } : r))
      );
    } catch (err) {
      console.error('Gagal memuat resep:', err);
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, loadingResep: false } : r))
      );
    }
  }, []);

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      // limit(50) - jaga-jaga supaya kalau riwayatnya udah banyak,
      // tidak sekaligus baca ribuan dokumen dalam 1x buka halaman.
      const q = query(
        collection(db, 'medicalRecords'),
        where('dokterUid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snap = await getDocs(q);
      setRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MedicalRecord, 'id'>) })));

      // Kalau ada kartu yang sedang terbuka (misal dokter baru saja balik
      // dari halaman "Beri Resep"), ambil ulang resepnya juga - satu query
      // saja, hanya untuk kartu itu. Kartu lain yang tertutup TIDAK ikut
      // di-fetch, tetap hemat.
      setExpandedId((currentExpandedId) => {
        if (currentExpandedId) fetchResepUntuk(currentExpandedId);
        return currentExpandedId;
      });
    } catch (err) {
      console.error('Gagal memuat riwayat pemeriksaan:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchResepUntuk]);

  // Muat ulang tiap kali halaman ini di-fokus (misal habis nambah pemeriksaan
  // baru lalu balik ke sini) - tetap 1x baca per kunjungan, bukan listener.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggleExpand = (record: RecordWithResep) => {
    if (expandedId === record.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(record.id);
    if (record.resepList) return; // udah pernah di-fetch, jangan baca ulang
    fetchResepUntuk(record.id);
  };

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListEmptyComponent={<Text style={styles.empty}>Belum ada riwayat pemeriksaan.</Text>}
      renderItem={({ item }) => {
        const expanded = expandedId === item.id;
        return (
          <Pressable style={styles.card} onPress={() => toggleExpand(item)}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tanggal}>{item.tanggalPeriksa}</Text>
                <Text style={styles.nik}>NIK: {item.pasienNik}</Text>
              </View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#888" />
            </View>
            <Text style={styles.diagnosa}>Diagnosa: {item.diagnosa}</Text>

            {expanded && (
              <View style={styles.detail}>
                <Text style={styles.detailLabel}>Keluhan</Text>
                <Text style={styles.detailText}>{item.keluhan}</Text>

                {item.tindakan ? (
                  <>
                    <Text style={styles.detailLabel}>Tindakan</Text>
                    <Text style={styles.detailText}>{item.tindakan}</Text>
                  </>
                ) : null}

                <Text style={styles.detailLabel}>Resep</Text>
                {item.loadingResep ? (
                  <ActivityIndicator style={{ marginTop: 6 }} />
                ) : item.resepList && item.resepList.length > 0 ? (
                  item.resepList.map((r) => (
                    <View key={r.id} style={{ marginTop: 4 }}>
                      {r.items.map((it, i) => (
                        <Text key={i} style={styles.detailText}>
                          • {it.namaObat} — {it.dosis} ({it.jumlah})
                        </Text>
                      ))}
                    </View>
                  ))
                ) : (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.detailTextMuted}>Belum ada resep untuk pemeriksaan ini.</Text>
                    <Pressable
                      style={styles.resepButton}
                      onPress={() =>
                        router.push({
                          pathname: '/dokter/resep',
                          params: {
                            medicalRecordId: item.id,
                            nik: item.pasienNik,
                            returnTo: '/dokter/riwayat_pasien',
                          },
                        })
                      }>
                      <Ionicons name="add-circle-outline" size={16} color="#2563eb" />
                      <Text style={styles.resepButtonText}>Beri Resep</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  tanggal: { fontWeight: '700', color: '#111', fontSize: 15 },
  nik: { color: '#666', fontSize: 12, marginTop: 2 },
  diagnosa: { color: '#333', fontSize: 14, marginTop: 4 },
  detail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 2,
  },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#4338CA', marginTop: 6 },
  detailText: { fontSize: 13, color: '#333' },
  detailTextMuted: { fontSize: 13, color: '#999', fontStyle: 'italic' },
  resepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  resepButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
}); 