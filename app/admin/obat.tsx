// CRUD data master Obat. Stok & harga disimpan di sini supaya nanti fitur
// Resep bisa "mengurangi stok" otomatis waktu obat diresepkan ke pasien.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '@/config/firebase';
import type { Obat } from '@/types/obat';
import { showAlert, showConfirm } from '@/utils/alert';

export default function KelolaObat() {
  const [namaObat, setNamaObat] = useState('');
  const [satuan, setSatuan] = useState('');
  const [stok, setStok] = useState('');
  const [harga, setHarga] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [obatList, setObatList] = useState<Obat[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'obat'), orderBy('namaObat'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setObatList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Obat, 'id'>) })));
        setLoadingList(false);
      },
      (err) => {
        console.error('Gagal memuat data obat:', err);
        setLoadingList(false);
      }
    );
    return unsub;
  }, []);

  const handleAdd = async () => {
    if (!namaObat.trim() || !satuan.trim()) {
      showAlert('Error', 'Nama obat dan satuan wajib diisi');
      return;
    }
    const stokNum = Number(stok) || 0;
    const hargaNum = Number(harga) || 0;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'obat'), {
        namaObat: namaObat.trim(),
        satuan: satuan.trim(),
        stok: stokNum,
        harga: hargaNum,
        deskripsi: deskripsi.trim(),
        createdAt: serverTimestamp(),
      });
      setNamaObat('');
      setSatuan('');
      setStok('');
      setHarga('');
      setDeskripsi('');
    } catch (err) {
      console.error('Gagal menambah data obat:', err);
      showAlert('Gagal', 'Tidak bisa menambah data obat');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string, nama: string) => {
    showConfirm('Hapus Obat', `Yakin hapus "${nama}"?`, async () => {
      try {
        await deleteDoc(doc(db, 'obat', id));
      } catch (err) {
        console.error('Gagal menghapus data obat:', err);
        showAlert('Gagal', 'Tidak bisa menghapus data obat');
      }
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Tambah Obat</Text>

      <TextInput
        style={styles.input}
        placeholder="Nama obat (mis. Paracetamol 500mg)"
        placeholderTextColor="#999"
        value={namaObat}
        onChangeText={setNamaObat}
      />
      <TextInput
        style={styles.input}
        placeholder="Satuan (mis. tablet, botol, kapsul)"
        placeholderTextColor="#999"
        value={satuan}
        onChangeText={setSatuan}
      />
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Stok"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={stok}
          onChangeText={setStok}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Harga (Rp)"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={harga}
          onChangeText={setHarga}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Deskripsi (opsional)"
        placeholderTextColor="#999"
        value={deskripsi}
        onChangeText={setDeskripsi}
      />

      <Pressable style={styles.button} onPress={handleAdd} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Tambah Obat</Text>}
      </Pressable>

      <Text style={styles.sectionTitle}>Daftar Obat</Text>

      {loadingList ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : (
        <FlatList
          data={obatList}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada data obat.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{item.namaObat}</Text>
                <Text style={styles.cardSub}>
                  Stok: {item.stok} {item.satuan} • Rp{item.harga.toLocaleString('id-ID')}
                </Text>
                {!!item.deskripsi && <Text style={styles.cardDesc}>{item.deskripsi}</Text>}
              </View>
              <Pressable onPress={() => handleDelete(item.id, item.namaObat)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#dc2626" />
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  button: { backgroundColor: '#4338CA', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  cardName: { fontWeight: '600', color: '#111' },
  cardSub: { color: '#4338CA', fontSize: 13, fontWeight: '500', marginTop: 2 },
  cardDesc: { color: '#666', fontSize: 13, marginTop: 2 },
  empty: { color: '#888', textAlign: 'center', marginTop: 12 },
});
