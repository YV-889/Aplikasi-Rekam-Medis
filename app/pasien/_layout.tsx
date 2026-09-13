import { Stack } from 'expo-router';

export default function PasienLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="profil" options={{ title: 'Profil' }} />
      <Stack.Screen name="riwayat" options={{ title: 'Riwayat Berobat' }} />
      <Stack.Screen name="resep" options={{ title: 'Resep' }} />
      <Stack.Screen name="hasil_pemeriksaan" options={{ title: 'Hasil Pemeriksaan' }} />
    </Stack>
  );
}
