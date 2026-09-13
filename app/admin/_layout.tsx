import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="dokter" options={{ title: 'Kelola Dokter' }} />
      <Stack.Screen name="pasien" options={{ title: 'Kelola Pasien' }} />
      <Stack.Screen name="poli" options={{ title: 'Kelola Poli' }} />
      <Stack.Screen name="obat" options={{ title: 'Kelola Obat' }} />
      <Stack.Screen name="pemeriksaan" options={{ title: 'Pemeriksaan' }} />
      <Stack.Screen name="resep" options={{ title: 'Resep' }} />
      <Stack.Screen name="rekam_medis" options={{ title: 'Rekam Medis' }} />
      <Stack.Screen name="laporan" options={{ title: 'Laporan' }} />
      <Stack.Screen name="profil" options={{ title: 'Profil' }} />
      <Stack.Screen name="pengaturan" options={{ title: 'Pengaturan' }} />
    </Stack>
  );
}
