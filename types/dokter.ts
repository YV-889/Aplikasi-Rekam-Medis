// Data khusus dokter, terpisah dari users/{uid} supaya field-nya nggak
// nyampur ke role lain. uid di sini = uid yang sama dengan di collection users.
// nama & email sengaja diduplikasi (denormalisasi) di sini juga, biar halaman
// "Daftar Dokter" bisa nampilin semua info cuma dengan 1x query, tanpa join.
export interface DokterProfile {
  uid: string;
  nama: string;
  email: string;
  spesialisasi: string;
  poliId: string;
  poliNama: string;
  createdAt?: any;
}
