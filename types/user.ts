export type UserRole = 'admin' | 'dokter' | 'pasien';

export interface UserProfile {
  uid: string;
  nama: string;
  email: string;
  role: UserRole;
  nik?: string; // cuma diisi kalau role === 'pasien', lihat register.tsx
  createdAt?: any;
}