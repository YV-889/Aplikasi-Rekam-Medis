// Komponen dashboard generic dipakai bareng oleh admin, dokter, pasien.
// Cuma beda warna (dari roleTheme.ts) & daftar menu yang dikirim tiap halaman.

import type { ComponentProps } from 'react';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { roleThemes, type RoleKey } from '@/constants/roleTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface DashboardMenuItem {
  label: string;
  href: string;
  icon: IoniconName;
}

interface RoleDashboardProps {
  role: RoleKey;
  userName: string;
  menu: DashboardMenuItem[];
}

export function RoleDashboard({ role, userName, menu }: RoleDashboardProps) {
  const theme = roleThemes[role];
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.primary, paddingTop: insets.top + 16 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{theme.label.toUpperCase()}</Text>
          <Text style={styles.greeting}>Halo, {userName} 👋</Text>
        </View>

        <Link href="/logout" asChild>
          <Pressable style={styles.logoutButton} hitSlop={8}>
            <Ionicons name="log-out-outline" size={22} color="#fff" />
          </Pressable>
        </Link>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.grid}>
          {menu.map((item) => (
            <Link key={item.href} href={item.href as any} asChild>
              <Pressable style={styles.card}>
                <View style={[styles.iconWrap, { backgroundColor: theme.soft }]}>
                  <Ionicons name={item.icon} size={22} color={theme.primary} />
                </View>
                <Text style={styles.cardLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="#c4c4c4" style={styles.chevron} />
              </Pressable>
            </Link>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    paddingBottom: 28,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  eyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  greeting: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 4 },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { padding: 20, gap: 12 },
  grid: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardLabel: { fontSize: 15, fontWeight: '600', color: '#111' },
  chevron: { marginLeft: 'auto' },
});