import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Komponen ini yang mengatur logika "siapa boleh lihat halaman apa"
function RootNavigator() {
  const { user, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const currentGroup = segments[0]; // 'admin' | 'dokter' | 'pasien' | '(auth)' | undefined

    // 1. Belum login tapi coba akses halaman selain auth -> lempar ke login
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    // 2. Sudah login tapi masih di halaman auth (atau di root "/") -> lempar ke dashboard sesuai role
    if (user && profile && (inAuthGroup || currentGroup === undefined)) {
      router.replace(`/${profile.role}/dashboard` as any);
      return;
    }

    // 3. Sudah login tapi mencoba akses folder role lain (mis. pasien buka /admin/...) -> tolak
    if (
      user &&
      profile &&
      !inAuthGroup &&
      currentGroup !== profile.role &&
      currentGroup !== 'logout'
    ) {
      router.replace(`/${profile.role}/dashboard` as any);
    }
  }, [user, profile, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="dokter" />
      <Stack.Screen name="pasien" />
      <Stack.Screen name="logout" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootNavigator />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
  