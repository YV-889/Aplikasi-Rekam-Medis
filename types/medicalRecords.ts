// Rekam medis hasil pemeriksaan dokter, di-index BY NIK (bukan uid),
// konsisten dengan pasienProfile - lihat types/pasien.ts untuk alasannya.
// Ini memungkinkan pemeriksaan pasien walk-in (belum punya akun) tetap
// bisa dicatat oleh dokter/admin.

export interface MedicalRecord {
  id: string; // doc id auto-generated Firestore
  pasienNik: string; // FK ke pasienProfile/{nik}
  dokterUid: string; // FK ke dokterProfile/{uid} / users/{uid}
  poliId: string;

  tanggalPeriksa: string; // ISO 'YYYY-MM-DD'
  keluhan: string;
  diagnosa: string;
  tindakan?: string;
  catatan?: string;

  createdAt?: any;
  updatedAt?: any;
}