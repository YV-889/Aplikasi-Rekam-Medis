import { RoleDashboard } from '@/components/RoleDashboard';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminDashboard() {
  const { profile } = useAuth();

  return (
    <RoleDashboard
      role="admin"
      userName={profile?.nama ?? 'Admin'}
      menu={[
        { label: 'Data Dokter', href: '/admin/dokter', icon: 'medkit-outline' },
        { label: 'Data Pasien', href: '/admin/pasien', icon: 'people-outline' },
        { label: 'Data Poli', href: '/admin/poli', icon: 'business-outline' },
        { label: 'Data Obat', href: '/admin/obat', icon: 'flask-outline' },
        { label: 'Pemeriksaan', href: '/admin/pemeriksaan', icon: 'clipboard-outline' },
        { label: 'Resep', href: '/admin/resep', icon: 'document-text-outline' },
        { label: 'Rekam Medis', href: '/admin/rekam_medis', icon: 'folder-open-outline' },
        { label: 'Laporan', href: '/admin/laporan', icon: 'bar-chart-outline' },
        { label: 'Profil', href: '/admin/profil', icon: 'person-circle-outline' },
        { label: 'Pengaturan', href: '/admin/pengaturan', icon: 'settings-outline' },
      ]}
    />
  );
}
