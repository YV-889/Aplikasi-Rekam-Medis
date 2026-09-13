// Form resep, dibawa dari pemeriksaan.tsx lewat query param medicalRecordId + nik.
//
// SENGAJA pakai getDocs (baca SEKALI), bukan onSnapshot (dengerin terus),
// karena daftar obat & data pasien di sini cuma perlu dibaca pas form
// dibuka - tidak butuh update real-time selagi dokter lagi ngisi resep.
// Ini penting buat ngirit kuota Firestore (lihat kejadian bug infinite loop
// sebelumnya).

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
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import { SimpleSelect } from '@/components/SimpleSelect';
import { showAlert } from '@/utils/alert';
import type { Obat } from '@/types/obat';
import type { PasienProfile } from '@/types/pasien';
import type { ResepItem } from '@/types/resep';

interface DraftItem {
  key: string;
  obatId: string | null;
  dosis: string;
  jumlah: string;
}

function emptyDraftItem(): DraftItem {
  return { key: Math.random().toString(36).slice(2), obatId: null, dosis: '', jumlah: '1' };
}

export default function ResepDokter() {
  const router = useRouter();
  const { medicalRecordId, nik, returnTo } = useLocalSearchParams<{
  medicalRecordId: string;
  nik: string;
  returnTo?: string;
}>();
  const [pasien, setPasien] = useState<PasienProfile | null>(null);
  const [obatList, setObatList] = useState<Obat[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [items, setItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [catatan, setCatatan] = useState('');

  useEffect(() => {
    async function load() {
      if (!medicalRecordId || !nik) {
        showAlert('Data tidak lengkap', 'Kembali dan mulai lagi dari pemeriksaan pasien.');
        router.back();
        return;
      }
      try {
        // 1x baca dokumen pasien (bukan listener)
        const pasienSnap = await getDoc(doc(db, 'pasienProfile', nik));
        if (pasienSnap.exists()) setPasien(pasienSnap.data() as PasienProfile);

        // 1x baca seluruh daftar obat (bukan listener) - cukup sekali pas form dibuka
        const obatSnap = await getDocs(query(collection(db, 'obat'), orderBy('namaObat')));
        setObatList(obatSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Obat, 'id'>) })));
      } catch (err) {
        console.error('Gagal memuat data resep:', err);
        showAlert('Gagal memuat data', 'Coba lagi.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [medicalRecordId, nik, router]);

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const addItem = () => setItems((prev) => [...prev, emptyDraftItem()]);

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const handleSimpan = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      showAlert('Error', 'Sesi login tidak ditemukan, coba login ulang.');
      return;
    }

    const validItems: ResepItem[] = [];
    for (const it of items) {
      if (!it.obatId || !it.dosis.trim()) continue;
      const obat = obatList.find((o) => o.id === it.obatId);
      if (!obat) continue;
      validItems.push({
        obatId: obat.id,
        namaObat: obat.namaObat,
        dosis: it.dosis.trim(),
        jumlah: Number(it.jumlah) || 1,
      });
    }

    if (validItems.length === 0) {
      showAlert('Lengkapi form', 'Pilih minimal 1 obat dan isi dosisnya.');
      return;
    }

    setSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1) Baca stok TERKINI tiap obat (di dalam transaction, bukan pakai
        //    obatList yang di-cache pas form dibuka - supaya nggak kejadian
        //    "resep 2 dokter beda waktu, stok jadi minus" kalau stoknya udah
        //    berubah sejak form ini dibuka).
        const obatRefs = validItems.map((it) => doc(db, 'obat', it.obatId));
        const obatSnaps = await Promise.all(obatRefs.map((ref) => transaction.get(ref)));

        // 2) Validasi stok cukup SEBELUM nulis apa pun
        obatSnaps.forEach((snap, idx) => {
          const stokSekarang = (snap.data()?.stok as number | undefined) ?? 0;
          if (stokSekarang < validItems[idx].jumlah) {
            throw new StokKurangError(validItems[idx].namaObat, stokSekarang);
          }
        });

        // 3) Semua valid -> simpan resep DAN kurangi stok sekaligus (atomik)
        const resepRef = doc(collection(db, 'resep'));
        transaction.set(resepRef, {
          medicalRecordId,
          pasienNik: nik,
          dokterUid: uid,
          items: validItems,
          catatan: catatan.trim() || null,
          createdAt: serverTimestamp(),
        });

        obatSnaps.forEach((snap, idx) => {
          const stokSekarang = (snap.data()?.stok as number | undefined) ?? 0;
          transaction.update(obatRefs[idx], { stok: stokSekarang - validItems[idx].jumlah });
        });
      });

      showAlert('Resep tersimpan', 'Pemeriksaan & resep pasien ini sudah lengkap. Stok obat sudah otomatis dikurangi.');
      // Balik ke halaman asal (Riwayat Pasien kalau dari sana, Dashboard
      // kalau dari alur pemeriksaan baru) - supaya useFocusEffect di
      // halaman tujuan sempat jalan lagi dan resep baru langsung kelihatan.
      router.replace((returnTo || '/dokter/dashboard') as any);
    } catch (err) {
      console.error('Gagal menyimpan resep:', err);
      if (err instanceof StokKurangError) {
        showAlert('Stok tidak cukup', `Stok "${err.namaObat}" cuma tersisa ${err.stokSekarang}. Kurangi jumlah atau ganti obat.`);
      } else {
        showAlert('Gagal menyimpan', 'Coba lagi.');
      }
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
        <Text style={styles.pasienMeta}>NIK: {nik}</Text>
      </View>

      {obatList.length === 0 && (
        <Text style={styles.warning}>
          ⚠️ Belum ada data obat. Minta admin isi dulu lewat menu Data Obat.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Daftar Obat</Text>
      {items.map((item, idx) => (
        <View key={item.key} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemIndex}>Obat #{idx + 1}</Text>
            {items.length > 1 && (
              <Pressable onPress={() => removeItem(item.key)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </Pressable>
            )}
          </View>

          <SimpleSelect
            label="Pilih Obat"
            placeholder="Pilih obat"
            options={obatList.map((o) => ({ label: `${o.namaObat} (stok: ${o.stok})`, value: o.id }))}
            selectedValue={item.obatId}
            onSelect={(v) => updateItem(item.key, { obatId: v })}
          />
          <TextInput
            style={styles.input}
            placeholder="Dosis (mis. 3x1 tablet sehari)"
            placeholderTextColor="#999"
            value={item.dosis}
            onChangeText={(v) => updateItem(item.key, { dosis: v })}
          />
          <TextInput
            style={styles.input}
            placeholder="Jumlah"
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={item.jumlah}
            onChangeText={(v) => updateItem(item.key, { jumlah: v })}
          />
        </View>
      ))}

      <Pressable style={styles.addButton} onPress={addItem}>
        <Ionicons name="add" size={18} color="#2563eb" />
        <Text style={styles.addButtonText}>Tambah Obat</Text>
      </Pressable>

      <Text style={styles.label}>Catatan (opsional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={catatan}
        onChangeText={setCatatan}
        placeholder="Catatan tambahan untuk resep ini..."
        multiline
      />

      <Pressable
        style={[styles.button, submitting && { opacity: 0.6 }]}
        onPress={handleSimpan}
        disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? 'Menyimpan...' : 'Simpan Resep'}</Text>
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Error khusus supaya gampang dibedakan dari error Firestore biasa di catch block.
class StokKurangError extends Error {
  namaObat: string;
  stokSekarang: number;
  constructor(namaObat: string, stokSekarang: number) {
    super(`Stok ${namaObat} tidak cukup`);
    this.namaObat = namaObat;
    this.stokSekarang = stokSekarang;
  }
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  pasienCard: { backgroundColor: '#eaf1ff', borderRadius: 12, padding: 14, marginBottom: 4 },
  pasienNama: { fontSize: 17, fontWeight: '700', color: '#111' },
  pasienMeta: { fontSize: 13, color: '#555', marginTop: 2 },
  warning: { color: '#b45309', backgroundColor: '#fffbeb', padding: 10, borderRadius: 8, fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 4 },
  itemCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: '#fafafa',
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemIndex: { fontWeight: '600', color: '#333', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    padding: 10,
  },
  addButtonText: { color: '#2563eb', fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 4 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
