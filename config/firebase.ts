// Konfigurasi & inisialisasi Firebase untuk app Rekam Medis
// PENTING: apiKey Firebase Web ini memang publik/aman untuk disimpan di client.
// Keamanan data yang sebenarnya diatur lewat Firestore Security Rules (lihat firestore.rules),
// BUKAN dengan menyembunyikan apiKey ini.

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  // @ts-ignore: getReactNativePersistence tidak ada di type declaration firebase,
  // tapi fungsinya tetap ADA dan jalan normal saat di-bundle Metro untuk React Native.
  // Ini known issue di firebase-js-sdk, bukan bug di kode kita.
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: 'AIzaSyDowZyFczcVTjMR5s_N1TMz917sW2pYbUY',
  authDomain: 'rekam-medis-app-b0d84.firebaseapp.com',
  projectId: 'rekam-medis-app-b0d84',
  storageBucket: 'rekam-medis-app-b0d84.firebasestorage.app',
  messagingSenderId: '1008047864508',
  appId: '1:1008047864508:web:8b278ecbd58d03740eaeb9',
};

// Cegah initializeApp dipanggil dua kali saat hot-reload
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Catatan: getAnalytics() sengaja TIDAK dipakai karena tidak didukung
// di lingkungan React Native (analytics Firebase itu untuk web/native SDK asli).

// Auth butuh persistence berbeda antara web dan native (Android/iOS)
export const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

export const db = getFirestore(app);

// ---------------------------------------------------------------------------
// SECONDARY AUTH INSTANCE
// ---------------------------------------------------------------------------
// Kenapa perlu ini: createUserWithEmailAndPassword() otomatis LOGIN sebagai
// user yang baru dibuat. Kalau admin pakai fungsi itu langsung di `auth` utama
// buat bikin akun dokter, admin bakal ke-logout dan malah ke-login sebagai
// dokter yang baru dibuat. Makanya kita buat instance Firebase App KEDUA
// khusus buat proses "admin membuat akun user lain", supaya sesi login admin
// di `auth` utama tetap aman/tidak terganggu.
let secondaryAuthInstance: ReturnType<typeof getAuth> | null = null;

export function getSecondaryAuth() {
  if (secondaryAuthInstance) return secondaryAuthInstance;

  const existing = getApps().find((a) => a.name === 'Secondary');
  const secondaryApp = existing ?? initializeApp(firebaseConfig, 'Secondary');

  secondaryAuthInstance =
    Platform.OS === 'web'
      ? getAuth(secondaryApp)
      : initializeAuth(secondaryApp, {
          persistence: getReactNativePersistence(AsyncStorage),
        });

  return secondaryAuthInstance;
}

export default app;
