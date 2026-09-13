// Kelola data medis pasien, di-index BY NIK (bukan uid) - lihat
// types/pasien.ts untuk penjelasan lengkap kenapa.
//
// Dua skenario yang ditangani di halaman ini:
// 1) WALK-IN: pasien datang periksa TAPI BELUM PUNYA akun di app. Admin
//    input NIK + data medis langsung di sini, uid otomatis kosong (null)
//    sampai pasien itu suatu saat register & "klaim" NIK-nya sendiri.
// 2) SUDAH PUNYA AKUN: pasien sudah register duluan (NIK otomatis
//    tertaut ke uid-nya). Admin tinggal cari by NIK/nama untuk melengkapi
//    atau memperbarui data medisnya.
//
// Admin TIDAK PERNAH membuat akun login pasien dari sini — itu cuma bisa
// lewat pasien sendiri di app/(auth)/register.tsx.

import { useEffect, useMemo, useState } from 'react';
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
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import { SimpleSelect } from '@/components/SimpleSelect';
import { showAlert } from '@/utils/alert';
import type { PasienProfile } from '@/types/pasien';

const emptyForm = {
  nik: '',
  nama: '',
  tanggalLahir: '',
  jenisKelamin: null as string | null,
  golonganDarah: null as string | null,
  alamat: '',
  noTelepon: '',
  alergi: '',
};

export default function KelolaPasien() {
  const [pasienList, setPasienList] = useState<PasienProfile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [editingExisting, setEditingExisting] = useState<PasienProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'pasienProfile'), orderBy('nama'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPasienList(snap.docs.map((d) => d.data() as PasienProfile));
        setLoadingList(false);
      },
      (err) => {
        console.error('Gagal memuat daftar pasien:', err);
        setLoadingList(false);
      }
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pasienList;
    return pasienList.filter(
      (p) => p.nama.toLowerCase().includes(q) || p.nik.includes(q)
    );
  }, [pasienList, search]);

  const handlePickExisting = (p: PasienProfile) => {
    setEditingExisting(p);
    setForm({
      nik: p.nik,
      nama: p.nama,
      tanggalLahir: p.tanggalLahir ?? '',
      jenisKelamin: p.jenisKelamin ?? null,
      golonganDarah: p.golonganDarah ?? null,
      alamat: p.alamat ?? '',
      noTelepon: p.noTelepon ?? '',
      alergi: p.alergi ?? '',
    });
  };

  const handleReset = () => {
    setEditingExisting(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    const nikTrimmed = form.nik.trim();
    if (nikTrimmed.length !== 16 || !/^\d+$/.test(nikTrimmed)) {
      showAlert('Error', 'NIK harus 16 digit angka');
      return;
    }
    if (!form.nama.trim()) {
      showAlert('Error', 'Nama wajib diisi');
      return;
    }

    // Kalau lagi nambah pasien BARU (bukan edit dari list) tapi NIK-nya
    // ternyata sudah ada di data, cegah supaya tidak tertimpa tanpa sadar.
    if (!editingExisting && pasienList.some((p) => p.nik === nikTrimmed)) {
      showAlert(
        'NIK sudah ada',
        'NIK ini sudah terdaftar di sistem. Cari di daftar pasien lalu tap untuk mengedit, jangan tambah baru.'
      );
      return;
    }

    const profilLengkap = !!(
      form.tanggalLahir &&
      form.jenisKelamin &&
      form.alamat
    );

    setSubmitting(true);
    try {
      await setDoc(
        doc(db, 'pasienProfile', nikTrimmed),
        {
          nik: nikTrimmed,
          // uid TIDAK disentuh di sini sama sekali. Kalau dokumen belum ada,
          // biarkan null (walk-in, menunggu pasien klaim). Kalau sudah ada
          // (sedang edit), uid & email lama otomatis dipertahankan karena
          // pakai merge:true.
          uid: editingExisting?.uid ?? null,
          nama: form.nama.trim(),
          // PENTING: Firestore SDK menolak field bernilai `undefined`
          // (beda dengan `null`, yang valid) - error-nya terjadi di device
          // sendiri sebelum request dikirim, jadi tidak akan pernah kena
          // rules. Makanya semua field opsional di sini di-fallback ke
          // `null`, bukan `undefined`.
          email: editingExisting?.email ?? null,
          tanggalLahir: form.tanggalLahir.trim(),
          jenisKelamin: form.jenisKelamin ?? null,
          golonganDarah: form.golonganDarah ?? null,
          alamat: form.alamat.trim(),
          noTelepon: form.noTelepon.trim(),
          alergi: form.alergi.trim(),
          profilLengkap,
          createdAt: editingExisting?.createdAt ?? serverTimestamp(),
          createdBy: editingExisting?.createdBy ?? auth.currentUser?.uid ?? null,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid ?? null,
        },
        { merge: true }
      );
      showAlert('Tersimpan', 'Data medis pasien berhasil disimpan');
      handleReset();
    } catch (err) {
      console.error('Gagal menyimpan data medis pasien:', err);
      showAlert('Gagal', 'Tidak bisa menyimpan data medis pasien');
    } finally {
      setSubmitting(false);
    }
  };

  // PENTING (fix bug tidak bisa scroll): sebelumnya form input + search box +
  // FlatList ditaruh sebagai anak-anak biasa dari satu <View style={{flex:1}}>
  // TANPA ScrollView. FlatList sebenarnya scrollable sendiri, tapi karena dia
  // cuma salah satu "anak" di antara elemen lain (bukan container utama),
  // begitu konten form di atasnya lebih tinggi dari layar, sisanya (search
  // box & daftar pasien) ke-push keluar area yang terlihat dan TIDAK BISA
  // dijangkau sama sekali - tidak ada scrollable manapun yang menampung
  // seluruh halaman.
  //
  // Fix: jadikan FlatList sebagai satu-satunya scroll container di halaman
  // ini. Form (judul, input, tombol) ditaruh di ListHeaderComponent, supaya
  // form dan daftar pasien sama-sama ikut ter-scroll dalam satu area yang
  // sama, dan search box selalu bisa dijangkau meski form-nya panjang.
  const renderHeader = () => (
    <View style={styles.headerSection}>
      <Text style={styles.sectionTitle}>
        {editingExisting ? `Edit Data: ${editingExisting.nama}` : 'Tambah Data Pasien (Walk-in)'}
      </Text>
      <Text style={styles.note}>
        {editingExisting
          ? editingExisting.uid
            ? 'Pasien ini sudah punya akun terdaftar.'
            : 'Pasien ini belum pernah daftar akun — data akan otomatis tertaut begitu dia register pakai NIK ini.'
          : 'Untuk pasien yang datang periksa tapi belum punya akun di app. Kalau NIK ini nanti dipakai untuk daftar akun, datanya otomatis tertaut.'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="NIK (16 digit)"
        placeholderTextColor="#999"
        keyboardType="number-pad"
        maxLength={16}
        editable={!editingExisting}
        value={form.nik}
        onChangeText={(v) => setForm((f) => ({ ...f, nik: v }))}
      />
      <TextInput
        style={styles.input}
        placeholder="Nama lengkap"
        placeholderTextColor="#999"
        value={form.nama}
        onChangeText={(v) => setForm((f) => ({ ...f, nama: v }))}
      />
      <TextInput
        style={styles.input}
        placeholder="Tanggal lahir (YYYY-MM-DD)"
        placeholderTextColor="#999"
        value={form.tanggalLahir}
        onChangeText={(v) => setForm((f) => ({ ...f, tanggalLahir: v }))}
      />
      <SimpleSelect
        label="Jenis Kelamin"
        placeholder="Pilih jenis kelamin"
        options={[
          { label: 'Laki-laki', value: 'L' },
          { label: 'Perempuan', value: 'P' },
        ]}
        selectedValue={form.jenisKelamin}
        onSelect={(v) => setForm((f) => ({ ...f, jenisKelamin: v }))}
      />
      <SimpleSelect
        label="Golongan Darah"
        placeholder="Pilih golongan darah"
        options={[
          { label: 'A', value: 'A' },
          { label: 'B', value: 'B' },
          { label: 'AB', value: 'AB' },
          { label: 'O', value: 'O' },
          { label: 'Tidak tahu', value: 'Tidak tahu' },
        ]}
        selectedValue={form.golonganDarah}
        onSelect={(v) => setForm((f) => ({ ...f, golonganDarah: v }))}
      />
      <TextInput
        style={styles.input}
        placeholder="Alamat"
        placeholderTextColor="#999"
        value={form.alamat}
        onChangeText={(v) => setForm((f) => ({ ...f, alamat: v }))}
      />
      <TextInput
        style={styles.input}
        placeholder="No. telepon"
        placeholderTextColor="#999"
        keyboardType="phone-pad"
        value={form.noTelepon}
        onChangeText={(v) => setForm((f) => ({ ...f, noTelepon: v }))}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Alergi obat/makanan (opsional, penting untuk keselamatan pasien)"
        placeholderTextColor="#999"
        multiline
        value={form.alergi}
        onChangeText={(v) => setForm((f) => ({ ...f, alergi: v }))}
      />

      <View style={styles.row}>
        <Pressable style={[styles.button, styles.rowInput]} onPress={handleSave} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{editingExisting ? 'Simpan Perubahan' : 'Tambah Pasien'}</Text>
          )}
        </Pressable>
        {editingExisting && (
          <Pressable style={styles.buttonSecondary} onPress={handleReset}>
            <Text style={styles.buttonSecondaryText}>Batal</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.sectionTitle}>Daftar Pasien</Text>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama atau NIK..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loadingList && <ActivityIndicator style={{ marginTop: 12 }} />}
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      data={loadingList ? [] : filtered}
      keyExtractor={(item) => item.nik}
      ListHeaderComponent={renderHeader()}
      ListEmptyComponent={
        loadingList ? null : <Text style={styles.empty}>Belum ada data pasien.</Text>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => handlePickExisting(item)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{item.nama}</Text>
            <Text style={styles.cardEmail}>NIK: {item.nik}</Text>
            <View style={styles.badgeRow}>
              <Text style={item.uid ? styles.badgeLinked : styles.badgeUnlinked}>
                {item.uid ? 'Sudah tertaut akun' : 'Menunggu klaim akun'}
              </Text>
              <Text style={item.profilLengkap ? styles.badgeLengkap : styles.badgeBelum}>
                {item.profilLengkap ? 'Data medis lengkap' : 'Belum lengkap'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#888" />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  contentContainer: { padding: 20, paddingBottom: 40 },
  headerSection: { gap: 10, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginTop: 12 },
  note: { color: '#666', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  rowInput: { flex: 1 },
  button: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  buttonSecondary: {
    backgroundColor: '#f3f4f6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  buttonSecondaryText: { color: '#374151', fontWeight: '600', fontSize: 16 },
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
  cardEmail: { color: '#666', fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  badgeLinked: { color: '#15803d', fontSize: 12, fontWeight: '500' },
  badgeUnlinked: { color: '#b45309', fontSize: 12, fontWeight: '500' },
  badgeLengkap: { color: '#2563eb', fontSize: 12, fontWeight: '500' },
  badgeBelum: { color: '#9ca3af', fontSize: 12, fontWeight: '500' },
  empty: { color: '#888', textAlign: 'center', marginTop: 12 },
});