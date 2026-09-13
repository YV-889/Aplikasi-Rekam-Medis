// Admin: lihat SEMUA rekam medis lintas dokter (read-only + SOFT DELETE).
//
// Beda dengan dokter/riwayat_pasien.tsx yang cuma menampilkan rekam medis
// milik dokter yang login sendiri (wajib difilter where('dokterUid','==',uid)
// karena rules), admin BOLEH baca semua dokumen medicalRecords tanpa filter
// kepemilikan - lihat firestore.rules: match /medicalRecords -> allow read:
// if isAdmin() (tanpa syarat tambahan). Makanya query dasar di sini tidak
// perlu where('dokterUid', ...) kecuali admin sengaja pilih filter dokter.
//
// KENAPA TIDAK PAKAI onSnapshot (soal kuota Firestore):
// medicalRecords berpotensi jadi collection PALING BESAR di app ini - satu
// dokumen per kunjungan, dari SEMUA dokter, terus bertambah tiap hari.
// Listener real-time akan tetap nyala & ke-charge read selama halaman ini
// terbuka. Jadi dipakai pola yang sama seperti riwayat_pasien.tsx: getDocs
// sekali + limit(50) + pull-to-refresh + refetch saat halaman difokus ulang
// (useFocusEffect) - bukan listener yang nyala terus-menerus.
//
// KENAPA SOFT DELETE (bukan deleteDoc biasa):
// Rekam medis TIDAK BOLEH dihapus permanen - itu prinsip etika & hukum
// pelayanan medis (harus ada rekam jejak yang bisa diaudit). Jadi "hapus"
// di sini sebenarnya UPDATE yang menambahkan field deletedAt, deletedBy,
// dan deleteReason. Dokumen tetap ada di Firestore, tapi kita filter di
// client supaya tidak muncul di list. Ini juga alasan resep TIDAK ikut
// disentuh: rekam medisnya sendiri masih ada (cuma disembunyikan), jadi
// tautan resep -> medicalRecordId tetap valid dan tidak jadi "yatim".
//
// FILTER DI CLIENT (bukan where('deletedAt', '==', null)):
// Firestore memperlakukan "field tidak ada" berbeda dari "field == null".
// Query where('deletedAt','==',null) HANYA cocok kalau field-nya benar-
// benar ada dan bernilai null - dokumen lama yang belum pernah disentuh
// soft-delete TIDAK punya field itu sama sekali, jadi akan hilang dari
// hasil query. Karena kita cuma ambil 50 dokumen sekali muat, filter di
// client aman dari sisi kuota (yang mahal adalah baca dari Firestore,
// bukan filter di memori).
//
// JOIN NAMA DOKTER & PASIEN (tanpa baca collection besar sekaligus):
// - Nama dokter: dokterProfile sudah menyimpan nama+poliNama (denormalisasi,
//   lihat types/dokter.ts). Collection ini kecil (jumlah dokter, bukan
//   jumlah kunjungan), jadi aman di-getDocs SEKALI lalu dipetakan uid->nama
//   di memori, tidak perlu getDoc per rekam medis.
// - Nama pasien: medicalRecords cuma simpan pasienNik (TIDAK didenormalisasi
//   di sini), dan pasienProfile bisa jadi collection besar - jadi TIDAK
//   diambil semuanya sekaligus. Sebagai gantinya, nama pasien di-fetch per
//   NIK UNIK yang benar-benar muncul di 50 rekam medis yang sedang
//   ditampilkan, hasilnya di-cache di state supaya NIK yang sama tidak
//   dibaca ulang lagi waktu refresh berikutnya.
//
// CATATAN INDEX: query dengan filter dokter (where('dokterUid','==',...) +
// orderBy('createdAt','desc')) pakai kombinasi field YANG SAMA PERSIS dengan
// query di dokter/riwayat_pasien.tsx, jadi composite index-nya (kalau sudah
// dibuat untuk halaman itu) otomatis kepakai juga di sini - tidak perlu
// bikin index baru. Kalau belum pernah dibuat, Firestore akan kasih error
// sekali di console berisi link langsung untuk generate index-nya.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import { SimpleSelect } from '@/components/SimpleSelect';
import { showAlert } from '@/utils/alert';
import type { MedicalRecord } from '@/types/medicalRecords';
import type { DokterProfile } from '@/types/dokter';
import type { PasienProfile } from '@/types/pasien';

// Field tambahan hasil soft-delete. Tidak diubah di types/medicalRecords.ts
// supaya schema utamanya tetap merefleksikan "bentuk dokumen normal";
// field ini secara eksplisit adalah metadata audit, bukan data medis.
type SoftDeleteFields = {
  deletedAt?: any;
  deletedBy?: string;
  deleteReason?: string;
};

type MedicalRecordWithMeta = MedicalRecord & SoftDeleteFields;

const PAGE_SIZE = 50;

export default function RekamMedisAdmin() {
  const [records, setRecords] = useState<MedicalRecordWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [dokterMap, setDokterMap] = useState<Record<string, DokterProfile>>({});
  const [filterDokterUid, setFilterDokterUid] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // nik -> nama pasien, di-cache di memori (lihat penjelasan di atas).
  const [pasienNameCache, setPasienNameCache] = useState<Record<string, string>>({});

  // State untuk modal alasan penghapusan (soft-delete WAJIB pakai alasan
  // sebagai jejak audit - lihat penjelasan di komentar file).
  const [deleteTarget, setDeleteTarget] = useState<MedicalRecordWithMeta | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Daftar dokter buat filter dropdown & mapping nama - collection kecil,
  // cukup 1x getDocs saat halaman dibuka, tidak perlu listener.
  useEffect(() => {
    async function loadDokter() {
      try {
        const snap = await getDocs(collection(db, 'dokterProfile'));
        const map: Record<string, DokterProfile> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as DokterProfile;
        });
        setDokterMap(map);
      } catch (err) {
        console.error('Gagal memuat daftar dokter:', err);
      }
    }
    loadDokter();
  }, []);

  // Ambil nama pasien HANYA untuk NIK yang belum ada di cache.
  const fetchMissingPasienNames = useCallback((niks: string[]) => {
    setPasienNameCache((currentCache) => {
      const missing = Array.from(new Set(niks)).filter((nik) => !(nik in currentCache));
      if (missing.length === 0) return currentCache;

      // getDoc satuan per NIK (bukan query 'in') supaya tidak kena limit
      // 30 nilai per query 'in' kalau suatu saat PAGE_SIZE diperbesar.
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
          entries.forEach(([nik, nama]) => {
            if (nama) next[nik] = nama;
          });
          return next;
        });
      })();

      return currentCache; // belum berubah sampai promise di atas selesai
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const q = filterDokterUid
        ? query(
            collection(db, 'medicalRecords'),
            where('dokterUid', '==', filterDokterUid),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE)
          )
        : query(collection(db, 'medicalRecords'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MedicalRecordWithMeta, 'id'>),
      }));
      setRecords(list);
      // Cukup fetch nama pasien untuk record yang benar-benar terlihat
      // (yang belum soft-deleted) - hemat baca pasienProfile.
      fetchMissingPasienNames(list.filter((r) => !r.deletedAt).map((r) => r.pasienNik));
    } catch (err) {
      console.error('Gagal memuat rekam medis:', err);
      showAlert(
        'Gagal memuat data',
        'Coba lagi. Kalau ini pertama kali filter dokter dipakai, cek console log browser - mungkin Firestore minta index baru (ada link buat generate otomatis).'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterDokterUid, fetchMissingPasienNames]);

  // Muat ulang tiap kali halaman difokus (termasuk saat filter dokter
  // berubah, karena itu ganti identitas `load`) - tetap 1x baca per
  // kunjungan/perubahan filter, bukan listener yang terus nyala.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  // ---- SOFT DELETE FLOW ----------------------------------------------------
  // Buka modal alasan penghapusan. Alasan wajib diisi (min. 3 char) supaya
  // jejak audit tidak kosong. Field yang ditulis:
  //   deletedAt    : serverTimestamp() - waktu resmi dari server, bukan HP
  //   deletedBy    : uid admin yang menghapus
  //   deleteReason : alasan (bebas, tapi wajib ada)
  // NB: kita pakai updateDoc, BUKAN deleteDoc, sehingga rules yang berlaku
  // adalah `allow update: if isAdmin() || isDokter();`. Rules `allow delete`
  // untuk medicalRecords sebaiknya nanti disempitkan hanya untuk keperluan
  // hard-delete darurat oleh admin - lihat firestore.rules.
  const openDeleteModal = (record: MedicalRecordWithMeta) => {
    setDeleteTarget(record);
    setDeleteReason('');
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
    setDeleteReason('');
  };

  const confirmSoftDelete = async () => {
    if (!deleteTarget) return;
    const reason = deleteReason.trim();
    if (reason.length < 3) {
      showAlert('Alasan wajib diisi', 'Isi alasan penghapusan minimal 3 karakter untuk jejak audit.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      showAlert('Sesi kadaluarsa', 'Silakan login ulang.');
      return;
    }
    setDeletingId(deleteTarget.id);
    try {
      await updateDoc(doc(db, 'medicalRecords', deleteTarget.id), {
        deletedAt: serverTimestamp(),
        deletedBy: uid,
        deleteReason: reason,
      });
      // Sembunyikan dari list lokal tanpa refetch - hemat 1x baca collection.
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      if (expandedId === deleteTarget.id) setExpandedId(null);
      setDeleteTarget(null);
      setDeleteReason('');
    } catch (err) {
      console.error('Gagal menghapus (soft-delete) rekam medis:', err);
      showAlert('Gagal menghapus', 'Coba lagi.');
    } finally {
      setDeletingId(null);
    }
  };
  // --------------------------------------------------------------------------

  const dokterOptions = Object.entries(dokterMap).map(([uid, d]) => ({
    label: `${d.nama} — ${d.poliNama}`,
    value: uid,
  }));

  const searchTrimmed = search.trim().toLowerCase();
  // Filter DOUBLE: (1) hilangkan record yang sudah soft-deleted,
  // (2) baru terapkan filter pencarian bila ada.
  const visibleRecords = records.filter((r) => !r.deletedAt);
  const filtered = searchTrimmed
    ? visibleRecords.filter((r) => {
        const nama = pasienNameCache[r.pasienNik]?.toLowerCase() ?? '';
        return (
          r.pasienNik.includes(searchTrimmed) ||
          nama.includes(searchTrimmed) ||
          r.diagnosa.toLowerCase().includes(searchTrimmed)
        );
      })
    : visibleRecords;

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <Text style={styles.title} testID="admin-rekam-medis-title">Rekam Medis (Semua Dokter)</Text>
      <Text style={styles.note}>
        Menampilkan {PAGE_SIZE} rekam medis terbaru{filterDokterUid ? ' dari dokter terpilih' : ''}.
        Rekam medis yang dihapus tetap tersimpan (soft-delete) tapi tidak muncul di list. Tarik ke bawah untuk muat ulang.
      </Text>

      <SimpleSelect
        label="Filter Dokter"
        placeholder="Semua dokter"
        options={dokterOptions}
        selectedValue={filterDokterUid}
        onSelect={(v) => setFilterDokterUid(v === filterDokterUid ? null : v)}
      />
      {filterDokterUid && (
        <Pressable
          onPress={() => setFilterDokterUid(null)}
          testID="admin-rekam-medis-clear-filter">
          <Text style={styles.clearFilter}>✕ Hapus filter dokter</Text>
        </Pressable>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari NIK, nama pasien, atau diagnosa..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
          testID="admin-rekam-medis-search-input"
        />
      </View>
    </View>
  );

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }

  return (
    <>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada rekam medis.</Text>}
        renderItem={({ item }) => {
          const expanded = expandedId === item.id;
          const dokter = dokterMap[item.dokterUid];
          const namaPasien = pasienNameCache[item.pasienNik];
          return (
            <Pressable
              style={styles.card}
              onPress={() => setExpandedId(expanded ? null : item.id)}
              testID={`admin-rekam-medis-card-${item.id}`}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tanggal}>{item.tanggalPeriksa}</Text>
                  <Text style={styles.pasienNama}>{namaPasien ?? `NIK: ${item.pasienNik}`}</Text>
                  <Text style={styles.dokterNama}>
                    {dokter ? `dr. ${dokter.nama} — ${dokter.poliNama}` : 'Dokter tidak ditemukan'}
                  </Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#888" />
              </View>
              <Text style={styles.diagnosa}>Diagnosa: {item.diagnosa}</Text>

              {expanded && (
                <View style={styles.detail}>
                  <Text style={styles.detailLabel}>NIK</Text>
                  <Text style={styles.detailText}>{item.pasienNik}</Text>

                  <Text style={styles.detailLabel}>Keluhan</Text>
                  <Text style={styles.detailText}>{item.keluhan}</Text>

                  {item.tindakan ? (
                    <>
                      <Text style={styles.detailLabel}>Tindakan</Text>
                      <Text style={styles.detailText}>{item.tindakan}</Text>
                    </>
                  ) : null}

                  {item.catatan ? (
                    <>
                      <Text style={styles.detailLabel}>Catatan</Text>
                      <Text style={styles.detailText}>{item.catatan}</Text>
                    </>
                  ) : null}

                  <Pressable
                    style={styles.deleteButton}
                    disabled={deletingId === item.id}
                    onPress={() => openDeleteModal(item)}
                    testID={`admin-rekam-medis-delete-${item.id}`}>
                    {deletingId === item.id ? (
                      <ActivityIndicator size="small" color="#dc2626" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={16} color="#dc2626" />
                        <Text style={styles.deleteButtonText}>Hapus Rekam Medis</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}
            </Pressable>
          );
        }}
      />

      {/* Modal alasan soft-delete. Dipakai gaya Modal bawaan RN (bukan
          BottomSheet library) supaya tidak nambah dependency, dan sudah
          cukup untuk kebutuhan input singkat + tombol konfirmasi. */}
      <Modal
        visible={deleteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={cancelDelete}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="admin-rekam-medis-delete-modal">
            <Text style={styles.modalTitle}>Hapus Rekam Medis?</Text>
            <Text style={styles.modalText}>
              Rekam medis {deleteTarget?.tanggalPeriksa} (NIK {deleteTarget?.pasienNik}) akan
              di-arsipkan (soft-delete). Data tetap tersimpan di sistem sebagai jejak audit dan
              tidak lagi tampil di list. Resep yang tertaut TIDAK ikut disentuh.
            </Text>
            <Text style={styles.modalLabel}>Alasan penghapusan (wajib)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Contoh: salah input pasien, duplikasi entri, dst."
              placeholderTextColor="#999"
              value={deleteReason}
              onChangeText={setDeleteReason}
              multiline
              testID="admin-rekam-medis-delete-reason-input"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={cancelDelete}
                disabled={deletingId !== null}
                testID="admin-rekam-medis-delete-cancel">
                <Text style={styles.modalBtnGhostText}>Batal</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalBtn,
                  styles.modalBtnDanger,
                  deletingId !== null && { opacity: 0.6 },
                ]}
                onPress={confirmSoftDelete}
                disabled={deletingId !== null}
                testID="admin-rekam-medis-delete-confirm">
                {deletingId !== null ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnDangerText}>Hapus (Arsipkan)</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  headerSection: { gap: 10, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  note: { color: '#666', fontSize: 13 },
  clearFilter: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#111' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  tanggal: { fontWeight: '700', color: '#111', fontSize: 15 },
  pasienNama: { color: '#333', fontSize: 13, marginTop: 2, fontWeight: '600' },
  dokterNama: { color: '#4338CA', fontSize: 12, marginTop: 2 },
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
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  deleteButtonText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },

  // Modal alasan soft-delete
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    gap: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  modalText: { fontSize: 13, color: '#555', lineHeight: 18 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#4338CA', marginTop: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 60,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#111',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  modalBtnGhost: { borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff' },
  modalBtnGhostText: { color: '#333', fontWeight: '600', fontSize: 14 },
  modalBtnDanger: { backgroundColor: '#dc2626' },
  modalBtnDangerText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
