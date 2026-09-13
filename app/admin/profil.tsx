// Profil admin yang sedang login.
//
// TIDAK ADA getDoc/getDocs SAMA SEKALI di halaman ini - nama/email/role/
// createdAt admin sudah tersedia dari AuthContext (di-load sekali saat
// login di contexts/AuthContext.tsx, dari users/{uid}). Tidak ada
// "adminProfile" collection terpisah kayak dokterProfile/pasienProfile,
// karena admin tidak punya data tambahan di luar users/{uid}. Jadi
// halaman ini praktis GRATIS dari sisi kuota Firestore.
//
// Read-only, sama seperti profil pasien/dokter - identitas akun (nama,
// email) dikelola lewat proses ganti password/reset, bukan form edit
// bebas di sini (konsisten dengan filosofi "identitas dikontrol lewat
// jalur resmi" yang dipakai di seluruh app ini).

import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';

import { auth } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { showAlert } from '@/utils/alert';

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

export default function ProfilAdmin() {
  const { profile } = useAuth();
  const [sendingReset, setSendingReset] = useState(false);

  const createdAtDate =
    profile?.createdAt && typeof profile.createdAt.toDate === 'function'
      ? profile.createdAt.toDate()
      : null;

  const handleResetPassword = async () => {
    if (!profile?.email) return;
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, profile.email);
      showAlert('Link terkirim', `Link reset password sudah dikirim ke ${profile.email}.`);
    } catch (err) {
      console.error('Gagal kirim reset password:', err);
      showAlert('Gagal mengirim', 'Coba lagi beberapa saat lagi.');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} testID="profil-admin-scroll">
      <View style={styles.heroCard}>
        <View style={styles.avatar}>
          <Ionicons name="shield-checkmark" size={36} color="#4338CA" />
        </View>
        <Text style={styles.heroNama} testID="profil-nama">
          {profile?.nama ?? '—'}
        </Text>
        <Text style={styles.heroEmail} testID="profil-email">
          {profile?.email ?? '—'}
        </Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>Administrator</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Akun</Text>
        <InfoRow label="Nama" value={profile?.nama} testID="profil-nama-row" />
        <View style={styles.divider} />
        <InfoRow label="Email" value={profile?.email} testID="profil-email-row" />
        <View style={styles.divider} />
        <InfoRow
          label="Bergabung sejak"
          value={createdAtDate ? createdAtDate.toLocaleDateString('id-ID', { dateStyle: 'long' }) : null}
          testID="profil-created-at"
        />
      </View>

      <Pressable
        style={styles.actionButton}
        onPress={handleResetPassword}
        disabled={sendingReset || !profile?.email}
        testID="profil-reset-password-button">
        {sendingReset ? (
          <ActivityIndicator color="#4338CA" />
        ) : (
          <>
            <Ionicons name="key-outline" size={18} color="#4338CA" />
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
    backgroundColor: '#eef2ff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#c7d2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroNama: { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center' },
  heroEmail: { fontSize: 13, color: '#555' },
  roleBadge: {
    marginTop: 6,
    backgroundColor: '#4338CA',
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
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#4338CA', marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#f0f0f0' },

  actionButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    padding: 12,
  },
  actionButtonText: { color: '#4338CA', fontWeight: '700', fontSize: 14 },

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