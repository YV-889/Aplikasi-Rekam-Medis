// Token warna per role. Sengaja dibedakan jauh biar user langsung sadar
// "saya sedang di area siapa" cuma dari warnanya - admin, dokter, atau pasien.

export const roleThemes = {
  admin: {
    label: 'Admin',
    primary: '#4338CA', // indigo
    soft: '#EEF2FF',
  },
  dokter: {
    label: 'Dokter',
    primary: '#047857', // emerald
    soft: '#ECFDF5',
  },
  pasien: {
    label: 'Pasien',
    primary: '#BE123C', // rose
    soft: '#FFF1F2',
  },
} as const;

export type RoleKey = keyof typeof roleThemes;
