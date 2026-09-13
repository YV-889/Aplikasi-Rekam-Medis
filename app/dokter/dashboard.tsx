import { RoleDashboard } from '@/components/RoleDashboard';
import { useAuth } from '@/contexts/AuthContext';

// Catatan: "Pemeriksaan" dan "Resep" SENGAJA tidak ada di menu dashboard ini.
// Kedua halaman itu butuh NIK pasien (dan medicalRecordId, khusus resep)
// yang cuma bisa didapat lewat alur: Daftar Pasien -> pilih pasien ->
// Pemeriksaan -> Resep. Kalau dibuka langsung tanpa param itu, akan gagal
// dengan pesan "NIK tidak ditemukan" - bukan bug, memang didesain begitu.

export default function DokterDashboard() {
  const { profile } = useAuth();

  return (
    <RoleDashboard
      role="dokter"
      userName={`dr. ${profile?.nama ?? ''}`}
      menu={[
        { label: 'Daftar Pasien', href: '/dokter/daftar_pasien', icon: 'people-outline' },
        { label: 'Riwayat Pasien', href: '/dokter/riwayat_pasien', icon: 'time-outline' },
        { label: 'Profil', href: '/dokter/profil', icon: 'person-circle-outline' },
      ]}
    />
  );
}
