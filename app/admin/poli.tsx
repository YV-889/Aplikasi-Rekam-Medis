// CRUD data master Poli. Ini harus diisi DULU sebelum bikin akun dokter,
// karena tiap dokter nanti wajib dipasangkan ke salah satu poli di sini.

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
import type { Poli } from '@/types/poli';
import { showAlert, showConfirm } from '@/utils/alert';

export default function KelolaPoli() {
  const [namaPoli, setNamaPoli] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [poliList, setPoliList] = useState<Poli[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'poli'), orderBy('namaPoli'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPoliList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Poli, 'id'>) })));
        setLoadingList(false);
      },
      (err) => {
        console.error('Gagal memuat data poli:', err);
        setLoadingList(false);
      }
    );
    return unsub;
  }, []);

  const handleAdd = async () => {
    if (!namaPoli.trim()) {
      showAlert('Error', 'Nama poli wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'poli'), {
        namaPoli: namaPoli.trim(),
        deskripsi: deskripsi.trim(),
        createdAt: serverTimestamp(),
      });
      setNamaPoli('');
      setDeskripsi('');
    } catch (err) {
      console.error('Gagal menambah data poli:', err);
      showAlert('Gagal', 'Tidak bisa menambah data poli');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string, nama: string) => {
    showConfirm('Hapus Poli', `Yakin hapus "${nama}"?`, async () => {
      try {
        await deleteDoc(doc(db, 'poli', id));
      } catch (err) {
        console.error('Gagal menghapus data poli:', err);
        showAlert('Gagal', 'Tidak bisa menghapus data poli');
      }
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Tambah Poli</Text>
      <TextInput
        style={styles.input}
        placeholder="Nama poli (mis. Poli Anak)"
        placeholderTextColor="#999"
        value={namaPoli}
        onChangeText={setNamaPoli}
      />
      <TextInput
        style={styles.input}
        placeholder="Deskripsi (opsional)"
        placeholderTextColor="#999"
        value={deskripsi}
        onChangeText={setDeskripsi}
      />
      <Pressable style={styles.button} onPress={handleAdd} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Tambah Poli</Text>}
      </Pressable>

      <Text style={styles.sectionTitle}>Daftar Poli</Text>
      {loadingList ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : (
        <FlatList
          data={poliList}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada data poli.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{item.namaPoli}</Text>
                {!!item.deskripsi && <Text style={styles.cardDesc}>{item.deskripsi}</Text>}
              </View>
              <Pressable onPress={() => handleDelete(item.id, item.namaPoli)} hitSlop={8}>
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
  cardDesc: { color: '#666', fontSize: 13 },
  empty: { color: '#888', textAlign: 'center', marginTop: 12 },
});
