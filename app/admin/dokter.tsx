// Halaman ini satu-satunya cara membuat akun dokter di sistem.
// Menggunakan "secondary auth" (lihat config/firebase.ts) supaya sesi login
// admin tidak ikut ke-logout saat akun dokter baru dibuat.
//
// Tiap dokter WAJIB dipasangkan ke satu poli (sesuai data di Data Poli) dan
// diisi spesialisasinya, mirip pola rumah sakit sungguhan.

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
import { createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db, getSecondaryAuth } from '@/config/firebase';
import { showAlert } from '@/utils/alert';
import { SimpleSelect } from '@/components/SimpleSelect';
import type { Poli } from '@/types/poli';
import type { DokterProfile } from '@/types/dokter';

function generateTempPassword() {
  return Math.random().toString(36).slice(-8) + 'Aa1!';
}

export default function KelolaDokter() {
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [spesialisasi, setSpesialisasi] = useState('');
  const [poliId, setPoliId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [poliList, setPoliList] = useState<Poli[]>([]);
  const [dokterList, setDokterList] = useState<DokterProfile[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Ambil daftar poli buat opsi dropdown
  useEffect(() => {
    const q = query(collection(db, 'poli'), orderBy('namaPoli'));
    const unsub = onSnapshot(q, (snap) => {
      setPoliList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Poli, 'id'>) })));
    });
    return unsub;
  }, []);

  // Ambil daftar dokter yang sudah terdaftar
  useEffect(() => {
    const q = query(collection(db, 'dokterProfile'), orderBy('nama'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDokterList(snap.docs.map((d) => d.data() as DokterProfile));
        setLoadingList(false);
      },
      (err) => {
        console.error('Gagal memuat daftar dokter:', err);
        setLoadingList(false);
      }
    );
    return unsub;
  }, []);

  const handleAddDokter = async () => {
    if (!nama || !email || !spesialisasi || !poliId) {
      showAlert('Error', 'Nama, email, spesialisasi, dan poli wajib diisi');
      return;
    }

    const poli = poliList.find((p) => p.id === poliId);
    if (!poli) {
      showAlert('Error', 'Poli tidak ditemukan, coba pilih ulang');
      return;
    }

    setSubmitting(true);
    const tempPassword = generateTempPassword();

    try {
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), tempPassword);

      try {
        // 1) Dokumen umum di users (dipakai buat cek role & routing)
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          nama,
          email: email.trim(),
          role: 'dokter',
          createdAt: serverTimestamp(),
        });

        // 2) Dokumen khusus dokter (spesialisasi + poli)
        await setDoc(doc(db, 'dokterProfile', cred.user.uid), {
          uid: cred.user.uid,
          nama,
          email: email.trim(),
          spesialisasi,
          poliId: poli.id,
          poliNama: poli.namaPoli,
          createdAt: serverTimestamp(),
        });
      } catch (firestoreError) {
        // PENTING: kalau tulis ke Firestore gagal (misal rules belum publish),
        // hapus lagi akun Auth yang baru dibuat supaya tidak jadi "akun hantu"
        // (ada di Authentication tapi tidak ada datanya di Firestore).
        console.error('Gagal menulis data Firestore, membatalkan akun:', firestoreError);
        await deleteUser(cred.user).catch((e) =>
          console.error('Gagal rollback (hapus akun Auth):', e)
        );
        throw firestoreError;
      }

      await signOut(secondaryAuth);

      showAlert(
        'Akun dokter berhasil dibuat',
        `Email: ${email.trim()}\nPassword sementara: ${tempPassword}\n\nBagikan info ini ke dokter yang bersangkutan. Sarankan dia ganti password lewat menu "Lupa Password" setelah login pertama.`
      );

      setNama('');
      setEmail('');
      setSpesialisasi('');
      setPoliId(null);
    } catch (error: any) {
      console.error('Gagal membuat akun dokter:', error);
      showAlert('Gagal membuat akun', getErrorMessage(error.code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Tambah Akun Dokter</Text>

      {poliList.length === 0 && (
        <Text style={styles.warning}>
          ⚠️ Belum ada data Poli. Tambahkan dulu lewat menu &quot;Data Poli&quot; sebelum bikin akun dokter.
        </Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Nama dokter"
        placeholderTextColor="#999"
        value={nama}
        onChangeText={setNama}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Spesialisasi (mis. Spesialis Anak)"
        placeholderTextColor="#999"
        value={spesialisasi}
        onChangeText={setSpesialisasi}
      />
      <SimpleSelect
        label="Pilih Poli"
        placeholder="Pilih poli tempat praktik"
        options={poliList.map((p) => ({ label: p.namaPoli, value: p.id }))}
        selectedValue={poliId}
        onSelect={setPoliId}
      />

      <Pressable style={styles.button} onPress={handleAddDokter} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Buat Akun Dokter</Text>
        )}
      </Pressable>

      <Text style={styles.sectionTitle}>Daftar Dokter</Text>

      {loadingList ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : (
        <FlatList
          data={dokterList}
          keyExtractor={(item) => item.uid}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada dokter terdaftar.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardName}>{item.nama}</Text>
              <Text style={styles.cardSub}>{item.spesialisasi} • {item.poliNama}</Text>
              <Text style={styles.cardEmail}>{item.email}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function getErrorMessage(code: string) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Email sudah terdaftar';
    case 'auth/invalid-email':
      return 'Format email tidak valid';
    case 'permission-denied':
      return 'Ditolak oleh Firestore Rules. Pastikan firestore.rules sudah di-publish di Firebase Console.';
    default:
      return 'Terjadi kesalahan, coba lagi';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginTop: 12 },
  warning: { color: '#b45309', backgroundColor: '#fffbeb', padding: 10, borderRadius: 8, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  button: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 8, gap: 2 },
  cardName: { fontWeight: '600', color: '#111' },
  cardSub: { color: '#4338CA', fontSize: 13, fontWeight: '500' },
  cardEmail: { color: '#666', fontSize: 13 },
  empty: { color: '#888', textAlign: 'center', marginTop: 12 },
});

