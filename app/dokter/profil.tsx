// Profil dokter yang sedang login (read-only).
//
// DATA DARI DUA SUMBER (sama polanya dengan pasien/profil.tsx):
// 1) users/{uid}        → nama, email (GRATIS - sudah ada di AuthContext,
//    di-load sekali saat login, tidak perlu getDoc lagi di sini).
// 2) dokterProfile/{uid} → spesialisasi, poli tempat praktik (1x getDoc,
//    di-cache AsyncStorage karena datanya jarang berubah - cuma admin yang
//    bisa mengubahnya lewat admin/dokter.tsx).
//
// KENAPA READ-ONLY: dokterProfile cuma boleh ditulis admin (lihat
// firestore.rules: match /dokterProfile -> allow write: if isAdmin()),
// sama filosofinya dengan pasienProfile - identitas profesional (spesialisasi,
// penempatan poli) adalah keputusan administratif klinik, bukan sesuatu yang
// diedit dokter sendiri dari HP-nya.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';

import { auth, db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { showAlert } from '@/utils/alert';
import type { DokterProfile } from '@/types/dokter';

function cacheKey(uid: string) {
  return `cache_dokterProfile_v1_${uid}`;
}

function InfoRow({ label, value, testID }: { label: string; value?: string | null; testID?: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value} testID={testID}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 13, color: '#666', flex: 1 },
  value: { fontSize: 13, color: '#111', fontWeight: '500', flex: 2, textAlign: 'right' },
});

export default function ProfilDokter() {
  const { user, profile: authProfile } = useAuth();
  const uid = user?.uid ?? null;

  const [dokterProfile, setDokterProfile] = useState<DokterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!uid) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const key = cacheKey(uid);

      if (!isRefresh) {
        try {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            setDokterProfile(JSON.parse(raw));
            setLoading(false);
          }
        } catch {
          /* cache kosong/rusak, tidak fatal */
        }
      }

      try {
        const snap = await getDoc(doc(db, 'dokterProfile', uid));
        if (snap.exists()) {
          const data = snap.data() as DokterProfile;
          setDokterProfile(data);
          await AsyncStorage.setItem(key, JSON.stringify(data));
        }
      } catch (err) {
        console.error('Gagal refresh dokterProfile:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [uid]
  );

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const handleResetPassword = async () => {
    if (!authProfile?.email) return;
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, authProfile.email);
      showAlert('Link terkirim', `Link reset password sudah dikirim ke ${authProfile.email}.`);
    } catch (err) {
      console.error('Gagal kirim reset password:', err);
      showAlert('Gagal mengirim', 'Coba lagi beberapa saat lagi.');
    } finally {
      setSendingReset(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} testID="profil-dokter-loading" />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      testID="profil-dokter-scroll">
      <View style={styles.heroCard}>
        <View style={styles.avatar}>
          <Ionicons name="medkit" size={36} color="#047857" />
        </View>
        <Text style={styles.heroNama} testID="profil-nama">
          dr. {authProfile?.nama ?? dokterProfile?.nama ?? '—'}
        </Text>
        <Text style={styles.heroEmail} testID="profil-email">
          {authProfile?.email ?? '—'}
        </Text>
        {!!dokterProfile?.poliNama && (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{dokterProfile.poliNama}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profil Profesional</Text>
        <InfoRow label="Spesialisasi" value={dokterProfile?.spesialisasi} testID="profil-spesialisasi" />
        <View style={styles.divider} />
        <InfoRow label="Poli Praktik" value={dokterProfile?.poliNama} testID="profil-poli" />
      </View>

      <View style={styles.infoNote}>
        <Ionicons name="lock-closed-outline" size={14} color="#6b7280" />
        <Text style={styles.infoNoteText}>
          Spesialisasi & poli praktik dikelola oleh admin klinik. Hubungi admin jika ada yang perlu
          diperbarui.
        </Text>
      </View>

      <Pressable
        style={styles.actionButton}
        onPress={handleResetPassword}
        disabled={sendingReset || !authProfile?.email}
        testID="profil-reset-password-button">
        {sendingReset ? (
          <ActivityIndicator color="#047857" />
        ) : (
          <>
            <Ionicons name="key-outline" size={18} color="#047857" />
            <Text style={styles.actionButtonText}>Kirim Link Reset Password</Text>
          </>
        )}
      </Pressable>

      <Link href="/logout" asChild>
        <Pressable style={styles.logoutButton} testID="profil-logout-button">
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutButtonText}>Keluar</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  heroCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroNama: { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center' },
  heroEmail: { fontSize: 13, color: '#555' },
  roleBadge: {
    marginTop: 6,
    backgroundColor: '#047857',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  roleBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#047857', marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#f0f0f0' },

  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
  },
  infoNoteText: { fontSize: 12, color: '#6b7280', flex: 1, lineHeight: 18 },

  actionButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 12,
  },
  actionButtonText: { color: '#047857', fontWeight: '700', fontSize: 14 },

  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutButtonText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
});