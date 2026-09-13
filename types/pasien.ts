// Data medis pasien, terpisah dari users/{uid}.
//
// PENTING — beda dengan DokterProfile: dokumen ini DI-INDEX BY NIK
// (pasienProfile/{nik}), BUKAN by uid. Alasannya:
//
// Di dunia nyata, pasien sering sudah punya identitas medis (datang &
// diperiksa di faskes) SEBELUM pernah install/daftar akun aplikasi ini.
// Kalau kita index by uid, data medis itu tidak akan pernah bisa dibuat
// duluan oleh admin karena uid-nya belum ada.
//
// Alur lengkapnya:
// 1) WALK-IN: admin input data medis pasien pas kunjungan pertama, disimpan
//    ke pasienProfile/{nik} dengan uid: null ("belum ada akun yang klaim").
// 2) KLAIM: pasien install app & register, WAJIB isi NIK. Kalau NIK cocok
//    dengan dokumen yang uid-nya masih null, otomatis ditautkan (uid diisi
//    uid akun barunya). Kalau NIK belum pernah ada, dibuat dokumen baru
//    kosong menunggu dilengkapi admin di kunjungan berikutnya.
// 3) Kalau NIK sudah diklaim uid lain, pendaftaran akun baru dengan NIK itu
//    DITOLAK — satu NIK cuma boleh ditautkan ke satu akun.
//
// Ini mencegah pasien baru daftar "tiba-tiba" muncul rekam medis siapa pun:
// rekam medis (medicalRecords) tetap terikat ke uid, dan uid baru "berarti
// medis" setelah proses klaim NIK ini berhasil DAN admin/dokter benar-benar
// mengisi datanya — bukan otomatis oleh sistem.
export interface PasienProfile {
  nik: string; // sama dengan document ID di pasienProfile/{nik}
  uid: string | null; // uid akun yang menautkan diri ke NIK ini; null = walk-in, belum ada akun

  nama: string;
  email?: string; // terisi otomatis begitu uid ditautkan (klaim)

  tanggalLahir?: string; // format ISO 'YYYY-MM-DD'
  jenisKelamin?: 'L' | 'P';
  golonganDarah?: 'A' | 'B' | 'AB' | 'O' | 'Tidak tahu';
  alamat?: string;
  noTelepon?: string;
  alergi?: string; // catatan alergi obat/makanan, opsional tapi penting

  // Menandai apakah data medis (bukan cuma NIK+nama) sudah dilengkapi.
  profilLengkap: boolean;

  // Audit trail
  createdAt?: any;
  createdBy?: string; // uid admin yang input pertama kali, atau uid pasien sendiri kalau self-claim
  updatedAt?: any;
  updatedBy?: string | null; // uid admin yang terakhir ubah data medis
}