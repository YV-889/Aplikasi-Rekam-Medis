// Laporan admin: ringkasan statistik + export ke file Excel (.xlsx).
//
// PRINSIP HEMAT KUOTA:
// - Angka ringkasan (total pasien/dokter/pemeriksaan/resep) pakai
//   getCountFromServer() - aggregation query yang JAUH lebih murah
//   daripada getDocs() (nggak perlu download seluruh dokumen buat sekadar
//   ngitung jumlahnya).
// - Data detail (buat ditulis ke Excel) baru di-fetch pas admin BENERAN
//   klik "Export ke Excel", bukan otomatis pas halaman dibuka.
// - Nama pasien/dokter di JOIN cuma untuk NIK/uid yang benar-benar muncul
//   di data periode terpilih (bukan baca semua pasienProfile/dokterProfile).
// - limit(500) di query detail - kalau periode kepilih ternyata punya lebih
//   dari 500 baris, sarankan admin pilih rentang lebih pendek.
//
// FORMAT TANGGAL: medicalRecords.tanggalPeriksa disimpan ISO 'YYYY-MM-DD'
// (lihat types/medicalRecords.ts), jadi range query string >= / <= aman
// dipakai tanpa perlu composite index (range + orderBy di FIELD YANG SAMA
// tidak butuh composite index).

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx-js-style';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';

import { db } from '@/config/firebase';
import { SimpleSelect } from '@/components/SimpleSelect';
import { showAlert } from '@/utils/alert';
import type { MedicalRecord } from '@/types/medicalRecords';
import type { Resep } from '@/types/resep';
import type { Obat } from '@/types/obat';
import type { DokterProfile } from '@/types/dokter';
import type { PasienProfile } from '@/types/pasien';

const MAX_ROWS = 500;
// Dipakai HANYA sebagai fallback sebelum settings/app selesai dimuat, atau
// kalau admin belum pernah menyimpan pengaturan sama sekali. Nilai aslinya
// sekarang diatur admin di halaman Pengaturan (app/admin/pengaturan.tsx),
// tersimpan di Firestore settings/app, field stokMenipisThreshold.
const DEFAULT_STOK_MENIPIS_THRESHOLD = 10;

type PeriodeKey = 'bulan_ini' | 'bulan_lalu' | '3_bulan' | 'semua';

const PERIODE_OPTIONS: { label: string; value: PeriodeKey }[] = [
  { label: 'Bulan Ini', value: 'bulan_ini' },
  { label: 'Bulan Lalu', value: 'bulan_lalu' },
  { label: '3 Bulan Terakhir', value: '3_bulan' },
  { label: 'Semua Waktu', value: 'semua' },
];

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function getRange(periode: PeriodeKey) {
  const now = new Date();
  switch (periode) {
    case 'bulan_ini': {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      return { startIso: toIso(start), endIso: toIso(end), startDate: start, endDate: end };
    }
    case 'bulan_lalu': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const start = startOfMonth(lastMonth);
      const end = endOfMonth(lastMonth);
      return { startIso: toIso(start), endIso: toIso(end), startDate: start, endDate: end };
    }
    case '3_bulan': {
      const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      const end = endOfMonth(now);
      return { startIso: toIso(start), endIso: toIso(end), startDate: start, endDate: end };
    }
    case 'semua':
    default:
      return {
        startIso: '0000-01-01',
        endIso: '9999-12-31',
        startDate: new Date(2000, 0, 1),
        endDate: new Date(2999, 0, 1),
      };
  }
}

function periodeLabel(periode: PeriodeKey) {
  return PERIODE_OPTIONS.find((p) => p.value === periode)?.label ?? periode;
}

// ---------------------------------------------------------------------------
// HELPER STYLING EXCEL
// ---------------------------------------------------------------------------
// Pakai xlsx-js-style (bukan 'xlsx' biasa) - API-nya identik dengan SheetJS
// asli, cuma versi ini benar-benar MENULIS style ke file .xlsx-nya. Versi
// gratis 'xlsx' cuma nyimpen data mentah tanpa warna/bold/border sama sekali,
// itu batasan resmi dari library-nya (bukan bug di kode kita).

const WARNA_HEADER = 'FF4338CA'; // indigo, senada tema admin
const WARNA_SUBHEADER = 'FFE0E7FF';
const WARNA_BORDER = 'FFD1D5DB';

const borderTipis = {
  top: { style: 'thin', color: { rgb: WARNA_BORDER } },
  bottom: { style: 'thin', color: { rgb: WARNA_BORDER } },
  left: { style: 'thin', color: { rgb: WARNA_BORDER } },
  right: { style: 'thin', color: { rgb: WARNA_BORDER } },
} as const;

function selHeader(text: string) {
  return {
    v: text,
    t: 's' as const,
    s: {
      font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: WARNA_HEADER } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: borderTipis,
    },
  };
}

function selData(value: string | number, opts?: { bold?: boolean; numFmt?: string }) {
  const isNumber = typeof value === 'number';
  return {
    v: value,
    t: (isNumber ? 'n' : 's') as 'n' | 's',
    s: {
      font: { bold: !!opts?.bold, sz: 10 },
      alignment: { horizontal: isNumber ? 'right' : 'left', vertical: 'center', wrapText: true },
      border: borderTipis,
      ...(opts?.numFmt ? { numFmt: opts.numFmt } : {}),
    },
  };
}

// Bikin worksheet tabel: baris pertama header berwarna, sisanya data
// berbatas garis tipis + lebar kolom otomatis.
function buatSheetTabel(headers: string[], rows: (string | number)[][], colWidths: number[]) {
  const headerRow = headers.map(selHeader);
  const dataRows = rows.length > 0
    ? rows.map((row) => row.map((v) => selData(v)))
    : [headers.map(() => selData(''))]; // baris kosong placeholder kalau data-nya nihil
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws['!cols'] = colWidths.map((wch) => ({ wch }));
  ws['!rows'] = [{ hpt: 24 }];
  return ws;
}

function selJudul(text: string, span: number) {
  const cells = [
    {
      v: text,
      t: 's' as const,
      s: {
        font: { bold: true, sz: 16, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: WARNA_HEADER } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    },
  ];
  for (let i = 1; i < span; i++) {
    cells.push({ v: '', t: 's', s: { fill: { fgColor: { rgb: WARNA_HEADER } } } } as any);
  }
  return cells;
}

function selSubjudul(text: string, span: number) {
  const cells = [
    {
      v: text,
      t: 's' as const,
      s: { font: { bold: true, sz: 12 }, fill: { fgColor: { rgb: WARNA_SUBHEADER } } },
    },
  ];
  for (let i = 1; i < span; i++) {
    cells.push({ v: '', t: 's', s: { fill: { fgColor: { rgb: WARNA_SUBHEADER } } } } as any);
  }
  return cells;
}

function selLabel(text: string) {
  return { v: text, t: 's' as const, s: { font: { bold: true, sz: 10 } } };
}

function selNilai(value: string | number) {
  const isNumber = typeof value === 'number';
  return {
    v: value,
    t: (isNumber ? 'n' : 's') as 'n' | 's',
    s: { font: { sz: 10, bold: isNumber }, alignment: { horizontal: isNumber ? 'right' : 'left' } },
  };
}

interface Ringkasan {
  totalPasien: number;
  totalDokter: number;
  totalPemeriksaan: number;
  totalResep: number;
  obatMenipisCount: number;
}

export default function LaporanAdmin() {
  const [periode, setPeriode] = useState<PeriodeKey>('bulan_ini');
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
  const [loadingRingkasan, setLoadingRingkasan] = useState(true);
  const [exporting, setExporting] = useState(false);
  // Threshold "stok menipis" - dibaca dari settings/app (lihat
  // admin/pengaturan.tsx). Mulai dari nilai default supaya kartu ringkasan
  // tetap bisa tampil sebelum settings/app selesai dimuat, lalu di-refresh
  // begitu nilai aslinya datang (lihat effect init() di bawah).
  const [stokThreshold, setStokThreshold] = useState(DEFAULT_STOK_MENIPIS_THRESHOLD);

  const loadRingkasan = async (p: PeriodeKey, threshold: number) => {
    setLoadingRingkasan(true);
    setRingkasan(null);
    try {
      const { startIso, endIso, startDate, endDate } = getRange(p);
      const startTs = Timestamp.fromDate(startDate);
      const endTs = Timestamp.fromDate(new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1));

      // Semua pakai getCountFromServer - aggregation query, murah, tidak
      // download isi dokumennya sama sekali.
      const [pasienCount, dokterCount, pemeriksaanCount, resepCount, obatMenipisCount] =
        await Promise.all([
          getCountFromServer(collection(db, 'pasienProfile')),
          getCountFromServer(collection(db, 'dokterProfile')),
          getCountFromServer(
            query(
              collection(db, 'medicalRecords'),
              where('tanggalPeriksa', '>=', startIso),
              where('tanggalPeriksa', '<=', endIso)
            )
          ),
          getCountFromServer(
            query(collection(db, 'resep'), where('createdAt', '>=', startTs), where('createdAt', '<=', endTs))
          ),
          getCountFromServer(query(collection(db, 'obat'), where('stok', '<=', threshold))),
        ]);

      setRingkasan({
        totalPasien: pasienCount.data().count,
        totalDokter: dokterCount.data().count,
        totalPemeriksaan: pemeriksaanCount.data().count,
        totalResep: resepCount.data().count,
        obatMenipisCount: obatMenipisCount.data().count,
      });
    } catch (err) {
      console.error('Gagal memuat ringkasan laporan:', err);
      showAlert('Gagal memuat ringkasan', 'Coba lagi.');
    } finally {
      setLoadingRingkasan(false);
    }
  };

  // Muat pengaturan threshold DULU (1x getDoc, dokumen kecil), baru muat
  // ringkasan pakai nilai itu - supaya kartu "Obat Stok Menipis" langsung
  // benar dari awal, bukan sempat tampil pakai angka default lalu berubah.
  // Kalau settings/app belum pernah dibuat (klinik baru), diam-diam pakai
  // DEFAULT_STOK_MENIPIS_THRESHOLD - tidak perlu tampilkan error ke admin
  // untuk kasus ini karena bukan kegagalan, cuma belum pernah diisi.
  useEffect(() => {
    async function init() {
      let threshold = DEFAULT_STOK_MENIPIS_THRESHOLD;
      try {
        const snap = await getDoc(doc(db, 'settings', 'app'));
        const nilai = snap.exists() ? snap.data().stokMenipisThreshold : undefined;
        if (typeof nilai === 'number') threshold = nilai;
      } catch (err) {
        console.error('Gagal memuat pengaturan threshold, pakai default:', err);
      }
      setStokThreshold(threshold);
      loadRingkasan(periode, threshold);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangePeriode = (value: string) => {
    const p = value as PeriodeKey;
    setPeriode(p);
    loadRingkasan(p, stokThreshold);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { startIso, endIso, startDate, endDate } = getRange(periode);
      const startTs = Timestamp.fromDate(startDate);
      const endTs = Timestamp.fromDate(new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1));

      const [pemeriksaanSnap, resepSnap, obatMenipisSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'medicalRecords'),
            where('tanggalPeriksa', '>=', startIso),
            where('tanggalPeriksa', '<=', endIso),
            orderBy('tanggalPeriksa', 'desc'),
            limit(MAX_ROWS)
          )
        ),
        getDocs(
          query(
            collection(db, 'resep'),
            where('createdAt', '>=', startTs),
            where('createdAt', '<=', endTs),
            orderBy('createdAt', 'desc'),
            limit(MAX_ROWS)
          )
        ),
        getDocs(
          query(collection(db, 'obat'), where('stok', '<=', stokThreshold), orderBy('stok', 'asc'))
        ),
      ]);

      const pemeriksaanList = pemeriksaanSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MedicalRecord, 'id'>),
      }));
      const resepList = resepSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Resep, 'id'>) }));
      const obatMenipisList = obatMenipisSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Obat, 'id'>),
      }));

      if (pemeriksaanSnap.size >= MAX_ROWS || resepSnap.size >= MAX_ROWS) {
        showAlert(
          'Data dipotong',
          `Periode ini punya lebih dari ${MAX_ROWS} baris. Laporan akan tetap dibuat, tapi cuma ${MAX_ROWS} baris terbaru per sheet. Pilih periode lebih pendek kalau butuh data lengkap.`
        );
      }

      // Join nama pasien & dokter, TAPI cuma untuk NIK/uid yang benar-benar
      // muncul di data periode ini (bukan baca semua pasienProfile/dokterProfile).
      const nikSet = new Set<string>();
      const dokterUidSet = new Set<string>();
      pemeriksaanList.forEach((r) => {
        nikSet.add(r.pasienNik);
        dokterUidSet.add(r.dokterUid);
      });
      resepList.forEach((r) => {
        nikSet.add(r.pasienNik);
        dokterUidSet.add(r.dokterUid);
      });

      const [pasienEntries, dokterEntries] = await Promise.all([
        Promise.all(
          Array.from(nikSet).map(async (nik) => {
            try {
              const snap = await getDoc(doc(db, 'pasienProfile', nik));
              return [nik, snap.exists() ? (snap.data() as PasienProfile).nama : nik] as const;
            } catch {
              return [nik, nik] as const;
            }
          })
        ),
        Promise.all(
          Array.from(dokterUidSet).map(async (uid) => {
            try {
              const snap = await getDoc(doc(db, 'dokterProfile', uid));
              if (!snap.exists()) return [uid, uid] as const;
              const d = snap.data() as DokterProfile;
              return [uid, `dr. ${d.nama}`] as const;
            } catch {
              return [uid, uid] as const;
            }
          })
        ),
      ]);
      const namaPasien = Object.fromEntries(pasienEntries);
      const namaDokter = Object.fromEntries(dokterEntries);

      // ---- Susun workbook Excel (dengan styling) ----
      const wb = XLSX.utils.book_new();

      // --- Sheet: Ringkasan ---
      const ringkasanRows = [
        selJudul('LAPORAN REKAM MEDIS', 2),
        [selLabel('Periode'), selNilai(periodeLabel(periode))],
        [selLabel('Dibuat pada'), selNilai(new Date().toLocaleString('id-ID'))],
        [selData(''), selData('')],
        selSubjudul('RINGKASAN', 2),
        [selLabel('Total Pasien Terdaftar'), selNilai(ringkasan?.totalPasien ?? 0)],
        [selLabel('Total Dokter Aktif'), selNilai(ringkasan?.totalDokter ?? 0)],
        [selLabel(`Total Pemeriksaan (${periodeLabel(periode)})`), selNilai(pemeriksaanList.length)],
        [selLabel(`Total Resep (${periodeLabel(periode)})`), selNilai(resepList.length)],
        [selLabel(`Obat Stok Menipis (\u2264 ${stokThreshold})`), selNilai(obatMenipisList.length)],
      ];
      const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasanRows);
      wsRingkasan['!cols'] = [{ wch: 34 }, { wch: 26 }];
      wsRingkasan['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 1 } },
      ];
      wsRingkasan['!rows'] = [{ hpt: 26 }];
      XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Ringkasan');

      // --- Sheet: Pemeriksaan ---
      const wsPemeriksaan = buatSheetTabel(
        ['Tanggal', 'NIK', 'Nama Pasien', 'Dokter', 'Keluhan', 'Diagnosa', 'Tindakan'],
        pemeriksaanList.map((r) => [
          r.tanggalPeriksa,
          r.pasienNik,
          namaPasien[r.pasienNik] ?? r.pasienNik,
          namaDokter[r.dokterUid] ?? r.dokterUid,
          r.keluhan,
          r.diagnosa,
          r.tindakan ?? '',
        ]),
        [12, 18, 22, 22, 28, 24, 24]
      );
      XLSX.utils.book_append_sheet(wb, wsPemeriksaan, 'Pemeriksaan');

      // --- Sheet: Resep ---
      const wsResep = buatSheetTabel(
        ['NIK', 'Nama Pasien', 'Dokter', 'Obat', 'Dosis', 'Jumlah', 'Catatan'],
        resepList.flatMap((r) =>
          r.items.map((it) => [
            r.pasienNik,
            namaPasien[r.pasienNik] ?? r.pasienNik,
            namaDokter[r.dokterUid] ?? r.dokterUid,
            it.namaObat,
            it.dosis,
            it.jumlah,
            r.catatan ?? '',
          ])
        ),
        [18, 22, 22, 22, 20, 10, 24]
      );
      XLSX.utils.book_append_sheet(wb, wsResep, 'Resep');

      // --- Sheet: Stok Obat Menipis ---
      const headerObat = ['Nama Obat', 'Satuan', 'Stok', 'Harga (Rp)'].map(selHeader);
      const dataObat =
        obatMenipisList.length > 0
          ? obatMenipisList.map((o) => [
              selData(o.namaObat),
              selData(o.satuan),
              selData(o.stok),
              selData(o.harga, { numFmt: '#,##0' }),
            ])
          : [[selData('Tidak ada obat dengan stok menipis'), selData(''), selData(''), selData('')]];
      const wsObat = XLSX.utils.aoa_to_sheet([headerObat, ...dataObat]);
      wsObat['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 16 }];
      wsObat['!rows'] = [{ hpt: 24 }];
      XLSX.utils.book_append_sheet(wb, wsObat, 'Stok Obat Menipis');

      const fileName = `Laporan_RekamMedis_${periode}_${Date.now()}.xlsx`;

      if (Platform.OS === 'web') {
        // Di web, expo-file-system & expo-sharing tidak berlaku (tidak ada
        // "document directory" di browser). XLSX.writeFile() sudah otomatis
        // menangani ini sendiri - bikin Blob & trigger download browser,
        // tanpa perlu expo-file-system sama sekali.
        XLSX.writeFile(wb, fileName);
      } else {
        const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const fileUri = FileSystem.documentDirectory + fileName;

        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Simpan / Bagikan Laporan',
          });
        } else {
          showAlert('File tersimpan', `Laporan disimpan di:\n${fileUri}`);
        }
      }
    } catch (err) {
      console.error('Gagal export laporan:', err);
      showAlert('Gagal export', 'Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Periode Laporan</Text>
      <SimpleSelect
        label="Pilih Periode"
        options={PERIODE_OPTIONS}
        selectedValue={periode}
        onSelect={handleChangePeriode}
      />

      {loadingRingkasan ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.grid}>
          <StatCard icon="people-outline" label="Total Pasien" value={ringkasan?.totalPasien ?? 0} />
          <StatCard icon="medkit-outline" label="Total Dokter" value={ringkasan?.totalDokter ?? 0} />
          <StatCard
            icon="clipboard-outline"
            label={`Pemeriksaan (${periodeLabel(periode)})`}
            value={ringkasan?.totalPemeriksaan ?? 0}
          />
          <StatCard
            icon="document-text-outline"
            label={`Resep (${periodeLabel(periode)})`}
            value={ringkasan?.totalResep ?? 0}
          />
        </View>
      )}

      {!!ringkasan && ringkasan.obatMenipisCount > 0 && (
        <View style={styles.warningBox}>
          <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
          <Text style={styles.warningText}>
            {ringkasan.obatMenipisCount} obat stoknya {stokThreshold} - cek menu Data Obat.
          </Text>
        </View>
      )}

      <Pressable style={styles.exportButton} onPress={handleExport} disabled={exporting}>
        {exporting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={styles.exportButtonText}>Export ke Excel</Text>
          </>
        )}
      </Pressable>
      <Text style={styles.exportNote}>
        File .xlsx berisi 4 sheet: Ringkasan, Pemeriksaan, Resep, dan Stok Obat Menipis - sesuai periode
        yang dipilih di atas.
      </Text>
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color="#4338CA" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  statCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 14,
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 12, color: '#666' },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  warningText: { color: '#92400E', fontSize: 13, flex: 1 },
  exportButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4338CA',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  exportButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  exportNote: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 8 },
});