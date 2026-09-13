// Bukan halaman UI biasa — begitu dibuka, langsung signOut() lalu
// redirect ke login ditangani otomatis oleh guard di app/_layout.tsx.

import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { signOut } from 'firebase/auth';

import { auth } from '@/config/firebase';

export default function Logout() {
  useEffect(() => {
    signOut(auth).catch((err) => console.error('Gagal logout:', err));
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
