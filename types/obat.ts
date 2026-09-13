export interface Obat {
  id: string;
  namaObat: string;
  satuan: string; // mis. "tablet", "kapsul", "botol", "sirup"
  stok: number;
  harga: number;
  deskripsi?: string;
  createdAt?: any;
}
