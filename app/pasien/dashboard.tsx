import { RoleDashboard } from '@/components/RoleDashboard';
import { useAuth } from '@/contexts/AuthContext';

export default function PasienDashboard() {
  const { profile } = useAuth();

  return (
    <RoleDashboard
      role="pasien"
      userName={profile?.nama ?? ''}
      menu={[
        { label: 'Riwayat Berobat', href: '/pasien/riwayat', icon: 'time-outline' },
        { label: 'Resep', href: '/pasien/resep', icon: 'document-text-outline' },
        { label: 'Hasil Pemeriksaan', href: '/pasien/hasil_pemeriksaan', icon: 'clipboard-outline' },
        { label: 'Profil', href: '/pasien/profil', icon: 'person-circle-outline' },
      ]}
    />
  );
}
