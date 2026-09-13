// Helper ekspor file (dipakai oleh CSV & Excel export di admin/laporan.tsx,
// dan bisa dipakai lagi kalau nanti butuh export di halaman lain).
//
// PENTING soal kuota: fungsi di sini TIDAK melakukan query Firestore apa pun.
// Dia cuma mengubah data yang SUDAH ada di state React (hasil query yang
// sudah dilakukan sebelumnya untuk ditampilkan di layar) menjadi file.
// Jadi tombol "Export CSV/Excel" itu sendiri = 0 tambahan baca Firestore.
//
// Expo SDK 54 mengganti API expo-file-system lama (writeAsStringAsync dkk,
// sekarang deprecated & throw runtime error) dengan class File/Directory/Paths
// yang baru. Lihat AGENTS.md - "Expo HAS CHANGED", makanya di sini sengaja
// pakai API baru, BUKAN expo-file-system/legacy.
//
// Butuh dependency tambahan (jalankan di terminal project):
//   npx expo install expo-file-system expo-sharing
//   npm install xlsx

import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Simpan & bagikan file:
 * - Web (Expo web / browser): trigger download langsung lewat Blob.
 * - Native (Android/iOS): tulis ke cache directory, lalu buka share sheet
 *   supaya user bisa "Save to Files" / kirim ke aplikasi lain.
 */
export async function saveAndShareFile(
  filename: string,
  mimeType: string,
  content: string,
  encoding: 'utf8' | 'base64' = 'utf8'
) {
  
  if (Platform.OS === 'web') {
  let blob: Blob;

  if (encoding === 'base64') {
    const bytes = base64ToUint8Array(content);

    const buffer = new ArrayBuffer(bytes.byteLength);
    const view = new Uint8Array(buffer);

    view.set(bytes);

    blob = new Blob([buffer], {
    type: mimeType,
  });
  } else {
    blob = new Blob([content], {
      type: mimeType,
    });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return;
}

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(encoding === 'base64' ? base64ToUint8Array(content) : content);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
  }
}

/** Escape 1 cell CSV sesuai RFC 4180 (bungkus tanda kutip kalau ada koma/kutip/baris baru). */
function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Ubah array header + rows jadi 1 string CSV siap tulis ke file. */
export function toCsv(header: string[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  // \uFEFF (BOM) di depan supaya Excel baca UTF-8 dengan benar (tanpa ini,
  // karakter non-ASCII kadang tampil rusak kalau dibuka langsung di Excel).
  return '\uFEFF' + lines.join('\r\n');
}