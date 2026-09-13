import { Stack } from 'expo-router';

export default function DokterLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="daftar_pasien" options={{ title: 'Daftar Pasien' }} />
      <Stack.Screen name="pemeriksaan" options={{ title: 'Pemeriksaan' }} />
      <Stack.Screen name="resep" options={{ title: 'Resep' }} />
      <Stack.Screen name="riwayat_pasien" options={{ title: 'Riwayat Pasien' }} />
      <Stack.Screen name="profil" options={{ title: 'Profil' }} />
    </Stack>
  );
}
