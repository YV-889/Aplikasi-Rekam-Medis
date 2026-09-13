// Form register ini KHUSUS untuk PASIEN. Sengaja tidak ada pilihan role,
// supaya orang tidak bisa asal klik "Dokter" dan dapat akses dashboard dokter.
// Akun dokter hanya bisa dibuat oleh admin lewat menu admin/dokter.tsx.
//
// NIK wajib diisi di sini karena dipakai untuk MENAUTKAN akun baru ke data
// medis yang mungkin sudah pernah diinput admin sebelumnya (skenario:
// pasien sudah pernah datang & diperiksa duluan, baru belakangan install
// app). Lihat penjelasan lengkap alurnya di types/pasien.ts.
//
// PENTING: pendaftaran akun TIDAK PERNAH membuat pasien bisa melihat rekam
// medis siapa pun secara otomatis. Menautkan NIK cuma mengisi field `uid`
// di pasienProfile miliknya sendiri (kalau ada) — rekam medis & resep tetap
// kosong sampai dokter/admin yang benar-benar input datanya.

import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import { showAlert } from '@/utils/alert';

export default function RegisterScreen() {
  const [nama, setNama] = useState('');
  const [nik, setNik] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    const nikTrimmed = nik.trim();

    if (!nama || !nikTrimmed || !email || !password) {
      showAlert('Error', 'Semua field wajib diisi');
      return;
    }
    if (nikTrimmed.length !== 16 || !/^\d+$/.test(nikTrimmed)) {
      showAlert('Error', 'NIK harus 16 digit angka');
      return;
    }
    if (password.length < 6) {
      showAlert('Error', 'Password minimal 6 karakter');
      return;
    }

    setLoading(true);
    let createdUid: string | null = null;

    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      createdUid = cred.user.uid;

      // 1) Dokumen akun umum (dipakai buat cek role & routing).
      //    nik ikut disimpan di sini (denormalisasi) supaya Firestore Rules
      //    bisa tau "NIK milik user yang lagi login ini apa" cukup dengan
      //    get(users/{uid}) - soalnya rules TIDAK BISA query
      //    "cari pasienProfile yang uid-nya = request.auth.uid", cuma bisa
      //    baca dokumen kalau tau path-nya persis. Makanya perlu dobel
      //    simpan NIK di sini.
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        nama,
        email: email.trim(),
        role: 'pasien', // hardcoded, tidak bisa dipilih user
        nik: nikTrimmed,
        createdAt: serverTimestamp(),
      });

      // 2) Tautkan/buat data medis untuk NIK ini. SENGAJA tidak membaca
      //    dokumennya dulu (getDoc) untuk cek "sudah ada atau belum" —
      //    kalau pasien diizinkan membaca data medis NIK siapa pun sebelum
      //    diklaim, itu celah privasi (orang bisa intip data medis orang
      //    lain cukup dengan tahu NIK-nya). Sebagai gantinya, langsung coba
      //    "klaim" (update), dan biarkan Firestore yang membedakan lewat
      //    jenis errornya:
      //    - 'not-found'        -> dokumen memang belum ada -> buat baru.
      //    - 'permission-denied'-> dokumen ada TAPI uid sudah diisi orang
      //                            lain (rules pasienProfile hanya izinkan
      //                            klaim kalau uid masih null) -> tolak.
      const pasienRef = doc(db, 'pasienProfile', nikTrimmed);
      try {
        await updateDoc(pasienRef, {
          uid: cred.user.uid,
          email: email.trim(),
          updatedAt: serverTimestamp(),
        });
      } catch (linkError: any) {
        if (linkError.code === 'not-found') {
          // NIK belum pernah ada -> buat dokumen baru, kosong (belum ada
          // data medis), menunggu dilengkapi admin di kunjungan berikutnya.
          await setDoc(pasienRef, {
            nik: nikTrimmed,
            uid: cred.user.uid,
            nama,
            email: email.trim(),
            profilLengkap: false,
            createdAt: serverTimestamp(),
            createdBy: cred.user.uid,
          });
        } else if (linkError.code === 'permission-denied') {
          throw new NikSudahDipakaiError();
        } else {
          throw linkError;
        }
      }
      // Redirect otomatis ditangani app/_layout.tsx begitu profile ke-load
    } catch (error: any) {
      // Rollback: kalau ada langkah yang gagal setelah akun Auth terlanjur
      // dibuat, hapus lagi supaya tidak jadi akun "hantu" tanpa data yang
      // konsisten (sama seperti pola rollback di admin/dokter.tsx).
      if (createdUid && auth.currentUser?.uid === createdUid) {
        await deleteDoc(doc(db, 'users', createdUid)).catch(() => {});
        await deleteUser(auth.currentUser).catch(() => {});
      }
      showAlert(
        'Registrasi gagal',
        error instanceof NikSudahDipakaiError
          ? 'NIK ini sudah terdaftar dan ditautkan ke akun lain. Kalau ini keliru, hubungi admin faskes.'
          : getErrorMessage(error.code)
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daftar Akun Pasien</Text>

      <TextInput
        style={styles.input}
        placeholder="Nama lengkap"
        placeholderTextColor="#999"
        value={nama}
        onChangeText={setNama}
      />
      <TextInput
        style={styles.input}
        placeholder="NIK (16 digit, sesuai KTP)"
        placeholderTextColor="#999"
        keyboardType="number-pad"
        maxLength={16}
        value={nik}
        onChangeText={setNik}
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
        placeholder="Password (min. 6 karakter)"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Text style={styles.note}>
        *NIK dipakai untuk menautkan akun ke data rekam medis kamu kalau kamu sudah pernah
        diperiksa di faskes ini sebelumnya. Kalau belum pernah, data medismu akan dilengkapi
        petugas saat kunjungan pertama.
      </Text>
      <Text style={styles.note}>
        *Pendaftaran ini khusus untuk pasien. Akun dokter dibuat oleh admin, dan akun admin
        dibuat manual oleh pengelola sistem — bukan lewat form ini.
      </Text>

      <Pressable style={styles.button} onPress={handleRegister} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Daftar</Text>}
      </Pressable>

      <Link href="/(auth)/login" style={styles.link}>
        Sudah punya akun? Masuk
      </Link>
    </View>
  );
}

// Error khusus supaya gampang dibedakan dari error Firebase biasa di catch block.
class NikSudahDipakaiError extends Error {}

function getErrorMessage(code: string) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Email sudah terdaftar';
    case 'auth/invalid-email':
      return 'Format email tidak valid';
    case 'auth/weak-password':
      return 'Password terlalu lemah';
    case 'permission-denied':
      return 'Ditolak oleh Firestore Rules. Pastikan firestore.rules sudah di-publish di Firebase Console.';
    default:
      return 'Terjadi kesalahan, coba lagi';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 24, textAlign: 'center', color: '#111' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  note: { fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 4 },
  button: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  link: { textAlign: 'center', color: '#2563eb', marginTop: 12 },
});